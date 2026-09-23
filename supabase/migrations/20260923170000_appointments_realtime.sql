-- Live appointment screens: any change to a clinic's sessions or bookings
-- tells every open booking, availability and appointment screen to refetch.
-- Like the queue broadcast, the payload names only the clinic — never a child
-- or parent — so it is safe on a public channel; each screen then refetches
-- through its own access-checked read model.

create function public.broadcast_appointments_change(p_clinic_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  select realtime.send(
    jsonb_build_object('clinic_id', p_clinic_id, 'changed_at', now()),
    'appointments_changed',
    'appointments:' || p_clinic_id::text,
    false
  );
$$;

create function public.broadcast_session_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.broadcast_appointments_change(coalesce(new.clinic_id, old.clinic_id));
  return null;
end;
$$;

create function public.broadcast_appointment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
begin
  select s.clinic_id into v_clinic_id
    from public.availability_sessions s
   where s.id = coalesce(new.session_id, old.session_id);

  -- A reschedule can cross sessions; both belong to the same clinic.
  if v_clinic_id is not null then
    perform public.broadcast_appointments_change(v_clinic_id);
  end if;
  return null;
end;
$$;

create trigger availability_sessions_broadcast_change
  after insert or update or delete on public.availability_sessions
  for each row execute function public.broadcast_session_change();

create trigger appointments_broadcast_change
  after insert or update or delete on public.appointments
  for each row execute function public.broadcast_appointment_change();

revoke execute on function public.broadcast_appointments_change(uuid) from public, anon, authenticated;
revoke execute on function public.broadcast_session_change() from public, anon, authenticated;
revoke execute on function public.broadcast_appointment_change() from public, anon, authenticated;
