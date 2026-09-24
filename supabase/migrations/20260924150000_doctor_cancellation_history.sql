-- 1. The doctor can cancel a session or a whole day again. Every booking in
--    it becomes 'cancelled' and its parent is notified ("Your appointment has
--    been cancelled."). Parents still can't cancel or move a booking.
-- 2. Patient history lists only children who have been consulted: the day
--    list, a history-only search, and the timeline all show completed visits.

-- ============================================================================
-- 1. Doctor cancellation
-- ============================================================================

/**
 * Cancels a session. Its confirmed bookings are cancelled and each parent is
 * told, in the same transaction. Returns how many bookings were cancelled.
 * The session row lock (shared with book_appointment) means a booking either
 * lands first — and is cancelled here — or is refused as SESSION_CANCELLED.
 */
create or replace function public.cancel_session(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.availability_sessions;
  v_appointment_id uuid;
  v_affected integer := 0;
begin
  select s.* into v_session
    from public.availability_sessions s
   where s.id = p_session_id
   for update;

  if v_session.id is null then
    raise exception 'SESSION_NOT_FOUND' using errcode = '23503';
  end if;
  if not public.is_clinic_staff(v_session.clinic_id, array['doctor']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_session.cancelled_at is not null then
    return 0;
  end if;

  update public.availability_sessions s
     set cancelled_at = now()
   where s.id = p_session_id;

  for v_appointment_id in
    update public.appointments a
       set status = 'cancelled', cancelled_at = now()
     where a.session_id = p_session_id
       and a.status in ('booked', 'pending')
    returning a.id
  loop
    perform public.notify_appointment_change(v_appointment_id, 'cancelled');
    v_affected := v_affected + 1;
  end loop;

  return v_affected;
end;
$$;

/** "Mark day closed": cancels every session that day (and their bookings). Returns bookings cancelled. */
create or replace function public.close_day(p_clinic_id uuid, p_date date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_affected integer := 0;
begin
  if not public.is_clinic_staff(p_clinic_id, array['doctor']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  for v_session_id in
    select s.id
      from public.availability_sessions s
     where s.clinic_id = p_clinic_id
       and s.date = p_date
       and s.cancelled_at is null
     order by s.start_time
  loop
    v_affected := v_affected + public.cancel_session(v_session_id);
  end loop;

  return v_affected;
end;
$$;

-- ============================================================================
-- 2. Patient history: consulted children only
-- ============================================================================

drop function public.clinic_patients_on(uuid, date);

/** Children whose consultation was completed on a given day. Doctor only. */
create function public.clinic_patients_on(p_clinic_id uuid, p_date date)
returns table (
  visit_id uuid,
  seq integer,
  status public.visit_status,
  reason public.visit_reason,
  child_id uuid,
  child_name text,
  child_dob date,
  parent_name text,
  parent_phone text,
  visit_count integer
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
    p.name,
    p.phone,
    (
      select count(*)::integer
        from public.visits every
       where every.child_id = c.id
         and every.clinic_id = p_clinic_id
         and every.status = 'completed'
    )
  from public.visits v
  join public.children c on c.id = v.child_id
  join public.parents p on p.id = c.parent_id
 where v.clinic_id = p_clinic_id
   and v.visit_date = p_date
   and v.status = 'completed'
   and public.is_clinic_staff(p_clinic_id, array['doctor']::public.staff_role[])
 order by v.completed_at desc nulls last, v.seq desc;
$$;

/**
 * History search: children who have had at least one completed consultation
 * here, by child name, parent name or phone. (The queue's walk-in search,
 * search_children, still finds everyone.)
 */
create function public.search_consulted_children(p_clinic_id uuid, p_query text)
returns table (
  child_id uuid,
  child_name text,
  dob date,
  parent_name text,
  parent_phone text,
  last_consultation_date date,
  consultation_count integer
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
    p.name,
    p.phone,
    max(v.visit_date),
    count(v.id)::integer
  from public.children c
  join public.parents p on p.id = c.parent_id
  join public.visits v
    on v.child_id = c.id and v.clinic_id = p_clinic_id and v.status = 'completed'
 where public.is_clinic_staff(p_clinic_id, array['doctor']::public.staff_role[])
   and coalesce(trim(p_query), '') <> ''
   and (
         c.name ilike '%' || trim(p_query) || '%'
         or p.name ilike '%' || trim(p_query) || '%'
         or (regexp_replace(trim(p_query), '\D', '', 'g') <> ''
             and p.phone like '%' || regexp_replace(trim(p_query), '\D', '', 'g') || '%')
       )
 group by c.id, c.name, c.dob, p.name, p.phone
 order by max(v.visit_date) desc, c.name
 limit 50;
$$;

drop function public.child_visit_timeline(uuid);

/**
 * A child's consultations for the doctor, newest first: fees and how they
 * were paid, follow-up, prescription photos, and what the pharmacy
 * dispensed. Completed visits only. Doctor of the visits' clinic only.
 */
create function public.child_visit_timeline(p_child_id uuid)
returns table (
  visit_id uuid,
  visit_date date,
  seq integer,
  status public.visit_status,
  reason public.visit_reason,
  from_appointment boolean,
  called_at timestamptz,
  completed_at timestamptz,
  consultation numeric,
  vaccination numeric,
  other numeric,
  payments jsonb,
  follow_up_date date,
  storage_keys text[],
  pharmacy_status public.pharmacy_order_status,
  pharmacy_total numeric,
  medicines jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.id,
    v.visit_date,
    v.seq,
    v.status,
    v.visit_reason,
    v.appointment_id is not null,
    v.called_at,
    v.completed_at,
    f.consultation,
    f.vaccination,
    f.other,
    coalesce(
      (select jsonb_agg(jsonb_build_object('mode', pay.mode, 'amount', pay.amount) order by pay.mode)
         from public.payments pay where pay.visit_id = v.id),
      '[]'::jsonb
    ),
    v.follow_up_date,
    coalesce(
      (select array_agg(pi.storage_key order by pi.sort_order)
         from public.prescription_images pi where pi.visit_id = v.id),
      array[]::text[]
    ),
    o.status,
    o.total,
    coalesce(
      (select jsonb_agg(jsonb_build_object(
                'name', m.name,
                'unit', m.unit,
                'quantity', oi.quantity,
                'unit_price', oi.unit_price
              ) order by m.name)
         from public.order_items oi
         join public.medicines m on m.id = oi.medicine_id
        where oi.order_id = o.id),
      '[]'::jsonb
    )
  from public.visits v
  left join public.fees f on f.visit_id = v.id
  left join public.pharmacy_orders o on o.visit_id = v.id
 where v.child_id = p_child_id
   and v.status = 'completed'
   and public.is_clinic_staff(v.clinic_id, array['doctor']::public.staff_role[])
 order by v.visit_date desc, v.completed_at desc nulls last;
$$;

revoke execute on function public.clinic_patients_on(uuid, date) from public, anon;
revoke execute on function public.search_consulted_children(uuid, text) from public, anon;
revoke execute on function public.child_visit_timeline(uuid) from public, anon;
grant execute on function public.clinic_patients_on(uuid, date) to authenticated;
grant execute on function public.search_consulted_children(uuid, text) to authenticated;
grant execute on function public.child_visit_timeline(uuid) to authenticated;
