-- =====================================================================
-- Office network restriction for attendance
--
-- Checking in and out requires being on an approved network. Everything
-- else — leave, claims, documents, the directory — keeps working from
-- anywhere, so a sick employee can still apply for leave from home.
--
-- HOW IT DECIDES: Postgres reads the caller's IP from the request
-- headers that PostgREST exposes. This is a solid deterrent for ordinary
-- staff, not a defence against someone actively attacking it — an
-- X-Forwarded-For header can be tampered with. We read the LAST entry,
-- which is the one Supabase's edge appends, so a client that injects its
-- own value does not win.
--
-- FAILS OPEN when no network is configured: with the table empty every
-- check-in is allowed, so installing this file cannot lock anyone out
-- before you have added your office IP.
--
-- Run once in Supabase > SQL Editor. Safe to re-run.
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

select public.network_status() as status_from_sql_editor;
