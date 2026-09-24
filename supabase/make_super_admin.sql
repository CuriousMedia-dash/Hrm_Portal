-- =====================================================================
-- Make someone a super admin
--
-- YOU DO NOT NORMALLY NEED THIS. From the portal:
--   Employees > the person > Edit > Portal role > Super admin > Save
--
-- Use this file only when no super admin is left to do that — the
-- situation you hit before. The SQL Editor runs as the database owner,
-- which the role guard lets through, so it always works.
--
-- CHANGE THE EMAIL on the line marked below. Nothing else.
-- =====================================================================

update public.employees
   set role   = 'super_admin',
       status = case when status = 'pending' then 'active' else status end
 where lower(email) = lower('CHANGE_ME@curiousmedia.in');   -- <<< the email

-- ---------------------------------------------------------------------
-- Confirm. You want role = super_admin AND a user_id that is not null.
--
-- A null user_id means the record has no login attached, so the role
-- sits on a row nobody can sign in as. Fix that from the portal with
-- Create login, or by linking an existing account.
-- ---------------------------------------------------------------------
select full_name,
       email,
       role,
       status,
       case when user_id is null then 'NO LOGIN — role does nothing yet'
            else 'linked' end as login
  from public.employees
 where role in ('super_admin', 'hr_admin')
 order by role, full_name;
