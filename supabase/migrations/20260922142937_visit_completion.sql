-- Phase 3: completing a visit — prescription photos, fees, split payments,
-- follow-up date. Completion is a single transaction: a visit can never end up
-- with fees recorded but payments missing, or vice versa.

-- ============================================================================
-- Visit access helpers (also used by the storage policies below)
-- ============================================================================

/** The child's own parent, or clinic staff, may read a visit's artefacts. */
create function public.can_access_visit(p_visit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.visits v
      join public.children c on c.id = v.child_id
      join public.parents p on p.id = c.parent_id
     where v.id = p_visit_id
       and (
         p.user_id = auth.uid()
         or public.is_clinic_staff(
              v.clinic_id,
              array['doctor', 'pharmacist']::public.staff_role[]
            )
       )
  );
$$;

/** Only the clinic's doctor may add to or complete a visit. */
create function public.can_edit_visit(p_visit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.visits v
     where v.id = p_visit_id
       and public.is_clinic_staff(v.clinic_id, array['doctor']::public.staff_role[])
  );
$$;

-- ============================================================================
-- fees
-- ============================================================================

create table public.fees (
  visit_id uuid primary key references public.visits (id) on delete cascade,
  consultation numeric(10, 2) not null default 0,
  vaccination numeric(10, 2) not null default 0,
  other numeric(10, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fees_non_negative
    check (consultation >= 0 and vaccination >= 0 and other >= 0)
);

comment on table public.fees is
  'One row per completed visit. Any line may be zero; there is no default prefill.';

create trigger fees_set_updated_at
  before update on public.fees
  for each row execute function public.set_updated_at();

-- ============================================================================
-- payments
-- ============================================================================

create type public.payment_mode as enum ('cash', 'upi', 'card');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits (id) on delete cascade,
  mode public.payment_mode not null,
  amount numeric(10, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  -- A hybrid payment is one row per mode, so at most three rows per visit.
  constraint payments_one_row_per_mode unique (visit_id, mode)
);

comment on table public.payments is
  'Split payments. The rows for a visit must sum exactly to its fee total — enforced in complete_visit.';

create index payments_visit_id_idx on public.payments (visit_id);

-- ============================================================================
-- prescription_images
-- ============================================================================

create table public.prescription_images (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits (id) on delete cascade,
  storage_key text not null unique,
  -- Caps a visit at three photos, per the capture flow.
  sort_order smallint not null check (sort_order between 0 and 2),
  created_at timestamptz not null default now(),
  constraint prescription_images_order_unique unique (visit_id, sort_order)
);

comment on table public.prescription_images is
  'Points at objects in the private "prescriptions" bucket. Clients only ever get short-lived signed URLs.';

create index prescription_images_visit_id_idx on public.prescription_images (visit_id);

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.fees enable row level security;
alter table public.payments enable row level security;
alter table public.prescription_images enable row level security;

-- Money is readable by the clinic's doctor and by the parent who paid it —
-- deliberately NOT by the pharmacist.
create policy fees_select_doctor on public.fees
  for select
  to authenticated
  using (
    exists (
      select 1 from public.visits v
       where v.id = fees.visit_id
         and public.is_clinic_staff(v.clinic_id, array['doctor']::public.staff_role[])
    )
  );

create policy fees_select_own_parent on public.fees
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.visits v
        join public.children c on c.id = v.child_id
        join public.parents p on p.id = c.parent_id
       where v.id = fees.visit_id and p.user_id = auth.uid()
    )
  );

create policy payments_select_doctor on public.payments
  for select
  to authenticated
  using (
    exists (
      select 1 from public.visits v
       where v.id = payments.visit_id
         and public.is_clinic_staff(v.clinic_id, array['doctor']::public.staff_role[])
    )
  );

create policy payments_select_own_parent on public.payments
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.visits v
        join public.children c on c.id = v.child_id
        join public.parents p on p.id = c.parent_id
       where v.id = payments.visit_id and p.user_id = auth.uid()
    )
  );

-- The pharmacist does need the prescription photo in order to dispense.
create policy prescription_images_select on public.prescription_images
  for select
  to authenticated
  using (public.can_access_visit(prescription_images.visit_id));

-- ============================================================================
-- Private prescription bucket
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('prescriptions', 'prescriptions', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

/** Objects are stored under `<visit_id>/<file>`, so access follows the visit. */
create function public.visit_id_from_storage_path(p_name text)
returns uuid
language sql
immutable
as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then split_part(p_name, '/', 1)::uuid
    else null
  end;
$$;

create policy prescriptions_read on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'prescriptions'
    and public.can_access_visit(public.visit_id_from_storage_path(name))
  );

create policy prescriptions_write on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'prescriptions'
    and public.can_edit_visit(public.visit_id_from_storage_path(name))
  );

create policy prescriptions_delete on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'prescriptions'
    and public.can_edit_visit(public.visit_id_from_storage_path(name))
  );

-- ============================================================================
-- Completing a visit
-- ============================================================================

/**
 * Ends a consultation in one transaction: records the prescription photos,
 * the fee lines, the split payments, and any follow-up date, then marks the
 * visit completed so it leaves the queue and reaches the pharmacy feed.
 *
 * Payments must sum exactly to the fee total — the database is the thing that
 * guarantees it, not the billing wizard.
 */
create function public.complete_visit(
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

  -- Summing per mode keeps a client that sends the same mode twice valid.
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

  update public.visits v
     set status = 'completed',
         completed_at = now(),
         follow_up_date = p_follow_up_date
   where v.id = p_visit_id
  returning v.* into v_visit;

  return v_visit;
end;
$$;

/**
 * A child's visit history — the doctor's child sheet and (from Phase 5) the
 * parent's records tab read the same model. Fee totals are withheld from the
 * pharmacist, who can see the visit and its photos but not the money.
 */
create function public.child_visit_history(p_child_id uuid)
returns table (
  visit_id uuid,
  visit_date date,
  status public.visit_status,
  reason public.visit_reason,
  fee_total numeric,
  follow_up_date date,
  completed_at timestamptz,
  storage_keys text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.id,
    v.visit_date,
    v.status,
    v.visit_reason,
    case
      when exists (
        select 1 from public.children c
        join public.parents p on p.id = c.parent_id
        where c.id = v.child_id and p.user_id = auth.uid()
      ) or public.is_clinic_staff(v.clinic_id, array['doctor']::public.staff_role[])
      then (select f.consultation + f.vaccination + f.other
              from public.fees f where f.visit_id = v.id)
    end,
    v.follow_up_date,
    v.completed_at,
    coalesce(
      (select array_agg(pi.storage_key order by pi.sort_order)
         from public.prescription_images pi where pi.visit_id = v.id),
      array[]::text[]
    )
  from public.visits v
 where v.child_id = p_child_id
   and public.can_access_visit(v.id)
 order by v.visit_date desc, v.seq desc;
$$;

-- ============================================================================
-- Function privileges
-- ============================================================================

revoke execute on function public.complete_visit(uuid, numeric, numeric, numeric, jsonb, date, text[]) from public, anon;
revoke execute on function public.child_visit_history(uuid) from public, anon;
revoke execute on function public.can_access_visit(uuid) from public, anon;
revoke execute on function public.can_edit_visit(uuid) from public, anon;

grant execute on function public.complete_visit(uuid, numeric, numeric, numeric, jsonb, date, text[]) to authenticated;
grant execute on function public.child_visit_history(uuid) to authenticated;
grant execute on function public.can_access_visit(uuid) to authenticated;
grant execute on function public.can_edit_visit(uuid) to authenticated;
