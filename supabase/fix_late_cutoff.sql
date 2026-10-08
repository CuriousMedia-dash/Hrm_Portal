-- =====================================================================
-- 10:20 is on time. 10:21 is late.
--
-- THE BUG: the trigger compared the check-in to time '10:20', which
-- means 10:20:00 exactly. Anyone who tapped check in at 10:20:30 was
-- flagged late, because half past the minute is after 10:20:00 — while
-- the portal's own clock, which only reads whole minutes, still showed
-- them as 10:20 and on time. The two disagreed for 59 seconds a day.
--
-- THE FIX: the whole 10:20 minute counts as on time. Late starts at
-- 10:21:00.
--
-- Re-running this is safe: it recomputes every record from its
-- check-in time, so anyone wrongly flagged gets cleared.
-- =====================================================================

-- ---------------------------------------------------------------------
-- STEP 0 — who is affected. Run this first if you want to see it.
-- ---------------------------------------------------------------------
select e.full_name,
       a.work_date,
       to_char(a.check_in at time zone 'Asia/Kolkata', 'HH24:MI:SS') as checked_in_at,
       a.is_late as currently_marked_late
  from public.attendance a
  join public.employees e on e.id = a.employee_id
 where a.check_in is not null
   and (a.check_in at time zone 'Asia/Kolkata')::time >= time '10:20'
   and (a.check_in at time zone 'Asia/Kolkata')::time <  time '10:21'
 order by a.work_date desc, e.full_name;

-- ---------------------------------------------------------------------
-- STEP 1 — the rule itself
-- ---------------------------------------------------------------------
create or replace function public.mark_late()
returns trigger language plpgsql set search_path = public as $$
begin
  -- >= 10:21 rather than > 10:20, so the whole 10:20 minute is on time
  new.is_late :=
    new.check_in is not null
    and new.status in ('present','wfh','half_day')
    and (new.check_in at time zone 'Asia/Kolkata')::time >= time '10:21'
    and not coalesce(new.late_waived, false);
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- STEP 2 — recompute everything already recorded
--
-- This clears anyone caught by the old off-by-a-minute rule, and leaves
-- every genuinely late arrival exactly as it was.
-- ---------------------------------------------------------------------
update public.attendance
   set is_late = (
         check_in is not null
         and status in ('present','wfh','half_day')
         and (check_in at time zone 'Asia/Kolkata')::time >= time '10:21'
         and not coalesce(late_waived, false)
       )
 where check_in is not null;

-- ---------------------------------------------------------------------
-- STEP 3 — confirm. Nothing in the 10:20 minute should be late now.
-- ---------------------------------------------------------------------
select
  count(*) filter (
    where (check_in at time zone 'Asia/Kolkata')::time >= time '10:20'
      and (check_in at time zone 'Asia/Kolkata')::time <  time '10:21'
      and is_late
  ) as still_late_at_1020,
  count(*) filter (where is_late) as late_records_total
  from public.attendance
 where check_in is not null;
