-- =====================================================================
-- Leave policy + holiday calendar
--
--   1. New leave types: paternity, family marriage, own marriage
--   2. Entitlements by employment type (interns get 1, staff get the set)
--   3. Holiday calendar, visible to everyone, editable by HR
--   4. The 2026 calendar, seeded
--
-- Run once in Supabase > SQL Editor. Safe to re-run.
-- Already folded into schema.sql for fresh setups.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The leave types
-- ---------------------------------------------------------------------
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

select name, to_char(start_date,'DD Mon') as from_date,
       to_char(end_date,'DD Mon') as to_date, kind
  from public.holidays order by start_date;
