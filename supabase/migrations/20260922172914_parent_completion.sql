-- Phase 5: what the parent sees once the visit is done — the summary, the
-- app rating, and the records tab.

-- ============================================================================
-- ratings
-- ============================================================================

create table public.ratings (
  visit_id uuid primary key references public.visits (id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  created_at timestamptz not null default now()
);

comment on table public.ratings is
  'A rating of the app, not of the doctor. Readable by the owner team and the parent who left it — never by clinic staff.';

alter table public.ratings enable row level security;

create policy ratings_insert_own_parent on public.ratings
  for insert
  to authenticated
  with check (
    exists (
      select 1
        from public.visits v
        join public.children c on c.id = v.child_id
        join public.parents p on p.id = c.parent_id
       where v.id = ratings.visit_id and p.user_id = auth.uid()
    )
  );

-- The parent can read their own rating back, so the app doesn't ask twice.
create policy ratings_select_own_parent on public.ratings
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.visits v
        join public.children c on c.id = v.child_id
        join public.parents p on p.id = c.parent_id
       where v.id = ratings.visit_id and p.user_id = auth.uid()
    )
  );

-- Owner-only, deliberately: the doctor and pharmacist never see ratings.
create policy ratings_select_owner on public.ratings
  for select
  to authenticated
  using (public.is_staff(array['owner']::public.staff_role[]));

-- ============================================================================
-- Visit summary
-- ============================================================================

/** True when the calling user is the parent of this child. */
create function public.is_own_child(p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.children c
      join public.parents p on p.id = c.parent_id
     where c.id = p_child_id and p.user_id = auth.uid()
  );
$$;

/**
 * Everything the parent's post-visit screen needs in one call. Fee totals are
 * withheld from the pharmacist (who can still see the visit and its photos),
 * and the rating is only ever echoed back to the parent who left it.
 */
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
  rating_stars smallint
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
    end
  from public.visits v
  join public.children c on c.id = v.child_id
 where v.id = p_visit_id
   and public.can_access_visit(v.id);
$$;

revoke execute on function public.visit_summary(uuid) from public, anon;
revoke execute on function public.is_own_child(uuid) from public, anon;
grant execute on function public.visit_summary(uuid) to authenticated;
grant execute on function public.is_own_child(uuid) to authenticated;
