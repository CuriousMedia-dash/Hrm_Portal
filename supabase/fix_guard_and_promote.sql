-- =====================================================================
-- One-off fix: the update guard was also blocking updates made from the
-- SQL Editor (where there is no logged-in user), which made it impossible
-- to promote the first HR admin. This replaces the function and then
-- promotes you.
--
-- Already included in the fixed schema.sql — this file is just so you
-- don't have to re-run the whole schema.
-- =====================================================================

create or replace function public.employees_guard_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null for the SQL Editor / service_role: that is you,
  -- the database owner, so let it through.
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

-- Now the promotion actually sticks:
update public.employees
   set role   = 'hr_admin',
       status = 'active'
 where lower(email) = lower('vihith@curiousmedia.in');

select full_name, email, role, status, user_id
  from public.employees
 order by created_at;
