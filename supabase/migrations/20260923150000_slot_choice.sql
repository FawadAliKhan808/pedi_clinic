-- Parents choose their own appointment time, and a child may have more than
-- one token or appointment on the same day.
--
--   1. No automatic slot assignment: booking and rescheduling take the slot
--      the person picked, checked against the session's grid and what's free.
--   2. Drop "one active token per child per day" and "one appointment per
--      child per day". (The per-phone daily token limit still applies.)

-- ============================================================================
-- 2. Same-day restrictions
-- ============================================================================

drop index public.visits_one_active_per_child_per_day;
drop index public.appointments_one_per_child_per_day;

-- ============================================================================
-- 1. Chosen slots
-- ============================================================================

/**
 * Every slot of a session nobody holds, in order — skipping slots already
 * past when the session is today. Slot n starts n slot-lengths after the
 * session start, for n below the session's capacity.
 */
create function public.session_free_slots(p_session public.availability_sessions)
returns time[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(slot order by slot), '{}')
    from (
      select p_session.start_time
               + make_interval(mins => n * public.setting_int(p_session.clinic_id, 'appointment_slot_minutes')) as slot
        from generate_series(0, p_session.max_bookings - 1) as n
    ) slots
   where not exists (
           select 1 from public.appointments a
            where a.session_id = p_session.id
              and a.status in ('pending', 'booked', 'attended')
              and a.slot_time = slots.slot
         )
     and (
           p_session.date > public.clinic_today(p_session.clinic_id)
           or slots.slot > public.clinic_local_time(p_session.clinic_id)
         );
$$;

/**
 * Raises unless p_slot is a free slot of the session. `p_ignore_appointment`
 * lets a booking keep its own slot when moving within a session.
 * The caller must hold the session row's lock.
 */
create function public.assert_slot_free(
  p_session public.availability_sessions,
  p_slot time,
  p_ignore_appointment uuid
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_slot_minutes integer := public.setting_int(p_session.clinic_id, 'appointment_slot_minutes');
  v_offset integer;
begin
  if p_slot is null then
    raise exception 'INVALID_SLOT' using errcode = '22023';
  end if;

  v_offset := public.minutes_of_day(p_slot) - public.minutes_of_day(p_session.start_time);
  if v_offset < 0
     or v_offset % v_slot_minutes <> 0
     or v_offset / v_slot_minutes >= p_session.max_bookings
     or extract(second from p_slot) <> 0 then
    raise exception 'INVALID_SLOT' using errcode = '22023';
  end if;

  if p_session.date = public.clinic_today(p_session.clinic_id)
     and p_slot <= public.clinic_local_time(p_session.clinic_id) then
    raise exception 'SESSION_IN_PAST' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.appointments a
     where a.session_id = p_session.id
       and a.slot_time = p_slot
       and a.status in ('pending', 'booked', 'attended')
       and a.id is distinct from p_ignore_appointment
  ) then
    raise exception 'SLOT_TAKEN' using errcode = '23505';
  end if;
end;
$$;

drop function public.book_appointment(uuid, uuid);

/** Parent requests the slot they picked; the doctor is asked to approve. */
create function public.book_appointment(p_session_id uuid, p_child_id uuid, p_slot_time time)
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
  perform public.assert_slot_free(v_session, p_slot_time, null);

  begin
    insert into public.appointments (session_id, child_id, appointment_date, status, slot_time)
    values (v_session.id, p_child_id, v_session.date, 'pending', p_slot_time)
    returning * into v_appointment;
  exception when unique_violation then
    raise exception 'SLOT_TAKEN' using errcode = '23505';
  end;

  perform public.notify_booking_request(v_appointment.id);

  return v_appointment;
end;
$$;

drop function public.reschedule_appointment(uuid, uuid);

/**
 * Moves a pending or confirmed appointment to the slot picked — in another
 * session or the same one. A parent's move goes back to the doctor for
 * approval; the doctor's counts as confirming it, and the parent is told.
 */
create function public.reschedule_appointment(
  p_appointment_id uuid,
  p_new_session_id uuid,
  p_slot_time time
)
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
  if p_new_session_id = v_appointment.session_id
     and p_slot_time = v_appointment.slot_time then
    return v_appointment;
  end if;

  select s.* into v_new
    from public.availability_sessions s
   where s.id = p_new_session_id
   for update;

  if v_new.id is null or v_new.clinic_id <> v_old.clinic_id then
    raise exception 'SESSION_NOT_FOUND' using errcode = '23503';
  end if;

  -- Moving within a session doesn't need a spare seat, only the new time.
  if v_new.id <> v_old.id then
    perform public.assert_session_bookable(v_new, not v_is_doctor);
  end if;
  perform public.assert_slot_free(v_new, p_slot_time, v_appointment.id);

  begin
    update public.appointments a
       set session_id = v_new.id,
           appointment_date = v_new.date,
           slot_time = p_slot_time,
           status = (case when v_is_doctor then 'booked' else 'pending' end)::public.appointment_status
     where a.id = v_appointment.id
    returning a.* into v_appointment;
  exception when unique_violation then
    raise exception 'SLOT_TAKEN' using errcode = '23505';
  end;

  if v_is_doctor and not v_is_parent then
    perform public.notify_appointment_change(v_appointment.id, 'rescheduled');
  else
    perform public.notify_booking_request(v_appointment.id);
  end if;

  return v_appointment;
end;
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
  free_slots time[]
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
    public.session_free_slots(s)
  from public.availability_sessions s
 where s.clinic_id = p_clinic_id
   and s.date between p_from and p_to
   and s.cancelled_at is null
 order by s.date, s.start_time;
$$;

drop function public.next_free_slot(public.availability_sessions);

-- ============================================================================
-- Arrival: with several bookings that day, link the earliest one
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
     order by coalesce(a.slot_time, s.start_time)
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

-- ============================================================================
-- Function privileges
-- ============================================================================

revoke execute on function public.book_appointment(uuid, uuid, time) from public, anon;
revoke execute on function public.reschedule_appointment(uuid, uuid, time) from public, anon;
revoke execute on function public.appointment_sessions(uuid, date, date) from public, anon;
revoke execute on function public.session_free_slots(public.availability_sessions) from public, anon, authenticated;
revoke execute on function public.assert_slot_free(public.availability_sessions, time, uuid) from public, anon, authenticated;

grant execute on function public.book_appointment(uuid, uuid, time) to authenticated;
grant execute on function public.reschedule_appointment(uuid, uuid, time) to authenticated;
grant execute on function public.appointment_sessions(uuid, date, date) to authenticated;
