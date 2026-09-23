-- =====================================================================
-- Why did "Create login" fail for this one person?
--
-- Put their email in the line below and run the whole file.
-- =====================================================================

with target as (select lower('CHANGE_ME@curiousmedia.in') as addr)

-- 1. the employee record
select 'employee record' as what,
       e.full_name::text,
       e.email::text,
       e.status::text,
       case when e.user_id is null then 'no login linked' else 'login already linked' end as login
  from public.employees e, target t
 where lower(coalesce(e.email,'')) = t.addr

union all

-- 2. any auth account on that address
select 'auth account',
       coalesce(u.raw_user_meta_data->>'full_name', '—')::text,
       u.email::text,
       case when u.email_confirmed_at is null then 'NOT confirmed' else 'confirmed' end,
       case when x.id is null then 'ORPHAN - belongs to nobody' else 'belongs to ' || x.full_name end
  from auth.users u
  left join public.employees x on x.user_id = u.id, target t
 where lower(u.email) = t.addr

union all

-- 3. duplicate employee rows on the same address
select 'duplicate row', e.full_name::text, e.email::text, e.status::text, e.id::text
  from public.employees e, target t
 where lower(coalesce(e.email,'')) = t.addr
   and (select count(*) from public.employees d
         where lower(coalesce(d.email,'')) = t.addr) > 1;

-- ---------------------------------------------------------------------
-- HOW TO READ IT
--
--   "ORPHAN - belongs to nobody"   the address still has a leftover
--                                  account. The updated Edge Function
--                                  now takes it over and sets your
--                                  password on it — just retry.
--
--   "belongs to <someone else>"    two people were given the same
--                                  address. Give this person their own.
--
--   "login already linked"         the record already has an account.
--                                  Use Reset password, not Create login.
--
--   "duplicate row"                two employee records share the email.
--                                  Delete the empty one, keep the filled one.
--
--   nothing at all                 the address is clean; the failure is
--                                  something else. The portal now shows
--                                  the real reason in the toast.
-- ---------------------------------------------------------------------
