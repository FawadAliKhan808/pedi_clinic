-- A front-desk login: sees today's queue and adds walk-ins for parents who
-- don't use the app. Its own file because a new enum value can't be used in
-- the same transaction that adds it; the next migration grants its access.
alter type public.staff_role add value if not exists 'receptionist';
