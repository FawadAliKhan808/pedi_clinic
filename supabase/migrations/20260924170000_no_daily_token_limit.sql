-- No per-phone daily limit: a parent can check in (or book) as many times a
-- day as they need. The check is removed from assign_token and the
-- `daily_token_limit_per_phone` setting is deleted. Bookings and
-- consultations never had a daily cap of their own.
--
-- assign_token keeps its `p_enforce_parent_id` parameter so existing callers
-- (check_in, add_walk_in) are unchanged; it is no longer used.

create or replace function public.assign_token(
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
  v_seq integer;
  v_appointment_id uuid := p_appointment_id;
  v_visit public.visits;
begin
  -- One lock per clinic-day, so concurrent check-ins can't share a token number.
  perform pg_advisory_xact_lock(hashtext(p_clinic_id::text || ':' || v_date::text));

  if v_appointment_id is null then
    select a.id into v_appointment_id
      from public.appointments a
      join public.availability_sessions s on s.id = a.session_id
     where a.child_id = p_child_id
       and a.appointment_date = v_date
       and a.status = 'booked'
       and s.clinic_id = p_clinic_id
     order by s.start_time
     limit 1;
  end if;

  select coalesce(max(v.seq), 0) + 1 into v_seq
    from public.visits v
   where v.clinic_id = p_clinic_id and v.visit_date = v_date;

  insert into public.visits (clinic_id, child_id, visit_date, seq, visit_reason, appointment_id)
  values (p_clinic_id, p_child_id, v_date, v_seq, p_visit_reason, v_appointment_id)
  returning * into v_visit;

  if v_appointment_id is not null then
    update public.appointments a
       set status = 'attended'
     where a.id = v_appointment_id and a.status = 'booked';
  end if;

  return v_visit;
end;
$$;

delete from public.settings where key = 'daily_token_limit_per_phone';
