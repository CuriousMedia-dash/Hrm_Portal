-- =====================================================================
-- Fix: "new row violates row-level security policy for table attendance"
-- when checking in after midnight IST.
--
-- The database server runs on UTC, so current_date is still yesterday
-- between 00:00 and 05:30 India time, while the browser already sends
-- today's date. The self check-in policy rejected the mismatch.
--
-- Already included in the fixed schema.sql — this file is so you don't
-- have to re-run the whole schema.
-- =====================================================================

create or replace function public.today_local()
returns date
language sql stable as $$
  select (now() at time zone 'Asia/Kolkata')::date;
$$;

drop policy if exists attendance_insert on public.attendance;
create policy attendance_insert on public.attendance
  for insert to authenticated
  with check (
    public.is_hr_admin()
    or (employee_id = public.current_employee_id() and work_date = public.today_local())
  );

drop policy if exists attendance_update on public.attendance;
create policy attendance_update on public.attendance
  for update to authenticated
  using (
    public.is_hr_admin()
    or (employee_id = public.current_employee_id() and work_date = public.today_local())
  )
  with check (
    public.is_hr_admin()
    or (employee_id = public.current_employee_id() and work_date = public.today_local())
  );

-- Sanity check: these two should now agree with your wall clock.
select current_date as server_date_utc, public.today_local() as local_date;
