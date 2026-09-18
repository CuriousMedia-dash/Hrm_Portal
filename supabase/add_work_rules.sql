-- =====================================================================
-- Work rules update
--
--   1. Unpaid leave becomes maternity leave
--   2. Notice period and internship end dates on the employee record
--   3. Arrival after 10:20 IST is marked late
--   4. Check-out blocked until 8 hours after check-in
--
-- Run once in Supabase > SQL Editor. Safe to re-run.
-- Already folded into schema.sql for fresh setups.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Unpaid leave -> maternity leave
-- ---------------------------------------------------------------------
alter table public.leave_requests drop constraint if exists leave_requests_leave_type_check;
alter table public.leave_balances drop constraint if exists leave_balances_leave_type_check;

update public.leave_requests set leave_type = 'maternity' where leave_type = 'unpaid';
update public.leave_balances set leave_type = 'maternity' where leave_type = 'unpaid';

alter table public.leave_requests
  add constraint leave_requests_leave_type_check
  check (leave_type in ('casual','sick','earned','maternity'));

alter table public.leave_balances
  add constraint leave_balances_leave_type_check
  check (leave_type in ('casual','sick','earned','maternity'));

-- New joiners get 0 maternity days; HR grants the entitlement per person
-- when it applies, from Supabase or by editing leave_balances.
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

-- ---------------------------------------------------------------------
-- 2. Dates the alerts count down to
-- ---------------------------------------------------------------------
alter table public.employees add column if not exists notice_end_date      date;
alter table public.employees add column if not exists internship_end_date  date;

comment on column public.employees.notice_end_date is
  'Last working day. HR is alerted 15 days before.';
comment on column public.employees.internship_end_date is
  'When the internship converts. Defaults to joining date + 6 months if left empty.';

-- ---------------------------------------------------------------------
-- 3. Late arrivals — anything after 10:20 India time
-- ---------------------------------------------------------------------
alter table public.attendance add column if not exists is_late boolean not null default false;

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

select 'work rules applied' as status;
