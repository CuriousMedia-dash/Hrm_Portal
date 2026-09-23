-- =====================================================================
-- HRM Portal - Supabase schema
-- Run this whole file once in  Supabase Dashboard > SQL Editor > New query
-- Safe to re-run: everything is idempotent.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------

create table if not exists public.employees (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid unique references auth.users(id) on delete set null,
  employee_code   text unique,
  full_name       text not null,
  email           text unique,            -- optional: records imported from HR's sheet may not have one yet
  phone           text,
  role            text not null default 'employee'
                    check (role in ('hr_admin','employee')),
  department      text,
  designation     text,
  employment_type text not null default 'full_time'
                    check (employment_type in ('full_time','part_time','intern','contract')),
  date_of_joining date,
  date_of_birth   date,
  location        text,
  address         text,
  manager_id      uuid references public.employees(id) on delete set null,
  status          text not null default 'active'
                    check (status in ('active','on_notice','inactive','pending')),
  notice_end_date     date,                -- last working day; HR alerted 15 days before
  internship_end_date date,                -- defaults to joining + 3 months when empty
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists employees_department_idx on public.employees (department);
create index if not exists employees_status_idx     on public.employees (status);
create index if not exists employees_manager_idx    on public.employees (manager_id);

create table if not exists public.attendance (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date   date not null default current_date,
  status      text not null default 'present'
                check (status in ('present','absent','half_day','wfh','leave','holiday')),
  check_in    timestamptz,
  check_out   timestamptz,
  note        text,
  is_late     boolean not null default false,   -- set by the trigger below, after 10:20 IST
  marked_by   uuid references public.employees(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (employee_id, work_date)
);

create index if not exists attendance_date_idx     on public.attendance (work_date);
create index if not exists attendance_employee_idx on public.attendance (employee_id, work_date desc);

create table if not exists public.leave_requests (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type  text not null check (leave_type in ('casual','sick','earned','maternity')),
  start_date  date not null,
  end_date    date not null,
  days        numeric(4,1) not null check (days > 0),
  reason      text,
  status      text not null default 'pending'
                check (status in ('pending','approved','rejected','cancelled')),
  reviewed_by uuid references public.employees(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists leave_requests_employee_idx on public.leave_requests (employee_id, start_date desc);
create index if not exists leave_requests_status_idx   on public.leave_requests (status);

create table if not exists public.leave_balances (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  year        int  not null,
  leave_type  text not null check (leave_type in ('casual','sick','earned','maternity')),
  entitled    numeric(4,1) not null default 0,
  unique (employee_id, year, leave_type)
);

-- ---------------------------------------------------------------------
-- 2. Helper functions (security definer: they bypass RLS on purpose so
--    the policies below can call them without infinite recursion)
-- ---------------------------------------------------------------------

create or replace function public.current_employee_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.employees where user_id = auth.uid() limit 1;
$$;

-- The server runs on UTC, but the team works in India. Every "is this
-- today?" check must use local time, otherwise nobody can check in
-- between midnight and 05:30 IST. Change the zone here if that changes.
create or replace function public.today_local()
returns date
language sql stable as $$
  select (now() at time zone 'Asia/Kolkata')::date;
$$;

create or replace function public.is_hr_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.employees
    where user_id = auth.uid() and role = 'hr_admin'
  );
$$;

-- ---------------------------------------------------------------------
-- 3. Triggers
-- ---------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists employees_touch on public.employees;
create trigger employees_touch before update on public.employees
  for each row execute function public.touch_updated_at();

drop trigger if exists attendance_touch on public.attendance;
create trigger attendance_touch before update on public.attendance
  for each row execute function public.touch_updated_at();

drop trigger if exists leave_requests_touch on public.leave_requests;
create trigger leave_requests_touch before update on public.leave_requests
  for each row execute function public.touch_updated_at();

-- Give every new employee a default leave allowance for the current year.
create or replace function public.seed_default_balances()
returns trigger language plpgsql security definer set search_path = public as $$
declare y int := extract(year from now())::int;
begin
  insert into public.leave_balances (employee_id, year, leave_type, entitled) values
    (new.id, y, 'casual',    12),
    (new.id, y, 'sick',       6),
    (new.id, y, 'earned',    15),
    (new.id, y, 'maternity',  0)
  on conflict (employee_id, year, leave_type) do nothing;
  return new;
end;
$$;

drop trigger if exists employees_seed_balances on public.employees;
create trigger employees_seed_balances after insert on public.employees
  for each row execute function public.seed_default_balances();

-- When someone signs up, link them to their existing employee record by
-- email; if HR has not created one yet, create a 'pending' record.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare existing_id uuid;
begin
  select id into existing_id
  from public.employees
  where lower(email) = lower(new.email)
  limit 1;

  if existing_id is not null then
    update public.employees
       set user_id = new.id,
           status  = case when status = 'pending' then 'active' else status end
     where id = existing_id;
  else
    insert into public.employees (user_id, full_name, email, role, status)
    values (
      new.id,
      coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(new.email,'@',1)),
      new.email,
      'employee',
      'pending'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Stop employees from editing their own role / department / joining date etc.
-- They may only change contact details on their own record.
--
-- auth.uid() is null when the statement comes from the Supabase SQL Editor
-- or the service_role key, i.e. from you as the database owner rather than
-- from a signed-in portal user. Those are allowed through, otherwise there
-- would be no way to promote the very first HR admin.
create or replace function public.employees_guard_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_hr_admin() then
    return new;
  end if;

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

drop trigger if exists employees_guard on public.employees;
create trigger employees_guard before update on public.employees
  for each row execute function public.employees_guard_update();

-- ---------------------------------------------------------------------
-- 4. View: leave entitlement vs. days already approved
-- ---------------------------------------------------------------------

create or replace view public.leave_balance_summary as
select
  b.employee_id,
  b.year,
  b.leave_type,
  b.entitled,
  coalesce((
    select sum(lr.days)
    from public.leave_requests lr
    where lr.employee_id = b.employee_id
      and lr.leave_type  = b.leave_type
      and lr.status      = 'approved'
      and extract(year from lr.start_date)::int = b.year
  ), 0)::numeric(5,1) as used
from public.leave_balances b;

alter view public.leave_balance_summary set (security_invoker = on);

-- ---------------------------------------------------------------------
-- 5. Row level security
-- ---------------------------------------------------------------------

alter table public.employees      enable row level security;
alter table public.attendance     enable row level security;
alter table public.leave_requests enable row level security;
alter table public.leave_balances enable row level security;

-- employees: the directory is HR-only. Everyone else can read exactly one
-- row — their own — which is what the portal needs to show you your profile.
-- Only HR writes, except that you may edit your own contact details
-- (guarded above).
drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees
  for select to authenticated
  using (user_id = auth.uid() or public.is_hr_admin());

drop policy if exists employees_insert on public.employees;
create policy employees_insert on public.employees
  for insert to authenticated with check (public.is_hr_admin());

drop policy if exists employees_update on public.employees;
create policy employees_update on public.employees
  for update to authenticated
  using (user_id = auth.uid() or public.is_hr_admin())
  with check (user_id = auth.uid() or public.is_hr_admin());

drop policy if exists employees_delete on public.employees;
create policy employees_delete on public.employees
  for delete to authenticated using (public.is_hr_admin());

-- attendance: your own rows, or everything if you are HR.
drop policy if exists attendance_select on public.attendance;
create policy attendance_select on public.attendance
  for select to authenticated
  using (employee_id = public.current_employee_id() or public.is_hr_admin());

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

drop policy if exists attendance_delete on public.attendance;
create policy attendance_delete on public.attendance
  for delete to authenticated using (public.is_hr_admin());

-- leave requests: raise your own, HR reviews everyone's.
drop policy if exists leave_select on public.leave_requests;
create policy leave_select on public.leave_requests
  for select to authenticated
  using (employee_id = public.current_employee_id() or public.is_hr_admin());

drop policy if exists leave_insert on public.leave_requests;
create policy leave_insert on public.leave_requests
  for insert to authenticated
  with check (employee_id = public.current_employee_id() or public.is_hr_admin());

drop policy if exists leave_update on public.leave_requests;
create policy leave_update on public.leave_requests
  for update to authenticated
  using (
    public.is_hr_admin()
    or (employee_id = public.current_employee_id() and status = 'pending')
  )
  with check (
    public.is_hr_admin()
    or (employee_id = public.current_employee_id() and status in ('pending','cancelled'))
  );

drop policy if exists leave_delete on public.leave_requests;
create policy leave_delete on public.leave_requests
  for delete to authenticated
  using (
    public.is_hr_admin()
    or (employee_id = public.current_employee_id() and status = 'pending')
  );

-- leave balances: read your own, HR maintains them.
drop policy if exists balances_select on public.leave_balances;
create policy balances_select on public.leave_balances
  for select to authenticated
  using (employee_id = public.current_employee_id() or public.is_hr_admin());

drop policy if exists balances_write on public.leave_balances;
create policy balances_write on public.leave_balances
  for all to authenticated
  using (public.is_hr_admin())
  with check (public.is_hr_admin());

-- =====================================================================
-- 6. Employee documents + emergency contacts
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Private storage bucket
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'employee-documents',
  'employee-documents',
  false,                                   -- private: reachable only via signed URLs
  10485760,                                -- 10 MB per file
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------
-- 2. Document register
-- ---------------------------------------------------------------------
create table if not exists public.employee_documents (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  doc_type    text not null check (doc_type in (
                'tenth_marksheet','twelfth_marksheet','ug_marksheet','pg_marksheet',
                'photo','pan_card','aadhaar_card','bank_proof','guardian_aadhaar',
                'relieving_letter','previous_offer_letter')),
  file_path   text not null,              -- path inside the storage bucket
  file_name   text not null,              -- what the employee called it
  file_size   bigint,
  mime_type   text,
  uploaded_at timestamptz not null default now(),
  unique (employee_id, doc_type)          -- one current file per document
);

create index if not exists employee_documents_employee_idx
  on public.employee_documents (employee_id);

-- ---------------------------------------------------------------------
-- 3. Emergency contacts (two required)
-- ---------------------------------------------------------------------
create table if not exists public.emergency_contacts (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  full_name    text not null,
  relationship text not null check (relationship in
                 ('mother','father','sibling','spouse','guardian','other')),
  phone        text not null,
  created_at   timestamptz not null default now()
);

create index if not exists emergency_contacts_employee_idx
  on public.emergency_contacts (employee_id);

-- ---------------------------------------------------------------------
-- 4. Row level security — your own records, or everything if you are HR
-- ---------------------------------------------------------------------
alter table public.employee_documents enable row level security;
alter table public.emergency_contacts enable row level security;

drop policy if exists documents_select on public.employee_documents;
create policy documents_select on public.employee_documents
  for select to authenticated
  using (employee_id = public.current_employee_id() or public.is_hr_admin());

drop policy if exists documents_insert on public.employee_documents;
create policy documents_insert on public.employee_documents
  for insert to authenticated
  with check (employee_id = public.current_employee_id() or public.is_hr_admin());

drop policy if exists documents_update on public.employee_documents;
create policy documents_update on public.employee_documents
  for update to authenticated
  using (employee_id = public.current_employee_id() or public.is_hr_admin())
  with check (employee_id = public.current_employee_id() or public.is_hr_admin());

drop policy if exists documents_delete on public.employee_documents;
create policy documents_delete on public.employee_documents
  for delete to authenticated
  using (employee_id = public.current_employee_id() or public.is_hr_admin());

drop policy if exists contacts_select on public.emergency_contacts;
create policy contacts_select on public.emergency_contacts
  for select to authenticated
  using (employee_id = public.current_employee_id() or public.is_hr_admin());

drop policy if exists contacts_write on public.emergency_contacts;
create policy contacts_write on public.emergency_contacts
  for all to authenticated
  using (employee_id = public.current_employee_id() or public.is_hr_admin())
  with check (employee_id = public.current_employee_id() or public.is_hr_admin());

-- ---------------------------------------------------------------------
-- 5. Storage policies
--
-- Every file is stored as  <employee_id>/<doc_type>-<timestamp>.<ext>
-- so the first folder in the path decides who owns it.
-- ---------------------------------------------------------------------
drop policy if exists "employee docs read"   on storage.objects;
drop policy if exists "employee docs insert" on storage.objects;
drop policy if exists "employee docs update" on storage.objects;
drop policy if exists "employee docs delete" on storage.objects;

create policy "employee docs read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'employee-documents'
    and (
      public.is_hr_admin()
      or (storage.foldername(name))[1] = public.current_employee_id()::text
    )
  );

create policy "employee docs insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'employee-documents'
    and (
      public.is_hr_admin()
      or (storage.foldername(name))[1] = public.current_employee_id()::text
    )
  );

create policy "employee docs update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'employee-documents'
    and (
      public.is_hr_admin()
      or (storage.foldername(name))[1] = public.current_employee_id()::text
    )
  );

