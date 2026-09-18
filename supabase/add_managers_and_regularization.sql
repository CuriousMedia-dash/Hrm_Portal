-- =====================================================================
-- Managers + regularization requests
--
--   1. A 'manager' role that can approve for their own department
--   2. Regularization requests for late arrivals and missed days
--   3. An approved late regularization clears the late flag
--
-- Run once in Supabase > SQL Editor. Safe to re-run.
-- Already folded into schema.sql for fresh setups.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The manager role
-- ---------------------------------------------------------------------
alter table public.employees drop constraint if exists employees_role_check;
alter table public.employees
  add constraint employees_role_check
  check (role in ('hr_admin','manager','employee'));

-- Is the signed-in person a manager of this employee? True when they are
-- a manager, the employee sits in the same department, and it is not
-- themselves. HR is handled separately by is_hr_admin().
create or replace function public.manages_employee(target uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.employees me
      join public.employees t
        on t.department = me.department
     where me.user_id    = auth.uid()
       and me.role       = 'manager'
       and me.department is not null
       and t.id          = target
       and t.id         <> me.id
  );
$$;

create or replace function public.is_manager()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.employees
     where user_id = auth.uid() and role = 'manager'
  );
$$;

-- ---------------------------------------------------------------------
-- 2. Widen the policies: a manager sees and decides for their department
-- ---------------------------------------------------------------------

-- Directory: your own row, your department if you manage it, or all for HR
drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_hr_admin()
    or public.manages_employee(id)
  );

-- Leave: managers review their department's requests
drop policy if exists leave_select on public.leave_requests;
create policy leave_select on public.leave_requests
  for select to authenticated
  using (
    employee_id = public.current_employee_id()
    or public.is_hr_admin()
    or public.manages_employee(employee_id)
  );

drop policy if exists leave_update on public.leave_requests;
create policy leave_update on public.leave_requests
  for update to authenticated
  using (
    public.is_hr_admin()
    or public.manages_employee(employee_id)
    or (employee_id = public.current_employee_id() and status = 'pending')
  )
  with check (
    public.is_hr_admin()
    or public.manages_employee(employee_id)
    or (employee_id = public.current_employee_id() and status in ('pending','cancelled'))
  );

-- Attendance: managers see their department and can clear a waived late
drop policy if exists attendance_select on public.attendance;
create policy attendance_select on public.attendance
  for select to authenticated
  using (
    employee_id = public.current_employee_id()
    or public.is_hr_admin()
    or public.manages_employee(employee_id)
  );

drop policy if exists attendance_update on public.attendance;
create policy attendance_update on public.attendance
  for update to authenticated
  using (
    public.is_hr_admin()
    or public.manages_employee(employee_id)
    or (employee_id = public.current_employee_id() and work_date = public.today_local())
  )
  with check (
    public.is_hr_admin()
    or public.manages_employee(employee_id)
    or (employee_id = public.current_employee_id() and work_date = public.today_local())
  );

drop policy if exists attendance_insert on public.attendance;
create policy attendance_insert on public.attendance
  for insert to authenticated
  with check (
    public.is_hr_admin()
    or public.manages_employee(employee_id)
    or (employee_id = public.current_employee_id() and work_date = public.today_local())
  );

-- The guard that stops employees editing their own record must let
-- managers through as well, for their own department.
create or replace function public.employees_guard_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_hr_admin() then
    return new;
  end if;

  new.role            := old.role;          -- only HR grants roles
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
-- 3. A late that has been waived stays waived
--
-- mark_late() recomputes is_late on every write, so an approved
-- regularization needs somewhere durable to record the decision.
-- ---------------------------------------------------------------------
alter table public.attendance add column if not exists late_waived boolean not null default false;

create or replace function public.mark_late()
returns trigger language plpgsql set search_path = public as $$
begin
  new.is_late :=
    new.check_in is not null
    and new.status in ('present','wfh','half_day')
    and (new.check_in at time zone 'Asia/Kolkata')::time > time '10:20'
    and not coalesce(new.late_waived, false);
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Regularization requests
-- ---------------------------------------------------------------------
create table if not exists public.regularizations (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date   date not null,
  kind        text not null check (kind in ('late','absent','missed_checkout')),
  reason      text not null,
  status      text not null default 'pending'
                check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.employees(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (employee_id, work_date, kind)
);

create index if not exists regularizations_employee_idx on public.regularizations (employee_id, work_date desc);
create index if not exists regularizations_status_idx   on public.regularizations (status);

drop trigger if exists regularizations_touch on public.regularizations;
create trigger regularizations_touch before update on public.regularizations
  for each row execute function public.touch_updated_at();

alter table public.regularizations enable row level security;

drop policy if exists regs_select on public.regularizations;
create policy regs_select on public.regularizations
  for select to authenticated
  using (
    employee_id = public.current_employee_id()
    or public.is_hr_admin()
    or public.manages_employee(employee_id)
  );

drop policy if exists regs_insert on public.regularizations;
create policy regs_insert on public.regularizations
  for insert to authenticated
  with check (employee_id = public.current_employee_id());

drop policy if exists regs_update on public.regularizations;
create policy regs_update on public.regularizations
  for update to authenticated
  using (
    public.is_hr_admin()
    or public.manages_employee(employee_id)
    or (employee_id = public.current_employee_id() and status = 'pending')
  )
  with check (
    public.is_hr_admin()
    or public.manages_employee(employee_id)
    or (employee_id = public.current_employee_id() and status = 'pending')
  );

drop policy if exists regs_delete on public.regularizations;
create policy regs_delete on public.regularizations
  for delete to authenticated
  using (
    public.is_hr_admin()
    or (employee_id = public.current_employee_id() and status = 'pending')
  );

-- Approving a 'late' request waives the late for that day, which is what
-- makes the counter go down.
create or replace function public.apply_regularization()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    if new.kind = 'late' then
      update public.attendance
         set late_waived = true,
             is_late     = false
       where employee_id = new.employee_id
         and work_date   = new.work_date;

    elsif new.kind = 'absent' then
      insert into public.attendance (employee_id, work_date, status, note, marked_by)
      values (new.employee_id, new.work_date, 'present',
              'Regularized: ' || left(new.reason, 180), new.reviewed_by)
      on conflict (employee_id, work_date) do update
        set status = 'present',
            note   = 'Regularized: ' || left(new.reason, 180);
    end if;

  -- withdrawing an approval puts the late back
  elsif new.status <> 'approved' and old.status = 'approved' and new.kind = 'late' then
    update public.attendance
       set late_waived = false
     where employee_id = new.employee_id
       and work_date   = new.work_date;
  end if;

  return new;
end;
$$;

drop trigger if exists regularizations_apply on public.regularizations;
create trigger regularizations_apply after update on public.regularizations
  for each row execute function public.apply_regularization();

select 'managers and regularization installed' as status;
