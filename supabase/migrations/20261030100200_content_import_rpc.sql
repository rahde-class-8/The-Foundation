-- Phase 4 functions (API_CONTRACTS §3–§4): sources, import jobs, passages, drafts, and publishing.
-- Learner functions are SECURITY DEFINER with explicit ownership checks; job writes and draft
-- creation are service-role only and called by the ingest-source and generate-drafts functions.

-- Drafts stay out of the library and search until published (P4-3) --------------------------------

-- public.search_catalog: 5 concept filters now also exclude drafts.
create or replace function public.search_catalog(
  q text default null,
  domain_id uuid default null,
  category_id uuid default null,
  after text default null,
  page_size int default 24
) returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_query tsquery := private.catalog_tsquery(search_catalog.q);
  v_limit int := least(greatest(coalesce(search_catalog.page_size, 24), 1), 100);
  v_after jsonb;
  v_items jsonb;
  v_rows int;
  v_next text;
begin
  if search_catalog.after is not null then
    begin
      v_after := convert_from(decode(search_catalog.after, 'base64'), 'UTF8')::jsonb;
      perform (v_after ->> 'o')::int, (v_after ->> 'i')::uuid;
    exception when others then
      raise exception 'invalid cursor' using errcode = '22023';
    end;
  end if;

  with matched as (
    select s.id, s.slug, s.name, s.aliases, s.summary_md, s.status,
           cat.id as cat_id, cat.slug as cat_slug, cat.name as cat_name, cat.sort_order as cat_sort
    from public.services s
    join public.service_categories cat on cat.id = s.category_id
    where s.status <> 'retired'
      and (search_catalog.category_id is null or s.category_id = search_catalog.category_id)
      and (search_catalog.domain_id is null or exists (
        select 1
        from public.service_concepts c
        join public.concept_certifications cc on cc.concept_id = c.id
        where c.service_id = s.id and c.status not in ('retired', 'draft') and cc.exam_domain_id = search_catalog.domain_id
      ))
      and (v_query is null or s.search_tsv @@ v_query or exists (
        select 1 from public.service_concepts c
        where c.service_id = s.id and c.status not in ('retired', 'draft') and (c.search_tsv || s.search_tsv) @@ v_query
      ))
      and (v_after is null
        or (cat.sort_order, s.name, s.id) > ((v_after ->> 'o')::int, v_after ->> 'n', (v_after ->> 'i')::uuid))
    order by cat.sort_order, s.name, s.id
    limit v_limit + 1
  ),
  numbered as (
    select m.*, row_number() over (order by m.cat_sort, m.name, m.id) as ord
    from matched m
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', n.id,
      'slug', n.slug,
      'name', n.name,
      'aliases', to_jsonb(n.aliases),
      'summaryMd', n.summary_md,
      'status', n.status,
      'category', jsonb_build_object('id', n.cat_id, 'slug', n.cat_slug, 'name', n.cat_name),
      'conceptCount', (
        select count(*) from public.service_concepts c where c.service_id = n.id and c.status not in ('retired', 'draft')
      ),
      'progress', (
        select jsonb_build_object(
          'reviewingOrBetter', count(*) filter (where r.mastery_status in ('reviewing', 'mastered')),
          'studied', count(*) filter (where r.first_studied_at is not null)
        )
        from public.review_state r
        join public.service_concepts c on c.id = r.concept_id
        where c.service_id = n.id and c.status not in ('retired', 'draft') and r.is_active and r.user_id = (select auth.uid())
      ),
      'matchedConcepts', case when v_query is null then '[]'::jsonb else coalesce((
        select jsonb_agg(jsonb_build_object('id', mc.id, 'slug', mc.slug, 'title', mc.title) order by mc.sort_order)
        from (
          select c.id, c.slug, c.title, c.sort_order
          from public.service_concepts c
          join public.services s2 on s2.id = c.service_id
          -- A concept "matches" when it satisfies the query itself, or completes it together with
          -- its service ("lambda concurrency"); a bare service-name query highlights no concepts.
          where c.service_id = n.id and c.status not in ('retired', 'draft')
            and (c.search_tsv @@ v_query
              or (not s2.search_tsv @@ v_query and (c.search_tsv || s2.search_tsv) @@ v_query))
          order by c.sort_order
          limit 5
        ) mc
      ), '[]'::jsonb) end
    ) order by n.ord) filter (where n.ord <= v_limit), '[]'::jsonb),
    count(*),
    (array_agg(
      replace(encode(convert_to(jsonb_build_object('o', n.cat_sort, 'n', n.name, 'i', n.id)::text, 'UTF8'), 'base64'), E'\n', '')
      order by n.ord
    ) filter (where n.ord = v_limit))[1]
  into v_items, v_rows, v_next
  from numbered n;

  return jsonb_build_object('items', v_items, 'nextCursor', case when v_rows > v_limit then v_next end);
