-- The check-in QR is printed on paper, so its code no longer changes every
-- minute. Each clinic has one code, derived from its secret, until the doctor
-- replaces it — which makes every old printout (and any photo of one) stop
-- working at once.

create or replace function public.checkin_code(p_clinic_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select substr(encode(extensions.hmac('printed-qr', s.secret, 'sha256'), 'hex'), 1, 20)
    from public.checkin_secrets s
   where s.clinic_id = p_clinic_id;
$$;

/** Whether a scanned code is this clinic's current printed code. */
create or replace function public.checkin_code_valid(p_clinic_id uuid, p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_code is not null and p_code = public.checkin_code(p_clinic_id);
$$;

drop function public.checkin_code_for(uuid, bigint);

/** For the printable QR page: the clinic's current code. Staff only. */
create or replace function public.checkin_qr_code()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid := public.default_clinic_id();
begin
  if not public.is_clinic_staff(v_clinic_id, array['doctor', 'pharmacist']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.checkin_secrets (clinic_id) values (v_clinic_id)
  on conflict do nothing;

  return jsonb_build_object(
    'code', public.checkin_code(v_clinic_id),
    -- Only for reception screens still running the old rotating-QR page:
    -- they refetch when this passes, so an hour keeps them calm until reloaded.
    'expires_at', now() + interval '1 hour'
  );
end;
$$;

/**
 * A new printed code for the clinic. Every old printout stops working, so
 * the doctor prints the new one straight away. Doctor only.
 */
create function public.replace_checkin_code()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid := public.default_clinic_id();
begin
  if not public.is_clinic_staff(v_clinic_id, array['doctor']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.checkin_secrets (clinic_id, secret, created_at)
  values (v_clinic_id, encode(extensions.gen_random_bytes(32), 'hex'), now())
  on conflict (clinic_id) do update
     set secret = excluded.secret,
         created_at = excluded.created_at;

  return jsonb_build_object('code', public.checkin_code(v_clinic_id));
end;
$$;

revoke execute on function public.checkin_code(uuid) from public, anon, authenticated;
revoke execute on function public.checkin_code_valid(uuid, text) from public, anon, authenticated;
revoke execute on function public.replace_checkin_code() from public, anon;
grant execute on function public.replace_checkin_code() to authenticated;
