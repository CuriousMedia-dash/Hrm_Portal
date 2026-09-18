-- =====================================================================
-- Promote the first HR admin.
-- Run AFTER you have signed up through the portal's Sign up form —
-- the record has to exist before it can be promoted.
-- Change the email below if you sign in with a different one.
-- =====================================================================

update public.employees
   set role   = 'hr_admin',
       status = 'active'
 where lower(email) = lower('vihith@curiousmedia.in');

-- Confirm it worked — you want role = hr_admin and a non-null user_id
-- that matches your account in Authentication > Users:
select full_name, email, role, status, user_id
  from public.employees
 order by created_at;
