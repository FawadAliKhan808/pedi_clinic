-- Appointment approval workflow, part 2.
--
-- A parent's booking is now a request ('pending') that the clinic's doctor
-- approves ('booked', shown as "Confirmed") or rejects. A pending request holds
-- its slot, so approving can never overbook a session; rejecting frees it.
-- Only appointments change — the walk-in queue stays first-come-first-served.
--
-- Every function below that counts or filters bookings now includes
-- 'pending'. Reminders and arrival-linking still apply to confirmed bookings
-- only.

-- ============================================================================
-- One request/booking per child per day, pending included
-- ============================================================================

drop index public.appointments_one_per_child_per_day;
create unique index appointments_one_per_child_per_day
  on public.appointments (child_id, appointment_date)
  where status in ('pending', 'booked', 'attended');

-- ============================================================================
-- Notifications: the doctor's inbox, and deletion
-- ============================================================================

-- Users may delete their own notifications (RLS already limits reads to them).
create policy notifications_delete_own on public.notifications
  for delete
  to authenticated
  using (user_id = auth.uid());

/** Tells every doctor of the session's clinic that a parent asked for a slot. */
create function public.notify_booking_request(p_appointment_id uuid)
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

/** Tells the parent whether their request was approved or rejected. */
create function public.notify_booking_decision(p_appointment_id uuid, p_decision text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, type, appointment_id, payload)
  select p.user_id,
         'booking_update',
         a.id,
         jsonb_build_object(
           'child_name', c.name,
           'decision', p_decision,
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

-- ============================================================================
-- Booking rules (pending requests hold their slot)
-- ============================================================================

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
  v_booked integer;
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

  select count(*) into v_booked
    from public.appointments a
   where a.session_id = p_session.id
     and a.status in ('pending', 'booked', 'attended');

  if v_booked >= p_session.max_bookings then
    raise exception 'SESSION_FULL' using errcode = '22023';
  end if;
end;
$$;

/** Parent requests a session for their child. The doctor is asked to approve. */
create or replace function public.book_appointment(p_session_id uuid, p_child_id uuid)
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

  select s.* into v_session
    from public.availability_sessions s
   where s.id = p_session_id
   for update;

  if v_session.id is null then
    raise exception 'SESSION_NOT_FOUND' using errcode = '23503';
  end if;

  perform public.assert_session_bookable(v_session, true);

  begin
    insert into public.appointments (session_id, child_id, appointment_date, status)
    values (v_session.id, p_child_id, v_session.date, 'pending')
    returning * into v_appointment;
  exception when unique_violation then
    raise exception 'APPOINTMENT_EXISTS_FOR_DAY' using errcode = '23505';
  end;

  perform public.notify_booking_request(v_appointment.id);

  return v_appointment;
end;
$$;

/**
 * Moves a pending or confirmed appointment. When the parent moves it, it goes
 * back to the doctor for approval. When the doctor moves it, that counts as
 * confirming it, and the parent is told.
 */
create or replace function public.reschedule_appointment(p_appointment_id uuid, p_new_session_id uuid)
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
  if v_appointment.status not in ('pending', 'booked') then
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

  begin
    update public.appointments a
       set session_id = v_new.id,
           appointment_date = v_new.date,
           status = (case when v_is_doctor then 'booked' else 'pending' end)::public.appointment_status
     where a.id = v_appointment.id
    returning a.* into v_appointment;
  exception when unique_violation then
    raise exception 'APPOINTMENT_EXISTS_FOR_DAY' using errcode = '23505';
  end;

  if v_is_doctor and not v_is_parent then
    perform public.notify_appointment_change(v_appointment.id, 'rescheduled');
  else
    perform public.notify_booking_request(v_appointment.id);
  end if;

  return v_appointment;
end;
$$;

/** Cancels a pending or confirmed appointment, no cutoff. The doctor cancelling notifies the parent. */
create or replace function public.cancel_appointment(p_appointment_id uuid)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment public.appointments;
  v_clinic_id uuid;
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

  select s.clinic_id into v_clinic_id
    from public.availability_sessions s
   where s.id = v_appointment.session_id;

  v_is_parent := public.is_own_child(v_appointment.child_id);
  v_is_doctor := public.is_clinic_staff(v_clinic_id, array['doctor']::public.staff_role[]);
  if not v_is_parent and not v_is_doctor then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_appointment.status not in ('pending', 'booked') then
    raise exception 'INVALID_APPOINTMENT_STATUS' using errcode = '22023';
  end if;

  update public.appointments a
     set status = 'cancelled', cancelled_at = now()
   where a.id = v_appointment.id
  returning a.* into v_appointment;

  if v_is_doctor and not v_is_parent then
    perform public.notify_appointment_change(v_appointment.id, 'cancelled');
  end if;

  return v_appointment;
end;
$$;

/**
 * The doctor approves or rejects a pending request. The row lock means a
 * request is decided exactly once — a second tap (or a second doctor) gets
 * INVALID_APPOINTMENT_STATUS. Every doctor's copy of the request is marked
 * read, and the parent is told the outcome.
 */
create function public.decide_appointment(p_appointment_id uuid, p_approve boolean)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment public.appointments;
  v_session public.availability_sessions;
begin
  select a.* into v_appointment
    from public.appointments a
   where a.id = p_appointment_id
   for update;

  if v_appointment.id is null then
    raise exception 'APPOINTMENT_NOT_FOUND' using errcode = '23503';
  end if;

  select s.* into v_session from public.availability_sessions s where s.id = v_appointment.session_id;

  if not public.is_clinic_staff(v_session.clinic_id, array['doctor']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_appointment.status <> 'pending' then
    raise exception 'INVALID_APPOINTMENT_STATUS' using errcode = '22023';
  end if;
  if p_approve and v_session.cancelled_at is not null then
    raise exception 'SESSION_CANCELLED' using errcode = '22023';
  end if;

  update public.appointments a
     set status = (case when p_approve then 'booked' else 'rejected' end)::public.appointment_status
   where a.id = v_appointment.id
  returning a.* into v_appointment;

  update public.notifications n
     set read_at = coalesce(n.read_at, now())
   where n.appointment_id = v_appointment.id
     and n.type = 'booking_request';

  perform public.notify_booking_decision(
    v_appointment.id,
    case when p_approve then 'approved' else 'rejected' end
  );

  return v_appointment;
end;
$$;

-- ============================================================================
-- Doctor: availability (counts include pending requests)
-- ============================================================================

create or replace function public.update_session_capacity(p_session_id uuid, p_max_bookings integer)
returns public.availability_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.availability_sessions;
  v_booked integer;
begin
  select s.* into v_session
    from public.availability_sessions s
   where s.id = p_session_id
   for update;

  if v_session.id is null then
    raise exception 'SESSION_NOT_FOUND' using errcode = '23503';
  end if;
  if not public.is_clinic_staff(v_session.clinic_id, array['doctor']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select count(*) into v_booked
    from public.appointments a
   where a.session_id = p_session_id and a.status in ('pending', 'booked', 'attended');

  if coalesce(p_max_bookings, -1) < v_booked then
    raise exception 'CAPACITY_BELOW_BOOKINGS' using errcode = '22023';
  end if;

  update public.availability_sessions s
     set max_bookings = p_max_bookings
   where s.id = p_session_id
  returning s.* into v_session;

  return v_session;
end;
$$;

create or replace function public.cancel_session(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.availability_sessions;
  v_appointment_id uuid;
  v_affected integer := 0;
begin
  select s.* into v_session
    from public.availability_sessions s
   where s.id = p_session_id
   for update;

  if v_session.id is null then
    raise exception 'SESSION_NOT_FOUND' using errcode = '23503';
  end if;
  if not public.is_clinic_staff(v_session.clinic_id, array['doctor']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_session.cancelled_at is not null then
    return 0;
  end if;

  update public.availability_sessions s
     set cancelled_at = now()
   where s.id = p_session_id;

  for v_appointment_id in
    update public.appointments a
       set status = 'cancelled', cancelled_at = now()
     where a.session_id = p_session_id
       and a.status in ('pending', 'booked')
    returning a.id
  loop
    perform public.notify_appointment_change(v_appointment_id, 'cancelled');
    v_affected := v_affected + 1;
  end loop;

  return v_affected;
end;
$$;

-- ============================================================================
-- Read models
-- ============================================================================

create or replace function public.appointment_sessions(p_clinic_id uuid, p_from date, p_to date)
returns table (
  session_id uuid,
  clinic_id uuid,
  date date,
  start_time time,
  end_time time,
  max_bookings integer,
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
    s.max_bookings,
    (
      select count(*)::integer
        from public.appointments a
       where a.session_id = s.id and a.status in ('pending', 'booked', 'attended')
    )
  from public.availability_sessions s
 where s.clinic_id = p_clinic_id
   and s.date between p_from and p_to
   and s.cancelled_at is null
 order by s.date, s.start_time;
$$;

/**
 * The parent's upcoming requests and bookings — including ones the doctor
 * turned down, so the parent sees "Not approved" rather than a silent vanish.
 */
create or replace function public.my_appointments()
returns table (
  appointment_id uuid,
  child_id uuid,
  child_name text,
  session_id uuid,
  date date,
  start_time time,
  end_time time,
  status public.appointment_status
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, c.id, c.name, s.id, s.date, s.start_time, s.end_time, a.status
    from public.appointments a
    join public.availability_sessions s on s.id = a.session_id
    join public.children c on c.id = a.child_id
    join public.parents p on p.id = c.parent_id
   where p.user_id = auth.uid()
     and a.status in ('pending', 'booked', 'rejected')
     and a.appointment_date >= public.clinic_today(s.clinic_id)
   order by s.date, s.start_time;
$$;

create or replace function public.clinic_appointments(p_clinic_id uuid, p_from date, p_to date)
returns table (
  session_id uuid,
  date date,
  start_time time,
  end_time time,
  max_bookings integer,
  booked_count integer,
  appointment_id uuid,
  appointment_status public.appointment_status,
  child_id uuid,
  child_name text,
  child_dob date,
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
    s.max_bookings,
    (
      select count(*)::integer
        from public.appointments b
       where b.session_id = s.id and b.status in ('pending', 'booked', 'attended')
    ),
    a.id,
    a.status,
    c.id,
    c.name,
    c.dob,
    p.phone,
    (select v.seq from public.visits v where v.appointment_id = a.id limit 1)
  from public.availability_sessions s
  left join public.appointments a
    on a.session_id = s.id and a.status in ('pending', 'booked', 'attended', 'missed')
  left join public.children c on c.id = a.child_id
  left join public.parents p on p.id = c.parent_id
 where s.clinic_id = p_clinic_id
   and s.date between p_from and p_to
   and s.cancelled_at is null
   and public.is_clinic_staff(p_clinic_id, array['doctor']::public.staff_role[])
 order by s.date, s.start_time, c.name;
$$;

-- ============================================================================
-- Function privileges
-- ============================================================================

revoke execute on function public.decide_appointment(uuid, boolean) from public, anon;
grant execute on function public.decide_appointment(uuid, boolean) to authenticated;

revoke execute on function public.notify_booking_request(uuid) from public, anon, authenticated;
revoke execute on function public.notify_booking_decision(uuid, text) from public, anon, authenticated;
