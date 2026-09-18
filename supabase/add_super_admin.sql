-- =====================================================================
-- Four-tier hierarchy + the intern monthly leave cap
--
--   1. super_admin      — everything, plus granting roles and deleting people
--   2. hr_admin / manager — the day-to-day plus approvals
--   3. associate        — an ordinary employee
--   4. intern           — an employee on employment_type 'intern': one leave a month
--
-- Tiers 1-2 are the `role` column. Tier 4 is `employment_type`, because an
-- intern is an associate with a different entitlement, not a different
-- set of permissions.
--
-- Run once in Supabase > SQL Editor. Safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The role
-- ---------------------------------------------------------------------
alter table public.employees drop constraint if exists employees_role_check;
alter table public.employees
  add constraint employees_role_check
  check (role in ('super_admin','hr_admin','manager','employee'));

-- Every existing policy asks is_hr_admin(); a super admin must satisfy it,
-- so this one change gives them everything HR has.
create or replace function public.is_hr_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.employees
     where user_id = auth.uid()
       and role in ('hr_admin','super_admin')
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.employees
     where user_id = auth.uid() and role = 'super_admin'
  );
$$;

-- ---------------------------------------------------------------------
-- 2. What only a super admin may do
-- ---------------------------------------------------------------------

-- Deleting an employee wipes their attendance, leave and documents. HR
-- edits; only a super admin destroys.
drop policy if exists employees_delete on public.employees;
create policy employees_delete on public.employees
  for delete to authenticated using (public.is_super_admin());

-- Roles are granted from the top only: HR cannot promote themselves or
-- anyone else, which is the point of having a tier above them.
create or replace function public.employees_guard_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- the SQL Editor / service_role is the database owner: let it through
  if auth.uid() is null or public.is_super_admin() then
    return new;
  end if;

  if public.is_hr_admin() then
    new.role := old.role;               -- HR may edit everything but the role
    return new;
  end if;

  -- everyone else may only touch their own contact details
  new.role            := old.role;
  new.status          := old.status;
  new.employee_code   := old.employee_code;
  new.department      := old.department;
  new.designation     := old.designation;
  new.employment_type := old.employment_type;
  new.date_of_joining := old.date_of_joining;
  new.manager_id      := old.manager_id;
  new.user_id         := old.user_id;
  new.email           := old.email;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Interns: one leave day per calendar month
--
-- The yearly entitlement is 12 so the balance card reads sensibly, and
-- this trigger stops anyone spending them in a lump.
-- ---------------------------------------------------------------------
create or replace function public.grant_leave_balances(p_employee uuid, p_year int default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  y     int  := coalesce(p_year, extract(year from public.today_local())::int);
  etype text;
begin
  select employment_type into etype from public.employees where id = p_employee;

  if etype = 'intern' then
    insert into public.leave_balances (employee_id, year, leave_type, entitled) values
      (p_employee, y, 'casual', 12)          -- one a month, capped by trigger
    on conflict (employee_id, year, leave_type) do update set entitled = excluded.entitled;

    delete from public.leave_balances
     where employee_id = p_employee and year = y and leave_type <> 'casual';
  else
    insert into public.leave_balances (employee_id, year, leave_type, entitled) values
      (p_employee, y, 'casual',           10),
      (p_employee, y, 'sick',             12),
      (p_employee, y, 'maternity',       182),
      (p_employee, y, 'paternity',        15),
      (p_employee, y, 'family_marriage',   3),
      (p_employee, y, 'own_marriage',     10)
    on conflict (employee_id, year, leave_type) do update set entitled = excluded.entitled;
  end if;
end;
$$;

create or replace function public.enforce_intern_leave_cap()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  etype     text;
  committed numeric;
begin
  select employment_type into etype from public.employees where id = new.employee_id;
  if etype is distinct from 'intern' then return new; end if;
  if new.status in ('rejected','cancelled') then return new; end if;

  select coalesce(sum(days), 0) into committed
    from public.leave_requests
   where employee_id = new.employee_id
     and status in ('pending','approved')
     and date_trunc('month', start_date) = date_trunc('month', new.start_date)
     and id <> new.id;

  if committed + new.days > 1 then
    raise exception 'Interns get one leave day per month. % already booked for %.',
      committed, to_char(new.start_date, 'FMMonth YYYY');
  end if;

  -- a request that runs into the next month would dodge the check above
  if date_trunc('month', new.end_date) <> date_trunc('month', new.start_date) then
    raise exception 'An intern''s leave cannot span two months — raise one request per month.';
  end if;

  return new;
end;
$$;

drop trigger if exists leave_intern_cap on public.leave_requests;
create trigger leave_intern_cap before insert or update on public.leave_requests
  for each row execute function public.enforce_intern_leave_cap();

-- re-grant everyone on the current rules
do $$
declare r record;
begin
  for r in select id from public.employees loop
    perform public.grant_leave_balances(r.id, null);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. Appoint the first super admin — change the email to yours
-- ---------------------------------------------------------------------
update public.employees
   set role = 'super_admin'
 where lower(email) = lower('vihith@curiousmedia.in');

select full_name, email, role, employment_type
  from public.employees
 where role <> 'employee'
 order by role, full_name;
