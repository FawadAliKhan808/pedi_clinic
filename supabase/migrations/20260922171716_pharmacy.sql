-- Phase 4: the in-house pharmacy — stock, the live feed of completed visits,
-- and dispensing.
--
-- Dispensing is one transaction that locks each medicine row, checks stock,
-- deducts it and prices the bill together. The prototype's read-then-write
-- sequence could oversell stock under two concurrent dispenses; this cannot.

-- ============================================================================
-- medicines
-- ============================================================================

create table public.medicines (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  name text not null,
  unit text not null,
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  stock integer not null default 0 check (stock >= 0),
  low_stock_threshold integer not null default 10 check (low_stock_threshold >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.medicines is
  'Pharmacy stock. The non-negative check on stock is a backstop; dispense_order is what actually guards it.';

create unique index medicines_clinic_name_unique
  on public.medicines (clinic_id, lower(name));

create index medicines_name_trgm_idx
  on public.medicines using gin (name extensions.gin_trgm_ops);

create trigger medicines_set_updated_at
  before update on public.medicines
  for each row execute function public.set_updated_at();

-- ============================================================================
-- pharmacy_orders / order_items
-- ============================================================================

create type public.pharmacy_order_status as enum ('pending', 'dispensed', 'skipped');

create table public.pharmacy_orders (
  id uuid primary key default gen_random_uuid(),
  -- One order per visit: completing a visit is what puts it on the feed.
  visit_id uuid not null unique references public.visits (id) on delete cascade,
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  status public.pharmacy_order_status not null default 'pending',
  total numeric(10, 2) not null default 0,
  dispensed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.pharmacy_orders is
  'Created when a visit completes. created_at is when it reached the feed, dispensed_at when it was filled — both feed analytics.';

create index pharmacy_orders_clinic_status_idx
  on public.pharmacy_orders (clinic_id, status);

create trigger pharmacy_orders_set_updated_at
  before update on public.pharmacy_orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.pharmacy_orders (id) on delete cascade,
  medicine_id uuid not null references public.medicines (id),
  quantity integer not null check (quantity > 0),
  -- Priced at dispensing time, so later price changes don't rewrite history.
  unit_price numeric(10, 2) not null,
  created_at timestamptz not null default now(),
  constraint order_items_one_row_per_medicine unique (order_id, medicine_id)
);

create index order_items_order_id_idx on public.order_items (order_id);

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.medicines enable row level security;
alter table public.pharmacy_orders enable row level security;
alter table public.order_items enable row level security;

-- Stock and orders are clinic operational data; all writes go through the
-- functions below, so there are deliberately no write policies.
create policy medicines_select_staff on public.medicines
  for select
  to authenticated
  using (
    public.is_clinic_staff(
      medicines.clinic_id,
      array['doctor', 'pharmacist']::public.staff_role[]
    )
  );

create policy pharmacy_orders_select_staff on public.pharmacy_orders
  for select
  to authenticated
  using (
    public.is_clinic_staff(
      pharmacy_orders.clinic_id,
      array['doctor', 'pharmacist']::public.staff_role[]
    )
  );

create policy order_items_select_staff on public.order_items
  for select
  to authenticated
  using (
    exists (
      select 1 from public.pharmacy_orders o
       where o.id = order_items.order_id
         and public.is_clinic_staff(
               o.clinic_id,
               array['doctor', 'pharmacist']::public.staff_role[]
             )
    )
  );

-- ============================================================================
-- Completing a visit now enqueues it for the pharmacy
-- ============================================================================

create or replace function public.complete_visit(
  p_visit_id uuid,
  p_consultation numeric,
  p_vaccination numeric,
  p_other numeric,
  p_payments jsonb,
  p_follow_up_date date default null,
  p_prescription_keys text[] default null
)
returns public.visits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit public.visits;
  v_total numeric(10, 2);
  v_paid numeric(10, 2);
begin
  select v.* into v_visit from public.visits v where v.id = p_visit_id for update;
  if v_visit.id is null then
    raise exception 'VISIT_NOT_FOUND' using errcode = '23503';
  end if;
  if not public.is_clinic_staff(v_visit.clinic_id, array['doctor']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_visit.status not in ('called', 'in_consultation') then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = '22023';
  end if;

  if coalesce(p_consultation, 0) < 0
     or coalesce(p_vaccination, 0) < 0
     or coalesce(p_other, 0) < 0 then
    raise exception 'INVALID_FEE_AMOUNT' using errcode = '22023';
  end if;

  v_total := round(coalesce(p_consultation, 0) + coalesce(p_vaccination, 0) + coalesce(p_other, 0), 2);

  select round(coalesce(sum((entry ->> 'amount')::numeric), 0), 2) into v_paid
    from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) as entry;

  if v_paid <> v_total then
    raise exception 'PAYMENT_TOTAL_MISMATCH' using errcode = '22023';
  end if;

  insert into public.fees (visit_id, consultation, vaccination, other)
  values (p_visit_id, coalesce(p_consultation, 0), coalesce(p_vaccination, 0), coalesce(p_other, 0))
  on conflict (visit_id) do update
    set consultation = excluded.consultation,
        vaccination = excluded.vaccination,
        other = excluded.other;

  delete from public.payments where visit_id = p_visit_id;

  insert into public.payments (visit_id, mode, amount)
  select p_visit_id,
         (entry ->> 'mode')::public.payment_mode,
         sum((entry ->> 'amount')::numeric)
    from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) as entry
   group by (entry ->> 'mode')::public.payment_mode
  having sum((entry ->> 'amount')::numeric) > 0;

  if p_prescription_keys is not null then
    delete from public.prescription_images where visit_id = p_visit_id;

    insert into public.prescription_images (visit_id, storage_key, sort_order)
    select p_visit_id, key, (index - 1)::smallint
      from unnest(p_prescription_keys) with ordinality as t(key, index)
     where index <= 3;
  end if;

  -- Reaches the pharmacy feed in the same transaction that completes the visit.
  insert into public.pharmacy_orders (visit_id, clinic_id)
  values (p_visit_id, v_visit.clinic_id)
  on conflict (visit_id) do nothing;

  update public.visits v
     set status = 'completed',
         completed_at = now(),
         follow_up_date = p_follow_up_date
   where v.id = p_visit_id
  returning v.* into v_visit;

  return v_visit;
end;
$$;

-- Visits completed before this migration still belong on the feed.
insert into public.pharmacy_orders (visit_id, clinic_id)
select v.id, v.clinic_id from public.visits v where v.status = 'completed'
on conflict (visit_id) do nothing;

-- ============================================================================
-- Dispensing
-- ============================================================================

/**
 * Fills an order in one transaction: each medicine row is locked (in id order,
 * so concurrent dispenses can't deadlock), checked against the requested
 * quantity, and deducted — then the bill is priced from the locked rows.
 * Insufficient stock aborts the whole thing, so stock can never go negative
 * and a partly-filled order can never be recorded.
 */
create function public.dispense_order(p_visit_id uuid, p_items jsonb)
returns public.pharmacy_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.pharmacy_orders;
  v_item record;
  v_stock integer;
  v_price numeric(10, 2);
  v_name text;
  v_total numeric(10, 2) := 0;
begin
  select o.* into v_order
    from public.pharmacy_orders o
   where o.visit_id = p_visit_id
   for update;

  if v_order.id is null then
    raise exception 'ORDER_NOT_FOUND' using errcode = '23503';
  end if;
  if not public.is_clinic_staff(v_order.clinic_id, array['pharmacist']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_order.status <> 'pending' then
    raise exception 'INVALID_ORDER_STATUS' using errcode = '22023';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'NO_ITEMS' using errcode = '22023';
  end if;

  for v_item in
    select (entry ->> 'medicine_id')::uuid as medicine_id,
           sum((entry ->> 'quantity')::integer) as quantity
      from jsonb_array_elements(p_items) as entry
     group by 1
     order by 1
  loop
    if v_item.quantity <= 0 then
      raise exception 'INVALID_QUANTITY' using errcode = '22023';
    end if;

    select m.stock, m.unit_price, m.name into v_stock, v_price, v_name
      from public.medicines m
     where m.id = v_item.medicine_id
       and m.clinic_id = v_order.clinic_id
     for update;

    if not found then
      raise exception 'MEDICINE_NOT_FOUND' using errcode = '23503';
    end if;
    if v_stock < v_item.quantity then
      raise exception 'INSUFFICIENT_STOCK:%', v_name using errcode = '22023';
    end if;

    update public.medicines m
       set stock = m.stock - v_item.quantity
     where m.id = v_item.medicine_id;

    insert into public.order_items (order_id, medicine_id, quantity, unit_price)
    values (v_order.id, v_item.medicine_id, v_item.quantity, v_price);

    v_total := v_total + (v_price * v_item.quantity);
  end loop;

  update public.pharmacy_orders o
     set status = 'dispensed', dispensed_at = now(), total = v_total
   where o.id = v_order.id
  returning o.* into v_order;

  return v_order;
end;
$$;

/** The parent is buying elsewhere — clear the visit off the feed. */
create function public.skip_pharmacy_order(p_visit_id uuid)
returns public.pharmacy_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.pharmacy_orders;
begin
  select o.* into v_order from public.pharmacy_orders o where o.visit_id = p_visit_id for update;
  if v_order.id is null then
    raise exception 'ORDER_NOT_FOUND' using errcode = '23503';
  end if;
  if not public.is_clinic_staff(v_order.clinic_id, array['pharmacist']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_order.status <> 'pending' then
    raise exception 'INVALID_ORDER_STATUS' using errcode = '22023';
  end if;

  update public.pharmacy_orders o
     set status = 'skipped'
   where o.id = v_order.id
  returning o.* into v_order;

  return v_order;
end;
$$;

-- ============================================================================
-- Stock management
-- ============================================================================

create function public.add_medicine(
  p_clinic_id uuid,
  p_name text,
  p_unit text,
  p_unit_price numeric,
  p_initial_stock integer,
  p_low_stock_threshold integer
)
returns public.medicines
language plpgsql
security definer
set search_path = public
as $$
declare
  v_medicine public.medicines;
begin
  if not public.is_clinic_staff(p_clinic_id, array['pharmacist']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_unit), '') = '' then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;

  insert into public.medicines (clinic_id, name, unit, unit_price, stock, low_stock_threshold)
  values (
    p_clinic_id,
    trim(p_name),
    trim(p_unit),
    greatest(coalesce(p_unit_price, 0), 0),
    greatest(coalesce(p_initial_stock, 0), 0),
    greatest(coalesce(p_low_stock_threshold, 0), 0)
  )
  returning * into v_medicine;

  return v_medicine;
end;
$$;

/** Increments rather than sets, so two restocks can't overwrite each other. */
create function public.restock_medicine(p_medicine_id uuid, p_quantity integer)
returns public.medicines
language plpgsql
security definer
set search_path = public
as $$
declare
  v_medicine public.medicines;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'INVALID_QUANTITY' using errcode = '22023';
  end if;

  select m.* into v_medicine from public.medicines m where m.id = p_medicine_id;
  if v_medicine.id is null then
    raise exception 'MEDICINE_NOT_FOUND' using errcode = '23503';
  end if;
  if not public.is_clinic_staff(v_medicine.clinic_id, array['pharmacist']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  update public.medicines m
     set stock = m.stock + p_quantity
   where m.id = p_medicine_id
  returning m.* into v_medicine;

  return v_medicine;
end;
$$;

-- ============================================================================
-- The feed
-- ============================================================================

/** Completed visits still waiting on the pharmacy, oldest first. */
create function public.pharmacy_feed(p_clinic_id uuid)
returns table (
  order_id uuid,
  visit_id uuid,
  seq integer,
  child_name text,
  child_dob date,
  reason public.visit_reason,
  completed_at timestamptz,
  storage_keys text[]
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
    )
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

/** Same pattern as the queue: a payload with no personal data in it. */
create function public.broadcast_pharmacy_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid := coalesce(new.clinic_id, old.clinic_id);
begin
  perform realtime.send(
    jsonb_build_object('clinic_id', v_clinic_id, 'changed_at', now()),
    'pharmacy_changed',
    'pharmacy:' || v_clinic_id::text,
    false
  );
  return null;
end;
$$;

create trigger pharmacy_orders_broadcast_change
  after insert or update or delete on public.pharmacy_orders
  for each row execute function public.broadcast_pharmacy_change();

-- ============================================================================
-- Function privileges
-- ============================================================================

revoke execute on function public.dispense_order(uuid, jsonb) from public, anon;
revoke execute on function public.skip_pharmacy_order(uuid) from public, anon;
revoke execute on function public.add_medicine(uuid, text, text, numeric, integer, integer) from public, anon;
revoke execute on function public.restock_medicine(uuid, integer) from public, anon;
revoke execute on function public.pharmacy_feed(uuid) from public, anon;

grant execute on function public.dispense_order(uuid, jsonb) to authenticated;
grant execute on function public.skip_pharmacy_order(uuid) to authenticated;
grant execute on function public.add_medicine(uuid, text, text, numeric, integer, integer) to authenticated;
grant execute on function public.restock_medicine(uuid, integer) to authenticated;
grant execute on function public.pharmacy_feed(uuid) to authenticated;
