-- Phase 7: appointments — availability sessions, booking, rescheduling and
-- cancelling, linking an appointment to the token on arrival, and the
-- scheduled jobs (reminders, follow-ups, missed-marking).
--
-- Booking is race-safe the same way token assignment is: the session row is
-- locked before its bookings are counted, and "one appointment per child per
-- day" is a partial unique index. Appointments don't change queue order —
-- arrival still goes through the normal first-come-first-served token.

-- ============================================================================
-- Settings helper
-- ============================================================================

/** Reads a text setting. Raises rather than falling back to a hardcoded default. */
create function public.setting_text(p_clinic_id uuid, p_key text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_value jsonb;
begin
  select s.value into v_value
    from public.settings s
   where s.clinic_id = p_clinic_id and s.key = p_key;

  if v_value is null then
    raise exception 'SETTING_MISSING:%', p_key using errcode = '22023';
  end if;

  return v_value #>> '{}';
end;
$$;

/** The clinic's current local wall-clock time, for "has this session ended?". */
create function public.clinic_local_time(p_clinic_id uuid)
returns time
language sql
stable
security definer
set search_path = public
as $$
  select (now() at time zone c.timezone)::time
    from public.clinics c
   where c.id = p_clinic_id;
$$;

-- ============================================================================
-- availability_sessions
-- ============================================================================

create table public.availability_sessions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  -- How many of this session's slots are open for appointments. Everything
  -- else stays available for walk-ins; there is no separate walk-in setting.
  max_bookings integer not null check (max_bookings >= 0),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint availability_sessions_time_order check (end_time > start_time)
);

create index availability_sessions_clinic_date_idx
  on public.availability_sessions (clinic_id, date)
  where cancelled_at is null;

create trigger availability_sessions_set_updated_at
  before update on public.availability_sessions
  for each row execute function public.set_updated_at();

-- ============================================================================
-- appointments
-- ============================================================================