end;
$$;

-- public.service_profile: 1 concept filters now also exclude drafts.
create or replace function public.service_profile(service_slug text, provider text default 'aws') returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id,
    'slug', s.slug,
    'name', s.name,
    'aliases', to_jsonb(s.aliases),
    'summaryMd', s.summary_md,
    'status', s.status,
    'origin', s.origin,
    'docsUrl', s.docs_url,
    'category', jsonb_build_object('id', cat.id, 'slug', cat.slug, 'name', cat.name),
    'dimensions', jsonb_build_object(
      'what', s.what_it_is_md,
      'how', s.how_it_works_md,
      'problem', s.problem_solved_md,
      'solution', s.how_it_solves_md,
      'not_do', s.does_not_do_md,
      'when', s.when_to_choose_md,
      'where', s.architecture_placement_md,
      'trade_offs', s.trade_offs_md
    ),
    'concepts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'slug', c.slug,
        'title', c.title,
        'summaryMd', c.summary_md,
        'explanationMd', c.explanation_md,
        'examplesMd', c.examples_md,
        'limitationsMd', c.limitations_md,
        'status', c.status,
        'origin', c.origin,
        'domains', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', d.id, 'code', d.code, 'name', d.name,
            'certification', cert.code || '-' || cert.exam_version,
            'relevance', cc.relevance
          ) order by cert.code, cc.relevance, d.sort_order)
          from public.concept_certifications cc
          join public.exam_domains d on d.id = cc.exam_domain_id
          join public.certifications cert on cert.id = cc.certification_id
          where cc.concept_id = c.id
        ), '[]'::jsonb),
        'citations', coalesce((
          select jsonb_agg(jsonb_build_object(
            'passageId', p.id,
            'supportType', cs.support_type,
            'excerpt', p.text,
            'excerptKind', p.excerpt_kind,
            'sectionPath', p.section_path,
            'pageStart', p.page_start,
            'pageEnd', p.page_end,
            'source', jsonb_build_object(
              'id', src.id,
              'title', src.title,
              'url', src.url,
              'sourceType', src.source_type,
              'trustTier', private.trust_tier(src.source_type),
              'retrievedAt', src.retrieved_at
            )
          ) order by cs.support_type, src.title, p.ordinal)
          from public.concept_sources cs
          join public.source_passages p on p.id = cs.passage_id
          join public.content_sources src on src.id = p.source_id
          where cs.concept_id = c.id
        ), '[]'::jsonb),
        'progress', (
          select jsonb_build_object('masteryStatus', r.mastery_status, 'firstStudiedAt', r.first_studied_at)
          from public.review_state r
          where r.concept_id = c.id and r.is_active and r.user_id = (select auth.uid())
        ),
        'questionCount', (
          select count(*) from public.questions qn where qn.concept_id = c.id and qn.status = 'published'
        )
      ) order by c.sort_order, c.title)
      from public.service_concepts c
      where c.service_id = s.id and c.status not in ('retired', 'draft')
    ), '[]'::jsonb),
    'related', coalesce((
      select jsonb_agg(jsonb_build_object(
        'relation', r.relation,
        'noteMd', r.note_md,
        'service', jsonb_build_object('slug', t.slug, 'name', t.name)
      ) order by r.relation, t.name)
      from public.service_relationships r
      join public.services t on t.id = r.to_service_id
      where r.from_service_id = s.id and t.status <> 'retired'
    ), '[]'::jsonb)
  )
  from public.services s
  join public.service_categories cat on cat.id = s.category_id
  where s.slug = service_profile.service_slug
    and s.cloud_provider = service_profile.provider
    and s.status <> 'retired';
$$;


-- Helpers ------------------------------------------------------------------------------------------

create function private.job_json(j public.import_jobs) returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when j.id is null then null else jsonb_build_object(
    'id', j.id, 'sourceId', j.source_id, 'jobType', j.job_type, 'status', j.status, 'progressPct', j.progress_pct,
    'passageCount', j.passage_count, 'errorCode', j.error_code, 'errorDetail', j.error_detail,
    'hasMore', j.status in ('queued', 'running', 'stalled'), 'runCount', j.run_count, 'result', j.result,
    'createdAt', j.created_at, 'finishedAt', j.finished_at) end;
$$;

create function private.require_owner() returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if not private.is_owner() then
    raise exception 'only the owner can review and publish content' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

grant execute on function private.require_owner() to authenticated;

