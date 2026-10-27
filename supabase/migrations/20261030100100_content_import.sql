-- Phase 4 schema: import jobs, upload storage policies, and user-source rules
-- (DATA_MODEL §4.2, CONTENT_GOVERNANCE §5, SECURITY §6).

-- User sources: no catalog key or URL; notes carry a body, uploads a storage path in the owner's folder.
alter table public.content_sources
  add constraint content_sources_user_types check (
    source_type not in ('user_note', 'user_upload') or (catalog_key is null and url is null)
  ),
  add constraint content_sources_note_body check (source_type <> 'user_note' or note_body_md is not null),
  add constraint content_sources_upload_path check (
    source_type <> 'user_upload'
    or storage_path = owner_id::text || '/' || id::text || '.pdf'
  );

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  source_id uuid references public.content_sources (id) on delete restrict,
  job_type text not null check (job_type in ('pdf_extract', 'note_segment', 'draft_generation')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'stalled', 'succeeded', 'failed', 'cancelled')),
  -- Resumable position, e.g. {"nextPage": 41, "segment": {...}}.
  cursor jsonb,
  -- Draft generation input ({passageIds, serviceId, maxConcepts}) and output ({conceptIds, rejected}).
  params jsonb,
  result jsonb,
  progress_pct smallint not null default 0 check (progress_pct between 0 and 100),
  passage_count int not null default 0 check (passage_count >= 0),
  error_code text check (error_code in (
    'file_too_large', 'unsupported_type', 'duplicate_source', 'rate_limited', 'pdf_encrypted', 'pdf_corrupt',
    'pdf_empty', 'pdf_too_many_pages', 'no_extractable_text', 'segmentation_failed', 'upload_missing',
    'ai_unavailable', 'ai_invalid_response', 'citation_mismatch')),
  error_detail text check (char_length(error_detail) <= 500),
  run_count int not null default 0 check (run_count >= 0),
  heartbeat_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (job_type = 'draft_generation' or source_id is not null),
  check ((status = 'failed') = (error_code is not null)),
  check ((status in ('succeeded', 'failed', 'cancelled')) = (finished_at is not null))
);

create index import_jobs_user_idx on public.import_jobs (user_id, status, created_at desc);
create index import_jobs_source_idx on public.import_jobs (source_id);
create trigger set_updated_at before update on public.import_jobs
  for each row execute function private.set_updated_at();

alter table public.import_jobs enable row level security;
create policy "own rows" on public.import_jobs for select to authenticated using (user_id = (select auth.uid()));
-- Written only through security-definer functions and the service role (ADR-0011).
grant select on public.import_jobs to authenticated;

-- Storage: private bucket "sources"; objects live at {user_id}/{source_id}.pdf (SECURITY §6).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sources', 'sources', false, 20 * 1024 * 1024, array['application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- A learner may upload exactly the object a pending upload source of theirs points to, once.
create policy "upload to own pending source" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'sources'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.content_sources s
      where s.owner_id = (select auth.uid()) and s.source_type = 'user_upload' and s.status = 'pending'
        and s.storage_path = name
    )
  );

create policy "read own uploads" on storage.objects
  for select to authenticated
  using (bucket_id = 'sources' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Same content hash as import_catalog uses for question versions (ADR-0006).
create function private.question_hash(p_prompt text, p_reference text, p_rubric jsonb, p_schema_version int)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(
    p_prompt || chr(31) || p_reference || chr(31) || p_rubric::text || chr(31) || p_schema_version, 'UTF8')), 'hex');
$$;
