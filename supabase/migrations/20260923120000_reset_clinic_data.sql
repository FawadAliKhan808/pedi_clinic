-- Reset: clears every parent, child, visit, appointment, and pharmacy record
-- in one transaction, keeping what the app needs to run — clinics, settings,
-- and staff logins. Used by `npm run reset` before a demo or a fresh start.
--
-- Callable only with the service-role key: no signed-in user (not even the
-- owner) can reach it. Prescription photos live in Storage and are removed by
-- the script, since Storage objects are deleted through its API.

create function public.reset_clinic_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_counts jsonb;
begin
  select jsonb_build_object(
    'parents', (select count(*) from public.parents),
    'children', (select count(*) from public.children),
    'visits', (select count(*) from public.visits),
    'appointments', (select count(*) from public.appointments),
    'availability_sessions', (select count(*) from public.availability_sessions),
    'medicines', (select count(*) from public.medicines),
    'pharmacy_orders', (select count(*) from public.pharmacy_orders),
    'ratings', (select count(*) from public.ratings),
    'notifications', (select count(*) from public.notifications),
    'push_subscriptions', (select count(*) from public.push_subscriptions),
    'installs', (select count(*) from public.installs)
  ) into v_counts;

  -- Listed explicitly (no CASCADE): if a new table ever references one of
  -- these, the reset fails loudly instead of silently emptying it.
  truncate table
    public.order_items,
    public.pharmacy_orders,
    public.medicines,
    public.prescription_images,
    public.payments,
    public.fees,
    public.ratings,
    public.notifications,
    public.push_subscriptions,
    public.installs,
    public.visits,
    public.appointments,
    public.availability_sessions,
    public.children,
    public.parents,
    public.scheduled_job_runs;

  return v_counts;
end;
$$;

comment on function public.reset_clinic_data() is
  'Clears all parent, visit, appointment and pharmacy data; keeps clinics, settings and staff. Service role only.';

revoke execute on function public.reset_clinic_data() from public, anon, authenticated;
grant execute on function public.reset_clinic_data() to service_role;
