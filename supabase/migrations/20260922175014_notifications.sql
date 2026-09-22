-- Phase 6: install tracking, the in-app notification list, Web Push
-- subscriptions, and the two queue-driven triggers ("you're 3rd in line",
-- "it's your turn").
--
-- Notifications are created by database triggers on `visits`, not by the app
-- code that changes the queue — so no code path can forget to notify. Rows
-- carry a type plus data only; the wording lives in the app's template module.

-- ============================================================================
-- notifications
-- ============================================================================

create type public.notification_type as enum (
  'third_in_line',
  'your_turn',
  'follow_up_reminder',
  'appointment_tomorrow',
  'appointment_today',
  'appointment_changed'
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type public.notification_type not null,
  visit_id uuid references public.visits (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  -- Claimed by a dispatcher (whether or not a push then got through).
  push_attempted_at timestamptz,
  -- A push reached at least one of the user's devices.
  sent_at timestamptz,
  read_at timestamptz
);

comment on table public.notifications is
  'The in-app notification list — always written, and the fallback when push is unavailable or undelivered.';

create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index notifications_pending_push_idx
  on public.notifications (created_at)
  where push_attempted_at is null;

-- "You're 3rd in line" is sent once per visit, however the queue shuffles.
create unique index notifications_third_in_line_once
  on public.notifications (visit_id)
  where type = 'third_in_line';

alter table public.notifications enable row level security;

create policy notifications_select_own on public.notifications
  for select
  to authenticated
  using (user_id = auth.uid());

-- ============================================================================
-- push_subscriptions
-- ============================================================================

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

alter table public.push_subscriptions enable row level security;

create policy push_subscriptions_select_own on public.push_subscriptions
  for select
  to authenticated
  using (user_id = auth.uid());

-- ============================================================================
-- installs
-- ============================================================================

create table public.installs (
  parent_id uuid primary key references public.parents (id) on delete cascade,
  installed_at timestamptz not null default now(),
  notifications_enabled_at timestamptz
);

comment on table public.installs is
  'Written once by the installed app. Adoption data: readable by the owner team and the parent themselves, never by clinic staff.';

alter table public.installs enable row level security;

-- The browser needs to know "this parent already installed" to swap the
-- install popup for an "open from your home screen" note.
create policy installs_select_own on public.installs
  for select
  to authenticated
  using (
    exists (
      select 1 from public.parents p
       where p.id = installs.parent_id and p.user_id = auth.uid()
    )
  );

create policy installs_select_owner on public.installs
  for select
  to authenticated
  using (public.is_staff(array['owner']::public.staff_role[]));

-- ============================================================================
-- Parent-facing functions
-- ============================================================================

/** Called once by the installed app. Idempotent. */
create function public.record_install()
returns public.installs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_id uuid;
  v_install public.installs;
begin
  select p.id into v_parent_id from public.parents p where p.user_id = auth.uid();
  if v_parent_id is null then
    raise exception 'PROFILE_INCOMPLETE' using errcode = '42501';
  end if;

  insert into public.installs (parent_id) values (v_parent_id)
  on conflict (parent_id) do nothing;

  select i.* into v_install from public.installs i where i.parent_id = v_parent_id;
  return v_install;
end;
$$;

/** Stamps the first time this parent turned notifications on. */
create function public.record_notifications_enabled()
returns public.installs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_id uuid;
  v_install public.installs;
begin
  select p.id into v_parent_id from public.parents p where p.user_id = auth.uid();
  if v_parent_id is null then
    raise exception 'PROFILE_INCOMPLETE' using errcode = '42501';
  end if;

  -- Notifications are only ever enabled from the installed app, so an
  -- install row normally exists; create one if it somehow doesn't.
  insert into public.installs (parent_id, notifications_enabled_at)
  values (v_parent_id, now())
  on conflict (parent_id) do update
    set notifications_enabled_at =
      coalesce(public.installs.notifications_enabled_at, excluded.notifications_enabled_at)
  returning * into v_install;

  return v_install;
end;
$$;

/**
 * Stores this device's push subscription. Keyed on the endpoint, so a device
 * that changes hands (or a re-subscribe) moves to the signed-in user.
 */
create function public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if coalesce(p_endpoint, '') = '' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'INVALID_SUBSCRIPTION' using errcode = '22023';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth;
end;
$$;

/** Marks the caller's notifications read — the given ones, or all of them. */
create function public.mark_notifications_read(p_ids uuid[] default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.notifications n
     set read_at = now()
   where n.user_id = auth.uid()
     and n.read_at is null
     and (p_ids is null or n.id = any (p_ids));
$$;

-- ============================================================================
-- Delivery (service role only)
-- ============================================================================

/**
 * Hands a dispatcher a batch of notifications nobody has tried to push yet.
 * SKIP LOCKED means two dispatchers running at once take disjoint batches, so
 * nothing is pushed twice. Queue alerts older than an hour are stale — "it's
 * your turn" is worse than useless hours later — so they're left to the
 * in-app list rather than pushed.
 */
create function public.claim_pending_pushes(p_limit integer default 50)
returns setof public.notifications
language sql
security definer
set search_path = public
as $$
  with claimable as (
    select n.id
      from public.notifications n
     where n.push_attempted_at is null
       and n.created_at > now() - interval '1 hour'
     order by n.created_at
     limit p_limit
     for update skip locked
  )
  update public.notifications n
     set push_attempted_at = now()
    from claimable
   where n.id = claimable.id
  returning n.*;
$$;

create function public.mark_pushes_sent(p_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.notifications n
     set sent_at = now()
   where n.id = any (p_ids);
$$;

-- ============================================================================
-- Queue-driven notifications
-- ============================================================================

/**
 * On every visit change:
 *   - a transition into `called`, or a Recall (called_at refreshed), queues
 *     "it's your turn" for that child's parent;
 *   - any waiting child with exactly two waiting children ahead gets
 *     "you're 3rd in line", once per visit.
 * Walk-in parents who haven't signed in yet have no account to notify.
 */
create function public.queue_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.status = 'called'
     and (old.status is distinct from new.status or old.called_at is distinct from new.called_at) then
    insert into public.notifications (user_id, type, visit_id, payload)
    select p.user_id,
           'your_turn',
           new.id,
           jsonb_build_object('child_name', c.name, 'seq', new.seq)
      from public.children c
      join public.parents p on p.id = c.parent_id
     where c.id = new.child_id
       and p.user_id is not null;
  end if;

  insert into public.notifications (user_id, type, visit_id, payload)
  select p.user_id,
         'third_in_line',
         v.id,
         jsonb_build_object('child_name', c.name, 'seq', v.seq)
    from public.visits v
    join public.children c on c.id = v.child_id
    join public.parents p on p.id = c.parent_id
   where v.clinic_id = new.clinic_id
     and v.visit_date = new.visit_date
     and v.status = 'waiting'
     and p.user_id is not null
     and (
       select count(*)
         from public.visits ahead
        where ahead.clinic_id = v.clinic_id
          and ahead.visit_date = v.visit_date
          and ahead.status = 'waiting'
          and ahead.seq < v.seq
     ) = 2
  on conflict (visit_id) where type = 'third_in_line' do nothing;

  return null;
end;
$$;

create trigger visits_queue_notifications
  after insert or update on public.visits
  for each row execute function public.queue_notifications();

/** Lets an open app refresh its list; the payload carries no content. */
create function public.broadcast_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform realtime.send(
    jsonb_build_object('changed_at', now()),
    'notifications_changed',
    'notifications:' || new.user_id::text,
    false
  );
  return null;
end;
$$;

create trigger notifications_broadcast
  after insert on public.notifications
  for each row execute function public.broadcast_notification();

-- ============================================================================
-- Function privileges
-- ============================================================================

revoke execute on function public.record_install() from public, anon;
revoke execute on function public.record_notifications_enabled() from public, anon;
revoke execute on function public.register_push_subscription(text, text, text) from public, anon;
revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
revoke execute on function public.claim_pending_pushes(integer) from public, anon, authenticated;
revoke execute on function public.mark_pushes_sent(uuid[]) from public, anon, authenticated;

grant execute on function public.record_install() to authenticated;
grant execute on function public.record_notifications_enabled() to authenticated;
grant execute on function public.register_push_subscription(text, text, text) to authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.claim_pending_pushes(integer) to service_role;
grant execute on function public.mark_pushes_sent(uuid[]) to service_role;
