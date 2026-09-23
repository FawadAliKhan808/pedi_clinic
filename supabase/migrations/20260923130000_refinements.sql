-- Refinements after the first full test pass:
--   1. Pharmacy money in the doctor's analytics and end-of-day summary.
--   2. The parent's name alongside their phone in the doctor's views.
--   3. Appointment slots: a session's capacity is its length divided by the
--      slot length (setting `appointment_slot_minutes`, 30), and every booking
--      holds one exact slot time.
--   4. One app rating per parent, ever.

-- ============================================================================
-- Settings
-- ============================================================================

insert into public.settings (clinic_id, key, value)
select c.id, 'appointment_slot_minutes', '30'::jsonb
  from public.clinics c
on conflict do nothing;

/** Minutes from midnight — for slot arithmetic on `time` values. */
create function public.minutes_of_day(p_time time)
returns integer
language sql
immutable
as $$
  select (extract(hour from p_time) * 60 + extract(minute from p_time))::integer;
$$;

-- ============================================================================
-- 1. Pharmacy money in analytics
-- ============================================================================

create or replace function public.doctor_analytics(p_clinic_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_timezone text;
  v_today date;
  v_grace integer;
begin
  if not public.is_clinic_staff(p_clinic_id, array['doctor']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'INVALID_RANGE' using errcode = '22023';
  end if;

  select c.timezone into v_timezone from public.clinics c where c.id = p_clinic_id;
  v_today := public.clinic_today(p_clinic_id);
  v_grace := public.setting_int(p_clinic_id, 'follow_up_return_grace_days');

  return (
    with
    tokens as (
      select v.*
        from public.visits v
       where v.clinic_id = p_clinic_id
         and v.visit_date between p_from and p_to
    ),
    completed as (
      select t.* from tokens t where t.status = 'completed'
    ),
    -- Pharmacy sales count on the clinic-local day they were dispensed.
    dispensed as (
      select (o.dispensed_at at time zone v_timezone)::date as day, o.total
        from public.pharmacy_orders o
       where o.clinic_id = p_clinic_id
         and o.status = 'dispensed'
         and o.dispensed_at is not null
         and (o.dispensed_at at time zone v_timezone)::date between p_from and p_to
    ),
    days as (
      select generate_series(p_from, p_to, interval '1 day')::date as day
    )
    select jsonb_build_object(
      'daily', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'date', d.day,
          'patients', (select count(*) from completed c where c.visit_date = d.day),
          'consultation', coalesce((select sum(f.consultation) from completed c join public.fees f on f.visit_id = c.id where c.visit_date = d.day), 0),
          'vaccination', coalesce((select sum(f.vaccination) from completed c join public.fees f on f.visit_id = c.id where c.visit_date = d.day), 0),
          'other', coalesce((select sum(f.other) from completed c join public.fees f on f.visit_id = c.id where c.visit_date = d.day), 0),
          'cash', coalesce((select sum(p.amount) from completed c join public.payments p on p.visit_id = c.id where c.visit_date = d.day and p.mode = 'cash'), 0),
          'upi', coalesce((select sum(p.amount) from completed c join public.payments p on p.visit_id = c.id where c.visit_date = d.day and p.mode = 'upi'), 0),
          'card', coalesce((select sum(p.amount) from completed c join public.payments p on p.visit_id = c.id where c.visit_date = d.day and p.mode = 'card'), 0),
          'pharmacy', coalesce((select sum(x.total) from dispensed x where x.day = d.day), 0),
          'pharmacy_orders', (select count(*) from dispensed x where x.day = d.day)
        ) order by d.day), '[]'::jsonb)
        from days d
      ),
      'visit_reasons', jsonb_build_object(
        'vaccination', (select count(*) from completed c where c.visit_reason = 'vaccination'),
        'general_checkup', (select count(*) from completed c where c.visit_reason = 'general_checkup')
      ),
      'new_vs_returning', (
        select jsonb_build_object(
          'new', count(*) filter (where not x.returning),
          'returning', count(*) filter (where x.returning)
        )
        from (
          select exists (
            select 1 from public.visits prior
             where prior.child_id = c.child_id
               and prior.status = 'completed'
               and prior.visit_date < c.visit_date
          ) as returning
          from completed c
        ) x
      ),
      'average_consultation_minutes', (
        select round(avg(extract(epoch from (c.completed_at - coalesce(c.consultation_started_at, c.called_at))) / 60)::numeric, 1)
          from completed c
         where c.completed_at is not null
           and coalesce(c.consultation_started_at, c.called_at) is not null
      ),
      'check_in_hours', (
        select coalesce(jsonb_agg(jsonb_build_object('hour', h.hour, 'count', h.count) order by h.hour), '[]'::jsonb)
          from (
            select extract(hour from (t.created_at at time zone v_timezone))::integer as hour, count(*) as count
              from tokens t
             group by 1
          ) h
      ),
      'tokens', jsonb_build_object(
        'total', (select count(*) from tokens),
        'skipped', (select count(*) from tokens t where t.status = 'skipped'),
        'removed', (select count(*) from tokens t where t.status = 'removed')
      ),
      'walk_ins_vs_appointments', jsonb_build_object(
        'walk_ins', (select count(*) from tokens t where t.appointment_id is null and t.status <> 'removed'),
        'appointments', (select count(*) from tokens t where t.appointment_id is not null and t.status <> 'removed')
      ),
      'appointments', (
        select jsonb_build_object(
          'attended', count(*) filter (where a.status = 'attended'),
          'missed', count(*) filter (where a.status = 'missed')
        )
          from public.appointments a
          join public.availability_sessions s on s.id = a.session_id
         where s.clinic_id = p_clinic_id
           and a.appointment_date between p_from and p_to
      ),
      'follow_ups', (
        select jsonb_build_object(
          'due', count(*),
          'returned', count(*) filter (where exists (
            select 1 from public.visits back
             where back.child_id = f.child_id
               and back.status = 'completed'
               and back.visit_date > f.visit_date
               and back.visit_date <= f.follow_up_date + v_grace
          ))
        )
          from public.visits f
         where f.clinic_id = p_clinic_id
           and f.status = 'completed'
           and f.follow_up_date between p_from and least(p_to, v_today)
      )
    )
  );
