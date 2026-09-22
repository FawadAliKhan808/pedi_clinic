-- Phase 2: queue core — tokens, queue state machine, walk-ins, live updates.
--
-- Every mutation lives in a SECURITY DEFINER function: `visits` has no
-- client-facing insert/update/delete policy, so token assignment and status
-- transitions can't be bypassed or raced from the client.

-- ============================================================================
-- parents: support doctor-created walk-in records
-- ============================================================================

-- A walk-in is entered by the doctor against a phone number that may have no
-- account yet, so user_id starts null and is claimed on that parent's first
-- OTP login (see upsert_parent_profile).
alter table public.parents alter column user_id drop not null;
alter table public.parents drop constraint parents_user_id_unique;
create unique index parents_user_id_unique
  on public.parents (user_id)
  where user_id is not null;

/**
 * Claims-or-creates the calling user's parent profile, keyed on the verified
 * phone number in their JWT. Claiming is what links a walk-in record (and its
 * children/visits) to the account the moment that parent first signs in.
 */
create function public.upsert_parent_profile(p_name text default null)
returns public.parents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_phone text := auth.jwt() ->> 'phone';
  v_parent public.parents;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if coalesce(v_phone, '') = '' then
    raise exception 'MISSING_PHONE' using errcode = '22023';
  end if;

  select p.* into v_parent from public.parents p where p.user_id = v_user_id;

  if v_parent.id is null then
    update public.parents p
       set user_id = v_user_id,
           name = coalesce(p.name, nullif(p_name, ''))
     where p.phone = v_phone
       and p.user_id is null
    returning p.* into v_parent;
  end if;

  if v_parent.id is null then
    insert into public.parents (user_id, phone, name)
    values (v_user_id, v_phone, nullif(p_name, ''))
    returning * into v_parent;
  elsif nullif(p_name, '') is not null then
    update public.parents p
       set name = p_name
     where p.id = v_parent.id
    returning p.* into v_parent;
  end if;

  return v_parent;
end;
$$;

-- ============================================================================
-- Clinic-scoped helpers
-- ============================================================================

/** "Today" as the clinic's own timezone sees it — never the server's. */
create function public.clinic_today(p_clinic_id uuid)
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_timezone text;
begin
  select c.timezone into v_timezone from public.clinics c where c.id = p_clinic_id;
  if v_timezone is null then
    raise exception 'CLINIC_NOT_FOUND' using errcode = '23503';
  end if;
  return (now() at time zone v_timezone)::date;
end;
$$;

/**
 * Single-clinic MVP convenience: the parent app has no clinic concept, so
 * check-in resolves the clinic server-side. Revisit when a second clinic is
 * onboarded (the app would then pass clinic_id explicitly).
 */
create function public.default_clinic_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
begin
  select c.id into v_clinic_id from public.clinics c order by c.created_at limit 1;
  if v_clinic_id is null then
    raise exception 'NO_CLINIC_CONFIGURED' using errcode = '23503';
  end if;
  return v_clinic_id;
end;
$$;

/** Reads an integer setting. Raises rather than falling back to a hardcoded default. */
create function public.setting_int(p_clinic_id uuid, p_key text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_value jsonb;
begin
  select s.value into v_value
    from public.settings s
   where s.clinic_id = p_clinic_id and s.key = p_key;

  if v_value is null then
    raise exception 'SETTING_MISSING:%', p_key using errcode = '22023';
  end if;

  return (v_value #>> '{}')::integer;
end;
$$;

create function public.is_clinic_staff(p_clinic_id uuid, p_roles public.staff_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.staff s
     where s.user_id = auth.uid()
       and s.clinic_id = p_clinic_id
       and s.role = any (p_roles)
  );
$$;

-- ============================================================================
-- visits
-- ============================================================================

create type public.visit_status as enum (
  'waiting', 'called', 'in_consultation', 'completed', 'skipped', 'removed'
);

create type public.visit_reason as enum ('vaccination', 'general_checkup');

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  visit_date date not null,
  seq integer not null,
  status public.visit_status not null default 'waiting',
  visit_reason public.visit_reason not null,
  -- FK added in Phase 7, when appointments exist.
  appointment_id uuid,
  called_at timestamptz,
  completed_at timestamptz,
  follow_up_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visits_clinic_date_seq_unique unique (clinic_id, visit_date, seq)
);

comment on table public.visits is
  'One token per row. seq is the visible token number, unique per clinic per clinic-local day.';

-- Enforces "one active token per child per day" in the database, so two
-- concurrent check-ins can't both succeed. A completed visit does not block a
-- later token on the same day.
create unique index visits_one_active_per_child_per_day
  on public.visits (child_id, visit_date)
  where status in ('waiting', 'called', 'in_consultation');

create index visits_clinic_date_status_idx on public.visits (clinic_id, visit_date, status);
create index visits_child_id_idx on public.visits (child_id);

create trigger visits_set_updated_at
  before update on public.visits
  for each row execute function public.set_updated_at();

alter table public.visits enable row level security;

create policy visits_select_own_children on public.visits
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.children c
        join public.parents p on p.id = c.parent_id
       where c.id = visits.child_id
         and p.user_id = auth.uid()
    )
  );

