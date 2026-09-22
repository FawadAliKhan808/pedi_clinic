-- Foundation schema: clinics, staff, parents, children, settings.
-- Race-sensitive operations (tokens, visits, dispensing, appointments) are
-- added as their own transactional functions in later migrations.

-- ============================================================================
-- Extensions
-- ============================================================================

create extension if not exists pg_trgm with schema extensions;

-- ============================================================================
-- Shared helpers
-- ============================================================================

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger: stamps updated_at = now() on every row update.';

-- ============================================================================
-- clinics
-- ============================================================================

create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.clinics is 'A clinic tenant. First customer: a single row.';

create trigger clinics_set_updated_at
  before update on public.clinics
  for each row execute function public.set_updated_at();

-- ============================================================================
-- staff
-- ============================================================================

create type public.staff_role as enum ('doctor', 'pharmacist', 'owner');

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  clinic_id uuid references public.clinics (id) on delete cascade,
  role public.staff_role not null,
  created_at timestamptz not null default now(),
  -- One login maps to exactly one role, checked server-side via this table
  -- (never inferred from email or client state).
  constraint staff_user_id_unique unique (user_id),
  -- Owner is the only role allowed to be clinic-independent.
  constraint staff_clinic_required_unless_owner
    check (role = 'owner' or clinic_id is not null)
);

comment on table public.staff is
  'Role + clinic membership for doctor/pharmacist/owner logins. Source of truth for server-side authorization.';

create index staff_clinic_id_idx on public.staff (clinic_id);

-- SECURITY DEFINER + owned by the migration role (which has BYPASSRLS on
-- Supabase), so this safely reads `staff` without recursing into its own
-- RLS policies. Used by policies on other tables to check role membership.
create function public.current_staff_roles()
returns table (clinic_id uuid, role public.staff_role)
language sql
stable
security definer
set search_path = public
as $$
  select s.clinic_id, s.role
  from public.staff s
  where s.user_id = auth.uid();
$$;

comment on function public.current_staff_roles() is
  'Returns the calling user''s (clinic_id, role) staff memberships. RLS-safe helper.';

create function public.is_staff(roles public.staff_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.current_staff_roles() r where r.role = any (roles)
  );
$$;

comment on function public.is_staff(public.staff_role[]) is
  'True if the calling user has any of the given staff roles.';

-- ============================================================================
-- parents
-- ============================================================================

create table public.parents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  phone text not null,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parents_user_id_unique unique (user_id),
  constraint parents_phone_unique unique (phone)
);

comment on table public.parents is
  'Parent profile, created on first phone-OTP login. name is collected right after signup.';

create trigger parents_set_updated_at
  before update on public.parents
  for each row execute function public.set_updated_at();

create index parents_phone_trgm_idx on public.parents using gin (phone extensions.gin_trgm_ops);

-- ============================================================================
-- children
-- ============================================================================

create table public.children (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  name text not null,
  dob date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.children is 'A parent''s child. Age is always computed from dob, never stored.';

create index children_parent_id_idx on public.children (parent_id);
create index children_name_trgm_idx on public.children using gin (name extensions.gin_trgm_ops);

create trigger children_set_updated_at
  before update on public.children
  for each row execute function public.set_updated_at();

-- ============================================================================
-- settings
-- ============================================================================

create table public.settings (
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (clinic_id, key)
);

comment on table public.settings is
  'Clinic-scoped config (booking window, reminder times, daily token limits, ...). No values are hardcoded in app code.';

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.clinics enable row level security;
alter table public.staff enable row level security;
alter table public.parents enable row level security;
alter table public.children enable row level security;
alter table public.settings enable row level security;

-- clinics: any signed-in user may read clinic info (name/timezone are not
-- sensitive and both the parent and staff apps need them). Writes are
-- service-role only in this phase (no client-facing clinic management yet).
create policy clinics_select_authenticated on public.clinics
  for select
  to authenticated
  using (true);

-- staff: a user may see only their own membership row(s). Writes are
-- service-role only — staff accounts are provisioned by an admin process,
-- never self-service.
create policy staff_select_own on public.staff
  for select
  to authenticated
  using (user_id = auth.uid());

-- parents: a parent may see and manage only their own profile row. The row
-- is created by the authenticated user themselves right after OTP verify.
create policy parents_select_own on public.parents
  for select
  to authenticated
  using (user_id = auth.uid());

create policy parents_insert_own on public.parents
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy parents_update_own on public.parents
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Doctor/pharmacist need to search and identify parents (walk-ins, pharmacy
-- feed). Single-clinic MVP: any doctor/pharmacist staff row grants this.
create policy parents_select_staff on public.parents
  for select
  to authenticated
  using (public.is_staff(array['doctor', 'pharmacist']::public.staff_role[]));

-- children: a parent manages only their own children.
create policy children_select_own on public.children
  for select
  to authenticated
  using (
    exists (
      select 1 from public.parents p
      where p.id = children.parent_id and p.user_id = auth.uid()
    )
  );

create policy children_insert_own on public.children
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.parents p
      where p.id = children.parent_id and p.user_id = auth.uid()
    )
  );

create policy children_update_own on public.children
  for update
  to authenticated
  using (
    exists (
      select 1 from public.parents p
      where p.id = children.parent_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.parents p
      where p.id = children.parent_id and p.user_id = auth.uid()
    )
  );

-- Doctor/pharmacist need child records for search, the child sheet, and the
-- pharmacy feed.
create policy children_select_staff on public.children
  for select
  to authenticated
  using (public.is_staff(array['doctor', 'pharmacist']::public.staff_role[]));

-- settings: readable by any signed-in user (booking window, daily limits,
-- etc. drive parent-facing UI too). Writes are service-role only in this
-- phase, pending the owner/doctor admin UI that will own them later.
create policy settings_select_authenticated on public.settings
  for select
  to authenticated
  using (true);
