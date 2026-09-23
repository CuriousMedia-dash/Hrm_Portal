-- =====================================================================
-- Start the directory over
--
-- Deletes every employee except you, and their logins, so you can add
-- people fresh from the portal with the Create login flow.
--
-- WHAT GOES WITH THEM (foreign keys cascade):
--   attendance · leave requests · leave balances · reimbursements
--   regularizations · submitted documents · issued documents
--   emergency contacts
--
-- There is no undo. If any of it matters, export first — step 0.
--
-- CHANGE THE EMAIL below if the account to keep is not this one.
-- =====================================================================

-- ---------------------------------------------------------------------
-- STEP 0 — look before you leap. Run this on its own first.
-- ---------------------------------------------------------------------
select
  e.full_name,
  e.email,
  e.role,
  e.status,
  (select count(*) from public.attendance      a where a.employee_id = e.id) as attendance_rows,
  (select count(*) from public.leave_requests  l where l.employee_id = e.id) as leave_rows,
  (select count(*) from public.reimbursements  r where r.employee_id = e.id) as claim_rows,
  (select count(*) from public.employee_documents d where d.employee_id = e.id) as uploaded_docs
from public.employees e
order by e.role, e.full_name;

-- ---------------------------------------------------------------------
-- STEP 1 — delete the employee records, keeping yours
-- ---------------------------------------------------------------------
delete from public.employees
 where lower(coalesce(email, '')) <> lower('vihith@curiousmedia.in');

-- ---------------------------------------------------------------------
-- STEP 2 — delete the logins too
--
-- Without this, an old account still exists in Supabase Auth with no
-- employee record attached. That person could sign in to an empty
-- portal, and creating a new employee on the same email would fail with
-- "already has an account".
-- ---------------------------------------------------------------------
delete from auth.users
 where lower(email) <> lower('vihith@curiousmedia.in');

-- ---------------------------------------------------------------------
-- STEP 3 — confirm what is left. Should be you, as super_admin.
-- ---------------------------------------------------------------------
select full_name, email, role, status,
       case when user_id is null then 'no login' else 'linked' end as login
  from public.employees;

select count(*) as auth_accounts_remaining from auth.users;

-- ---------------------------------------------------------------------
-- AFTERWARDS
--
-- Uploaded files are NOT removed by this — the rows pointing at them are
-- gone, but the objects stay in the employee-documents bucket. Clear them
-- in Supabase > Storage > employee-documents by deleting the folders,
-- each of which is named after an employee id that no longer exists.
--
-- Then add people from the portal: Employees > Add employee, with
-- "Create their portal login now" ticked. Record and account are made
-- together, so the duplicate-record problem cannot come back.
-- ---------------------------------------------------------------------
