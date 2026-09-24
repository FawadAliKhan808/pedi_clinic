-- 1. Bookings are permanent: no cancelling or rescheduling by anyone.
--    The functions that did it are dropped (clients have no write policies on
--    appointments, so nothing else can change one). A session — or a whole
--    day — can only be taken down while nobody has booked it.
-- 2. Patient history for the doctor: search by parent name as well as child
--    name and phone, the patients seen on any day, and a child's full visit
--    timeline (fees, payments, follow-up, prescriptions, medicines).

-- ============================================================================
-- 1. Locked bookings
-- ============================================================================

drop function if exists public.reschedule_appointment(uuid, uuid);
drop function if exists public.cancel_appointment(uuid);

/** Takes down a session nobody has booked. Refuses (SESSION_HAS_BOOKINGS) otherwise. */
create or replace function public.cancel_session(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.availability_sessions;
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

  if exists (
    select 1 from public.appointments a
     where a.session_id = p_session_id
       and a.status in ('booked', 'attended', 'pending')
  ) then
    raise exception 'SESSION_HAS_BOOKINGS' using errcode = '22023';
  end if;

  update public.availability_sessions s
     set cancelled_at = now()
   where s.id = p_session_id;

  return 0;
end;
$$;

/** "Mark day closed": takes down that day's sessions — only if none has a booking. */
create or replace function public.close_day(p_clinic_id uuid, p_date date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
begin
  if not public.is_clinic_staff(p_clinic_id, array['doctor']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- Lock the day's sessions first, so a booking can't slip in meanwhile.
  perform 1
     from public.availability_sessions s
    where s.clinic_id = p_clinic_id
      and s.date = p_date
      and s.cancelled_at is null
    for update;

  if exists (
    select 1
      from public.appointments a
      join public.availability_sessions s on s.id = a.session_id
     where s.clinic_id = p_clinic_id
       and s.date = p_date
       and s.cancelled_at is null
       and a.status in ('booked', 'attended', 'pending')
  ) then
    raise exception 'SESSION_HAS_BOOKINGS' using errcode = '22023';
  end if;

  for v_session_id in
    select s.id
      from public.availability_sessions s
     where s.clinic_id = p_clinic_id
       and s.date = p_date
       and s.cancelled_at is null
  loop
    perform public.cancel_session(v_session_id);
  end loop;

  return 0;
end;
$$;

-- ============================================================================
-- 2. Patient history
-- ============================================================================

/** Doctor/pharmacist search by child name, parent name, or phone. */
create or replace function public.search_children(p_clinic_id uuid, p_query text)
returns table (
  child_id uuid,
  child_name text,
  dob date,
  parent_id uuid,
  parent_name text,
  parent_phone text,
  last_visit_date date
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.dob,
    p.id,
    p.name,
    p.phone,
    (
      select max(v.visit_date)
        from public.visits v
       where v.child_id = c.id and v.clinic_id = p_clinic_id
    )
  from public.children c
  join public.parents p on p.id = c.parent_id
 where public.is_clinic_staff(
         p_clinic_id,
         array['doctor', 'pharmacist']::public.staff_role[]
       )
   and coalesce(trim(p_query), '') <> ''
   and (
         c.name ilike '%' || trim(p_query) || '%'
         or p.name ilike '%' || trim(p_query) || '%'
         or p.phone like '%' || regexp_replace(trim(p_query), '\D', '', 'g') || '%'
           and regexp_replace(trim(p_query), '\D', '', 'g') <> ''
       )
 order by c.name
 limit 50;
$$;

/** Every child with a token on a given day (default screen: today). Doctor only. */
create function public.clinic_patients_on(p_clinic_id uuid, p_date date)
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
  visit_count integer
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
    (
      select count(*)::integer
        from public.visits every
       where every.child_id = c.id
         and every.clinic_id = p_clinic_id
         and every.status = 'completed'
    )
  from public.visits v
  join public.children c on c.id = v.child_id
  join public.parents p on p.id = c.parent_id
 where v.clinic_id = p_clinic_id
   and v.visit_date = p_date
   and public.is_clinic_staff(p_clinic_id, array['doctor']::public.staff_role[])
 order by v.seq;
$$;

/**
 * A child's whole history for the doctor, newest first: every visit with its
 * fees, how it was paid, the follow-up, prescription photos, and what the
 * pharmacy dispensed. Doctor of the visit's clinic only.
 */
create function public.child_visit_timeline(p_child_id uuid)
returns table (
  visit_id uuid,
  visit_date date,
  seq integer,
  status public.visit_status,
  reason public.visit_reason,
  from_appointment boolean,
  called_at timestamptz,
  completed_at timestamptz,
  consultation numeric,
  vaccination numeric,
  other numeric,
  payments jsonb,
  follow_up_date date,
  storage_keys text[],
  pharmacy_status public.pharmacy_order_status,
  pharmacy_total numeric,
  medicines jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.id,
    v.visit_date,
    v.seq,
    v.status,
    v.visit_reason,
    v.appointment_id is not null,
    v.called_at,
    v.completed_at,
    f.consultation,
    f.vaccination,
    f.other,
    coalesce(
      (select jsonb_agg(jsonb_build_object('mode', pay.mode, 'amount', pay.amount) order by pay.mode)
         from public.payments pay where pay.visit_id = v.id),
      '[]'::jsonb
    ),
    v.follow_up_date,
    coalesce(
      (select array_agg(pi.storage_key order by pi.sort_order)
         from public.prescription_images pi where pi.visit_id = v.id),
      array[]::text[]
    ),
    o.status,
    o.total,
    coalesce(
      (select jsonb_agg(jsonb_build_object(
                'name', m.name,
                'unit', m.unit,
                'quantity', oi.quantity,
                'unit_price', oi.unit_price
              ) order by m.name)
         from public.order_items oi
         join public.medicines m on m.id = oi.medicine_id
        where oi.order_id = o.id),
      '[]'::jsonb
    )
  from public.visits v
  left join public.fees f on f.visit_id = v.id
  left join public.pharmacy_orders o on o.visit_id = v.id
 where v.child_id = p_child_id
   and v.status <> 'removed'
   and public.is_clinic_staff(v.clinic_id, array['doctor']::public.staff_role[])
 order by v.visit_date desc, v.seq desc;
$$;

revoke execute on function public.clinic_patients_on(uuid, date) from public, anon;
revoke execute on function public.child_visit_timeline(uuid) from public, anon;
grant execute on function public.clinic_patients_on(uuid, date) to authenticated;
grant execute on function public.child_visit_timeline(uuid) to authenticated;