-- Sources ------------------------------------------------------------------------------------------

-- Registers an upload before the file is sent to Storage (CNT-2a): size, duplicate, and daily limits.
-- The Edge Function re-checks everything against the stored bytes.
create function public.create_upload_source(title text, byte_size bigint, sha256 text) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  v_source public.content_sources;
  v_job public.import_jobs;
begin
  if create_upload_source.byte_size > 20 * 1024 * 1024 then
    raise exception 'file_too_large' using errcode = '22023';
  end if;
  if create_upload_source.sha256 !~ '^[0-9a-f]{64}$' or btrim(coalesce(create_upload_source.title, '')) = '' then
    raise exception 'invalid upload' using errcode = '22023';
  end if;
  if exists (select 1 from public.content_sources s
             where s.owner_id = v_uid and s.sha256 = create_upload_source.sha256 and s.status <> 'failed') then
    raise exception 'duplicate_source' using errcode = '22023';
  end if;
  if (select count(*) from public.content_sources s
      where s.owner_id = v_uid and s.source_type = 'user_upload' and s.created_at > now() - interval '1 day') >= 10 then
    raise exception 'rate_limited' using errcode = '22023';
  end if;
  -- A failed upload of the same file may be retried.
  update public.content_sources s set sha256 = null
  where s.owner_id = v_uid and s.sha256 = create_upload_source.sha256 and s.status = 'failed';

  insert into public.content_sources (id, owner_id, source_type, visibility, title, storage_path, mime_type, byte_size,
                                      sha256, status)
  select g.id, v_uid, 'user_upload', 'private', left(btrim(create_upload_source.title), 300),
         v_uid::text || '/' || g.id::text || '.pdf', 'application/pdf', create_upload_source.byte_size,
         create_upload_source.sha256, 'pending'
  from (select gen_random_uuid() as id) g
  returning * into v_source;

  insert into public.import_jobs (user_id, source_id, job_type) values (v_uid, v_source.id, 'pdf_extract')
  returning * into v_job;

  return jsonb_build_object('sourceId', v_source.id, 'storagePath', v_source.storage_path, 'job', private.job_json(v_job));
end;
$$;

create function public.create_note_source(title text, body_md text) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  v_source public.content_sources;
  v_job public.import_jobs;
begin
  if btrim(coalesce(create_note_source.title, '')) = '' or btrim(coalesce(create_note_source.body_md, '')) = '' then
    raise exception 'a note needs a title and text' using errcode = '22023';
  end if;
  if char_length(create_note_source.body_md) > 50000 then
    raise exception 'notes are limited to 50,000 characters' using errcode = '22023';
  end if;
  insert into public.content_sources (owner_id, source_type, visibility, title, note_body_md, status)
  values (v_uid, 'user_note', 'private', left(btrim(create_note_source.title), 300), create_note_source.body_md, 'pending')
  returning * into v_source;
  insert into public.import_jobs (user_id, source_id, job_type) values (v_uid, v_source.id, 'note_segment')
  returning * into v_job;
  return jsonb_build_object('sourceId', v_source.id, 'job', private.job_json(v_job));
end;
$$;

-- Everything the /content screen lists: own sources with their latest job, open drafts, stale citations.
create function public.content_overview() returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  return jsonb_build_object(
    'isOwner', private.is_owner(),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'sourceType', s.source_type, 'trustTier', private.trust_tier(s.source_type),
        'status', s.status, 'byteSize', s.byte_size, 'pageCount', s.page_count, 'createdAt', s.created_at,
        'passageCount', (select count(*) from public.source_passages p where p.source_id = s.id),
        'job', (select private.job_json(j) from public.import_jobs j
                where j.source_id = s.id order by j.created_at desc limit 1))
        order by s.created_at desc)
      from public.content_sources s
      where s.owner_id = v_uid and s.source_type in ('user_note', 'user_upload') and s.status <> 'archived'
    ), '[]'::jsonb),
    'drafts', case when not private.is_owner() then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'title', c.title, 'status', c.status, 'serviceName', sv.name, 'serviceSlug', sv.slug,
        'createdAt', c.created_at,
        'questionCount', (select count(*) from public.questions q where q.concept_id = c.id and q.status <> 'retired'),
        'citationCount', (select count(*) from public.concept_sources cs where cs.concept_id = c.id))
        order by c.created_at desc)
      from public.service_concepts c join public.services sv on sv.id = c.service_id
      where c.owner_id = v_uid and c.managed_by = 'app' and c.status in ('draft', 'in_review')
    ), '[]'::jsonb) end,
    'stale', case when not private.is_owner() then '[]'::jsonb else coalesce((
      select jsonb_agg(row_to_json(t)::jsonb order by t."retrievedAt" nulls first, t.title)
      from (
        select src.id, src.title, src.url, src.source_type as "sourceType", src.retrieved_at as "retrievedAt",
               count(distinct c.id) as "conceptCount"
        from public.content_sources src
        join public.source_passages p on p.source_id = src.id
        join public.concept_sources cs on cs.passage_id = p.id
        join public.service_concepts c on c.id = cs.concept_id and c.status = 'published'
        where src.source_type like 'aws\_%'
          and (src.retrieved_at is null or src.retrieved_at < now() - interval '12 months')
        group by src.id
      ) t
    ), '[]'::jsonb) end
  );
