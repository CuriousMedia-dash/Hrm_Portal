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
  internship_end_date date,                -- defaults to joining + 6 months when empty
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