create policy visits_select_staff on public.visits
  for select
  to authenticated
  using (
    public.is_clinic_staff(
      visits.clinic_id,
      array['doctor', 'pharmacist']::public.staff_role[]
    )
  );

-- ============================================================================
-- Token assignment
-- ============================================================================

/**
 * Assigns the next token for a clinic-day. The advisory lock serializes
 * concurrent callers for that clinic-day, so seq can never be handed out
 * twice; the partial unique index catches a duplicate active token for the
 * same child.
 *
 * p_enforce_parent_id, when set, applies the clinic's per-phone daily token
 * limit. Walk-ins pass null: the doctor entering a patient in person is an
 * explicit override of a safeguard meant for self-service check-in.
 */
create function public.assign_token(
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
  v_limit integer;
  v_used integer;
  v_seq integer;
  v_visit public.visits;
begin
  perform pg_advisory_xact_lock(hashtext(p_clinic_id::text || ':' || v_date::text));

  if p_enforce_parent_id is not null then
    v_limit := public.setting_int(p_clinic_id, 'daily_token_limit_per_phone');

    select count(*) into v_used
      from public.visits v
      join public.children c on c.id = v.child_id
     where c.parent_id = p_enforce_parent_id
       and v.clinic_id = p_clinic_id
       and v.visit_date = v_date
       and v.status <> 'removed';

    if v_used >= v_limit then
      raise exception 'DAILY_TOKEN_LIMIT_REACHED' using errcode = '22023';
    end if;
  end if;

  select coalesce(max(v.seq), 0) + 1 into v_seq
    from public.visits v
   where v.clinic_id = p_clinic_id and v.visit_date = v_date;

  begin
    insert into public.visits (clinic_id, child_id, visit_date, seq, visit_reason, appointment_id)
    values (p_clinic_id, p_child_id, v_date, v_seq, p_visit_reason, p_appointment_id)
    returning * into v_visit;
  exception when unique_violation then
    -- seq collisions are impossible under the advisory lock, so this is the
    -- one-active-token-per-child index firing.
    raise exception 'ACTIVE_TOKEN_EXISTS' using errcode = '23505';
  end;

  return v_visit;
end;
$$;

/** Parent self-service check-in. */
create function public.check_in(
  p_child_id uuid,
  p_visit_reason public.visit_reason,
  p_appointment_id uuid default null
)
returns public.visits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select p.id into v_parent_id
    from public.parents p
    join public.children c on c.parent_id = p.id
   where c.id = p_child_id
     and p.user_id = auth.uid();

  if v_parent_id is null then
    raise exception 'CHILD_NOT_FOUND' using errcode = '42501';
  end if;

  return public.assign_token(
    public.default_clinic_id(),
    p_child_id,
    p_visit_reason,
    p_appointment_id,
    v_parent_id
  );
end;
$$;

/**
 * Doctor-entered walk-in: finds or creates the parent by phone (no account
 * required) and the child by name + date of birth, then assigns a token —
 * all in one transaction.
 */
create function public.add_walk_in(
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

  return public.assign_token(p_clinic_id, v_child_id, p_visit_reason, null, null);
end;
$$;

-- ============================================================================
-- Queue state machine
-- ============================================================================

/**
 * Calls a child to the doctor. Also serves Recall (a skipped or already-called
 * visit can be called again). Refuses while another child's consultation is
 * open, so the UI can prompt to finish that one first.
 */
create function public.call_visit(p_visit_id uuid)
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
  if v_visit.status not in ('waiting', 'called', 'skipped') then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = '22023';
  end if;

  if exists (
    select 1
      from public.visits v
     where v.clinic_id = v_visit.clinic_id
       and v.visit_date = v_visit.visit_date
       and v.status in ('called', 'in_consultation')
       and v.id <> p_visit_id
  ) then
    raise exception 'ACTIVE_CONSULTATION_EXISTS' using errcode = '22023';
  end if;

  update public.visits v
     set status = 'called', called_at = now()
   where v.id = p_visit_id
  returning v.* into v_visit;

  return v_visit;
end;
$$;

create function public.start_consultation(p_visit_id uuid)
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
     set status = 'in_consultation'
   where v.id = p_visit_id
  returning v.* into v_visit;

  return v_visit;
end;
$$;

create function public.skip_visit(p_visit_id uuid)
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
  if v_visit.status not in ('waiting', 'called', 'in_consultation') then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = '22023';
  end if;

  update public.visits v
     set status = 'skipped'
   where v.id = p_visit_id
  returning v.* into v_visit;

  return v_visit;
end;
$$;

create function public.remove_visit(p_visit_id uuid)
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
  if v_visit.status = 'completed' then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = '22023';
  end if;

  update public.visits v
     set status = 'removed'
   where v.id = p_visit_id
  returning v.* into v_visit;

  return v_visit;
end;
$$;

-- ============================================================================
-- Read models
-- ============================================================================

/**
 * Everything the parent's queue screen needs, without ever exposing another
 * family's row: position counts are computed here rather than by reading the
 * queue. "Patients ahead" counts only waiting children with a lower token.
 */
create function public.parent_queue_view()
returns table (
  visit_id uuid,
  child_id uuid,
  child_name text,
  visit_date date,
  seq integer,
  status public.visit_status,
  reason public.visit_reason,
  now_serving_seq integer,
  patients_ahead integer
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
    )
  from public.visits v
  join public.children c on c.id = v.child_id
  join public.parents p on p.id = c.parent_id
 where p.user_id = auth.uid()
   and v.visit_date = public.clinic_today(v.clinic_id)
 order by v.seq;
$$;

/**
 * The doctor's live queue. Skipped cards sort to the end; completed and
 * removed visits drop off. Returns zero rows to anyone who isn't clinic staff.
 */
create function public.doctor_queue(p_clinic_id uuid)
returns table (
  visit_id uuid,
  seq integer,
  status public.visit_status,
  reason public.visit_reason,
  child_id uuid,
  child_name text,
  child_dob date,
  parent_phone text,
  is_returning boolean,
  has_appointment boolean,
  called_at timestamptz,
  created_at timestamptz
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
    v.created_at
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

/** Doctor search over past children, by child name or parent phone. */
create function public.search_children(p_clinic_id uuid, p_query text)
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
   and (c.name ilike '%' || trim(p_query) || '%' or p.phone like '%' || trim(p_query) || '%')
 order by c.name
 limit 25;
$$;

-- ============================================================================
-- Live updates
-- ============================================================================

/**
 * Notifies every queue watcher (parents and doctor alike) that something
 * changed, so they refetch their own read model. The payload deliberately
 * carries no personal data — only which clinic changed — because parents
 * cannot be granted read access to each other's rows.
 */
create function public.broadcast_queue_change()
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
    'queue_changed',
    'queue:' || v_clinic_id::text,
    false
  );
  return null;
end;
$$;

create trigger visits_broadcast_queue_change
  after insert or update or delete on public.visits
  for each row execute function public.broadcast_queue_change();

-- ============================================================================
-- Function privileges — anon can reach none of this
-- ============================================================================

revoke execute on function public.upsert_parent_profile(text) from public, anon;
revoke execute on function public.assign_token(uuid, uuid, public.visit_reason, uuid, uuid) from public, anon;
revoke execute on function public.check_in(uuid, public.visit_reason, uuid) from public, anon;
revoke execute on function public.add_walk_in(uuid, text, date, text, public.visit_reason) from public, anon;
revoke execute on function public.call_visit(uuid) from public, anon;
revoke execute on function public.start_consultation(uuid) from public, anon;
revoke execute on function public.skip_visit(uuid) from public, anon;
revoke execute on function public.remove_visit(uuid) from public, anon;
revoke execute on function public.parent_queue_view() from public, anon;
revoke execute on function public.doctor_queue(uuid) from public, anon;
revoke execute on function public.search_children(uuid, text) from public, anon;

grant execute on function public.upsert_parent_profile(text) to authenticated;
grant execute on function public.check_in(uuid, public.visit_reason, uuid) to authenticated;
grant execute on function public.add_walk_in(uuid, text, date, text, public.visit_reason) to authenticated;
grant execute on function public.call_visit(uuid) to authenticated;
grant execute on function public.start_consultation(uuid) to authenticated;
grant execute on function public.skip_visit(uuid) to authenticated;
grant execute on function public.remove_visit(uuid) to authenticated;
grant execute on function public.parent_queue_view() to authenticated;
grant execute on function public.doctor_queue(uuid) to authenticated;
grant execute on function public.search_children(uuid, text) to authenticated;

-- assign_token is internal: only the two entry points above may call it.