end;
$$;

-- Passages the caller can cite: their own sources and shared ones; full-text search when q is given.
create function public.search_passages(q text default null, source_id uuid default null, page_size int default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  v_query tsquery := case when btrim(coalesce(search_passages.q, '')) = '' then null
                          else websearch_to_tsquery('english', search_passages.q) end;
begin
  return coalesce((
    select jsonb_agg(row_to_json(t)::jsonb order by t.rank desc, t."sourceTitle", t.ordinal)
    from (
      select p.id, p.ordinal, p.text, p.page_start as "pageStart", p.page_end as "pageEnd",
             p.section_path as "sectionPath", p.char_start as "charStart", p.char_end as "charEnd",
             src.id as "sourceId", src.title as "sourceTitle", src.source_type as "sourceType",
             private.trust_tier(src.source_type) as "trustTier",
             case when v_query is null then 0 else ts_rank(p.search_tsv, v_query) end as rank
      from public.source_passages p
      join public.content_sources src on src.id = p.source_id
      where (src.owner_id = v_uid or src.visibility = 'shared')
        and (search_passages.source_id is null or src.id = search_passages.source_id)
        and (v_query is null or p.search_tsv @@ v_query)
        and (v_query is not null or search_passages.source_id is not null)
      order by rank desc, src.title, p.ordinal
      limit least(greatest(coalesce(search_passages.page_size, 50), 1), 200)
    ) t
  ), '[]'::jsonb);
end;
$$;

-- Drafts (owner only) -------------------------------------------------------------------------------

create function private.owned_draft(p_concept_id uuid, p_uid uuid) returns public.service_concepts
language plpgsql
stable
set search_path = ''
as $$
declare
  v_concept public.service_concepts;
begin
  select * into v_concept from public.service_concepts c
  where c.id = p_concept_id and c.owner_id = p_uid and c.managed_by = 'app';
  if not found then
    raise exception 'draft not found' using errcode = 'P0002';
  end if;
  return v_concept;
end;
$$;

create function public.draft_detail(concept_id uuid) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_owner();
  v_concept public.service_concepts := private.owned_draft(draft_detail.concept_id, v_uid);
begin
  return jsonb_build_object(
    'id', v_concept.id, 'title', v_concept.title, 'status', v_concept.status, 'origin', v_concept.origin,
    'summaryMd', v_concept.summary_md, 'explanationMd', v_concept.explanation_md,
    'limitationsMd', v_concept.limitations_md, 'revision', v_concept.revision,
    'service', (select jsonb_build_object('id', sv.id, 'slug', sv.slug, 'name', sv.name)
                from public.services sv where sv.id = v_concept.service_id),
    'domainIds', coalesce((select jsonb_agg(cc.exam_domain_id) from public.concept_certifications cc
                           where cc.concept_id = v_concept.id), '[]'::jsonb),
    'citations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'passageId', p.id, 'supportType', cs.support_type, 'text', p.text, 'pageStart', p.page_start,
        'pageEnd', p.page_end, 'sectionPath', p.section_path, 'sourceTitle', src.title,
        'sourceType', src.source_type, 'trustTier', private.trust_tier(src.source_type)) order by src.title, p.ordinal)
      from public.concept_sources cs
      join public.source_passages p on p.id = cs.passage_id
      join public.content_sources src on src.id = p.source_id
      where cs.concept_id = v_concept.id
    ), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'dimension', q.dimension, 'difficulty', q.difficulty, 'status', q.status, 'version', v.version,
        'promptMd', v.prompt_md, 'referenceAnswerMd', v.reference_answer_md, 'rubric', v.rubric) order by q.key)
      from public.questions q join public.question_versions v on v.id = q.current_version_id
      where q.concept_id = v_concept.id and q.status <> 'retired'
    ), '[]'::jsonb)
  );
end;
$$;

