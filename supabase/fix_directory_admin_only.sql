-- =====================================================================
-- Make the employee directory HR-only.
--
-- Before: any signed-in user could read every employee row.
-- After:  you can read your own record; HR admins can read everyone.
--
-- Already included in the fixed schema.sql — this file is so you don't
-- have to re-run the whole schema.
-- =====================================================================

drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees
  for select to authenticated
  using (user_id = auth.uid() or public.is_hr_admin());
