-- "Know your doctor": the doctor's public profile, shown to parents. Stored as
-- the `doctor_profile` setting (no hardcoded clinic content in app code) and
-- read through doctor_profile().

insert into public.settings (clinic_id, key, value)
select c.id,
       'doctor_profile',
       jsonb_build_object(
         'name', 'Dr. Syed Tajamul',
         'photo', '/dr-syed.png',
         'title', 'Pediatrician & Neonatologist',
         'experience', '20+ Years Experience',
         'location', 'Cloudnine Hospital, Bellandur, Bengaluru',
         'qualifications', jsonb_build_array(
           'MD (Paediatrics)', 'DNB (Pediatrics)', 'DCH (Australia)',
           'Fellowship in Neonatology', 'FRSPH (London)'
         ),
         'languages', jsonb_build_array(
           'English', 'Hindi', 'Kannada', 'Urdu', 'Malayalam', 'Tamil'
         ),
         'expertise', jsonb_build_array(
           'Pediatric Allergy & Asthma', 'Neonatal Care (NICU)',
           'Respiratory Disorders in Children', 'Child Infections & Immunization'
         ),
         'highlights', jsonb_build_array(
           'Senior Consultant Pediatrician at Cloudnine',
           'Extensive experience in newborn and child care',
           'Known for a child-friendly and clear consultation approach',
           'High patient satisfaction and trust'
         )
       )
  from public.clinics c
on conflict do nothing;

/** The clinic doctor's public profile (single-clinic MVP), or null if not set. */
create function public.doctor_profile()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select s.value
    from public.settings s
   where s.clinic_id = public.default_clinic_id()
     and s.key = 'doctor_profile';
$$;

revoke execute on function public.doctor_profile() from public, anon;
grant execute on function public.doctor_profile() to authenticated;
