-- =====================================================================
-- DANGER — full reset of the HRM Portal database.
--
-- This deletes EVERY employee, attendance record, leave request and
-- login. There is no undo. Use it only to start over from scratch.
--
-- Run order:
--   1. this file          (wipes everything)
--   2. schema.sql         (rebuilds tables, policies, triggers)
--   3. sign up in the portal with your work email
--   4. make_admin.sql     (promotes you to HR admin)
-- =====================================================================

-- Drop the trigger on auth.users first, so deleting logins can't fire it.
drop trigger if exists on_auth_user_created on auth.users;

drop view  if exists public.leave_balance_summary;
drop table if exists public.leave_balances  cascade;
drop table if exists public.leave_requests  cascade;
drop table if exists public.attendance      cascade;
drop table if exists public.employees       cascade;

drop function if exists public.handle_new_user()        cascade;
drop function if exists public.employees_guard_update() cascade;
drop function if exists public.seed_default_balances()  cascade;
drop function if exists public.touch_updated_at()       cascade;
drop function if exists public.is_hr_admin()            cascade;
drop function if exists public.current_employee_id()    cascade;

-- Remove every login. Comment this line out if you would rather keep
-- the existing accounts and only rebuild the employee data.
delete from auth.users;

-- Check nothing is left behind:
select table_name from information_schema.tables
 where table_schema = 'public'
   and table_name in ('employees','attendance','leave_requests','leave_balances');
-- (an empty result means the wipe worked)
