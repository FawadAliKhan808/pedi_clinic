-- Appointments, simplified after clinic testing:
--
--   * Sessions are broad blocks of time (e.g. Morning 10–1, Evening 6–9) with
--     no capacity and no 30-minute slots: any number of children can book.
--     One-tap presets come from the `session_presets` setting.
--   * No approval step: a booking is confirmed the moment it's made, and it
--     carries a reason for visit, like a queue token.
--   * Check-in can turn a child's upcoming booking into today's token, taking
--     its reason ("coming for the same reason?"). The booking passed to
--     check_in is now validated against the child.
--   * The daily job marks any booking whose day passed without a check-in as
--     missed (including any left over from the old approval flow).

-- ============================================================================
-- Settings
-- ============================================================================

insert into public.settings (clinic_id, key, value)
select c.id,
       'session_presets',
       '[{"label": "Morning", "start": "10:00", "end": "13:00"},
         {"label": "Evening", "start": "18:00", "end": "21:00"}]'::jsonb
  from public.clinics c
on conflict do nothing;

delete from public.settings where key = 'appointment_slot_minutes';

-- ============================================================================
-- Data: reason for visit, no capacity, no slots, no pending requests
-- ============================================================================

alter table public.appointments
  add column visit_reason public.visit_reason not null default 'general_checkup';
-- Existing rows took the default; new bookings must say why they're coming.
alter table public.appointments alter column visit_reason drop default;

update public.appointments set status = 'booked' where status = 'pending';

drop index if exists public.appointments_one_per_slot;
alter table public.appointments drop column slot_time;

alter table public.availability_sessions drop column max_bookings;

comment on table public.availability_sessions is
  'A block of time the doctor opens for appointments (e.g. Evening 18:00–21:00). No capacity: any number of children may book it.';

-- ============================================================================
-- Retired: approval, slots, capacity
-- ============================================================================

drop function if exists public.decide_appointment(uuid, boolean);
drop function if exists public.notify_booking_decision(uuid, text);
drop function if exists public.assert_slot_free(public.availability_sessions, time, uuid);
drop function if exists public.session_free_slots(public.availability_sessions);
drop function if exists public.book_appointment(uuid, uuid, time);
drop function if exists public.reschedule_appointment(uuid, uuid, time);

-- ============================================================================
-- Sessions
-- ============================================================================

/** Opens a session: any times, end after start, not overlapping another. */
create or replace function public.create_session(
  p_clinic_id uuid,
  p_date date,
  p_start_time time,
  p_end_time time
)
returns public.availability_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.availability_sessions;
begin
  if not public.is_clinic_staff(p_clinic_id, array['doctor']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_date < public.clinic_today(p_clinic_id) then
    raise exception 'SESSION_IN_PAST' using errcode = '22023';
  end if;
  if p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception 'INVALID_SESSION_TIMES' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.availability_sessions s
     where s.clinic_id = p_clinic_id
       and s.date = p_date
       and s.cancelled_at is null
       and s.start_time < p_end_time
       and s.end_time > p_start_time
  ) then
    raise exception 'SESSION_OVERLAP' using errcode = '23505';
  end if;

  insert into public.availability_sessions (clinic_id, date, start_time, end_time)
  values (p_clinic_id, p_date, p_start_time, p_end_time)
  returning * into v_session;

  return v_session;
end;
$$;

