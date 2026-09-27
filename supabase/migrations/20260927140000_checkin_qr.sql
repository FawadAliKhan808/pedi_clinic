-- Check-in only inside the clinic.
--
-- A screen at reception (a staff page) shows a QR code that changes every
-- minute. A parent's check-in must carry a code from that screen, so a photo
-- forwarded to someone outside stops working within minutes. The code is an
-- HMAC of the current minute with a per-clinic secret that clients can never
-- read; only the functions below use it.

create extension if not exists pgcrypto with schema extensions;

create table public.checkin_secrets (
  clinic_id uuid primary key references public.clinics (id) on delete cascade,
  secret text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now()
);

-- RLS on with no policies: no client can read or write a secret.
alter table public.checkin_secrets enable row level security;

insert into public.checkin_secrets (clinic_id)
select id from public.clinics
on conflict do nothing;

/** The check-in code for one minute ("window") of one clinic. Internal only. */
create function public.checkin_code_for(p_clinic_id uuid, p_window bigint)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select substr(encode(extensions.hmac(p_window::text, s.secret, 'sha256'), 'hex'), 1, 20)
    from public.checkin_secrets s
   where s.clinic_id = p_clinic_id;
$$;

/**
 * Whether a scanned code is recent enough. The screen shows a new code every
 * minute; one is accepted for up to 5 minutes after it appeared, which covers
 * picking the child and reason after scanning.
 */
create function public.checkin_code_valid(p_clinic_id uuid, p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_code is not null and exists (
    select 1
      from generate_series(0, 4) as back(minutes)
     where public.checkin_code_for(
             p_clinic_id,
             floor(extract(epoch from now()) / 60)::bigint - back.minutes
           ) = p_code
  );
$$;

/** For the reception screen: this minute's code and when it's replaced. Staff only. */
create function public.checkin_qr_code()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid := public.default_clinic_id();
  v_window bigint := floor(extract(epoch from now()) / 60)::bigint;
begin
  if not public.is_clinic_staff(v_clinic_id, array['doctor', 'pharmacist']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- A clinic created after this migration gets its secret on first use.
  insert into public.checkin_secrets (clinic_id) values (v_clinic_id)
  on conflict do nothing;

  return jsonb_build_object(
    'code', public.checkin_code_for(v_clinic_id, v_window),
    'expires_at', to_timestamp((v_window + 1) * 60)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- check_in now requires the code. The old signature is dropped so nothing can
-- still check in without one.
-- ----------------------------------------------------------------------------

drop function public.check_in(uuid, public.visit_reason, uuid);

/**
 * Parent self-service check-in, only with a code from the clinic's reception
 * screen. With `p_appointment_id` — one of this child's own confirmed
 * bookings, today or upcoming — the token takes that booking's reason and the
 * booking counts as attended.
 */
create function public.check_in(
  p_child_id uuid,
  p_visit_reason public.visit_reason,
  p_checkin_code text,
  p_appointment_id uuid default null
)
returns public.visits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_id uuid;
  v_clinic_id uuid := public.default_clinic_id();
  v_reason public.visit_reason := p_visit_reason;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  if not public.checkin_code_valid(v_clinic_id, p_checkin_code) then
    raise exception 'CHECKIN_CODE_INVALID' using errcode = '42501';
  end if;

  select p.id into v_parent_id
    from public.parents p
    join public.children c on c.parent_id = p.id
   where c.id = p_child_id
     and p.user_id = auth.uid();

  if v_parent_id is null then
    raise exception 'CHILD_NOT_FOUND' using errcode = '42501';
  end if;

  if p_appointment_id is not null then
    select a.visit_reason into v_reason
      from public.appointments a
      join public.availability_sessions s on s.id = a.session_id
     where a.id = p_appointment_id
       and a.child_id = p_child_id
       and a.status = 'booked'
       and a.appointment_date >= public.clinic_today(v_clinic_id)
       and s.clinic_id = v_clinic_id;

    if not found then
      raise exception 'APPOINTMENT_NOT_FOUND' using errcode = '23503';
    end if;
  end if;

  if v_reason is null then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;

  return public.assign_token(v_clinic_id, p_child_id, v_reason, p_appointment_id, v_parent_id);
end;
$$;

-- ----------------------------------------------------------------------------
-- Privileges
-- ----------------------------------------------------------------------------

revoke execute on function public.checkin_code_for(uuid, bigint) from public, anon, authenticated;
revoke execute on function public.checkin_code_valid(uuid, text) from public, anon, authenticated;
revoke execute on function public.checkin_qr_code() from public, anon;
revoke execute on function public.check_in(uuid, public.visit_reason, text, uuid) from public, anon;

grant execute on function public.checkin_qr_code() to authenticated;
grant execute on function public.check_in(uuid, public.visit_reason, text, uuid) to authenticated;
