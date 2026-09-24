-- Live owner dashboard: anything that moves its numbers — an install or
-- notifications being turned on, a parent registering, a rating, a token —
-- pings the `owner:overview` channel so an open dashboard refreshes itself.
-- The payload carries no data at all; the dashboard refetches through the
-- owner-only owner_overview().

create function public.broadcast_owner_overview_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform realtime.send(
    jsonb_build_object('changed_at', now()),
    'overview_changed',
    'owner:overview',
    false
  );
  return null;
end;
$$;

-- Statement-level, so a bulk change sends one ping rather than one per row.
create trigger installs_broadcast_owner
  after insert or update or delete on public.installs
  for each statement execute function public.broadcast_owner_overview_change();

create trigger parents_broadcast_owner
  after insert or update of user_id or delete on public.parents
  for each statement execute function public.broadcast_owner_overview_change();

create trigger ratings_broadcast_owner
  after insert or update or delete on public.ratings
  for each statement execute function public.broadcast_owner_overview_change();

create trigger visits_broadcast_owner
  after insert or delete on public.visits
  for each statement execute function public.broadcast_owner_overview_change();

revoke execute on function public.broadcast_owner_overview_change() from public, anon, authenticated;
