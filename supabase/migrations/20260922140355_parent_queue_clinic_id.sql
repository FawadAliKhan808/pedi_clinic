-- The parent's queue screen subscribes to its clinic's live queue channel,
-- so the read model has to say which clinic the token belongs to.

drop function public.parent_queue_view();

create function public.parent_queue_view()
returns table (
  visit_id uuid,
  clinic_id uuid,
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
    v.clinic_id,
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

revoke execute on function public.parent_queue_view() from public, anon;
grant execute on function public.parent_queue_view() to authenticated;