create policy "employee docs delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'employee-documents'
    and (
      public.is_hr_admin()
      or (storage.foldername(name))[1] = public.current_employee_id()::text
    )
  );

-- =====================================================================
-- 7. Reimbursements + birthday helper
-- =====================================================================

create table if not exists public.reimbursements (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  claim_date   date not null default current_date,   -- when the expense happened
  category     text not null check (category in (
                 'travel','food','accommodation','phone_internet',
                 'office_supplies','client_entertainment','software','other')),
  amount       numeric(10,2) not null check (amount > 0),
  description  text,
  receipt_path text,                                  -- path inside the storage bucket
  receipt_name text,
  status       text not null default 'pending'
                 check (status in ('pending','approved','rejected','paid')),
  reviewed_by  uuid references public.employees(id) on delete set null,
  reviewed_at  timestamptz,
  review_note  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists reimbursements_employee_idx on public.reimbursements (employee_id, claim_date desc);
create index if not exists reimbursements_status_idx   on public.reimbursements (status);

drop trigger if exists reimbursements_touch on public.reimbursements;
create trigger reimbursements_touch before update on public.reimbursements
  for each row execute function public.touch_updated_at();

alter table public.reimbursements enable row level security;

-- Raise your own, HR reviews everyone's.
drop policy if exists reimb_select on public.reimbursements;
create policy reimb_select on public.reimbursements
  for select to authenticated
  using (employee_id = public.current_employee_id() or public.is_hr_admin());

drop policy if exists reimb_insert on public.reimbursements;
create policy reimb_insert on public.reimbursements
  for insert to authenticated
  with check (employee_id = public.current_employee_id() or public.is_hr_admin());

drop policy if exists reimb_update on public.reimbursements;
create policy reimb_update on public.reimbursements
  for update to authenticated
  using (
    public.is_hr_admin()
    or (employee_id = public.current_employee_id() and status = 'pending')
  )
  with check (
    public.is_hr_admin()
    or (employee_id = public.current_employee_id() and status = 'pending')
  );

drop policy if exists reimb_delete on public.reimbursements;
create policy reimb_delete on public.reimbursements
  for delete to authenticated
  using (
    public.is_hr_admin()
    or (employee_id = public.current_employee_id() and status = 'pending')
  );

-- ---------------------------------------------------------------------
-- Upcoming birthdays, ignoring the year.
-- Returns everyone with a birthday in the next `days_ahead` days,
-- handling the December -> January wrap. HR only, via RLS on employees.
-- ---------------------------------------------------------------------
create or replace function public.upcoming_birthdays(days_ahead int default 7)
returns table (
  id          uuid,
  full_name   text,
  department  text,
  designation text,
  birthday    date,
  days_away   int
)
language sql stable security invoker set search_path = public as $$
  with base as (
    select
      e.id, e.full_name, e.department, e.designation, e.date_of_birth,
      -- this year's occurrence, rolled forward if it has already passed
      case
        when make_date(
               extract(year from public.today_local())::int,
               extract(month from e.date_of_birth)::int,
               extract(day  from e.date_of_birth)::int
             ) >= public.today_local()
        then make_date(
               extract(year from public.today_local())::int,
               extract(month from e.date_of_birth)::int,
               extract(day  from e.date_of_birth)::int)
        else make_date(
               extract(year from public.today_local())::int + 1,
               extract(month from e.date_of_birth)::int,
               extract(day  from e.date_of_birth)::int)
      end as next_birthday
    from public.employees e
    where e.date_of_birth is not null
      and e.status in ('active','on_notice')
  )
  select id, full_name, department, designation, next_birthday,
         (next_birthday - public.today_local())::int as days_away
    from base
   where next_birthday - public.today_local() between 0 and days_ahead
   order by next_birthday, full_name;
$$;

-- =====================================================================
-- 8. Attendance rules: late marking and the 8-hour day
-- =====================================================================

-- Late arrivals — anything after 10:20 India time
-- ---------------------------------------------------------------------
create or replace function public.mark_late()
returns trigger language plpgsql set search_path = public as $$
begin
  new.is_late :=
    new.check_in is not null
    and new.status in ('present','wfh','half_day')
    and (new.check_in at time zone 'Asia/Kolkata')::time > time '10:20';
  return new;
end;
$$;

drop trigger if exists attendance_mark_late on public.attendance;
create trigger attendance_mark_late before insert or update on public.attendance
  for each row execute function public.mark_late();

-- Backfill anything already recorded
update public.attendance
   set is_late = (check_in is not null
                  and status in ('present','wfh','half_day')
                  and (check_in at time zone 'Asia/Kolkata')::time > time '10:20')
 where check_in is not null;

-- ---------------------------------------------------------------------
-- 4. Eight hours before check-out
--
-- HR can still correct a record — the rule applies to employees marking
-- themselves out, not to an admin fixing the roster.
-- ---------------------------------------------------------------------
create or replace function public.enforce_min_hours()
returns trigger language plpgsql security definer set search_path = public as $$
declare worked interval;
begin
  if new.check_out is null then return new; end if;
  if old.check_out is not null and old.check_out = new.check_out then return new; end if;

  -- auth.uid() is null for the SQL Editor / service_role; admins are exempt
  if auth.uid() is null or public.is_hr_admin() then return new; end if;

  if new.check_in is null then
    raise exception 'There is no check-in on this day to measure from.';
  end if;

  worked := new.check_out - new.check_in;
  if worked < interval '8 hours' then
    raise exception 'You need 8 hours from check-in before checking out. So far: % hours %  minutes.',
      extract(hour from worked)::int, extract(minute from worked)::int;
  end if;

  return new;
end;
$$;

drop trigger if exists attendance_min_hours on public.attendance;
create trigger attendance_min_hours before update on public.attendance
  for each row execute function public.enforce_min_hours();

-- =====================================================================
-- 9. Managers and regularization requests
-- =====================================================================

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

-- =====================================================================
-- 10. Leave policy + holiday calendar
-- =====================================================================

alter table public.leave_requests drop constraint if exists leave_requests_leave_type_check;
alter table public.leave_balances drop constraint if exists leave_balances_leave_type_check;

alter table public.leave_requests
  add constraint leave_requests_leave_type_check
  check (leave_type in ('casual','sick','earned','maternity','paternity',
                        'family_marriage','own_marriage'));

alter table public.leave_balances
  add constraint leave_balances_leave_type_check
  check (leave_type in ('casual','sick','earned','maternity','paternity',
                        'family_marriage','own_marriage'));

-- ---------------------------------------------------------------------
-- 2. Entitlements
--
-- Interns get a single casual leave and nothing else. Everyone else gets
-- the full set. Maternity is six months (182 days) and paternity 15;
-- they sit on every record and are simply unused where they don't apply.
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
      (p_employee, y, 'casual', 1)
    on conflict (employee_id, year, leave_type) do update set entitled = excluded.entitled;

    -- an intern holds no other entitlement
    delete from public.leave_balances
     where employee_id = p_employee and year = y and leave_type <> 'casual';
  else
    insert into public.leave_balances (employee_id, year, leave_type, entitled) values
      (p_employee, y, 'casual',           10),
      (p_employee, y, 'sick',             12),
      (p_employee, y, 'maternity',       182),   -- 6 months
      (p_employee, y, 'paternity',        15),
      (p_employee, y, 'family_marriage',   3),   -- cousin / immediate family
      (p_employee, y, 'own_marriage',     10)
    on conflict (employee_id, year, leave_type) do update set entitled = excluded.entitled;
  end if;
end;
$$;

-- New joiners get theirs automatically
create or replace function public.seed_default_balances()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.grant_leave_balances(new.id, null);
  return new;
end;
$$;

drop trigger if exists employees_seed_balances on public.employees;
create trigger employees_seed_balances after insert on public.employees
  for each row execute function public.seed_default_balances();

-- Changing someone's employment type re-grants on the new basis, which is
-- what should happen when an intern converts to full time.
create or replace function public.regrant_on_type_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.employment_type is distinct from old.employment_type then
    perform public.grant_leave_balances(new.id, null);
  end if;
  return new;
end;
$$;

drop trigger if exists employees_regrant_balances on public.employees;
create trigger employees_regrant_balances after update on public.employees
  for each row execute function public.regrant_on_type_change();

-- Apply the new policy to everyone already on the books, this year
do $$
declare r record;
begin
  for r in select id from public.employees loop
    perform public.grant_leave_balances(r.id, null);
  end loop;
end $$;

-- 'earned' is no longer granted; clear the leftovers from the old policy
delete from public.leave_balances
 where leave_type = 'earned'
   and not exists (
     select 1 from public.leave_requests lr
      where lr.employee_id = leave_balances.employee_id
        and lr.leave_type  = 'earned'
   );

-- ---------------------------------------------------------------------
-- 3. Holiday calendar
-- ---------------------------------------------------------------------
create table if not exists public.holidays (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  start_date  date not null,
  end_date    date not null,
  kind        text not null default 'public'
                check (kind in ('public','break','optional')),
  note        text,
  created_at  timestamptz not null default now(),
  check (end_date >= start_date),
  unique (name, start_date)
);

create index if not exists holidays_start_idx on public.holidays (start_date);

alter table public.holidays enable row level security;

-- Everyone signed in can read the calendar; only HR maintains it.
drop policy if exists holidays_select on public.holidays;
create policy holidays_select on public.holidays
  for select to authenticated using (true);

drop policy if exists holidays_write on public.holidays;
create policy holidays_write on public.holidays
  for all to authenticated
  using (public.is_hr_admin())
  with check (public.is_hr_admin());

-- ---------------------------------------------------------------------
-- 4. The 2026 calendar
-- ---------------------------------------------------------------------
insert into public.holidays (name, start_date, end_date, kind) values
  ('Republic Day',           '2026-01-26', '2026-01-26', 'public'),
  ('Maha Shivaratri',        '2026-02-15', '2026-02-15', 'public'),
  ('Holi',                   '2026-03-04', '2026-03-04', 'public'),
  ('Eid ul Fitr',            '2026-03-21', '2026-03-21', 'public'),
  ('Ram Navami',             '2026-03-26', '2026-03-26', 'public'),
  ('Good Friday',            '2026-04-03', '2026-04-03', 'public'),
  ('Buddha Purnima',         '2026-05-01', '2026-05-01', 'public'),
  ('Bakrid',                 '2026-05-27', '2026-05-27', 'public'),
  ('Independence Day',       '2026-08-15', '2026-08-15', 'public'),
  ('Raksha Bandhan',         '2026-08-28', '2026-08-28', 'public'),
  ('Janmashtami',            '2026-09-04', '2026-09-04', 'public'),
  ('Ganesh Chaturthi',       '2026-09-14', '2026-09-14', 'public'),
  ('Mahatma Gandhi Jayanti', '2026-10-02', '2026-10-02', 'public'),
  ('Dussehra',               '2026-10-19', '2026-10-20', 'public'),
  ('Diwali',                 '2026-11-06', '2026-11-11', 'public'),
  ('Christmas',              '2026-12-25', '2026-12-25', 'public'),
  ('Summer break',           '2026-06-26', '2026-06-30', 'break'),
  ('Winter break',           '2026-12-30', '2027-01-03', 'break')
on conflict (name, start_date) do update
  set end_date = excluded.end_date,
      kind     = excluded.kind;

-- =====================================================================
-- 11. Four-tier hierarchy + intern monthly leave cap
-- =====================================================================

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

-- =====================================================================
-- 12. Office network restriction for attendance
-- =====================================================================

create table if not exists public.allowed_networks (
  id         uuid primary key default gen_random_uuid(),
  label      text not null,
  cidr       cidr not null,
  is_active  boolean not null default true,
  note       text,
  created_at timestamptz not null default now(),
  unique (cidr)
);

comment on table public.allowed_networks is
  'Networks that may mark attendance. A single static IP is x.x.x.x/32.';

alter table public.allowed_networks enable row level security;

-- Employees never need to read this; the checks below run as definer.
drop policy if exists networks_select on public.allowed_networks;
create policy networks_select on public.allowed_networks
  for select to authenticated using (public.is_hr_admin());

drop policy if exists networks_write on public.allowed_networks;
create policy networks_write on public.allowed_networks
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ---------------------------------------------------------------------
-- Who is calling, and from where
-- ---------------------------------------------------------------------
create or replace function public.client_ip()
returns inet
language plpgsql stable set search_path = public as $$
declare
  headers json;
  xff     text;
  last_ip text;
begin
  begin
    headers := current_setting('request.headers', true)::json;
  exception when others then
    return null;
  end;

  if headers is null then return null; end if;

  xff := coalesce(headers ->> 'x-forwarded-for', headers ->> 'cf-connecting-ip', '');
  if xff = '' then return null; end if;

  -- the trusted edge appends the real client IP last
  last_ip := btrim(split_part(xff, ',', array_length(string_to_array(xff, ','), 1)));

  begin
    return last_ip::inet;
  exception when others then
    -- strip a trailing :port on IPv4 and try once more
    begin
      return split_part(last_ip, ':', 1)::inet;
    exception when others then
      return null;
    end;
  end;
end;
$$;

create or replace function public.on_office_network()
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    -- nothing configured yet: allow everything rather than lock people out
    when not exists (select 1 from public.allowed_networks where is_active)
      then true
    else exists (
      select 1
        from public.allowed_networks n
       where n.is_active
         and public.client_ip() is not null
         and public.client_ip() <<= n.cidr
    )
  end;
$$;

-- What the portal asks so it can explain itself before anyone clicks
create or replace function public.network_status()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ip',         public.client_ip()::text,
    'allowed',    public.on_office_network(),
    'configured', exists (select 1 from public.allowed_networks where is_active)
  );
