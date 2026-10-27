-- Row-level security and grants for catalog, content, and review state (DATA_MODEL §6).
-- Phase 1 has no client-side catalog writes: curated content is loaded by the catalog import
-- (service role). Owner write policies arrive with the screens that need them.

alter table public.certifications enable row level security;
alter table public.exam_domains enable row level security;
alter table public.service_categories enable row level security;
alter table public.services enable row level security;
alter table public.service_relationships enable row level security;
alter table public.service_concepts enable row level security;
alter table public.concept_revisions enable row level security;
alter table public.concept_certifications enable row level security;
alter table public.questions enable row level security;
alter table public.question_versions enable row level security;
alter table public.content_sources enable row level security;
alter table public.source_passages enable row level security;
alter table public.concept_sources enable row level security;
alter table public.review_state enable row level security;

-- Reference data: readable by any signed-in user.
create policy "authenticated read" on public.certifications
  for select to authenticated using (true);
create policy "authenticated read" on public.exam_domains
  for select to authenticated using (true);
create policy "authenticated read" on public.service_categories
  for select to authenticated using (true);

-- Services: published ones for everyone signed in; the owner also sees drafts and items in review.
create policy "published or owner" on public.services
  for select to authenticated using (status = 'published' or (select private.is_owner()));

create policy "both services visible" on public.service_relationships
  for select to authenticated using (
    exists (select 1 from public.services s where s.id = from_service_id)
    and exists (select 1 from public.services s where s.id = to_service_id)
  );

-- Concepts: published + shared, or authored by the caller, or the owner.
create policy "published, own, or owner" on public.service_concepts
  for select to authenticated using (
    (status = 'published' and visibility = 'shared')
    or owner_id = (select auth.uid())
    or (select private.is_owner())
  );

create policy "owner only" on public.concept_revisions
  for select to authenticated using ((select private.is_owner()));

create policy "concept visible" on public.concept_certifications
  for select to authenticated using (
    exists (select 1 from public.service_concepts c where c.id = concept_id)
  );

create policy "published with visible concept, or owner" on public.questions
  for select to authenticated using (
    (status = 'published' and exists (select 1 from public.service_concepts c where c.id = concept_id))
    or (select private.is_owner())
  );

create policy "question visible" on public.question_versions
  for select to authenticated using (
    exists (select 1 from public.questions q where q.id = question_id)
  );

create policy "shared or own" on public.content_sources
  for select to authenticated using (visibility = 'shared' or owner_id = (select auth.uid()));

create policy "source visible" on public.source_passages
  for select to authenticated using (
    exists (select 1 from public.content_sources s where s.id = source_id)
  );

create policy "concept and passage visible" on public.concept_sources
  for select to authenticated using (
    exists (select 1 from public.service_concepts c where c.id = concept_id)
    and exists (select 1 from public.source_passages p where p.id = passage_id)
  );

-- Review state is private to its learner and written only through security-definer functions.
create policy "own rows" on public.review_state
  for select to authenticated using (user_id = (select auth.uid()));

-- Grants. anon gets nothing. authenticated reads; RLS decides which rows.
grant select on
  public.certifications, public.exam_domains, public.service_categories, public.services,
  public.service_relationships, public.service_concepts, public.concept_revisions,
  public.concept_certifications, public.questions, public.content_sources,
  public.source_passages, public.concept_sources, public.review_state
  to authenticated;

-- Reference answers and rubrics stay hidden until an attempt is submitted (DATA_MODEL §6.3).
grant select (id, question_id, version, prompt_md, rubric_schema_version, created_at)
  on public.question_versions to authenticated;
