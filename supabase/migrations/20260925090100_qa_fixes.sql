-- QA fixes (safe to re-run: every object is create-or-replace):
--   1. A child's date of birth can't be in the future (any insert/update).
--   2. Parents can edit a child, and delete one that has no visit history.
--   3. A child already waiting, called or with the doctor can't get another
--      token until that visit ends ("Currently in queue").
--   4. One booking per child per day.
--   5. Walk-ins need an exact 10-digit phone number.
--   6. Parents are told when their child's token is skipped or removed.
--   7. Analytics: "arrived" counts tokens linked to a booking on the day the
--      child came (not the booking's date).

-- ============================================================================
-- 1. No future dates of birth
-- ============================================================================

create or replace function public.children_check_dob()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.dob > public.clinic_today(public.default_clinic_id()) then
    raise exception 'INVALID_DOB' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists children_dob_not_future on public.children;
create trigger children_dob_not_future
  before insert or update of dob on public.children
  for each row execute function public.children_check_dob();

-- ============================================================================
-- 2. Edit / delete a child (parent)
-- ============================================================================

/** Corrects a child's name or date of birth. Own child only. */
create or replace function public.update_child(p_child_id uuid, p_name text, p_dob date)
returns public.children
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child public.children;
begin
  if not public.is_own_child(p_child_id) then
    raise exception 'CHILD_NOT_FOUND' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' or p_dob is null then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;

  update public.children c
     set name = trim(p_name), dob = p_dob
   where c.id = p_child_id
  returning c.* into v_child;

  return v_child;
end;
$$;

/**
 * Deletes a child added by mistake. A child who has been to the clinic keeps
 * their records, so one with any visit can't be deleted (CHILD_HAS_VISITS).
 * Upcoming bookings go with the child.
 */
create or replace function public.delete_child(p_child_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_own_child(p_child_id) then
    raise exception 'CHILD_NOT_FOUND' using errcode = '42501';
  end if;
  if exists (select 1 from public.visits v where v.child_id = p_child_id) then
    raise exception 'CHILD_HAS_VISITS' using errcode = '22023';
  end if;

  delete from public.children c where c.id = p_child_id;
end;
$$;

-- ============================================================================
-- 3. No second token while one is in play
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
  v_seq integer;
  v_appointment_id uuid := p_appointment_id;
  v_visit public.visits;
begin
  -- One lock per clinic-day: token numbers can't collide, and the "already in
  -- the queue" check below can't race a second check-in.
  perform pg_advisory_xact_lock(hashtext(p_clinic_id::text || ':' || v_date::text));

  if exists (
    select 1 from public.visits v
     where v.child_id = p_child_id
       and v.clinic_id = p_clinic_id
       and v.visit_date = v_date
       and v.status in ('waiting', 'called', 'in_consultation')
  ) then
    raise exception 'ACTIVE_TOKEN_EXISTS' using errcode = '23505';
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

-- ============================================================================
-- 4. One booking per child per day
-- ============================================================================

create or replace function public.book_appointment(
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

  -- One booking per child per day. The lock is per child-day, so two taps
  -- booking the same child into different sessions can't both get through.
  perform pg_advisory_xact_lock(hashtext('booking:' || p_child_id::text || ':' || v_session.date::text));
  if exists (
    select 1 from public.appointments a
     where a.child_id = p_child_id
       and a.appointment_date = v_session.date
       and a.status in ('booked', 'attended', 'pending')
  ) then
    raise exception 'APPOINTMENT_EXISTS_FOR_DAY' using errcode = '23505';
  end if;

  insert into public.appointments (session_id, child_id, appointment_date, status, visit_reason)
  values (v_session.id, p_child_id, v_session.date, 'booked', p_visit_reason)
  returning * into v_appointment;

  perform public.notify_booking_request(v_appointment.id);

  return v_appointment;
end;
$$;

-- ============================================================================
-- 5. Walk-ins: exact 10-digit phone, no future date of birth
-- ============================================================================

create or replace function public.add_walk_in(
  p_clinic_id uuid,
  p_child_name text,
  p_child_dob date,
  p_parent_phone text,
  p_visit_reason public.visit_reason
)
returns public.visits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_id uuid;
  v_child_id uuid;
  v_visit public.visits;
begin
  if not public.is_clinic_staff(p_clinic_id, array['doctor']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if coalesce(trim(p_child_name), '') = '' then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;
  -- Exactly 10 digits: the parent later signs in with this number.
  if coalesce(trim(p_parent_phone), '') !~ '^[0-9]{10}$' then
    raise exception 'INVALID_PHONE' using errcode = '22023';
  end if;
  if p_child_dob > public.clinic_today(p_clinic_id) then
    raise exception 'INVALID_DOB' using errcode = '22023';
  end if;

  select p.id into v_parent_id
    from public.parents p
   where p.phone = trim(p_parent_phone);

  if v_parent_id is null then
    insert into public.parents (phone) values (trim(p_parent_phone))
    returning id into v_parent_id;
  end if;

  select c.id into v_child_id
    from public.children c
   where c.parent_id = v_parent_id
     and lower(c.name) = lower(trim(p_child_name))
     and c.dob = p_child_dob;

  if v_child_id is null then
    insert into public.children (parent_id, name, dob)
    values (v_parent_id, trim(p_child_name), p_child_dob)
    returning id into v_child_id;
  end if;

  v_visit := public.assign_token(p_clinic_id, v_child_id, p_visit_reason, null, null);

  update public.visits v
     set source = 'walk_in'
   where v.id = v_visit.id
  returning v.* into v_visit;

  return v_visit;
end;
$$;

-- ============================================================================
-- 6. Skipped / removed notifications
-- ============================================================================

create or replace function public.queue_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.status = 'called'
     and (old.status is distinct from new.status or old.called_at is distinct from new.called_at) then
    insert into public.notifications (user_id, type, visit_id, payload)
    select p.user_id,
           'your_turn',
           new.id,
           jsonb_build_object('child_name', c.name, 'seq', new.seq)
      from public.children c
      join public.parents p on p.id = c.parent_id
     where c.id = new.child_id
       and p.user_id is not null;
  end if;

  -- Skipped or removed by the doctor: tell the parent straight away.
  if tg_op = 'UPDATE'
     and new.status in ('skipped', 'removed')
     and old.status is distinct from new.status then
    insert into public.notifications (user_id, type, visit_id, payload)
    select p.user_id,
           (case when new.status = 'skipped' then 'token_skipped' else 'token_removed' end)::public.notification_type,
           new.id,
           jsonb_build_object('child_name', c.name, 'seq', new.seq)
      from public.children c
      join public.parents p on p.id = c.parent_id
     where c.id = new.child_id
       and p.user_id is not null;
  end if;

  insert into public.notifications (user_id, type, visit_id, payload)
  select p.user_id,
         'third_in_line',
         v.id,
         jsonb_build_object('child_name', c.name, 'seq', v.seq)
    from public.visits v
    join public.children c on c.id = v.child_id
    join public.parents p on p.id = c.parent_id
   where v.clinic_id = new.clinic_id
     and v.visit_date = new.visit_date
     and v.status = 'waiting'
     and p.user_id is not null
     and (
       select count(*)
         from public.visits ahead
        where ahead.clinic_id = v.clinic_id
          and ahead.visit_date = v.visit_date
          and ahead.status = 'waiting'
          and ahead.seq < v.seq
     ) = 2
  on conflict (visit_id) where type = 'third_in_line' do nothing;

  return null;
end;
$$;

-- ============================================================================
-- 7. Analytics: arrivals counted from tokens
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
      -- Arrived: tokens issued in the range that are linked to a booking —
      -- counted on the day the child actually came (which can differ from the
      -- booking's date, e.g. "coming for the same reason" early). Missed:
      -- bookings in the range whose day passed with no check-in.
      'appointments', jsonb_build_object(
        'attended', (select count(*) from tokens t where t.appointment_id is not null and t.status <> 'removed'),
        'missed', (
          select count(*)
            from public.appointments a
            join public.availability_sessions s on s.id = a.session_id
           where s.clinic_id = p_clinic_id
             and a.appointment_date between p_from and p_to
             and a.status = 'missed'
        )
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
      -- Arrived: that day's tokens linked to a booking (whatever date the
      -- booking was for). Missed / not arrived: that day's bookings.
      'appointments', jsonb_build_object(
        'attended', (
          select count(*)
            from public.visits v
           where v.clinic_id = p_clinic_id
             and v.visit_date = p_date
             and v.appointment_id is not null
             and v.status <> 'removed'
        ),
        'missed', (
          select count(*)
            from public.appointments a
            join public.availability_sessions s on s.id = a.session_id
           where s.clinic_id = p_clinic_id
             and a.appointment_date = p_date
             and a.status = 'missed'
        ),
        'not_arrived', (
          select count(*)
            from public.appointments a
            join public.availability_sessions s on s.id = a.session_id
           where s.clinic_id = p_clinic_id
             and a.appointment_date = p_date
             and a.status = 'booked'
        )
      )
    )
  );
end;
$$;

-- ============================================================================
-- Function privileges
-- ============================================================================

revoke execute on function public.update_child(uuid, text, date) from public, anon;
revoke execute on function public.delete_child(uuid) from public, anon;
grant execute on function public.update_child(uuid, text, date) to authenticated;
grant execute on function public.delete_child(uuid) to authenticated;
revoke execute on function public.children_check_dob() from public, anon, authenticated;