$$;

grant execute on function public.network_status() to authenticated;

-- ---------------------------------------------------------------------
-- The rule: you may only mark YOURSELF from an approved network
--
-- HR and managers are exempt — they correct the roster, often for days
-- that have already passed, and locking that to the office helps nobody.
-- ---------------------------------------------------------------------
create or replace function public.enforce_office_network()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- SQL Editor / service_role
  if auth.uid() is null then return new; end if;

  -- approvers are marking someone else, or fixing a record
  if public.is_hr_admin() or public.is_manager() then return new; end if;

  -- only self-marking is restricted
  if new.employee_id is distinct from public.current_employee_id() then
    return new;
  end if;

  if not public.on_office_network() then
    raise exception
      'Attendance can only be marked on the office network. You appear to be at %.',
      coalesce(public.client_ip()::text, 'an unknown address')
      using hint = 'Connect to the office Wi-Fi, or ask HR to mark you.';
  end if;

  return new;
end;
$$;

drop trigger if exists attendance_office_network on public.attendance;
create trigger attendance_office_network before insert or update on public.attendance
  for each row execute function public.enforce_office_network();

-- ---------------------------------------------------------------------
-- Add your office here. Until you do, nothing is restricted.
--
--   insert into public.allowed_networks (label, cidr) values
--     ('Office Wi-Fi', '203.0.113.45/32');
--
-- A whole range uses a smaller prefix, e.g. '203.0.113.0/24'.
-- ---------------------------------------------------------------------

