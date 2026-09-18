-- =====================================================================
-- Let an employee record exist without an email address.
--
-- Why: the directory is imported from HR's sheet, which lists people by
-- name and department only. The email is added later, when the person
-- needs portal access.
--
-- Still unique when present — Postgres allows many NULLs in a unique
-- column, but no two people can share the same real address.
--
-- Already folded into schema.sql for fresh setups.
-- =====================================================================

alter table public.employees alter column email drop not null;

-- A record with no email cannot be linked by signup. This shows who
-- still needs one:
select employee_code, full_name, department, designation
  from public.employees
 where email is null
 order by full_name;
