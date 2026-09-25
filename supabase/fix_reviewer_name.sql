-- =====================================================================
-- Show who approved something, not just who rejected it
--
-- THE BUG: the portal read the approver's name by joining to the
-- employees table. An ordinary employee may only read their OWN
-- employees row, so that join came back empty and no name was shown.
-- Rejections still looked attributed because a rejection carries a
-- written reason and an approval does not — so approvals appeared to
-- lose the reviewer while rejections kept theirs.
--
-- THE FIX: record the reviewer's name on the request itself at the
-- moment of the decision. No join, no widening of who may read the
-- directory. A rename keeps it current (last trigger below).
--
-- Applies to leave, reimbursements and regularizations — all three had
-- the same problem.
--
-- Run once in Supabase > SQL Editor. Safe to re-run.
-- =====================================================================

alter table public.leave_requests  add column if not exists reviewed_by_name text;
alter table public.leave_requests  add column if not exists reviewed_by_role text;
alter table public.reimbursements  add column if not exists reviewed_by_name text;
alter table public.reimbursements  add column if not exists reviewed_by_role text;
alter table public.regularizations add column if not exists reviewed_by_name text;
alter table public.regularizations add column if not exists reviewed_by_role text;

-- ---------------------------------------------------------------------
-- Stamp the name whenever reviewed_by is set or changed.
--
-- security definer: the trigger reads the employees table on behalf of
-- someone who may not be allowed to, which is the whole point.
-- ---------------------------------------------------------------------
create or replace function public.stamp_reviewer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.reviewed_by is null then
    new.reviewed_by_name := null;
    new.reviewed_by_role := null;
  elsif new.reviewed_by is distinct from old.reviewed_by
        or new.reviewed_by_name is null then
    select full_name, role
      into new.reviewed_by_name, new.reviewed_by_role
      from public.employees
     where id = new.reviewed_by;
  end if;
  return new;
end;
$$;

drop trigger if exists leave_stamp_reviewer on public.leave_requests;
create trigger leave_stamp_reviewer before insert or update on public.leave_requests
  for each row execute function public.stamp_reviewer();

drop trigger if exists reimb_stamp_reviewer on public.reimbursements;
create trigger reimb_stamp_reviewer before insert or update on public.reimbursements
  for each row execute function public.stamp_reviewer();

drop trigger if exists reg_stamp_reviewer on public.regularizations;
create trigger reg_stamp_reviewer before insert or update on public.regularizations
  for each row execute function public.stamp_reviewer();

-- ---------------------------------------------------------------------
-- Backfill everything already decided
-- ---------------------------------------------------------------------
update public.leave_requests r
   set reviewed_by_name = e.full_name,
       reviewed_by_role = e.role
  from public.employees e
 where e.id = r.reviewed_by
   and r.reviewed_by_name is null;

update public.reimbursements r
   set reviewed_by_name = e.full_name,
       reviewed_by_role = e.role
  from public.employees e
 where e.id = r.reviewed_by
   and r.reviewed_by_name is null;

update public.regularizations r
   set reviewed_by_name = e.full_name,
       reviewed_by_role = e.role
  from public.employees e
 where e.id = r.reviewed_by
   and r.reviewed_by_name is null;

-- ---------------------------------------------------------------------
-- Keep the stamp current if someone is renamed or changes role
-- ---------------------------------------------------------------------
create or replace function public.resync_reviewer_names()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.full_name is distinct from old.full_name
     or new.role is distinct from old.role then
    update public.leave_requests
       set reviewed_by_name = new.full_name, reviewed_by_role = new.role
     where reviewed_by = new.id;
    update public.reimbursements
       set reviewed_by_name = new.full_name, reviewed_by_role = new.role
     where reviewed_by = new.id;
    update public.regularizations
       set reviewed_by_name = new.full_name, reviewed_by_role = new.role
     where reviewed_by = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists employees_resync_reviewer on public.employees;
create trigger employees_resync_reviewer after update on public.employees
  for each row execute function public.resync_reviewer_names();

-- ---------------------------------------------------------------------
-- Check: every decided request should now name its reviewer
-- ---------------------------------------------------------------------
select 'leave' as source, status, count(*) as rows,
       count(*) filter (where reviewed_by_name is not null) as named
  from public.leave_requests where reviewed_by is not null group by status
union all
select 'reimbursement', status, count(*),
       count(*) filter (where reviewed_by_name is not null)
  from public.reimbursements where reviewed_by is not null group by status
union all
select 'regularization', status, count(*),
       count(*) filter (where reviewed_by_name is not null)
  from public.regularizations where reviewed_by is not null group by status
order by 1, 2;