create or replace function public.copy_week(
  p_clinic_id uuid,
  p_from_week_start date,
  p_to_week_start date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := public.clinic_today(p_clinic_id);
  v_offset integer := p_to_week_start - p_from_week_start;
  v_source public.availability_sessions;
  v_created integer := 0;
begin
  if not public.is_clinic_staff(p_clinic_id, array['doctor']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  for v_source in
    select s.*
      from public.availability_sessions s
     where s.clinic_id = p_clinic_id
       and s.date between p_from_week_start and p_from_week_start + 6
       and s.cancelled_at is null
     order by s.date, s.start_time
  loop
    continue when v_source.date + v_offset < v_today;
    continue when exists (
      select 1 from public.availability_sessions t
       where t.clinic_id = p_clinic_id
         and t.date = v_source.date + v_offset
         and t.cancelled_at is null
         and t.start_time < v_source.end_time
         and t.end_time > v_source.start_time
    );

    insert into public.availability_sessions (clinic_id, date, start_time, end_time)
    values (p_clinic_id, v_source.date + v_offset, v_source.start_time, v_source.end_time);
    v_created := v_created + 1;
  end loop;

  return v_created;
end;
$$;

/** Raises unless a new booking may land in this session: live, not over, in the window (parents). */
create or replace function public.assert_session_bookable(
  p_session public.availability_sessions,
  p_enforce_window boolean
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := public.clinic_today(p_session.clinic_id);
begin
  if p_session.cancelled_at is not null then
    raise exception 'SESSION_CANCELLED' using errcode = '22023';
  end if;

  if p_session.date < v_today
     or (p_session.date = v_today and p_session.end_time <= public.clinic_local_time(p_session.clinic_id)) then
    raise exception 'SESSION_IN_PAST' using errcode = '22023';
  end if;

  if p_enforce_window
     and p_session.date > v_today + (public.setting_int(p_session.clinic_id, 'booking_window_days') - 1) then
    raise exception 'OUTSIDE_BOOKING_WINDOW' using errcode = '22023';
  end if;
end;
$$;

-- ============================================================================
-- Notifications (no slot times any more)
-- ============================================================================

/** Tells every doctor of the clinic about a booking — made, or moved by the parent. */
create or replace function public.notify_booking_request(p_appointment_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, type, appointment_id, payload)
  select st.user_id,
         'booking_request',
         a.id,
         jsonb_build_object(
           'child_name', c.name,
           'visit_reason', a.visit_reason,
           'appointment_date', s.date,
           'start_time', to_char(s.start_time, 'HH24:MI'),
           'end_time', to_char(s.end_time, 'HH24:MI')
         )
    from public.appointments a
    join public.availability_sessions s on s.id = a.session_id
    join public.children c on c.id = a.child_id
    join public.staff st on st.clinic_id = s.clinic_id and st.role = 'doctor'
   where a.id = p_appointment_id;
$$;

create or replace function public.notify_appointment_change(
  p_appointment_id uuid,
  p_change text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, type, appointment_id, payload)
  select p.user_id,
         'appointment_changed',
         a.id,
         jsonb_build_object(
           'child_name', c.name,
           'change', p_change,
           'appointment_date', s.date,
           'start_time', to_char(s.start_time, 'HH24:MI'),
           'end_time', to_char(s.end_time, 'HH24:MI')
         )
    from public.appointments a
    join public.availability_sessions s on s.id = a.session_id
    join public.children c on c.id = a.child_id
    join public.parents p on p.id = c.parent_id
   where a.id = p_appointment_id
     and p.user_id is not null;
$$;

create or replace function public.send_appointment_reminders(
  p_clinic_id uuid,
  p_kind public.notification_type,
  p_date date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created integer;
begin
  insert into public.notifications (user_id, type, appointment_id, payload)
  select p.user_id,
         p_kind,
         a.id,
         jsonb_build_object(
           'child_name', c.name,
           'appointment_date', s.date,
           'start_time', to_char(s.start_time, 'HH24:MI'),
           'end_time', to_char(s.end_time, 'HH24:MI')
         )
    from public.appointments a
    join public.availability_sessions s on s.id = a.session_id
    join public.children c on c.id = a.child_id
    join public.parents p on p.id = c.parent_id
   where s.clinic_id = p_clinic_id
     and a.appointment_date = p_date
     and a.status = 'booked'
     and s.cancelled_at is null
     and p.user_id is not null
  on conflict (appointment_id, type)
    where type in ('appointment_today', 'appointment_tomorrow')
    do nothing;

  get diagnostics v_created = row_count;
  return v_created;
end;
$$;

-- ============================================================================
-- Booking: confirmed on the spot, with a reason
-- ============================================================================

/** Parent books a session for their child, for a reason. Confirmed immediately; the doctor is told. */
create function public.book_appointment(
  p_session_id uuid,
  p_child_id uuid,
  p_visit_reason public.visit_reason
)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.availability_sessions;
  v_appointment public.appointments;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if not public.is_own_child(p_child_id) then
    raise exception 'CHILD_NOT_FOUND' using errcode = '42501';
  end if;
  if p_visit_reason is null then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;

  select s.* into v_session
    from public.availability_sessions s
   where s.id = p_session_id
   for update;

  if v_session.id is null then
    raise exception 'SESSION_NOT_FOUND' using errcode = '23503';
  end if;

  perform public.assert_session_bookable(v_session, true);

  insert into public.appointments (session_id, child_id, appointment_date, status, visit_reason)
  values (v_session.id, p_child_id, v_session.date, 'booked', p_visit_reason)
  returning * into v_appointment;

  perform public.notify_booking_request(v_appointment.id);

  return v_appointment;
end;
$$;

/**
 * Moves a booking to another session. It stays confirmed. The doctor moving
 * it tells the parent; the parent moving it tells the doctor.
 */
create function public.reschedule_appointment(p_appointment_id uuid, p_new_session_id uuid)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment public.appointments;
  v_old public.availability_sessions;
  v_new public.availability_sessions;
  v_is_parent boolean;
  v_is_doctor boolean;
begin
  select a.* into v_appointment
    from public.appointments a
   where a.id = p_appointment_id
   for update;

  if v_appointment.id is null then
    raise exception 'APPOINTMENT_NOT_FOUND' using errcode = '23503';
  end if;

  select s.* into v_old from public.availability_sessions s where s.id = v_appointment.session_id;

  v_is_parent := public.is_own_child(v_appointment.child_id);
  v_is_doctor := public.is_clinic_staff(v_old.clinic_id, array['doctor']::public.staff_role[]);
  if not v_is_parent and not v_is_doctor then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_appointment.status <> 'booked' then
    raise exception 'INVALID_APPOINTMENT_STATUS' using errcode = '22023';
  end if;
  if p_new_session_id = v_appointment.session_id then
    return v_appointment;
  end if;

  select s.* into v_new
    from public.availability_sessions s
   where s.id = p_new_session_id
   for update;

  if v_new.id is null or v_new.clinic_id <> v_old.clinic_id then
    raise exception 'SESSION_NOT_FOUND' using errcode = '23503';
  end if;

  perform public.assert_session_bookable(v_new, not v_is_doctor);

  update public.appointments a
     set session_id = v_new.id,
         appointment_date = v_new.date
   where a.id = v_appointment.id
  returning a.* into v_appointment;

  if v_is_doctor and not v_is_parent then
    perform public.notify_appointment_change(v_appointment.id, 'rescheduled');
  else
    perform public.notify_booking_request(v_appointment.id);
  end if;

  return v_appointment;
end;
$$;

-- ============================================================================
-- Check-in: arrival links today's booking, or (if the parent says so) an
-- upcoming one — whose reason then becomes the token's reason.
-- ============================================================================

create or replace function public.assign_token(
  p_clinic_id uuid,
  p_child_id uuid,
  p_visit_reason public.visit_reason,
  p_appointment_id uuid,
  p_enforce_parent_id uuid
)
returns public.visits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date := public.clinic_today(p_clinic_id);
  v_limit integer;
  v_used integer;
  v_seq integer;
  v_appointment_id uuid := p_appointment_id;
  v_visit public.visits;
begin
  perform pg_advisory_xact_lock(hashtext(p_clinic_id::text || ':' || v_date::text));

  if p_enforce_parent_id is not null then
    v_limit := public.setting_int(p_clinic_id, 'daily_token_limit_per_phone');

    select count(*) into v_used
      from public.visits v
      join public.children c on c.id = v.child_id
     where c.parent_id = p_enforce_parent_id
       and v.clinic_id = p_clinic_id
       and v.visit_date = v_date
       and v.status <> 'removed';

    if v_used >= v_limit then
      raise exception 'DAILY_TOKEN_LIMIT_REACHED' using errcode = '22023';
    end if;
  end if;

  if v_appointment_id is null then
    select a.id into v_appointment_id
      from public.appointments a
      join public.availability_sessions s on s.id = a.session_id
     where a.child_id = p_child_id
       and a.appointment_date = v_date
       and a.status = 'booked'
       and s.clinic_id = p_clinic_id
     order by s.start_time
     limit 1;
  end if;

  select coalesce(max(v.seq), 0) + 1 into v_seq
    from public.visits v
   where v.clinic_id = p_clinic_id and v.visit_date = v_date;

  insert into public.visits (clinic_id, child_id, visit_date, seq, visit_reason, appointment_id)
  values (p_clinic_id, p_child_id, v_date, v_seq, p_visit_reason, v_appointment_id)
  returning * into v_visit;

  if v_appointment_id is not null then
    update public.appointments a
       set status = 'attended'
     where a.id = v_appointment_id and a.status = 'booked';
  end if;

  return v_visit;
end;
$$;

/**
 * Parent self-service check-in. With `p_appointment_id` — one of this child's
 * own confirmed bookings, today or upcoming — the token takes that booking's
 * reason and the booking counts as attended (the parent said they're coming
 * today for the same reason).
 */
create or replace function public.check_in(
  p_child_id uuid,
  p_visit_reason public.visit_reason,
  p_appointment_id uuid default null
)
returns public.visits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_id uuid;
  v_clinic_id uuid := public.default_clinic_id();
  v_reason public.visit_reason := p_visit_reason;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select p.id into v_parent_id
    from public.parents p
    join public.children c on c.parent_id = p.id
   where c.id = p_child_id
     and p.user_id = auth.uid();

  if v_parent_id is null then
    raise exception 'CHILD_NOT_FOUND' using errcode = '42501';
  end if;

  if p_appointment_id is not null then
    select a.visit_reason into v_reason
      from public.appointments a
      join public.availability_sessions s on s.id = a.session_id
     where a.id = p_appointment_id
       and a.child_id = p_child_id
       and a.status = 'booked'
       and a.appointment_date >= public.clinic_today(v_clinic_id)
       and s.clinic_id = v_clinic_id;

    if not found then
      raise exception 'APPOINTMENT_NOT_FOUND' using errcode = '23503';
    end if;
  end if;

  if v_reason is null then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;

  return public.assign_token(v_clinic_id, p_child_id, v_reason, p_appointment_id, v_parent_id);
end;
$$;

-- ============================================================================
-- Daily cleanup: a booking whose day passed with no check-in is missed
-- ============================================================================

create or replace function public.mark_missed_appointments(p_clinic_id uuid, p_today date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_marked integer;
begin
  update public.appointments a
     set status = 'missed'
    from public.availability_sessions s
   where s.id = a.session_id
     and s.clinic_id = p_clinic_id
     and a.appointment_date < p_today
     and a.status in ('booked', 'pending');

  get diagnostics v_marked = row_count;
  return v_marked;
end;
$$;

-- ============================================================================
-- Read models
-- ============================================================================

drop function public.booking_window();

/** Single-clinic MVP: today, the bookable range, and the doctor's one-tap session presets. */
create function public.booking_window()
returns table (clinic_id uuid, today date, from_date date, to_date date, session_presets jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    public.clinic_today(c.id),
    public.clinic_today(c.id),
    public.clinic_today(c.id) + (public.setting_int(c.id, 'booking_window_days') - 1),
    coalesce(
      (select st.value from public.settings st
        where st.clinic_id = c.id and st.key = 'session_presets'),
      '[]'::jsonb
    )
  from public.clinics c
 where c.id = public.default_clinic_id();
$$;

drop function public.appointment_sessions(uuid, date, date);

/** Live sessions in a date range, with how many are booked. No personal data. */
create function public.appointment_sessions(p_clinic_id uuid, p_from date, p_to date)
returns table (
  session_id uuid,
  clinic_id uuid,
  date date,
  start_time time,
  end_time time,
  booked_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.clinic_id,
    s.date,
    s.start_time,
    s.end_time,
    (
      select count(*)::integer
        from public.appointments a
       where a.session_id = s.id and a.status in ('booked', 'attended')
    )
  from public.availability_sessions s
 where s.clinic_id = p_clinic_id
   and s.date between p_from and p_to
   and s.cancelled_at is null
   -- A session that's already over today can't be booked any more.
   and (s.date > public.clinic_today(p_clinic_id)
        or s.end_time > public.clinic_local_time(p_clinic_id))
 order by s.date, s.start_time;
$$;

drop function public.my_appointments();

/** The parent's upcoming bookings (today onwards). */
create function public.my_appointments()
returns table (
  appointment_id uuid,
  child_id uuid,
  child_name text,
  session_id uuid,
  date date,
  start_time time,
  end_time time,
  visit_reason public.visit_reason,
  status public.appointment_status
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, c.id, c.name, s.id, s.date, s.start_time, s.end_time, a.visit_reason, a.status
    from public.appointments a
    join public.availability_sessions s on s.id = a.session_id
    join public.children c on c.id = a.child_id
    join public.parents p on p.id = c.parent_id
   where p.user_id = auth.uid()
     and a.status = 'booked'
     and a.appointment_date >= public.clinic_today(s.clinic_id)
   order by s.date, s.start_time, c.name;
$$;

drop function public.clinic_appointments(uuid, date, date);

/** The doctor's schedule: every session in range with who booked it and why. */
create function public.clinic_appointments(p_clinic_id uuid, p_from date, p_to date)
returns table (
  session_id uuid,
  date date,
  start_time time,
  end_time time,
  booked_count integer,
  appointment_id uuid,
  appointment_status public.appointment_status,
  visit_reason public.visit_reason,
  child_id uuid,
  child_name text,
  child_dob date,
  parent_name text,
  parent_phone text,
  token_seq integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.date,
    s.start_time,
    s.end_time,
    (
      select count(*)::integer
        from public.appointments b
       where b.session_id = s.id and b.status in ('booked', 'attended')
    ),
    a.id,
    a.status,
    a.visit_reason,
    c.id,
    c.name,
    c.dob,
    p.name,
    p.phone,
    (select v.seq from public.visits v where v.appointment_id = a.id limit 1)
  from public.availability_sessions s
  left join public.appointments a
    on a.session_id = s.id and a.status in ('booked', 'attended', 'missed')
  left join public.children c on c.id = a.child_id
  left join public.parents p on p.id = c.parent_id
 where s.clinic_id = p_clinic_id
   and s.date between p_from and p_to
   and s.cancelled_at is null
   and public.is_clinic_staff(p_clinic_id, array['doctor']::public.staff_role[])
 order by s.date, s.start_time, a.created_at nulls last;
$$;

-- ============================================================================
-- Function privileges
-- ============================================================================

revoke execute on function public.book_appointment(uuid, uuid, public.visit_reason) from public, anon;
revoke execute on function public.reschedule_appointment(uuid, uuid) from public, anon;
revoke execute on function public.booking_window() from public, anon;
revoke execute on function public.appointment_sessions(uuid, date, date) from public, anon;
revoke execute on function public.my_appointments() from public, anon;
revoke execute on function public.clinic_appointments(uuid, date, date) from public, anon;

grant execute on function public.book_appointment(uuid, uuid, public.visit_reason) to authenticated;
grant execute on function public.reschedule_appointment(uuid, uuid) to authenticated;
grant execute on function public.booking_window() to authenticated;
grant execute on function public.appointment_sessions(uuid, date, date) to authenticated;
grant execute on function public.my_appointments() to authenticated;
grant execute on function public.clinic_appointments(uuid, date, date) to authenticated;
