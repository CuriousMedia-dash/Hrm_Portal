-- =====================================================================
-- Employee documents + emergency contacts
--
-- Run this once in Supabase > SQL Editor. Safe to re-run.
-- Already folded into schema.sql for fresh setups.
--
-- Files live in Supabase Storage (private bucket), not in Postgres.
-- The table below records which file is which document for whom.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Private storage bucket
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'employee-documents',
  'employee-documents',
  false,                                   -- private: reachable only via signed URLs
  10485760,                                -- 10 MB per file
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------
-- 2. Document register
-- ---------------------------------------------------------------------
create table if not exists public.employee_documents (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  doc_type    text not null check (doc_type in (
                'tenth_marksheet','twelfth_marksheet','ug_marksheet','pg_marksheet',
                'photo','pan_card','aadhaar_card','bank_proof','guardian_aadhaar',
                'relieving_letter','previous_offer_letter')),
  file_path   text not null,              -- path inside the storage bucket
  file_name   text not null,              -- what the employee called it
  file_size   bigint,
  mime_type   text,
  uploaded_at timestamptz not null default now(),
  unique (employee_id, doc_type)          -- one current file per document
);

create index if not exists employee_documents_employee_idx
  on public.employee_documents (employee_id);

-- ---------------------------------------------------------------------
-- 3. Emergency contacts (two required)
-- ---------------------------------------------------------------------
create table if not exists public.emergency_contacts (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  full_name    text not null,
  relationship text not null check (relationship in
                 ('mother','father','sibling','spouse','guardian','other')),
  phone        text not null,
  created_at   timestamptz not null default now()
);

create index if not exists emergency_contacts_employee_idx
  on public.emergency_contacts (employee_id);

-- ---------------------------------------------------------------------
-- 4. Row level security — your own records, or everything if you are HR
-- ---------------------------------------------------------------------
alter table public.employee_documents enable row level security;
alter table public.emergency_contacts enable row level security;

drop policy if exists documents_select on public.employee_documents;
create policy documents_select on public.employee_documents
  for select to authenticated
  using (employee_id = public.current_employee_id() or public.is_hr_admin());

drop policy if exists documents_insert on public.employee_documents;
create policy documents_insert on public.employee_documents
  for insert to authenticated
  with check (employee_id = public.current_employee_id() or public.is_hr_admin());

drop policy if exists documents_update on public.employee_documents;
create policy documents_update on public.employee_documents
  for update to authenticated
  using (employee_id = public.current_employee_id() or public.is_hr_admin())
  with check (employee_id = public.current_employee_id() or public.is_hr_admin());

drop policy if exists documents_delete on public.employee_documents;
create policy documents_delete on public.employee_documents
  for delete to authenticated
  using (employee_id = public.current_employee_id() or public.is_hr_admin());

drop policy if exists contacts_select on public.emergency_contacts;
create policy contacts_select on public.emergency_contacts
  for select to authenticated
  using (employee_id = public.current_employee_id() or public.is_hr_admin());

drop policy if exists contacts_write on public.emergency_contacts;
create policy contacts_write on public.emergency_contacts
  for all to authenticated
  using (employee_id = public.current_employee_id() or public.is_hr_admin())
  with check (employee_id = public.current_employee_id() or public.is_hr_admin());

-- ---------------------------------------------------------------------
-- 5. Storage policies
--
-- Every file is stored as  <employee_id>/<doc_type>-<timestamp>.<ext>
-- so the first folder in the path decides who owns it.
-- ---------------------------------------------------------------------
drop policy if exists "employee docs read"   on storage.objects;
drop policy if exists "employee docs insert" on storage.objects;
drop policy if exists "employee docs update" on storage.objects;
drop policy if exists "employee docs delete" on storage.objects;

create policy "employee docs read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'employee-documents'
    and (
      public.is_hr_admin()
      or (storage.foldername(name))[1] = public.current_employee_id()::text
    )
  );

create policy "employee docs insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'employee-documents'
    and (
      public.is_hr_admin()
      or (storage.foldername(name))[1] = public.current_employee_id()::text
    )
  );

create policy "employee docs update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'employee-documents'
    and (
      public.is_hr_admin()
      or (storage.foldername(name))[1] = public.current_employee_id()::text
    )
  );

create policy "employee docs delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'employee-documents'
    and (
      public.is_hr_admin()
      or (storage.foldername(name))[1] = public.current_employee_id()::text
    )
  );

-- Check the bucket landed:
select id, public, file_size_limit from storage.buckets where id = 'employee-documents';