-- Saves edits to a draft. Question edits create new immutable versions (ADR-0006).
create function public.update_draft(
  concept_id uuid,
  title text,
  summary_md text,
  explanation_md text,
  limitations_md text,
  domain_ids uuid[],
  questions jsonb
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_owner();
  v_concept public.service_concepts := private.owned_draft(update_draft.concept_id, v_uid);
  v_item jsonb;
  v_question public.questions;
  v_hash text;
  v_version public.question_versions;
begin
  if v_concept.status not in ('draft', 'in_review') then
    raise exception 'only drafts can be edited' using errcode = '22023';
  end if;
  if btrim(coalesce(update_draft.title, '')) = '' then
    raise exception 'a title is required' using errcode = '22023';
  end if;

  update public.service_concepts c set
    title = left(btrim(update_draft.title), 200),
    summary_md = nullif(btrim(update_draft.summary_md), ''),
    explanation_md = nullif(btrim(update_draft.explanation_md), ''),
    limitations_md = nullif(btrim(update_draft.limitations_md), '')
  where c.id = v_concept.id;

  delete from public.concept_certifications cc where cc.concept_id = v_concept.id;
  insert into public.concept_certifications (concept_id, certification_id, exam_domain_id)
  select v_concept.id, d.certification_id, d.id
  from public.exam_domains d where d.id = any (coalesce(update_draft.domain_ids, '{}'));

  for v_item in select * from jsonb_array_elements(coalesce(update_draft.questions, '[]'::jsonb)) loop
    select * into v_question from public.questions q
    where q.id = (v_item ->> 'id')::uuid and q.concept_id = v_concept.id and q.status <> 'retired';
    if not found then
      raise exception 'question % does not belong to this draft', v_item ->> 'id' using errcode = '22023';
    end if;
    if jsonb_typeof(v_item -> 'rubric') <> 'object' or jsonb_typeof(v_item -> 'rubric' -> 'points') <> 'array' then
      raise exception 'each question needs a rubric with points' using errcode = '22023';
    end if;
    update public.questions q set
      dimension = coalesce(v_item ->> 'dimension', q.dimension),
      difficulty = coalesce((v_item ->> 'difficulty')::smallint, q.difficulty)
    where q.id = v_question.id;
    v_hash := private.question_hash(v_item ->> 'promptMd', v_item ->> 'referenceAnswerMd', v_item -> 'rubric', 1);
    select * into v_version from public.question_versions v where v.question_id = v_question.id and v.content_hash = v_hash;
    if not found then
      insert into public.question_versions (question_id, version, prompt_md, reference_answer_md, rubric,
                                            rubric_schema_version, content_hash)
      values (v_question.id,
              (select coalesce(max(v.version), 0) + 1 from public.question_versions v where v.question_id = v_question.id),
              v_item ->> 'promptMd', v_item ->> 'referenceAnswerMd', v_item -> 'rubric', 1, v_hash)
      returning * into v_version;
    end if;
    update public.questions q set current_version_id = v_version.id where q.id = v_question.id;
  end loop;

  return public.draft_detail(v_concept.id);
end;
$$;

-- Publishes a draft after validation (CONTENT_GOVERNANCE §3, CNT-7a) and snapshots the revision.
create function public.publish_concept(concept_id uuid) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_owner();
  v_concept public.service_concepts := private.owned_draft(publish_concept.concept_id, v_uid);
  v_problems text[] := '{}';
  v_revision int;
  v_placeholder text := '\m(TODO|TBD|FIXME|XXX|lorem ipsum)\M|\[\[|\{\{';
begin
  if v_concept.status not in ('draft', 'in_review') then
    raise exception 'only drafts can be published' using errcode = '22023';
  end if;
  if not exists (select 1 from public.services sv where sv.id = v_concept.service_id and sv.status = 'published') then
    v_problems := array_append(v_problems, 'its service is not published'::text);
  end if;
  if coalesce(btrim(v_concept.summary_md), '') = '' or coalesce(btrim(v_concept.explanation_md), '') = '' then
    v_problems := array_append(v_problems, 'a summary and an explanation are required'::text);
  end if;
  if not exists (select 1 from public.concept_sources cs where cs.concept_id = v_concept.id) then
    v_problems := array_append(v_problems, 'at least one citation is required'::text);
  end if;
  if exists (
    select 1 from public.concept_sources cs
    join public.source_passages p on p.id = cs.passage_id
    join public.content_sources src on src.id = p.source_id
    where cs.concept_id = v_concept.id and src.owner_id <> v_uid and src.visibility <> 'shared'
  ) then
    v_problems := array_append(v_problems, 'a citation points to another user''s passage'::text);
  end if;
  if not exists (select 1 from public.questions q where q.concept_id = v_concept.id and q.status <> 'retired') then
    v_problems := array_append(v_problems, 'at least one question is required'::text);
  end if;
  if exists (
    select 1 from public.questions q join public.question_versions v on v.id = q.current_version_id
    where q.concept_id = v_concept.id and q.status <> 'retired'
      and (jsonb_typeof(v.rubric -> 'points') <> 'array'
           or jsonb_array_length(v.rubric -> 'points') = 0
           or not exists (select 1 from jsonb_array_elements(v.rubric -> 'points') pt where (pt ->> 'critical')::boolean)
           or exists (select 1 from jsonb_array_elements(v.rubric -> 'points') pt
                      where coalesce(pt ->> 'id', '') !~ '^p\d+$' or coalesce(btrim(pt ->> 'text'), '') = ''))
  ) then
    v_problems := array_append(v_problems, 'every question needs a rubric with at least one critical point'::text);
  end if;
  if concat_ws(' ', v_concept.title, v_concept.summary_md, v_concept.explanation_md, v_concept.limitations_md) ~* v_placeholder
     or exists (
       select 1 from public.questions q join public.question_versions v on v.id = q.current_version_id
       where q.concept_id = v_concept.id and q.status <> 'retired'
         and concat_ws(' ', v.prompt_md, v.reference_answer_md, v.rubric::text) ~* v_placeholder
     ) then
    v_problems := array_append(v_problems, 'placeholder text (TODO, TBD, [[…]]) must be replaced'::text);
  end if;
  if cardinality(v_problems) > 0 then
    raise exception 'cannot publish: %', array_to_string(v_problems, '; ') using errcode = '22023';
  end if;

  select coalesce(max(r.revision), 0) + 1 into v_revision from public.concept_revisions r where r.concept_id = v_concept.id;
  update public.questions q set status = 'published' where q.concept_id = v_concept.id and q.status <> 'retired';
  update public.service_concepts c
  set status = 'published', published_at = now(), revision = v_revision
  where c.id = v_concept.id
  returning * into v_concept;

  insert into public.concept_revisions (concept_id, revision, snapshot, published_by)
  values (v_concept.id, v_revision, jsonb_build_object(
    'title', v_concept.title, 'summaryMd', v_concept.summary_md, 'explanationMd', v_concept.explanation_md,
    'limitationsMd', v_concept.limitations_md,
    'citations', (select coalesce(jsonb_agg(jsonb_build_object('passageId', cs.passage_id, 'supportType', cs.support_type)
                                            order by cs.passage_id, cs.support_type), '[]'::jsonb)
                  from public.concept_sources cs where cs.concept_id = v_concept.id),
    'questions', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'versionId', q.current_version_id)
                                            order by q.key), '[]'::jsonb)
                  from public.questions q where q.concept_id = v_concept.id and q.status = 'published')
  ), v_uid);

  return jsonb_build_object('id', v_concept.id, 'status', v_concept.status, 'revision', v_revision,
                            'publishedAt', v_concept.published_at);
