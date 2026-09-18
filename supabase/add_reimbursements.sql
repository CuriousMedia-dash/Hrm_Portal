-- =====================================================================
-- Reimbursement claims
--
-- Run once in Supabase > SQL Editor. Safe to re-run.
-- Already folded into schema.sql for fresh setups.
--
-- Receipts reuse the employee-documents bucket, under
--   <employee_id>/receipts/<file>
-- so the existing storage Apolicies already cover them: the first folder
-- in the path is the employee id.
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
