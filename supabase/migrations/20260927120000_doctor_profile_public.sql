-- The sign-in screen shows who the clinic's doctor is before a parent has an
-- account. The profile is public information written for parents (name,
-- title, experience, location, qualifications), so it can be read signed out.
grant execute on function public.doctor_profile() to anon;
