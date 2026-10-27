-- Atomic, idempotent catalog sync (ADR-0007). Called by scripts/catalog-import.ts with the
-- service role after the YAML has been validated. Rows are only written when they differ, so a
-- second run reports zero changes (P1-1). Catalog-managed rows that disappear from the YAML are
-- retired, never deleted (learning history may reference them).

create function public.import_catalog(p_catalog jsonb, p_owner_id uuid) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
set client_min_messages = warning
as $$
#variable_conflict use_column
declare
  v_changes jsonb := '{}'::jsonb;
  v_n int;
  v_m int;
  v_missing text;
  r record;
  v_last record;
begin
  -- p_owner_id must be an auth.users id; the owner_id foreign keys enforce it.
  if p_owner_id is null then
    raise exception 'p_owner_id is required' using errcode = '22004';
  end if;

  -- Staging tables, flattened from the payload.
  drop table if exists pg_temp._svc, pg_temp._con, pg_temp._cit, pg_temp._map, pg_temp._que, pg_temp._rel,
    pg_temp._cit_ids, pg_temp._map_ids, pg_temp._que_ids;

  create temp table _svc on commit drop as
  select x.*, null::uuid as id
  from jsonb_to_recordset(coalesce(p_catalog -> 'services', '[]')) as x(
    provider text, slug text, name text, aliases text[], category text, summary_md text,
    what_it_is_md text, how_it_works_md text, problem_solved_md text, how_it_solves_md text,
    does_not_do_md text, when_to_choose_md text, architecture_placement_md text, trade_offs_md text,
    docs_url text, status text, origin text);

  create temp table _rel on commit drop as
  select svc ->> 'provider' as provider, svc ->> 'slug' as from_slug, x.service as to_slug, x.relation, x.note_md
  from jsonb_array_elements(coalesce(p_catalog -> 'services', '[]')) svc
  cross join lateral jsonb_to_recordset(coalesce(svc -> 'related', '[]')) as x(service text, relation text, note_md text);

  create temp table _con on commit drop as
  select svc ->> 'provider' as provider, svc ->> 'slug' as service_slug, x.*, null::uuid as service_id, null::uuid as id
  from jsonb_array_elements(coalesce(p_catalog -> 'services', '[]')) svc
  cross join lateral jsonb_to_recordset(coalesce(svc -> 'concepts', '[]')) as x(
    slug text, title text, sort_order int, summary_md text, explanation_md text, examples_md text,
    limitations_md text, status text, origin text);

  create temp table _cit on commit drop as
  select svc ->> 'provider' as provider, svc ->> 'slug' as service_slug, con ->> 'slug' as concept_slug,
         x.*, encode(sha256(convert_to(x.excerpt, 'UTF8')), 'hex') as text_hash
  from jsonb_array_elements(coalesce(p_catalog -> 'services', '[]')) svc
  cross join lateral jsonb_array_elements(coalesce(svc -> 'concepts', '[]')) con
  cross join lateral jsonb_to_recordset(coalesce(con -> 'citations', '[]')) as x(
    source text, excerpt text, excerpt_kind text, section_path text, support_type text);

  create temp table _map on commit drop as
  select svc ->> 'provider' as provider, svc ->> 'slug' as service_slug, con ->> 'slug' as concept_slug, x.*
  from jsonb_array_elements(coalesce(p_catalog -> 'services', '[]')) svc
  cross join lateral jsonb_array_elements(coalesce(svc -> 'concepts', '[]')) con
  cross join lateral jsonb_to_recordset(coalesce(con -> 'mappings', '[]')) as x(
    vendor text, code text, exam_version text, domain text, relevance text);

  create temp table _que on commit drop as
  select svc ->> 'provider' as provider, svc ->> 'slug' as service_slug, con ->> 'slug' as concept_slug, x.*,
         encode(sha256(convert_to(
           x.prompt_md || chr(31) || x.reference_answer_md || chr(31) || x.rubric::text || chr(31) || x.rubric_schema_version,
           'UTF8')), 'hex') as content_hash
  from jsonb_array_elements(coalesce(p_catalog -> 'services', '[]')) svc
  cross join lateral jsonb_array_elements(coalesce(svc -> 'concepts', '[]')) con
  cross join lateral jsonb_to_recordset(coalesce(con -> 'questions', '[]')) as x(
    key text, dimension text, difficulty smallint, status text, origin text,
    prompt_md text, reference_answer_md text, rubric jsonb, rubric_schema_version int);

  -- Categories.
  insert into public.service_categories as t (slug, name, sort_order)
  select x.slug, x.name, x.sort_order
  from jsonb_to_recordset(coalesce(p_catalog -> 'categories', '[]')) as x(slug text, name text, sort_order int)
  on conflict (slug) do update set name = excluded.name, sort_order = excluded.sort_order
  where (t.name, t.sort_order) is distinct from (excluded.name, excluded.sort_order);
  get diagnostics v_n = row_count;
  v_changes := v_changes || jsonb_build_object('categories', v_n);

  -- Certifications and exam domains.
  insert into public.certifications as t (vendor, code, exam_version, name, status, exam_guide_url)
  select x.vendor, x.code, x.exam_version, x.name, coalesce(x.status, 'active'), x.exam_guide_url
  from jsonb_to_recordset(coalesce(p_catalog -> 'certifications', '[]')) as x(
    vendor text, code text, exam_version text, name text, status text, exam_guide_url text)
  on conflict (vendor, code, exam_version) do update
    set name = excluded.name, status = excluded.status, exam_guide_url = excluded.exam_guide_url
  where (t.name, t.status, t.exam_guide_url) is distinct from (excluded.name, excluded.status, excluded.exam_guide_url);
  get diagnostics v_n = row_count;
  v_changes := v_changes || jsonb_build_object('certifications', v_n);

  insert into public.exam_domains as t (certification_id, code, name, weight_pct, sort_order)
  select cert.id, d.code, d.name, d.weight_pct, d.sort_order
  from jsonb_array_elements(coalesce(p_catalog -> 'certifications', '[]')) c
  join public.certifications cert
    on cert.vendor = c ->> 'vendor' and cert.code = c ->> 'code' and cert.exam_version = c ->> 'exam_version'
  cross join lateral jsonb_to_recordset(coalesce(c -> 'domains', '[]')) as d(code text, name text, weight_pct numeric, sort_order int)
  on conflict (certification_id, code) do update
    set name = excluded.name, weight_pct = excluded.weight_pct, sort_order = excluded.sort_order
  where (t.name, t.weight_pct, t.sort_order) is distinct from (excluded.name, excluded.weight_pct, excluded.sort_order);
  get diagnostics v_n = row_count;
  v_changes := v_changes || jsonb_build_object('exam_domains', v_n);

  -- Sources.
  insert into public.content_sources as t (owner_id, catalog_key, source_type, visibility, title, url, retrieved_at)
  select p_owner_id, x.key, x.source_type, 'shared', x.title, x.url, x.retrieved_at
  from jsonb_to_recordset(coalesce(p_catalog -> 'sources', '[]')) as x(
    key text, source_type text, title text, url text, retrieved_at timestamptz)
  on conflict (catalog_key) do update
    set source_type = excluded.source_type, title = excluded.title, url = excluded.url, retrieved_at = excluded.retrieved_at
  where (t.source_type, t.title, t.url, t.retrieved_at)
    is distinct from (excluded.source_type, excluded.title, excluded.url, excluded.retrieved_at);
  get diagnostics v_n = row_count;
  v_changes := v_changes || jsonb_build_object('sources', v_n);

  -- Services. Refuse to take over rows the app manages.
  select string_agg(s.slug, ', ') into v_missing
  from pg_temp._svc x
  join public.services s on s.cloud_provider = x.provider and s.slug = x.slug
  where s.managed_by <> 'catalog';
  if v_missing is not null then
    raise exception 'services managed by the app cannot be overwritten by the catalog: %', v_missing using errcode = '23505';
  end if;

  select string_agg(x.slug || ' -> ' || x.category, ', ') into v_missing
  from pg_temp._svc x left join public.service_categories c on c.slug = x.category
  where c.id is null;
  if v_missing is not null then
    raise exception 'unknown service categories: %', v_missing using errcode = '23503';
  end if;

  insert into public.services as t (
    cloud_provider, slug, name, aliases, category_id, summary_md,
    what_it_is_md, how_it_works_md, problem_solved_md, how_it_solves_md,
    does_not_do_md, when_to_choose_md, architecture_placement_md, trade_offs_md,
    docs_url, status, origin, managed_by)
  select x.provider, x.slug, x.name, coalesce(x.aliases, '{}'), c.id, x.summary_md,
         x.what_it_is_md, x.how_it_works_md, x.problem_solved_md, x.how_it_solves_md,
         x.does_not_do_md, x.when_to_choose_md, x.architecture_placement_md, x.trade_offs_md,
         x.docs_url, x.status, x.origin, 'catalog'
  from pg_temp._svc x
  join public.service_categories c on c.slug = x.category
  on conflict (cloud_provider, slug) do update set
    name = excluded.name, aliases = excluded.aliases, category_id = excluded.category_id,
    summary_md = excluded.summary_md, what_it_is_md = excluded.what_it_is_md,
    how_it_works_md = excluded.how_it_works_md, problem_solved_md = excluded.problem_solved_md,
    how_it_solves_md = excluded.how_it_solves_md, does_not_do_md = excluded.does_not_do_md,
    when_to_choose_md = excluded.when_to_choose_md, architecture_placement_md = excluded.architecture_placement_md,
    trade_offs_md = excluded.trade_offs_md, docs_url = excluded.docs_url, status = excluded.status,
    origin = excluded.origin
  where (t.name, t.aliases, t.category_id, t.summary_md, t.what_it_is_md, t.how_it_works_md,
         t.problem_solved_md, t.how_it_solves_md, t.does_not_do_md, t.when_to_choose_md,
         t.architecture_placement_md, t.trade_offs_md, t.docs_url, t.status, t.origin)
    is distinct from
        (excluded.name, excluded.aliases, excluded.category_id, excluded.summary_md, excluded.what_it_is_md,
         excluded.how_it_works_md, excluded.problem_solved_md, excluded.how_it_solves_md, excluded.does_not_do_md,
         excluded.when_to_choose_md, excluded.architecture_placement_md, excluded.trade_offs_md,
         excluded.docs_url, excluded.status, excluded.origin);
  get diagnostics v_n = row_count;
  v_changes := v_changes || jsonb_build_object('services', v_n);

  update pg_temp._svc x set id = s.id
  from public.services s where s.cloud_provider = x.provider and s.slug = x.slug;

  -- Service relationships: exact sync for every service in the payload.
  select string_agg(x.from_slug || ' -> ' || x.to_slug, ', ') into v_missing
  from pg_temp._rel x left join public.services s on s.cloud_provider = x.provider and s.slug = x.to_slug
  where s.id is null;
  if v_missing is not null then
    raise exception 'unknown related services: %', v_missing using errcode = '23503';
  end if;

  delete from public.service_relationships t
  using pg_temp._svc f
  where t.from_service_id = f.id
    and not exists (
      select 1 from pg_temp._rel x
      join public.services s on s.cloud_provider = x.provider and s.slug = x.to_slug
      where x.provider = f.provider and x.from_slug = f.slug and s.id = t.to_service_id and x.relation = t.relation
    );
  get diagnostics v_n = row_count;

  insert into public.service_relationships as t (from_service_id, to_service_id, relation, note_md)
  select f.id, s.id, x.relation, x.note_md
  from pg_temp._rel x
  join pg_temp._svc f on f.provider = x.provider and f.slug = x.from_slug
  join public.services s on s.cloud_provider = x.provider and s.slug = x.to_slug
  on conflict (from_service_id, to_service_id, relation) do update set note_md = excluded.note_md
  where t.note_md is distinct from excluded.note_md;
  get diagnostics v_m = row_count;
  v_changes := v_changes || jsonb_build_object('relationships', v_n + v_m);

  -- Concepts.
  update pg_temp._con x set service_id = f.id
  from pg_temp._svc f where f.provider = x.provider and f.slug = x.service_slug;

  select string_agg(x.service_slug || '/' || x.slug, ', ') into v_missing
  from pg_temp._con x
  join public.service_concepts c on c.service_id = x.service_id and c.slug = x.slug
  where c.managed_by <> 'catalog';
  if v_missing is not null then
    raise exception 'concepts managed by the app cannot be overwritten by the catalog: %', v_missing using errcode = '23505';
  end if;

  insert into public.service_concepts as t (
    service_id, slug, title, sort_order, summary_md, explanation_md, examples_md, limitations_md,
    status, origin, managed_by, visibility, owner_id, published_at)
  select x.service_id, x.slug, x.title, coalesce(x.sort_order, 0), x.summary_md, x.explanation_md, x.examples_md,
         x.limitations_md, x.status, x.origin, 'catalog', 'shared', p_owner_id,
         case when x.status = 'published' then now() end
  from pg_temp._con x
  on conflict (service_id, slug) do update set
    title = excluded.title, sort_order = excluded.sort_order, summary_md = excluded.summary_md,
    explanation_md = excluded.explanation_md, examples_md = excluded.examples_md,
    limitations_md = excluded.limitations_md, status = excluded.status, origin = excluded.origin,
    published_at = case when excluded.status = 'published' then coalesce(t.published_at, now()) else t.published_at end
  where (t.title, t.sort_order, t.summary_md, t.explanation_md, t.examples_md, t.limitations_md, t.status, t.origin)
    is distinct from
        (excluded.title, excluded.sort_order, excluded.summary_md, excluded.explanation_md, excluded.examples_md,
         excluded.limitations_md, excluded.status, excluded.origin);
  get diagnostics v_n = row_count;
  v_changes := v_changes || jsonb_build_object('concepts', v_n);

  update pg_temp._con x set id = c.id
  from public.service_concepts c where c.service_id = x.service_id and c.slug = x.slug;

  -- Passages (immutable, deduplicated by text hash) and concept citations (exact sync).
  select string_agg(distinct x.source, ', ') into v_missing
  from pg_temp._cit x left join public.content_sources s on s.catalog_key = x.source
  where s.id is null;
  if v_missing is not null then
    raise exception 'unknown sources: %', v_missing using errcode = '23503';
  end if;

  insert into public.source_passages (source_id, ordinal, excerpt_kind, section_path, text, text_hash)
  select n.source_id,
         coalesce((select max(p.ordinal) from public.source_passages p where p.source_id = n.source_id), 0)
           + row_number() over (partition by n.source_id order by n.first_seen),
         n.excerpt_kind, n.section_path, n.excerpt, n.text_hash
  from (
    select distinct on (s.id, x.text_hash)
           s.id as source_id, x.text_hash, x.excerpt, coalesce(x.excerpt_kind, 'verbatim') as excerpt_kind,
           x.section_path, x.service_slug || '/' || x.concept_slug as first_seen
    from pg_temp._cit x
    join public.content_sources s on s.catalog_key = x.source
    where not exists (
      select 1 from public.source_passages p where p.source_id = s.id and p.text_hash = x.text_hash
    )
    order by s.id, x.text_hash, x.service_slug, x.concept_slug
  ) n;
  get diagnostics v_n = row_count;
  v_changes := v_changes || jsonb_build_object('passages', v_n);

  create temp table _cit_ids on commit drop as
  select distinct c.id as concept_id, p.id as passage_id, x.support_type
  from pg_temp._cit x
  join pg_temp._svc f on f.provider = x.provider and f.slug = x.service_slug
  join pg_temp._con c on c.service_id = f.id and c.slug = x.concept_slug
  join public.content_sources s on s.catalog_key = x.source
  join public.source_passages p on p.source_id = s.id and p.text_hash = x.text_hash;

  delete from public.concept_sources t
  using pg_temp._con c
  where t.concept_id = c.id
    and not exists (
      select 1 from pg_temp._cit_ids d
      where d.concept_id = t.concept_id and d.passage_id = t.passage_id and d.support_type = t.support_type
    );
  get diagnostics v_n = row_count;

  insert into public.concept_sources (concept_id, passage_id, support_type)
  select d.concept_id, d.passage_id, d.support_type from pg_temp._cit_ids d
  on conflict do nothing;
  get diagnostics v_m = row_count;
  v_changes := v_changes || jsonb_build_object('citations', v_n + v_m);

  -- Certification mappings (exact sync).
  select string_agg(distinct x.vendor || '/' || x.code || '-' || x.exam_version || '/' || x.domain, ', ') into v_missing
  from pg_temp._map x
  left join public.certifications cert
    on cert.vendor = x.vendor and cert.code = x.code and cert.exam_version = x.exam_version
  left join public.exam_domains d on d.certification_id = cert.id and d.code = x.domain
  where d.id is null;
  if v_missing is not null then
    raise exception 'unknown exam domains: %', v_missing using errcode = '23503';
  end if;

  create temp table _map_ids on commit drop as
  select distinct on (c.id, d.id) c.id as concept_id, cert.id as certification_id, d.id as exam_domain_id,
         coalesce(x.relevance, 'core') as relevance
  from pg_temp._map x
  join pg_temp._svc f on f.provider = x.provider and f.slug = x.service_slug
  join pg_temp._con c on c.service_id = f.id and c.slug = x.concept_slug
  join public.certifications cert on cert.vendor = x.vendor and cert.code = x.code and cert.exam_version = x.exam_version
  join public.exam_domains d on d.certification_id = cert.id and d.code = x.domain
  order by c.id, d.id;

  delete from public.concept_certifications t
  using pg_temp._con c
  where t.concept_id = c.id
    and not exists (select 1 from pg_temp._map_ids m where m.concept_id = t.concept_id and m.exam_domain_id = t.exam_domain_id);
  get diagnostics v_n = row_count;

  insert into public.concept_certifications as t (concept_id, certification_id, exam_domain_id, relevance)
  select m.concept_id, m.certification_id, m.exam_domain_id, m.relevance from pg_temp._map_ids m
  on conflict (concept_id, exam_domain_id) do update set relevance = excluded.relevance
  where t.relevance is distinct from excluded.relevance;
  get diagnostics v_m = row_count;
  v_changes := v_changes || jsonb_build_object('mappings', v_n + v_m);

  -- Questions and immutable question versions (a content change creates version N+1).
  create temp table _que_ids on commit drop as
  select q.*, c.id as concept_id
  from pg_temp._que q
  join pg_temp._svc f on f.provider = q.provider and f.slug = q.service_slug
  join pg_temp._con c on c.service_id = f.id and c.slug = q.concept_slug;

  select string_agg(q.concept_slug || '/' || q.key, ', ') into v_missing
  from pg_temp._que_ids q
  join public.questions t on t.concept_id = q.concept_id and t.key = q.key
  where t.managed_by <> 'catalog';
  if v_missing is not null then
    raise exception 'questions managed by the app cannot be overwritten by the catalog: %', v_missing using errcode = '23505';
  end if;

  insert into public.questions as t (concept_id, key, question_type, dimension, difficulty, status, origin, managed_by)
  select q.concept_id, q.key, 'open_recall', q.dimension, coalesce(q.difficulty, 2), q.status, q.origin, 'catalog'
  from pg_temp._que_ids q
  on conflict (concept_id, key) do update set
    dimension = excluded.dimension, difficulty = excluded.difficulty, status = excluded.status, origin = excluded.origin
  where (t.dimension, t.difficulty, t.status, t.origin)
    is distinct from (excluded.dimension, excluded.difficulty, excluded.status, excluded.origin);
  get diagnostics v_n = row_count;
  v_changes := v_changes || jsonb_build_object('questions', v_n);

  insert into public.question_versions (question_id, version, prompt_md, reference_answer_md, rubric, rubric_schema_version, content_hash)
  select t.id,
         coalesce((select max(v.version) from public.question_versions v where v.question_id = t.id), 0) + 1,
         q.prompt_md, q.reference_answer_md, q.rubric, q.rubric_schema_version, q.content_hash
  from pg_temp._que_ids q
  join public.questions t on t.concept_id = q.concept_id and t.key = q.key
  where not exists (
    select 1 from public.question_versions v where v.question_id = t.id and v.content_hash = q.content_hash
  );
  get diagnostics v_n = row_count;
  v_changes := v_changes || jsonb_build_object('question_versions', v_n);

  update public.questions t set current_version_id = v.id
  from pg_temp._que_ids q
  join public.question_versions v on v.content_hash = q.content_hash
  where t.concept_id = q.concept_id and t.key = q.key and v.question_id = t.id
    and t.current_version_id is distinct from v.id;

  -- Revisions: snapshot each published concept whose content differs from its latest snapshot.
  v_n := 0;
  for r in
    select c.id, c.revision,
      jsonb_build_object(
        'title', c.title, 'summaryMd', c.summary_md, 'explanationMd', c.explanation_md,
        'examplesMd', c.examples_md, 'limitationsMd', c.limitations_md,
        'citations', coalesce((
          select jsonb_agg(jsonb_build_object('passageId', cs.passage_id, 'supportType', cs.support_type)
            order by cs.passage_id, cs.support_type)
          from public.concept_sources cs where cs.concept_id = c.id), '[]'::jsonb)
      ) as snapshot
    from public.service_concepts c
    join pg_temp._con x on x.id = c.id
    where c.status = 'published'
  loop
    select cr.revision, cr.snapshot into v_last
    from public.concept_revisions cr where cr.concept_id = r.id order by cr.revision desc limit 1;

    if not found then
      insert into public.concept_revisions (concept_id, revision, snapshot) values (r.id, r.revision, r.snapshot);
      v_n := v_n + 1;
    elsif v_last.snapshot is distinct from r.snapshot then
      update public.service_concepts set revision = v_last.revision + 1 where id = r.id;
      insert into public.concept_revisions (concept_id, revision, snapshot) values (r.id, v_last.revision + 1, r.snapshot);
      v_n := v_n + 1;
    end if;
  end loop;
  v_changes := v_changes || jsonb_build_object('revisions', v_n);

  -- Retire catalog-managed rows that are no longer in the catalog.
  update public.questions t set status = 'retired'
  where t.managed_by = 'catalog' and t.status <> 'retired'
    and not exists (select 1 from pg_temp._que_ids q where q.concept_id = t.concept_id and q.key = t.key);
  get diagnostics v_n = row_count;

  update public.service_concepts t set status = 'retired'
  where t.managed_by = 'catalog' and t.status <> 'retired'
    and not exists (select 1 from pg_temp._con c where c.id = t.id);
  get diagnostics v_m = row_count;
  v_n := v_n + v_m;

  update public.services t set status = 'retired'
  where t.managed_by = 'catalog' and t.status <> 'retired'
    and not exists (select 1 from pg_temp._svc s where s.id = t.id);
  get diagnostics v_m = row_count;
  v_changes := v_changes || jsonb_build_object('retired', v_n + v_m);

  return v_changes;
end;
$$;

revoke all on function public.import_catalog(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.import_catalog(jsonb, uuid) to service_role;
