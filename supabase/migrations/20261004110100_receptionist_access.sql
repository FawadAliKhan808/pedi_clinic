-- What the receptionist can do: read today's queue, add a walk-in (a child
-- whose parent doesn't use the app), and show the check-in QR at the desk.
-- Each function below is its latest definition with 'receptionist' added to
-- the roles allowed; nothing else changes. Calling, skipping, completing
-- visits, history, fees and the pharmacy stay with the doctor and pharmacist.

create or replace function public.doctor_queue(p_clinic_id uuid)
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
  created_at timestamptz,
  weight_kg numeric
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
    v.created_at,
    v.weight_kg
  from public.visits v
  join public.children c on c.id = v.child_id
  join public.parents p on p.id = c.parent_id
 where v.clinic_id = p_clinic_id
   and v.visit_date = public.clinic_today(p_clinic_id)
   and v.status not in ('completed', 'removed')
   and public.is_clinic_staff(
         p_clinic_id,
         array['doctor', 'pharmacist', 'receptionist']::public.staff_role[]
       )
 order by (case when v.status = 'skipped' then 1 else 0 end), v.seq;
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
  if not public.is_clinic_staff(p_clinic_id, array['doctor', 'receptionist']::public.staff_role[]) then
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

create or replace function public.checkin_qr_code()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid := public.default_clinic_id();
begin
  if not public.is_clinic_staff(v_clinic_id, array['doctor', 'pharmacist', 'receptionist']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.checkin_secrets (clinic_id) values (v_clinic_id)
  on conflict do nothing;

  return jsonb_build_object(
    'code', public.checkin_code(v_clinic_id),
    -- Only for reception screens still running the old rotating-QR page:
    -- they refetch when this passes, so an hour keeps them calm until reloaded.
    'expires_at', now() + interval '1 hour'
  );
end;
$$;