end;
$$;

create function public.reject_draft(concept_id uuid) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_owner();
  v_concept public.service_concepts := private.owned_draft(reject_draft.concept_id, v_uid);
begin
  if v_concept.status not in ('draft', 'in_review') then
    raise exception 'only drafts can be rejected' using errcode = '22023';
  end if;
  update public.questions q set status = 'retired' where q.concept_id = v_concept.id;
  update public.service_concepts c set status = 'retired' where c.id = v_concept.id;
  return jsonb_build_object('id', v_concept.id, 'status', 'retired');
end;
$$;

-- Service role: import jobs ------------------------------------------------------------------------

-- Starts or resumes a job. A running job with a fresh heartbeat (< 2 min) is reported as busy.
create function public.claim_import_job(p_user_id uuid, p_job_id uuid, p_restart boolean default false) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_job public.import_jobs;
  v_source public.content_sources;
begin
  select * into v_job from public.import_jobs j where j.id = p_job_id and j.user_id = p_user_id for update;
  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  if p_restart and v_job.status = 'succeeded' and v_job.job_type <> 'draft_generation' then
    update public.import_jobs j set status = 'queued', cursor = null, progress_pct = 0, finished_at = null
    where j.id = v_job.id returning * into v_job;
  end if;
  if v_job.status in ('succeeded', 'failed', 'cancelled') then
    return jsonb_build_object('claimed', false, 'busy', false, 'job', private.job_json(v_job));
  end if;
  if v_job.status = 'running' and v_job.heartbeat_at > now() - interval '2 minutes' then
    return jsonb_build_object('claimed', false, 'busy', true, 'job', private.job_json(v_job));
  end if;
  update public.import_jobs j set
    status = 'running', run_count = j.run_count + 1, heartbeat_at = now(), started_at = coalesce(j.started_at, now())
  where j.id = v_job.id returning * into v_job;
  select * into v_source from public.content_sources s where s.id = v_job.source_id;
  return jsonb_build_object('claimed', true, 'busy', false, 'job', private.job_json(v_job), 'cursor', v_job.cursor,
    'source', case when v_source.id is null then null else jsonb_build_object(
      'id', v_source.id, 'sourceType', v_source.source_type, 'storagePath', v_source.storage_path,
      'byteSize', v_source.byte_size, 'sha256', v_source.sha256, 'noteBodyMd', v_source.note_body_md) end);
