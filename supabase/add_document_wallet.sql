-- =====================================================================
-- Document wallet — documents HR issues TO an employee
--
-- The existing employee_documents table is the other direction: things
-- the employee uploads for HR (Aadhaar, mark sheets). This one holds what
-- the company gives them — offer letter, payslips, insurance — which they
-- can download but never change.
--
-- Payslips recur, so unlike the checklist there can be many files per
-- type. Each row may carry a period ('2026-09') and a title.
--
-- Managers are deliberately excluded: payslips are salary information.
-- Only the employee themselves and HR can see a wallet.
--
-- Run once in Supabase > SQL Editor. Safe to re-run.
-- =====================================================================

create table if not exists public.issued_documents (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  doc_type    text not null check (doc_type in (
                'insurance','offer_letter','appointment_letter',
                'completion_certificate','payslip','recommendation_letter','other')),
  title       text,                       -- e.g. 'September 2026' or a custom name
  period      text,                       -- 'YYYY-MM' for payslips
  file_path   text not null,
  file_name   text not null,
  file_size   bigint,
  mime_type   text,
  note        text,
  issued_by   uuid references public.employees(id) on delete set null,
  issued_at   timestamptz not null default now()
);

create index if not exists issued_documents_employee_idx
  on public.issued_documents (employee_id, issued_at desc);
create index if not exists issued_documents_type_idx
  on public.issued_documents (doc_type);

alter table public.issued_documents enable row level security;

-- The employee reads their own; HR reads and writes everyone's.
drop policy if exists issued_select on public.issued_documents;
create policy issued_select on public.issued_documents
  for select to authenticated
  using (employee_id = public.current_employee_id() or public.is_hr_admin());

drop policy if exists issued_write on public.issued_documents;
create policy issued_write on public.issued_documents
  for all to authenticated
  using (public.is_hr_admin())
  with check (public.is_hr_admin());

-- ---------------------------------------------------------------------
-- Storage: wallet files live at  <employee_id>/issued/<file>
--
-- The existing policies let an employee write and delete anything under
-- their own folder — fine for documents they upload, wrong for a payslip.
-- These replacements carve out the 'issued' subfolder as read-only to
-- everyone but HR.
-- ---------------------------------------------------------------------
drop policy if exists "employee docs insert" on storage.objects;
create policy "employee docs insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'employee-documents'
    and (
      public.is_hr_admin()
      or (
        (storage.foldername(name))[1] = public.current_employee_id()::text
        and coalesce((storage.foldername(name))[2], '') <> 'issued'
      )
    )
  );

drop policy if exists "employee docs update" on storage.objects;
create policy "employee docs update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'employee-documents'
    and (
      public.is_hr_admin()
      or (
        (storage.foldername(name))[1] = public.current_employee_id()::text
        and coalesce((storage.foldername(name))[2], '') <> 'issued'
      )
    )
  );

drop policy if exists "employee docs delete" on storage.objects;
create policy "employee docs delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'employee-documents'
    and (
      public.is_hr_admin()
      or (
        (storage.foldername(name))[1] = public.current_employee_id()::text
        and coalesce((storage.foldername(name))[2], '') <> 'issued'
      )
    )
  );

-- reading stays as it was: your own folder, or everything for HR
drop policy if exists "employee docs read" on storage.objects;
create policy "employee docs read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'employee-documents'
    and (
      public.is_hr_admin()
      or (storage.foldername(name))[1] = public.current_employee_id()::text
    )
  );

select 'document wallet installed' as status;
