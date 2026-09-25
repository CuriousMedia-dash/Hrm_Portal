-- =====================================================================
-- Company policies
--
-- HR uploads the policy documents once; everyone in the portal can read
-- and download them. Unlike the employee documents bucket, nothing here
-- is personal, so every signed-in person may read the whole thing —
-- but only HR and super admins may add, replace or remove.
--
-- Run once in Supabase > SQL Editor. Safe to re-run.
-- =====================================================================

create table if not exists public.policies (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,
  title       text not null,
  description text,
  file_path   text not null,             -- path inside the company-policies bucket
  file_name   text not null,
  file_size   bigint,
  mime_type   text,
  effective_from date,
  is_active   boolean not null default true,
  uploaded_by uuid references public.employees(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists policies_kind_idx on public.policies (kind, created_at desc);

comment on table public.policies is
  'Company-wide policy documents. Readable by every employee.';

-- keep updated_at honest, reusing the trigger the other tables use
drop trigger if exists policies_touch on public.policies;
create trigger policies_touch before update on public.policies
  for each row execute function public.touch_updated_at();

alter table public.policies enable row level security;

drop policy if exists policies_select on public.policies;
create policy policies_select on public.policies
  for select to authenticated using (true);

drop policy if exists policies_write on public.policies;
create policy policies_write on public.policies
  for all to authenticated
  using (public.is_hr_admin()) with check (public.is_hr_admin());

-- ---------------------------------------------------------------------
-- Storage: a private bucket of its own
--
-- Private, so the files are only reachable through a signed URL the
-- portal mints for a signed-in person — not by guessing a public link.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('company-policies', 'company-policies', false)
on conflict (id) do nothing;

drop policy if exists "policies read" on storage.objects;
create policy "policies read" on storage.objects
  for select to authenticated
  using (bucket_id = 'company-policies');

drop policy if exists "policies insert" on storage.objects;
create policy "policies insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'company-policies' and public.is_hr_admin());

drop policy if exists "policies update" on storage.objects;
create policy "policies update" on storage.objects
  for update to authenticated
  using (bucket_id = 'company-policies' and public.is_hr_admin());

drop policy if exists "policies delete" on storage.objects;
create policy "policies delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'company-policies' and public.is_hr_admin());

select 'policies installed' as status;