end;
$$;

-- Appends passages and advances the cursor in one transaction, so an interrupted job resumes cleanly
-- and a re-run inserts nothing twice (P4-1, P4-2).
create function public.record_import_progress(
  p_user_id uuid,
  p_job_id uuid,
  p_passages jsonb,
  p_cursor jsonb,
  p_progress int,
  p_page_count int default null
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_job public.import_jobs;
begin
  select * into v_job from public.import_jobs j
  where j.id = p_job_id and j.user_id = p_user_id and j.status = 'running' for update;
  if not found then
    raise exception 'job is not running' using errcode = 'P0409';
  end if;

  insert into public.source_passages (source_id, ordinal, page_start, page_end, section_path, char_start, char_end,
                                      text, text_hash)
  select v_job.source_id, (x ->> 'ordinal')::int, (x ->> 'pageStart')::int, (x ->> 'pageEnd')::int,
         left(x ->> 'sectionPath', 300), (x ->> 'charStart')::int, (x ->> 'charEnd')::int, x ->> 'text', x ->> 'textHash'
  from jsonb_array_elements(coalesce(p_passages, '[]'::jsonb)) x
  on conflict do nothing;

  if p_page_count is not null then
    update public.content_sources s set page_count = p_page_count where s.id = v_job.source_id;
  end if;
  update public.import_jobs j set
    cursor = p_cursor, progress_pct = least(greatest(p_progress, 0), 100), heartbeat_at = now(),
    passage_count = (select count(*) from public.source_passages p where p.source_id = v_job.source_id)
  where j.id = v_job.id returning * into v_job;
  return private.job_json(v_job);
end;
$$;

create function public.finish_import_job(
  p_user_id uuid,
  p_job_id uuid,
  p_error_code text default null,
  p_error_detail text default null,
  p_result jsonb default null,
  p_sha256 text default null
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_job public.import_jobs;
begin
  select * into v_job from public.import_jobs j where j.id = p_job_id and j.user_id = p_user_id for update;
  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  if v_job.status in ('succeeded', 'failed', 'cancelled') then
    return private.job_json(v_job);
  end if;
  update public.import_jobs j set
    status = case when p_error_code is null then 'succeeded' else 'failed' end,
    error_code = p_error_code, error_detail = left(p_error_detail, 500), result = coalesce(p_result, j.result),
    progress_pct = case when p_error_code is null then 100 else j.progress_pct end,
    finished_at = now(), heartbeat_at = now(),
    passage_count = case when j.source_id is null then j.passage_count else
      (select count(*) from public.source_passages p where p.source_id = j.source_id) end
  where j.id = v_job.id returning * into v_job;
  if v_job.source_id is not null then
    update public.content_sources s set
      status = case when p_error_code is null then 'ready' else 'failed' end,
      sha256 = case when p_error_code is null then coalesce(p_sha256, s.sha256) else null end
    where s.id = v_job.source_id;
  end if;
  return private.job_json(v_job);
end;
$$;

-- Service role: drafts -----------------------------------------------------------------------------

create function private.user_is_owner(p_user_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from auth.users u where u.id = p_user_id and u.raw_app_meta_data ->> 'role' = 'owner');
$$;

grant execute on function private.user_is_owner(uuid) to service_role;

create function public.start_draft_job(p_user_id uuid, p_params jsonb) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_job public.import_jobs;
begin
  if not private.user_is_owner(p_user_id) then
    raise exception 'only the owner can generate drafts' using errcode = '42501';
  end if;
  insert into public.import_jobs (user_id, job_type, status, params, run_count, started_at, heartbeat_at)
  values (p_user_id, 'draft_generation', 'running', p_params, 1, now(), now())
  returning * into v_job;
  return private.job_json(v_job);
end;
$$;

-- Creates draft concepts from normalized generator output (CNT-6a). Every row is a draft owned by the
-- learner and linked to the job; citations must be passages the learner may cite.
create function public.create_drafts(p_user_id uuid, p_job_id uuid, p_service_id uuid, p_drafts jsonb) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_job public.import_jobs;
  v_draft jsonb;
  v_question jsonb;
  v_concept_id uuid;
  v_question_id uuid;
  v_version_id uuid;
  v_ids uuid[] := '{}';
  v_n int;
begin
  select * into v_job from public.import_jobs j
  where j.id = p_job_id and j.user_id = p_user_id and j.job_type = 'draft_generation' and j.status = 'running' for update;
  if not found then
    raise exception 'draft job is not running' using errcode = 'P0409';
  end if;
  if not exists (select 1 from public.services sv where sv.id = p_service_id and sv.status <> 'retired') then
    raise exception 'service not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_drafts, '[]'::jsonb)) d
    cross join lateral jsonb_array_elements(d -> 'citations') c
    left join public.source_passages p on p.id = (c ->> 'passageId')::uuid
    left join public.content_sources src on src.id = p.source_id
    where p.id is null or (src.owner_id <> p_user_id and src.visibility <> 'shared')
  ) then
    raise exception 'citation_mismatch' using errcode = '22023';
  end if;

  for v_draft in select * from jsonb_array_elements(coalesce(p_drafts, '[]'::jsonb)) loop
    insert into public.service_concepts (service_id, slug, title, sort_order, summary_md, explanation_md, limitations_md,
                                         status, origin, managed_by, visibility, owner_id)
    values (p_service_id,
            left(trim(both '-' from lower(regexp_replace(v_draft ->> 'title', '[^a-zA-Z0-9]+', '-', 'g'))), 60)
              || '-' || substr(md5(gen_random_uuid()::text), 1, 6),
            left(v_draft ->> 'title', 200), 1000, left(v_draft ->> 'summaryMd', 600), left(v_draft ->> 'explanationMd', 8000),
            left(v_draft ->> 'limitationsMd', 4000), 'draft', 'ai_draft', 'app', 'private', p_user_id)
    returning id into v_concept_id;

    insert into public.concept_sources (concept_id, passage_id, support_type)
    select distinct v_concept_id, (c ->> 'passageId')::uuid, c ->> 'supportType'
    from jsonb_array_elements(v_draft -> 'citations') c;

    v_n := 0;
    for v_question in select * from jsonb_array_elements(coalesce(v_draft -> 'questions', '[]'::jsonb)) loop
      v_n := v_n + 1;
      insert into public.questions (concept_id, key, dimension, difficulty, status, origin, managed_by)
      values (v_concept_id, 'q-' || v_n, v_question ->> 'dimension', (v_question ->> 'difficulty')::smallint, 'draft',
              'ai_draft', 'app')
      returning id into v_question_id;
      insert into public.question_versions (question_id, version, prompt_md, reference_answer_md, rubric,
                                            rubric_schema_version, content_hash)
      values (v_question_id, 1, v_question ->> 'promptMd', v_question ->> 'referenceAnswerMd', v_question -> 'rubric', 1,
              private.question_hash(v_question ->> 'promptMd', v_question ->> 'referenceAnswerMd', v_question -> 'rubric', 1))
      returning id into v_version_id;
      update public.questions q set current_version_id = v_version_id where q.id = v_question_id;
    end loop;
    v_ids := v_ids || v_concept_id;
  end loop;

  return jsonb_build_object('conceptIds', to_jsonb(v_ids));
end;
$$;

-- Grants ---------------------------------------------------------------------------------------------

grant execute on function
  public.create_upload_source(text, bigint, text),
  public.create_note_source(text, text),
  public.content_overview(),
  public.search_passages(text, uuid, int),
  public.draft_detail(uuid),
  public.update_draft(uuid, text, text, text, text, uuid[], jsonb),
  public.publish_concept(uuid),
  public.reject_draft(uuid)
  to authenticated;

revoke all on function
  public.claim_import_job(uuid, uuid, boolean),
  public.record_import_progress(uuid, uuid, jsonb, jsonb, int, int),
  public.finish_import_job(uuid, uuid, text, text, jsonb, text),
  public.start_draft_job(uuid, jsonb),
  public.create_drafts(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function
  public.claim_import_job(uuid, uuid, boolean),
  public.record_import_progress(uuid, uuid, jsonb, jsonb, int, int),
  public.finish_import_job(uuid, uuid, text, text, jsonb, text),
  public.start_draft_job(uuid, jsonb),
  public.create_drafts(uuid, uuid, uuid, jsonb)
  to service_role;
grant execute on function private.job_json(public.import_jobs), private.question_hash(text, text, jsonb, int)
  to service_role;
