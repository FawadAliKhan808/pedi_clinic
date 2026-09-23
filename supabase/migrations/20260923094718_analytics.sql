-- Phase 8: doctor analytics, the end-of-day summary, and the owner dashboard.
--
-- All three are read-only SECURITY DEFINER functions that check the caller's
-- role themselves: revenue is doctor-only (never the pharmacist), and ratings /
-- install adoption are owner-only (never clinic staff).

-- ============================================================================
-- Two data points analytics needs that weren't recorded yet
-- ============================================================================

-- "Average consultation duration" needs the moment the consultation started,
-- not just when the child was called.
alter table public.visits add column consultation_started_at timestamptz;

-- "App tokens vs manually added walk-ins" needs to know who created the token.
create type public.visit_source as enum ('app', 'walk_in');
alter table public.visits add column source public.visit_source not null default 'app';

create or replace function public.start_consultation(p_visit_id uuid)
returns public.visits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit public.visits;
begin
  select v.* into v_visit from public.visits v where v.id = p_visit_id;
  if v_visit.id is null then
    raise exception 'VISIT_NOT_FOUND' using errcode = '23503';
  end if;
  if not public.is_clinic_staff(v_visit.clinic_id, array['doctor']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_visit.status <> 'called' then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = '22023';
  end if;

  update public.visits v
     set status = 'in_consultation', consultation_started_at = now()
   where v.id = p_visit_id
  returning v.* into v_visit;

  return v_visit;
end;
$$;

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
  if coalesce(trim(p_child_name), '') = '' or coalesce(trim(p_parent_phone), '') = '' then
    raise exception 'INVALID_INPUT' using errcode = '22023';
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
-- Doctor analytics
-- ============================================================================

/**
 * Everything on the doctor's Analytics tab for a date range, in one call.
 * "Patients" are completed visits. Revenue is consultation money (fees and
 * payments), not pharmacy sales. Daily rows cover every date in the range,
 * zero-filled, so charts never have gaps; weekly/monthly views sum them.
 */
create function public.doctor_analytics(p_clinic_id uuid, p_from date, p_to date)
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
          'card', coalesce((select sum(p.amount) from completed c join public.payments p on p.visit_id = c.id where c.visit_date = d.day and p.mode = 'card'), 0)
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
      -- Follow-ups falling due in the range (and already due), and how many of
      -- those children came back within the grace period.
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

/** The day's close-out for the doctor: patients seen, money by mode and fee type, appointments. */
create function public.end_of_day_summary(p_clinic_id uuid, p_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_clinic_staff(p_clinic_id, array['doctor']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return (
    with completed as (
      select v.id
        from public.visits v
       where v.clinic_id = p_clinic_id
         and v.visit_date = p_date
         and v.status = 'completed'
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
      'appointments', (
        select jsonb_build_object(
          'attended', count(*) filter (where a.status = 'attended'),
          'missed', count(*) filter (where a.status = 'missed'),
          -- Still booked with no token: "missed" once the day is over.
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
-- Owner dashboard
-- ============================================================================

/**
 * The owner team's view, across every clinic: app rating, adoption, and how
 * tokens are created. Owner-only — never visible to doctor or pharmacist.
 */
create function public.owner_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_staff(array['owner']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'ratings', (
      select jsonb_build_object(
        'count', count(*),
        'average', round(avg(r.stars)::numeric, 2),
        'distribution', jsonb_build_object(
          '1', count(*) filter (where r.stars = 1),
          '2', count(*) filter (where r.stars = 2),
          '3', count(*) filter (where r.stars = 3),
          '4', count(*) filter (where r.stars = 4),
          '5', count(*) filter (where r.stars = 5)
        )
      )
      from public.ratings r
    ),
    'adoption', jsonb_build_object(
      'parents_registered', (select count(*) from public.parents p where p.user_id is not null),
      'installed', (select count(*) from public.installs),
      'notifications_enabled', (select count(*) from public.installs i where i.notifications_enabled_at is not null)
    ),
    'usage', jsonb_build_object(
      'app_tokens', (select count(*) from public.visits v where v.source = 'app'),
      'walk_ins', (select count(*) from public.visits v where v.source = 'walk_in')
    )
  );
end;
$$;

revoke execute on function public.doctor_analytics(uuid, date, date) from public, anon;
revoke execute on function public.end_of_day_summary(uuid, date) from public, anon;
revoke execute on function public.owner_overview() from public, anon;
grant execute on function public.doctor_analytics(uuid, date, date) to authenticated;
grant execute on function public.end_of_day_summary(uuid, date) to authenticated;
grant execute on function public.owner_overview() to authenticated;
