-- Weight at each visit. Measured on the clinic's scale while the child waits;
-- the parent can enter it from the token screen, and the doctor can enter or
-- correct it (from the queue's Complete visit flow). Optional, but asked for.
-- One per visit, so a child's visits read as a growth record.

alter table public.visits
  add column weight_kg numeric(5, 2)
  check (weight_kg is null or (weight_kg > 0 and weight_kg < 200));

comment on column public.visits.weight_kg is
  'Child''s weight in kg at this visit, measured at the clinic. Null until recorded.';

/**
 * Records (or clears, with null) the weight for a visit.
 * - The doctor of the visit's clinic: any visit.
 * - The parent: their own child's visit, today, while it is still in the queue.
 * Returns the stored value. Raises INVALID_WEIGHT, VISIT_NOT_FOUND,
 * VISIT_NOT_ACTIVE or NOT_AUTHORIZED.
 */
create function public.record_visit_weight(p_visit_id uuid, p_weight_kg numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.visits;
  stored numeric(5, 2);
begin
  if p_weight_kg is not null and (p_weight_kg <= 0 or p_weight_kg >= 200) then
    raise exception 'INVALID_WEIGHT' using errcode = '22023';
  end if;

  select * into v from public.visits where id = p_visit_id;
  if not found then
    raise exception 'VISIT_NOT_FOUND' using errcode = '23503';
  end if;

  if public.is_clinic_staff(v.clinic_id, array['doctor']::public.staff_role[]) then
    null;
  elsif public.is_own_child(v.child_id) then
    if v.visit_date <> public.clinic_today(v.clinic_id)
       or v.status not in ('waiting', 'called', 'in_consultation') then
      raise exception 'VISIT_NOT_ACTIVE' using errcode = '22023';
    end if;
  else
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  stored := round(p_weight_kg, 2);
  update public.visits set weight_kg = stored where id = p_visit_id;
  return stored;
end;
$$;

revoke execute on function public.record_visit_weight(uuid, numeric) from public, anon;
grant execute on function public.record_visit_weight(uuid, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- The reads that show it. Each keeps its previous columns and adds weight_kg
-- at the end; the bodies are otherwise unchanged.
-- ---------------------------------------------------------------------------

drop function public.parent_queue_view();

create function public.parent_queue_view()
returns table (
  visit_id uuid,
  clinic_id uuid,
  child_id uuid,
  child_name text,
  visit_date date,
  seq integer,
  status public.visit_status,
  reason public.visit_reason,
  now_serving_seq integer,
  patients_ahead integer,
  weight_kg numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.id,
    v.clinic_id,
    c.id,
    c.name,
    v.visit_date,
    v.seq,
    v.status,
    v.visit_reason,
    (
      select v2.seq
        from public.visits v2
       where v2.clinic_id = v.clinic_id
         and v2.visit_date = v.visit_date
         and v2.status in ('called', 'in_consultation')
       order by v2.called_at desc nulls last
       limit 1
    ),
    (
      select count(*)::integer
        from public.visits v3
       where v3.clinic_id = v.clinic_id
         and v3.visit_date = v.visit_date
         and v3.status = 'waiting'
         and v3.seq < v.seq
    ),
    v.weight_kg
  from public.visits v
  join public.children c on c.id = v.child_id
  join public.parents p on p.id = c.parent_id
 where p.user_id = auth.uid()
   and v.visit_date = public.clinic_today(v.clinic_id)
 order by v.seq;
$$;
revoke execute on function public.parent_queue_view() from public, anon;
grant execute on function public.parent_queue_view() to authenticated;

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
         array['doctor', 'pharmacist']::public.staff_role[]
       )
 order by (case when v.status = 'skipped' then 1 else 0 end), v.seq;
$$;
revoke execute on function public.doctor_queue(uuid) from public, anon;
grant execute on function public.doctor_queue(uuid) to authenticated;

drop function public.visit_summary(uuid);

create function public.visit_summary(p_visit_id uuid)
returns table (
  visit_id uuid,
  child_id uuid,
  child_name text,
  visit_date date,
  seq integer,
  status public.visit_status,
  reason public.visit_reason,
  fee_total numeric,
  follow_up_date date,
  completed_at timestamptz,
  storage_keys text[],
  rating_stars smallint,
  weight_kg numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.id,
    c.id,
    c.name,
    v.visit_date,
    v.seq,
    v.status,
    v.visit_reason,
    case
      when public.is_own_child(v.child_id)
        or public.is_clinic_staff(v.clinic_id, array['doctor']::public.staff_role[])
      then (select f.consultation + f.vaccination + f.other
              from public.fees f where f.visit_id = v.id)
    end,
    v.follow_up_date,
    v.completed_at,
    coalesce(
      (select array_agg(pi.storage_key order by pi.sort_order)
         from public.prescription_images pi where pi.visit_id = v.id),
      array[]::text[]
    ),
    case
      when public.is_own_child(v.child_id)
      then (select r.stars from public.ratings r where r.visit_id = v.id)
    end,
    v.weight_kg
  from public.visits v
  join public.children c on c.id = v.child_id
 where v.id = p_visit_id
   and public.can_access_visit(v.id);
$$;
revoke execute on function public.visit_summary(uuid) from public, anon;
grant execute on function public.visit_summary(uuid) to authenticated;

drop function public.child_visit_timeline(uuid);

/**
 * A child's consultations for the doctor, newest first: weight, fees and how
 * they were paid, follow-up, prescription photos, and what the pharmacy
 * dispensed. Completed visits only. Doctor of the visits' clinic only.
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
  medicines jsonb,
  weight_kg numeric
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
    ),
    v.weight_kg
  from public.visits v
  left join public.fees f on f.visit_id = v.id
  left join public.pharmacy_orders o on o.visit_id = v.id
 where v.child_id = p_child_id
   and v.status = 'completed'
   and public.is_clinic_staff(v.clinic_id, array['doctor']::public.staff_role[])
 order by v.visit_date desc, v.completed_at desc nulls last;
$$;
revoke execute on function public.child_visit_timeline(uuid) from public, anon;
grant execute on function public.child_visit_timeline(uuid) to authenticated;