end;
$$;

create or replace function public.end_of_day_summary(p_clinic_id uuid, p_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_timezone text;
begin
  if not public.is_clinic_staff(p_clinic_id, array['doctor']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select c.timezone into v_timezone from public.clinics c where c.id = p_clinic_id;

  return (
    with completed as (
      select v.id
        from public.visits v
       where v.clinic_id = p_clinic_id
         and v.visit_date = p_date
         and v.status = 'completed'
    ),
    dispensed as (
      select o.total
        from public.pharmacy_orders o
       where o.clinic_id = p_clinic_id
         and o.status = 'dispensed'
         and o.dispensed_at is not null
         and (o.dispensed_at at time zone v_timezone)::date = p_date
    )
    select jsonb_build_object(
      'date', p_date,
      'patients_seen', (select count(*) from completed),
      'by_mode', jsonb_build_object(
        'cash', coalesce((select sum(p.amount) from public.payments p join completed c on c.id = p.visit_id where p.mode = 'cash'), 0),
        'upi', coalesce((select sum(p.amount) from public.payments p join completed c on c.id = p.visit_id where p.mode = 'upi'), 0),
        'card', coalesce((select sum(p.amount) from public.payments p join completed c on c.id = p.visit_id where p.mode = 'card'), 0)
      ),
      'by_fee_type', jsonb_build_object(
        'consultation', coalesce((select sum(f.consultation) from public.fees f join completed c on c.id = f.visit_id), 0),
        'vaccination', coalesce((select sum(f.vaccination) from public.fees f join completed c on c.id = f.visit_id), 0),
        'other', coalesce((select sum(f.other) from public.fees f join completed c on c.id = f.visit_id), 0)
      ),
      'pharmacy', jsonb_build_object(
        'total', coalesce((select sum(x.total) from dispensed x), 0),
        'orders', (select count(*) from dispensed)
      ),
      'appointments', (
        select jsonb_build_object(
          'attended', count(*) filter (where a.status = 'attended'),
          'missed', count(*) filter (where a.status = 'missed'),
          'not_arrived', count(*) filter (where a.status = 'booked')
        )
          from public.appointments a
          join public.availability_sessions s on s.id = a.session_id
         where s.clinic_id = p_clinic_id
           and a.appointment_date = p_date
      )
    )
  );
end;
$$;

-- ============================================================================
-- 2. Parent name in the doctor's queue
-- ============================================================================

drop function public.doctor_queue(uuid);

create function public.doctor_queue(p_clinic_id uuid)
returns table (
  visit_id uuid,
  seq integer,
  status public.visit_status,
  reason public.visit_reason,
  child_id uuid,
  child_name text,
  child_dob date,
  parent_name text,
  parent_phone text,
  is_returning boolean,
  has_appointment boolean,
  called_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.id,
    v.seq,
    v.status,
    v.visit_reason,
    c.id,
    c.name,
    c.dob,
    p.name,
    p.phone,
    exists (
      select 1
        from public.visits prior
       where prior.child_id = c.id
         and prior.status = 'completed'
         and prior.visit_date < v.visit_date
    ),
    v.appointment_id is not null,
    v.called_at,
    v.created_at
  from public.visits v
  join public.children c on c.id = v.child_id
  join public.parents p on p.id = c.parent_id
 where v.clinic_id = p_clinic_id
   and v.visit_date = public.clinic_today(p_clinic_id)
   and v.status not in ('completed', 'removed')
   and public.is_clinic_staff(
         p_clinic_id,
         array['doctor', 'pharmacist']::public.staff_role[]
       )
 order by (case when v.status = 'skipped' then 1 else 0 end), v.seq;
$$;

-- ============================================================================
-- 3. Appointment slots
-- ============================================================================

alter table public.appointments add column slot_time time;

comment on column public.appointments.slot_time is
  'The exact time this booking holds: session start plus a whole number of slots. Assigned at booking and on reschedule.';

-- Existing live bookings take slots in the order they were made.
update public.appointments a
   set slot_time = s.start_time
                 + make_interval(mins => (r.position::integer - 1) * public.setting_int(s.clinic_id, 'appointment_slot_minutes'))
  from (
    select b.id,
           row_number() over (partition by b.session_id order by b.created_at, b.id) as position
      from public.appointments b
     where b.status in ('pending', 'booked', 'attended')
  ) r,
  public.availability_sessions s
 where r.id = a.id and s.id = a.session_id;

-- Two live bookings can never share a slot.
create unique index appointments_one_per_slot
  on public.appointments (session_id, slot_time)
  where status in ('pending', 'booked', 'attended');

-- Sessions' capacity now follows their length (never below what's booked).
update public.availability_sessions s
   set max_bookings = greatest(
         (public.minutes_of_day(s.end_time) - public.minutes_of_day(s.start_time))
           / public.setting_int(s.clinic_id, 'appointment_slot_minutes'),
         (select count(*) from public.appointments a
           where a.session_id = s.id and a.status in ('pending', 'booked', 'attended'))
       )
 where s.cancelled_at is null;

/**
 * The earliest slot in the session no live booking holds, or null when full.
 * The caller must hold the session row's lock.
 */
create function public.next_free_slot(p_session public.availability_sessions)
returns time
language sql
stable
security definer
set search_path = public
as $$
  select p_session.start_time + make_interval(mins => n * public.setting_int(p_session.clinic_id, 'appointment_slot_minutes'))
    from generate_series(0, p_session.max_bookings - 1) as n
   where not exists (
     select 1 from public.appointments a
      where a.session_id = p_session.id
        and a.status in ('pending', 'booked', 'attended')
        and a.slot_time = p_session.start_time + make_interval(mins => n * public.setting_int(p_session.clinic_id, 'appointment_slot_minutes'))
   )
   order by n
   limit 1;
$$;

drop function public.update_session_capacity(uuid, integer);
drop function public.create_session(uuid, date, time, time, integer);

/**
 * Opens a session. Times must fall on slot boundaries (every 30 minutes by
 * default), and its capacity is simply how many slots fit: 9:00–11:00 → 4.
 */
create function public.create_session(
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
  v_slot integer;
  v_session public.availability_sessions;
begin
  if not public.is_clinic_staff(p_clinic_id, array['doctor']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_date < public.clinic_today(p_clinic_id) then
    raise exception 'SESSION_IN_PAST' using errcode = '22023';
  end if;

  v_slot := public.setting_int(p_clinic_id, 'appointment_slot_minutes');
  if p_start_time is null or p_end_time is null
     or p_end_time <= p_start_time
     or public.minutes_of_day(p_start_time) % v_slot <> 0
     or public.minutes_of_day(p_end_time) % v_slot <> 0
     or extract(second from p_start_time) <> 0
     or extract(second from p_end_time) <> 0 then
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

  insert into public.availability_sessions (clinic_id, date, start_time, end_time, max_bookings)
  values (
    p_clinic_id,
    p_date,
    p_start_time,
    p_end_time,
    (public.minutes_of_day(p_end_time) - public.minutes_of_day(p_start_time)) / v_slot
  )
  returning * into v_session;

  return v_session;
end;
$$;

/** Parent requests a session for their child; the booking holds the earliest free slot. */
create or replace function public.book_appointment(p_session_id uuid, p_child_id uuid)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.availability_sessions;
  v_appointment public.appointments;
  v_slot time;
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

  v_slot := public.next_free_slot(v_session);
  if v_slot is null then
    raise exception 'SESSION_FULL' using errcode = '22023';
  end if;

  begin
    insert into public.appointments (session_id, child_id, appointment_date, status, slot_time)
    values (v_session.id, p_child_id, v_session.date, 'pending', v_slot)
    returning * into v_appointment;
  exception when unique_violation then
    raise exception 'APPOINTMENT_EXISTS_FOR_DAY' using errcode = '23505';
  end;

  perform public.notify_booking_request(v_appointment.id);

  return v_appointment;
end;
$$;

/**
 * Moves a pending or confirmed appointment to the new session's earliest free
 * slot. A parent's move goes back to the doctor for approval; the doctor's
 * counts as confirming it, and the parent is told.
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
  v_slot time;
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

  v_slot := public.next_free_slot(v_new);
  if v_slot is null then
    raise exception 'SESSION_FULL' using errcode = '22023';
  end if;

  begin
    update public.appointments a
       set session_id = v_new.id,
           appointment_date = v_new.date,
           slot_time = v_slot,
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

-- Notifications carry the exact time as well as the session.

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
           'appointment_time', to_char(a.slot_time, 'HH24:MI'),
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
           'appointment_date', s.date,
           'appointment_time', to_char(a.slot_time, 'HH24:MI'),
           'start_time', to_char(s.start_time, 'HH24:MI'),
           'end_time', to_char(s.end_time, 'HH24:MI')
         )
    from public.appointments a
    join public.availability_sessions s on s.id = a.session_id
    join public.children c on c.id = a.child_id
    join public.staff st on st.clinic_id = s.clinic_id and st.role = 'doctor'
   where a.id = p_appointment_id;
$$;

create or replace function public.notify_booking_decision(p_appointment_id uuid, p_decision text)
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
           'appointment_time', to_char(a.slot_time, 'HH24:MI'),
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
           'appointment_time', to_char(a.slot_time, 'HH24:MI'),
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

-- Read models: slot length, next free time, and each booking's exact time.

drop function public.booking_window();

create function public.booking_window()
returns table (clinic_id uuid, today date, from_date date, to_date date, slot_minutes integer)
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
    public.setting_int(c.id, 'appointment_slot_minutes')
  from public.clinics c
 where c.id = public.default_clinic_id();
$$;

drop function public.appointment_sessions(uuid, date, date);

create function public.appointment_sessions(p_clinic_id uuid, p_from date, p_to date)
returns table (
  session_id uuid,
  clinic_id uuid,
  date date,
  start_time time,
  end_time time,
  max_bookings integer,
  booked_count integer,
  next_free_time time
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
    ),
    public.next_free_slot(s)
  from public.availability_sessions s
 where s.clinic_id = p_clinic_id
   and s.date between p_from and p_to
   and s.cancelled_at is null
 order by s.date, s.start_time;
$$;

drop function public.my_appointments();

create function public.my_appointments()
returns table (
  appointment_id uuid,
  child_id uuid,
  child_name text,
  session_id uuid,
  date date,
  start_time time,
  end_time time,
  slot_time time,
  status public.appointment_status
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, c.id, c.name, s.id, s.date, s.start_time, s.end_time, a.slot_time, a.status
    from public.appointments a
    join public.availability_sessions s on s.id = a.session_id
    join public.children c on c.id = a.child_id
    join public.parents p on p.id = c.parent_id
   where p.user_id = auth.uid()
     and a.status in ('pending', 'booked', 'rejected')
     and a.appointment_date >= public.clinic_today(s.clinic_id)
   order by s.date, coalesce(a.slot_time, s.start_time);
$$;

drop function public.clinic_appointments(uuid, date, date);

create function public.clinic_appointments(p_clinic_id uuid, p_from date, p_to date)
returns table (
  session_id uuid,
  date date,
  start_time time,
  end_time time,
  max_bookings integer,
  booked_count integer,
  appointment_id uuid,
  appointment_status public.appointment_status,
  slot_time time,
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
    s.max_bookings,
    (
      select count(*)::integer
        from public.appointments b
       where b.session_id = s.id and b.status in ('pending', 'booked', 'attended')
    ),
    a.id,
    a.status,
    a.slot_time,
    c.id,
    c.name,
    c.dob,
    p.name,
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
 order by s.date, s.start_time, a.slot_time nulls last, c.name;
$$;

-- ============================================================================
-- 4. One app rating per parent
-- ============================================================================

alter table public.ratings
  add column parent_id uuid references public.parents (id) on delete cascade;

update public.ratings r
   set parent_id = c.parent_id
  from public.visits v
  join public.children c on c.id = v.child_id
 where v.id = r.visit_id;

-- If a parent rated more than once before this rule, keep their first rating.
delete from public.ratings r
 using public.ratings earlier
 where earlier.parent_id = r.parent_id
   and (earlier.created_at, earlier.visit_id) < (r.created_at, r.visit_id);

alter table public.ratings alter column parent_id set not null;

create unique index ratings_one_per_parent on public.ratings (parent_id);

-- Ratings are written only through submit_app_rating, which enforces the rule.
drop policy ratings_insert_own_parent on public.ratings;

/** True once the signed-in parent has rated the app. */
create function public.has_rated_app()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.ratings r
      join public.parents p on p.id = r.parent_id
     where p.user_id = auth.uid()
  );
$$;

/** Rates the app from a visit summary. Once per parent — a second try gets ALREADY_RATED. */
create function public.submit_app_rating(p_visit_id uuid, p_stars integer)
returns public.ratings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_id uuid;
  v_rating public.ratings;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;

  select c.parent_id into v_parent_id
    from public.visits v
    join public.children c on c.id = v.child_id
    join public.parents p on p.id = c.parent_id
   where v.id = p_visit_id and p.user_id = auth.uid();

  if v_parent_id is null then
    raise exception 'VISIT_NOT_FOUND' using errcode = '42501';
  end if;

  begin
    insert into public.ratings (visit_id, parent_id, stars)
    values (p_visit_id, v_parent_id, p_stars)
    returning * into v_rating;
  exception when unique_violation then
    raise exception 'ALREADY_RATED' using errcode = '23505';
  end;

  return v_rating;
end;
$$;

-- ============================================================================
-- Function privileges
-- ============================================================================

revoke execute on function public.doctor_queue(uuid) from public, anon;
revoke execute on function public.create_session(uuid, date, time, time) from public, anon;
revoke execute on function public.booking_window() from public, anon;
revoke execute on function public.appointment_sessions(uuid, date, date) from public, anon;
revoke execute on function public.my_appointments() from public, anon;
revoke execute on function public.clinic_appointments(uuid, date, date) from public, anon;
revoke execute on function public.has_rated_app() from public, anon;
revoke execute on function public.submit_app_rating(uuid, integer) from public, anon;
revoke execute on function public.next_free_slot(public.availability_sessions) from public, anon, authenticated;

grant execute on function public.doctor_queue(uuid) to authenticated;
grant execute on function public.create_session(uuid, date, time, time) to authenticated;
grant execute on function public.booking_window() to authenticated;
grant execute on function public.appointment_sessions(uuid, date, date) to authenticated;
grant execute on function public.my_appointments() to authenticated;
grant execute on function public.clinic_appointments(uuid, date, date) to authenticated;
grant execute on function public.has_rated_app() to authenticated;
grant execute on function public.submit_app_rating(uuid, integer) to authenticated;
