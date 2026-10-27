-- Catalog read functions (API_CONTRACTS §3). All are SECURITY INVOKER, so RLS decides visibility,
-- except mark_concept_exposed, which writes review_state and checks visibility explicitly.

-- Trust tier is derived from the source type, never stored (CONTENT_GOVERNANCE §2).
create function private.trust_tier(source_type text) returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when source_type like 'aws\_%' then 'official'
    when source_type = 'curated' then 'curated'
    else 'personal'
  end;
$$;

-- Prefix search over every term: "lamb conc" matches "Lambda" + "Concurrency".
create function private.catalog_tsquery(q text) returns tsquery
language sql
immutable
set search_path = ''
as $$
  with terms as (
    select string_agg(t || ':*', ' & ') as expr
    from regexp_split_to_table(lower(coalesce(q, '')), '[^a-z0-9]+') as t
    where t <> ''
  )
  select case
    when expr is null then null
    else to_tsquery('simple'::regconfig, expr) || to_tsquery('english'::regconfig, expr)
  end
  from terms;
$$;

grant execute on function private.trust_tier(text), private.catalog_tsquery(text)
  to authenticated, service_role;

create function public.search_catalog(
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
        where c.service_id = s.id and c.status <> 'retired' and cc.exam_domain_id = search_catalog.domain_id
      ))
      and (v_query is null or s.search_tsv @@ v_query or exists (
        select 1 from public.service_concepts c
        where c.service_id = s.id and c.status <> 'retired' and (c.search_tsv || s.search_tsv) @@ v_query
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
        select count(*) from public.service_concepts c where c.service_id = n.id and c.status <> 'retired'
      ),
      'progress', (
        select jsonb_build_object(
          'reviewingOrBetter', count(*) filter (where r.mastery_status in ('reviewing', 'mastered')),
          'studied', count(*) filter (where r.first_studied_at is not null)
        )
        from public.review_state r
        join public.service_concepts c on c.id = r.concept_id
        where c.service_id = n.id and c.status <> 'retired' and r.is_active and r.user_id = (select auth.uid())
      ),
      'matchedConcepts', case when v_query is null then '[]'::jsonb else coalesce((
        select jsonb_agg(jsonb_build_object('id', mc.id, 'slug', mc.slug, 'title', mc.title) order by mc.sort_order)
        from (
          select c.id, c.slug, c.title, c.sort_order
          from public.service_concepts c
          join public.services s2 on s2.id = c.service_id
          -- A concept "matches" when it satisfies the query itself, or completes it together with
          -- its service ("lambda concurrency"); a bare service-name query highlights no concepts.
          where c.service_id = n.id and c.status <> 'retired'
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

create function public.service_profile(service_slug text, provider text default 'aws') returns jsonb
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
      where c.service_id = s.id and c.status <> 'retired'
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

create function public.catalog_facets() returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name) order by c.sort_order, c.name)
      from public.service_categories c
    ), '[]'::jsonb),
    'certifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cert.id,
        'vendor', cert.vendor,
        'code', cert.code,
        'examVersion', cert.exam_version,
        'name', cert.name,
        'domains', coalesce((
          select jsonb_agg(jsonb_build_object('id', d.id, 'code', d.code, 'name', d.name, 'weightPct', d.weight_pct)
            order by d.sort_order, d.code)
          from public.exam_domains d where d.certification_id = cert.id
        ), '[]'::jsonb)
      ) order by cert.vendor, cert.code, cert.exam_version)
      from public.certifications cert
      where cert.status = 'active'
    ), '[]'::jsonb)
  );
$$;

-- Records that the learner opened a concept's explanation ("studied", LIB-7; cold-recall
-- exposure, MASTERY_MODEL §3). Creates the review_state row on first exposure.
create function public.mark_concept_exposed(concept_id uuid) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.service_concepts c
    where c.id = mark_concept_exposed.concept_id
      and c.status <> 'retired'
      and ((c.status = 'published' and c.visibility = 'shared') or c.owner_id = v_uid or private.is_owner())
  ) then
    raise exception 'concept not found' using errcode = 'P0002';
  end if;

  insert into public.review_state as r (user_id, concept_id, mastery_status, first_studied_at, last_exposure_at)
  values (v_uid, mark_concept_exposed.concept_id, 'learning', now(), now())
  on conflict (user_id, concept_id) where is_active do update
    set last_exposure_at = excluded.last_exposure_at,
        first_studied_at = coalesce(r.first_studied_at, excluded.first_studied_at),
        mastery_status = case when r.mastery_status = 'new' then 'learning' else r.mastery_status end;
end;
$$;

grant execute on function
  public.search_catalog(text, uuid, uuid, text, int),
  public.service_profile(text, text),
  public.catalog_facets(),
  public.mark_concept_exposed(uuid)
  to authenticated;
