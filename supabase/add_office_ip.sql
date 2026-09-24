-- =====================================================================
-- Register the office static IP for attendance marking
--
-- RUN add_office_network.sql FIRST. This file only adds the address.
--
-- BEFORE YOU RUN THIS: open the portal from the office Wi-Fi, go to
-- Activity, and read the line that says which IP you are on. It must say
-- 103.140.219.90. If it says anything else, put THAT number in below —
-- what matters is the address the internet sees, not what the router is
-- configured with.
--
-- /32 means "this one address". Do not widen it to /24 — the
-- 255.255.255.0 mask describes your ISP's segment, not your company, so
-- a /24 would also let in every other customer on it.
-- =====================================================================

insert into public.allowed_networks (label, cidr, note)
values ('Office Wi-Fi', '103.140.219.90/32', 'Static IP from ISP, added 2026-09-23')
on conflict (cidr) do update
  set is_active = true,
      label     = excluded.label;

-- Confirm what is now in force
select label, cidr::text, is_active, note
  from public.allowed_networks
 order by created_at;

-- What the server sees for YOUR current connection. Run this from the
-- office and 'allowed' should come back true.
select public.network_status();

-- ---------------------------------------------------------------------
-- IF YOU LOCK PEOPLE OUT
--
-- Turning the restriction off again, immediately:
--
--   update public.allowed_networks set is_active = false;
--
-- With no active row the check fails open and everyone can mark
-- attendance from anywhere, exactly as before this was installed.
-- HR, managers and super admins are exempt either way.
-- ---------------------------------------------------------------------