create type public.appointment_status as enum ('booked', 'cancelled', 'missed', 'attended');

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.availability_sessions (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  -- Copied from the session so "one per child per day" can be a unique index.
  appointment_date date not null,
  status public.appointment_status not null default 'booked',
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index appointments_one_per_child_per_day
  on public.appointments (child_id, appointment_date)
  where status in ('booked', 'attended');

create index appointments_session_id_idx on public.appointments (session_id);
create index appointments_date_status_idx on public.appointments (appointment_date, status);

create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

-- The FK that Phase 2 deferred until appointments existed.
alter table public.visits
  add constraint visits_appointment_id_fkey
  foreign key (appointment_id) references public.appointments (id) on delete set null;

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.availability_sessions enable row level security;
alter table public.appointments enable row level security;

-- Session times and capacity carry no personal data; parents need them to book.
create policy availability_sessions_select_authenticated on public.availability_sessions
  for select
  to authenticated
  using (true);

create policy appointments_select_own on public.appointments
  for select
  to authenticated
  using (public.is_own_child(appointments.child_id));

create policy appointments_select_staff on public.appointments
  for select
  to authenticated
  using (
    exists (
      select 1 from public.availability_sessions s
       where s.id = appointments.session_id
         and public.is_clinic_staff(
               s.clinic_id,
               array['doctor', 'pharmacist']::public.staff_role[]
             )
    )
  );

-- ============================================================================
-- Notifications: appointment and follow-up reminders
-- ============================================================================

alter table public.notifications
  add column appointment_id uuid references public.appointments (id) on delete cascade;

create unique index notifications_appointment_reminder_once
  on public.notifications (appointment_id, type)
  where type in ('appointment_today', 'appointment_tomorrow');

create unique index notifications_follow_up_once
  on public.notifications (visit_id)
  where type = 'follow_up_reminder';

/** Queues "your appointment changed" for the child's parent, if they have an account. */
create function public.notify_appointment_change(
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

-- ============================================================================
-- Booking rules
-- ============================================================================

/**
 * Raises unless a new booking may land in this session: not cancelled, not
 * already over, within the booking window (for parents), and not full.
 * The caller must already hold the session row's lock.
 */
create function public.assert_session_bookable(
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

  -- "Within the next N days" = today plus the following N-1 days.
  if p_enforce_window
     and p_session.date > v_today + (public.setting_int(p_session.clinic_id, 'booking_window_days') - 1) then
    raise exception 'OUTSIDE_BOOKING_WINDOW' using errcode = '22023';
  end if;

  select count(*) into v_booked
    from public.appointments a
   where a.session_id = p_session.id
     and a.status in ('booked', 'attended');

  if v_booked >= p_session.max_bookings then
    raise exception 'SESSION_FULL' using errcode = '22023';
  end if;
end;
$$;

/** Parent books a session for their child. */
create function public.book_appointment(p_session_id uuid, p_child_id uuid)
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

  -- Locking the session serialises concurrent bookings of the same session,
  -- so the capacity count below can't be raced.
  select s.* into v_session
    from public.availability_sessions s
   where s.id = p_session_id
   for update;

  if v_session.id is null then
    raise exception 'SESSION_NOT_FOUND' using errcode = '23503';
  end if;

  perform public.assert_session_bookable(v_session, true);

  begin
    insert into public.appointments (session_id, child_id, appointment_date)
    values (v_session.id, p_child_id, v_session.date)
    returning * into v_appointment;
  exception when unique_violation then
    raise exception 'APPOINTMENT_EXISTS_FOR_DAY' using errcode = '23505';
  end;

  return v_appointment;
end;
$$;

/**
 * Moves a booked appointment to another session. The parent is held to the
 * booking window; the doctor isn't. When the doctor does it, the parent is
 * told straight away.
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

  begin
    update public.appointments a
       set session_id = v_new.id,
           appointment_date = v_new.date
     where a.id = v_appointment.id
    returning a.* into v_appointment;
  exception when unique_violation then
    raise exception 'APPOINTMENT_EXISTS_FOR_DAY' using errcode = '23505';
  end;

  if v_is_doctor and not v_is_parent then
    perform public.notify_appointment_change(v_appointment.id, 'rescheduled');
  end if;

  return v_appointment;
end;
$$;

/** Cancels a booked appointment, no cutoff. The doctor cancelling notifies the parent. */
create function public.cancel_appointment(p_appointment_id uuid)
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
  if v_appointment.status <> 'booked' then
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

-- ============================================================================
-- Doctor: availability
-- ============================================================================

create function public.create_session(
  p_clinic_id uuid,
  p_date date,
  p_start_time time,
  p_end_time time,
  p_max_bookings integer
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
  if p_end_time <= p_start_time then
    raise exception 'INVALID_SESSION_TIMES' using errcode = '22023';
  end if;
  if coalesce(p_max_bookings, -1) < 0 then
    raise exception 'INVALID_INPUT' using errcode = '22023';
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
  values (p_clinic_id, p_date, p_start_time, p_end_time, p_max_bookings)
  returning * into v_session;

  return v_session;
end;
$$;

/** Changes how many appointment slots a session offers — never below what's booked. */
create function public.update_session_capacity(p_session_id uuid, p_max_bookings integer)
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
   where a.session_id = p_session_id and a.status in ('booked', 'attended');

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

/** Cancels a session and every booking in it, telling each parent. Returns bookings affected. */
create function public.cancel_session(p_session_id uuid)
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
       and a.status = 'booked'
    returning a.id
  loop
    perform public.notify_appointment_change(v_appointment_id, 'cancelled');
    v_affected := v_affected + 1;
  end loop;

  return v_affected;
end;
$$;

/** "Mark day closed": cancels every session that day. Returns bookings affected. */
create function public.close_day(p_clinic_id uuid, p_date date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_affected integer := 0;
begin
  if not public.is_clinic_staff(p_clinic_id, array['doctor']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  for v_session_id in
    select s.id
      from public.availability_sessions s
     where s.clinic_id = p_clinic_id
       and s.date = p_date
       and s.cancelled_at is null
  loop
    v_affected := v_affected + public.cancel_session(v_session_id);
  end loop;

  return v_affected;
end;
$$;

/**
 * "Copy last week": repeats every live session of the source week, same
 * weekday and times, into the target week. Skips days already past and slots
 * that would overlap an existing session. Returns sessions created.
 */
create function public.copy_week(
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

    insert into public.availability_sessions (clinic_id, date, start_time, end_time, max_bookings)
    values (p_clinic_id, v_source.date + v_offset, v_source.start_time, v_source.end_time, v_source.max_bookings);
    v_created := v_created + 1;
  end loop;

  return v_created;
end;
$$;

-- ============================================================================
-- Read models
-- ============================================================================

/** Single-clinic MVP: the booking window as the clinic sees it (IST), from settings. */
create function public.booking_window()
returns table (clinic_id uuid, today date, from_date date, to_date date)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    public.clinic_today(c.id),
    public.clinic_today(c.id),
    public.clinic_today(c.id) + (public.setting_int(c.id, 'booking_window_days') - 1)
  from public.clinics c
 where c.id = public.default_clinic_id();
$$;

/** Live sessions in a date range with how many slots are taken. No personal data. */
create function public.appointment_sessions(p_clinic_id uuid, p_from date, p_to date)
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
       where a.session_id = s.id and a.status in ('booked', 'attended')
    )
  from public.availability_sessions s
 where s.clinic_id = p_clinic_id
   and s.date between p_from and p_to
   and s.cancelled_at is null
 order by s.date, s.start_time;
$$;

/** The signed-in parent's upcoming, still-booked appointments. */
create function public.my_appointments()
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
     and a.status = 'booked'
     and a.appointment_date >= public.clinic_today(s.clinic_id)
   order by s.date, s.start_time;
$$;

/**
 * The doctor's appointments view: every live session in the range, with its
 * bookings (a session with none still appears, as a row with null booking).
 */
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
       where b.session_id = s.id and b.status in ('booked', 'attended')
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
    on a.session_id = s.id and a.status in ('booked', 'attended', 'missed')
  left join public.children c on c.id = a.child_id
  left join public.parents p on p.id = c.parent_id
 where s.clinic_id = p_clinic_id
   and s.date between p_from and p_to
   and s.cancelled_at is null
   and public.is_clinic_staff(p_clinic_id, array['doctor']::public.staff_role[])
 order by s.date, s.start_time, c.name;
$$;

-- ============================================================================
-- Arrival: the token links today's appointment
-- ============================================================================

/**
 * Same race-safe token assignment as before, now also linking the child's
 * booked appointment for today (if any) and marking it attended. The
 * appointment doesn't change the token's place: the queue stays
 * first-come-first-served.
 */
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
     limit 1;
  end if;

  select coalesce(max(v.seq), 0) + 1 into v_seq
    from public.visits v
   where v.clinic_id = p_clinic_id and v.visit_date = v_date;

  begin
    insert into public.visits (clinic_id, child_id, visit_date, seq, visit_reason, appointment_id)
    values (p_clinic_id, p_child_id, v_date, v_seq, p_visit_reason, v_appointment_id)
    returning * into v_visit;
  exception when unique_violation then
    raise exception 'ACTIVE_TOKEN_EXISTS' using errcode = '23505';
  end;

  if v_appointment_id is not null then
    update public.appointments a
       set status = 'attended'
     where a.id = v_appointment_id and a.status = 'booked';
  end if;

  return v_visit;
end;
$$;

-- ============================================================================
-- Scheduled jobs
-- ============================================================================

create table public.scheduled_job_runs (
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  job text not null,
  run_date date not null,
  ran_at timestamptz not null default now(),
  primary key (clinic_id, job, run_date)
);

comment on table public.scheduled_job_runs is
  'One row per clinic, job and clinic-local day: makes each daily job run exactly once, and catch up if a tick was missed.';

alter table public.scheduled_job_runs enable row level security;

/** "Appointment today" / "appointment tomorrow" for every booking on p_date. Once per appointment. */
create function public.send_appointment_reminders(
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

/**
 * Follow-up reminders, sent on the morning run from `follow_up_reminder_days_before`
 * days ahead of the follow-up date. A follow-up set at shorter notice than that
 * is reminded the next morning (never the same day it was set). Once per visit.
 */
create function public.send_follow_up_reminders(p_clinic_id uuid, p_today date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days_before integer := public.setting_int(p_clinic_id, 'follow_up_reminder_days_before');
  v_timezone text;
  v_created integer;
begin
  select c.timezone into v_timezone from public.clinics c where c.id = p_clinic_id;

  insert into public.notifications (user_id, type, visit_id, payload)
  select p.user_id,
         'follow_up_reminder',
         v.id,
         jsonb_build_object('child_name', c.name, 'follow_up_date', v.follow_up_date)
    from public.visits v
    join public.children c on c.id = v.child_id
    join public.parents p on p.id = c.parent_id
   where v.clinic_id = p_clinic_id
     and v.status = 'completed'
     and v.follow_up_date is not null
     and v.follow_up_date >= p_today
     and v.follow_up_date - v_days_before <= p_today
     and (v.completed_at at time zone v_timezone)::date < p_today
     and p.user_id is not null
  on conflict (visit_id) where type = 'follow_up_reminder' do nothing;

  get diagnostics v_created = row_count;
  return v_created;
end;
$$;

/** Bookings from past days that never got a token. */
create function public.mark_missed_appointments(p_clinic_id uuid, p_today date)
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
     and a.status = 'booked';

  get diagnostics v_marked = row_count;
  return v_marked;
end;
$$;

/**
 * Kicks the app server to push whatever the jobs just queued. The URL and
 * secret live in Supabase Vault (set by `npm run configure:dispatch` after
 * deploying); until then this is a no-op and reminders wait in the in-app list.
 */
create function public.request_push_dispatch()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  select ds.decrypted_secret into v_url
    from vault.decrypted_secrets ds where ds.name = 'notification_dispatch_url';
  select ds.decrypted_secret into v_secret
    from vault.decrypted_secrets ds where ds.name = 'notification_dispatch_secret';

  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := rtrim(v_url, '/') || '/api/notifications/dispatch',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
end;
$$;

/** Stores where scheduled jobs send the "please push now" request. Service role only. */
create function public.configure_notification_dispatch(p_url text, p_secret text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from vault.secrets
   where name in ('notification_dispatch_url', 'notification_dispatch_secret');
  perform vault.create_secret(p_url, 'notification_dispatch_url');
  perform vault.create_secret(p_secret, 'notification_dispatch_secret');
end;
$$;

/**
 * Runs every few minutes (pg_cron). For each clinic, each daily job fires once,
 * the first tick after the clinic-local time configured in `settings` — so
 * times are data, not code, and a missed tick simply catches up on the next.
 * One clinic's failure (e.g. a missing setting) doesn't stop the others.
 */
create function public.run_scheduled_jobs()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic record;
  v_local timestamp;
  v_today date;
  v_created integer := 0;
  v_missed integer := 0;
begin
  for v_clinic in select c.id, c.timezone from public.clinics c loop
    begin
      v_local := now() at time zone v_clinic.timezone;
      v_today := v_local::date;

      v_missed := v_missed + public.mark_missed_appointments(v_clinic.id, v_today);

      if v_local::time >= public.setting_text(v_clinic.id, 'reminder_morning_time')::time then
        insert into public.scheduled_job_runs (clinic_id, job, run_date)
        values (v_clinic.id, 'morning_reminders', v_today)
        on conflict do nothing;
        if found then
          v_created := v_created
            + public.send_appointment_reminders(v_clinic.id, 'appointment_today', v_today)
            + public.send_follow_up_reminders(v_clinic.id, v_today);
        end if;
      end if;

      if v_local::time >= public.setting_text(v_clinic.id, 'reminder_evening_time')::time then
        insert into public.scheduled_job_runs (clinic_id, job, run_date)
        values (v_clinic.id, 'evening_reminders', v_today)
        on conflict do nothing;
        if found then
          v_created := v_created
            + public.send_appointment_reminders(v_clinic.id, 'appointment_tomorrow', v_today + 1);
        end if;
      end if;
    exception when others then
      raise warning 'scheduled jobs failed for clinic %: %', v_clinic.id, sqlerrm;
    end;
  end loop;

  if v_created > 0 then
    perform public.request_push_dispatch();
  end if;

  return jsonb_build_object('notifications_created', v_created, 'appointments_missed', v_missed);
end;
$$;

-- ============================================================================
-- Scheduling
-- ============================================================================

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'pedi-clinic-scheduled-jobs',
  '*/5 * * * *',
  'select public.run_scheduled_jobs()'
);

-- ============================================================================
-- Function privileges
-- ============================================================================

revoke execute on function public.book_appointment(uuid, uuid) from public, anon;
revoke execute on function public.reschedule_appointment(uuid, uuid) from public, anon;
revoke execute on function public.cancel_appointment(uuid) from public, anon;
revoke execute on function public.create_session(uuid, date, time, time, integer) from public, anon;
revoke execute on function public.update_session_capacity(uuid, integer) from public, anon;
revoke execute on function public.cancel_session(uuid) from public, anon;
revoke execute on function public.close_day(uuid, date) from public, anon;
revoke execute on function public.copy_week(uuid, date, date) from public, anon;
revoke execute on function public.booking_window() from public, anon;
revoke execute on function public.appointment_sessions(uuid, date, date) from public, anon;
revoke execute on function public.my_appointments() from public, anon;
revoke execute on function public.clinic_appointments(uuid, date, date) from public, anon;

grant execute on function public.book_appointment(uuid, uuid) to authenticated;
grant execute on function public.reschedule_appointment(uuid, uuid) to authenticated;
grant execute on function public.cancel_appointment(uuid) to authenticated;
grant execute on function public.create_session(uuid, date, time, time, integer) to authenticated;
grant execute on function public.update_session_capacity(uuid, integer) to authenticated;
grant execute on function public.cancel_session(uuid) to authenticated;
grant execute on function public.close_day(uuid, date) to authenticated;
grant execute on function public.copy_week(uuid, date, date) to authenticated;
grant execute on function public.booking_window() to authenticated;
grant execute on function public.appointment_sessions(uuid, date, date) to authenticated;
grant execute on function public.my_appointments() to authenticated;
grant execute on function public.clinic_appointments(uuid, date, date) to authenticated;

-- Internal machinery: callable by the scheduler and service role only.
revoke execute on function public.notify_appointment_change(uuid, text) from public, anon, authenticated;
revoke execute on function public.assert_session_bookable(public.availability_sessions, boolean) from public, anon, authenticated;
revoke execute on function public.send_appointment_reminders(uuid, public.notification_type, date) from public, anon, authenticated;
revoke execute on function public.send_follow_up_reminders(uuid, date) from public, anon, authenticated;
revoke execute on function public.mark_missed_appointments(uuid, date) from public, anon, authenticated;
revoke execute on function public.request_push_dispatch() from public, anon, authenticated;
revoke execute on function public.configure_notification_dispatch(text, text) from public, anon, authenticated;
revoke execute on function public.run_scheduled_jobs() from public, anon, authenticated;

grant execute on function public.send_appointment_reminders(uuid, public.notification_type, date) to service_role;
grant execute on function public.send_follow_up_reminders(uuid, date) to service_role;
grant execute on function public.mark_missed_appointments(uuid, date) to service_role;
grant execute on function public.configure_notification_dispatch(text, text) to service_role;
grant execute on function public.run_scheduled_jobs() to service_role;
