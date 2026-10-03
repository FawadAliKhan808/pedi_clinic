-- The pharmacist sees the child's weight from this visit: children's doses
-- are worked out by body weight. Same columns as before, plus weight_kg at
-- the end; the body is otherwise unchanged.

drop function public.pharmacy_feed(uuid);

create function public.pharmacy_feed(p_clinic_id uuid)
returns table (
  order_id uuid,
  visit_id uuid,
  seq integer,
  child_name text,
  child_dob date,
  reason public.visit_reason,
  completed_at timestamptz,
  storage_keys text[],
  weight_kg numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    v.id,
    v.seq,
    c.name,
    c.dob,
    v.visit_reason,
    v.completed_at,
    coalesce(
      (select array_agg(pi.storage_key order by pi.sort_order)
         from public.prescription_images pi where pi.visit_id = v.id),
      array[]::text[]
    ),
    v.weight_kg
  from public.pharmacy_orders o
  join public.visits v on v.id = o.visit_id
  join public.children c on c.id = v.child_id
 where o.clinic_id = p_clinic_id
   and o.status = 'pending'
   and public.is_clinic_staff(
         p_clinic_id,
         array['doctor', 'pharmacist']::public.staff_role[]
       )
 order by v.completed_at;
$$;
revoke execute on function public.pharmacy_feed(uuid) from public, anon;
grant execute on function public.pharmacy_feed(uuid) to authenticated;
