begin;
select plan(40);

-- Fixture: an owner, a second learner, and a tiny catalog loaded through import_catalog.
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.local', '{"role":"owner"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'learner@test.local', '{}');

create function pg_temp.fixture(concept_title text default 'Listener rules') returns jsonb language sql as $$
  select jsonb_build_object(
    'categories', jsonb_build_array(jsonb_build_object('slug', 'networking', 'name', 'Networking', 'sort_order', 1),
                                    jsonb_build_object('slug', 'compute', 'name', 'Compute', 'sort_order', 2)),
    'certifications', jsonb_build_array(jsonb_build_object(
      'vendor', 'aws', 'code', 'TST', 'exam_version', 'X1', 'name', 'Test cert', 'status', 'active', 'exam_guide_url', null,
      'domains', jsonb_build_array(
        jsonb_build_object('code', 'D1', 'name', 'Secure', 'weight_pct', 60, 'sort_order', 1),
        jsonb_build_object('code', 'D2', 'name', 'Resilient', 'weight_pct', 40, 'sort_order', 2)))),
    'sources', jsonb_build_array(jsonb_build_object(
      'key', 'elb-docs', 'source_type', 'aws_documentation', 'title', 'ELB docs',
      'url', 'https://docs.aws.amazon.com/elasticloadbalancing/', 'retrieved_at', '2026-10-01')),
    'services', jsonb_build_array(
      jsonb_build_object(
        'provider', 'aws', 'slug', 'elastic-load-balancing', 'name', 'Elastic Load Balancing', 'aliases', jsonb_build_array('ELB'),
        'category', 'networking', 'summary_md', 'Distributes traffic across targets.', 'what_it_is_md', 'A load balancer.',
        'status', 'published', 'origin', 'curated', 'docs_url', null,
        'related', jsonb_build_array(jsonb_build_object('service', 'draft-compute', 'relation', 'commonly_paired_with', 'note_md', null)),
        'concepts', jsonb_build_array(jsonb_build_object(
          'slug', 'listener-rules', 'title', concept_title, 'sort_order', 1, 'summary_md', 'Route by host and path.',
          'explanation_md', 'Application Load Balancers evaluate listener rules in priority order.',
          'examples_md', null, 'limitations_md', null, 'status', 'published', 'origin', 'curated',
          'mappings', jsonb_build_array(jsonb_build_object('vendor', 'aws', 'code', 'TST', 'exam_version', 'X1', 'domain', 'D2', 'relevance', 'core')),
          'citations', jsonb_build_array(jsonb_build_object('source', 'elb-docs', 'excerpt', 'Rules are evaluated in priority order.',
                                                            'excerpt_kind', 'verbatim', 'section_path', 'Listeners', 'support_type', 'defines')),
          'questions', jsonb_build_array(jsonb_build_object(
            'key', 'rule-order', 'dimension', 'how', 'difficulty', 2, 'status', 'published', 'origin', 'curated',
            'prompt_md', 'How are listener rules evaluated?', 'reference_answer_md', 'In priority order.',
            'rubric', jsonb_build_object('schemaVersion', 1, 'points', jsonb_build_array(
              jsonb_build_object('id', 'p1', 'text', 'Priority order', 'weight', 3, 'critical', true))),
            'rubric_schema_version', 1))))),
      jsonb_build_object(
        'provider', 'aws', 'slug', 'draft-compute', 'name', 'Draft Compute', 'aliases', jsonb_build_array(),
        'category', 'compute', 'summary_md', 'Not reviewed yet.', 'status', 'in_review', 'origin', 'ai_draft', 'docs_url', null,
        'related', jsonb_build_array(),
        'concepts', jsonb_build_array(jsonb_build_object(
          'slug', 'cold-starts', 'title', 'Cold starts', 'sort_order', 1, 'summary_md', 'Initialization latency.',
          'explanation_md', 'New environments initialize before handling requests.', 'examples_md', null, 'limitations_md', null,
          'status', 'in_review', 'origin', 'ai_draft',
          'mappings', jsonb_build_array(jsonb_build_object('vendor', 'aws', 'code', 'TST', 'exam_version', 'X1', 'domain', 'D1', 'relevance', 'core')),
          'citations', jsonb_build_array(jsonb_build_object('source', 'elb-docs', 'excerpt', 'Paraphrased note.',
                                                            'excerpt_kind', 'paraphrase', 'section_path', null, 'support_type', 'evidence')),
          'questions', jsonb_build_array())))));
$$;

create function pg_temp.as_user(uid uuid, owner boolean default false) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'role', 'authenticated',
    'app_metadata', case when owner then jsonb_build_object('role', 'owner') else '{}'::jsonb end)::text, true);
$$;

create function pg_temp.total_changes(changes jsonb) returns int language sql as $$
  select sum(value::int)::int from jsonb_each_text(changes);
$$;

create function pg_temp.explain_text(query text) returns text language plpgsql as $$
declare line text; result text := '';
begin
  for line in execute 'explain ' || query loop result := result || line || E'\n'; end loop;
  return result;
end $$;

grant execute on all functions in schema pg_temp to anon, authenticated;

-- 1–5: import is complete, idempotent, and protected.
select ok(pg_temp.total_changes(public.import_catalog(pg_temp.fixture(), '00000000-0000-0000-0000-0000000000a1')) > 0,
  'first import writes the catalog');
select is(pg_temp.total_changes(public.import_catalog(pg_temp.fixture(), '00000000-0000-0000-0000-0000000000a1')), 0,
  'second import of the same catalog changes nothing (P1-1)');
select is((public.import_catalog(pg_temp.fixture('Listener rules v2'), '00000000-0000-0000-0000-0000000000a1') ->> 'revisions')::int, 1,
  'changing a published concept appends a revision snapshot');
select is((select revision from public.service_concepts where slug = 'listener-rules'), 2, 'the concept revision is incremented');
select is((select count(*)::int from public.concept_revisions), 2, 'revision history is kept');

-- 6–8: immutability and integrity.
select throws_ok($$update public.question_versions set prompt_md = 'changed'$$, 'P0001', null, 'question versions are immutable');
select throws_ok($$delete from public.source_passages$$, 'P0001', null, 'source passages are immutable');
select throws_ok(
  $$insert into public.concept_certifications (concept_id, certification_id, exam_domain_id)
    select c.id, gen_random_uuid(), d.id from public.service_concepts c, public.exam_domains d
    where c.slug = 'cold-starts' and d.code = 'D2'$$,
  '23503', null, 'a mapping must use a domain of the same certification');

-- 9–11: anon has no access.
set local role anon;
select throws_ok($$select * from public.services$$, '42501', null, 'anon cannot read services');
select throws_ok($$select public.search_catalog()$$, '42501', null, 'anon cannot search the catalog');
select throws_ok($$select public.mark_concept_exposed(gen_random_uuid())$$, '42501', null, 'anon cannot record exposure');
reset role;

-- 12–19: a non-owner learner sees only published content and none of the hidden fields.
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select is((select count(*)::int from public.services), 1, 'learner sees published services only');
select is((select count(*)::int from public.service_concepts), 1, 'learner sees published concepts only');
select is((select count(*)::int from public.service_relationships), 0, 'relationships to unpublished services are hidden');
select is((select count(*)::int from public.questions), 1, 'learner sees the published question');
select lives_ok($$select prompt_md from public.question_versions$$, 'learner can read question prompts');
select throws_ok($$select reference_answer_md from public.question_versions$$, '42501', null,
  'reference answers are not readable before submission');
select throws_ok($$select rubric from public.question_versions$$, '42501', null, 'rubrics are not readable');
select throws_ok($$select public.import_catalog('{}'::jsonb, gen_random_uuid())$$, '42501', null,
  'learners cannot run the catalog import');

-- 20–29: search_catalog.
select is(jsonb_array_length(public.search_catalog() -> 'items'), 1, 'learner search lists published services');
select is(public.search_catalog(q => 'elb') #>> '{items,0,slug}', 'elastic-load-balancing', 'aliases are searchable (LIB-3a)');
select is(public.search_catalog(q => 'elastic load') #>> '{items,0,slug}', 'elastic-load-balancing', 'name prefixes are searchable');
select is(public.search_catalog(q => 'elb listener') #>> '{items,0,matchedConcepts,0,slug}', 'listener-rules',
  'a concept phrase highlights the matching concept');
select is(jsonb_array_length(public.search_catalog(q => 'elb') #> '{items,0,matchedConcepts}'), 0,
  'a bare service query highlights no concepts');
select is(jsonb_array_length(public.search_catalog(q => 'zzzz') -> 'items'), 0, 'no match returns no items');
select is(jsonb_array_length(public.search_catalog(
  domain_id => (select id from public.exam_domains where code = 'D1')) -> 'items'), 0,
  'domain filter excludes services without a visible concept in that domain (LIB-2a)');
select is(jsonb_array_length(public.search_catalog(
  domain_id => (select id from public.exam_domains where code = 'D2')) -> 'items'), 1,
  'domain filter includes services with a mapped concept');
select throws_ok($$select public.search_catalog(after => 'not-a-cursor')$$, '22023', null, 'invalid cursors are rejected');
select is(public.service_profile('missing-service'), null, 'unknown services return null');

-- 30–34: service_profile and exposure for the learner.
select is(public.service_profile('elastic-load-balancing') #>> '{concepts,0,citations,0,source,trustTier}', 'official',
  'citations carry a derived trust tier');
select is(public.service_profile('elastic-load-balancing') #>> '{dimensions,how}', null,
  'unauthored dimensions are null');
select throws_ok($$select public.mark_concept_exposed((select id from public.service_concepts limit 0))$$, 'P0002', null,
  'exposure requires a visible concept');
select lives_ok($$select public.mark_concept_exposed((select id from public.service_concepts where slug = 'listener-rules'))$$,
  'learner records exposure');
select is(public.service_profile('elastic-load-balancing') #>> '{concepts,0,progress,masteryStatus}', 'learning',
  'first exposure marks the concept as learning (studied)');
reset role;

-- 35–40: the owner sees work in review; review state stays private.
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', true);
select is(jsonb_array_length(public.search_catalog() -> 'items'), 2, 'owner also sees services in review');
select isnt(public.search_catalog(page_size => 1) ->> 'nextCursor', null, 'a full page returns a cursor');
select is(public.search_catalog(page_size => 1, after => public.search_catalog(page_size => 1) ->> 'nextCursor') #>> '{items,0,slug}',
  'draft-compute', 'the cursor continues with the next service (keyset pagination)');
select is((select count(*)::int from public.review_state), 0, 'owner cannot see another learner''s review state');
select is(public.service_profile('elastic-load-balancing') #>> '{concepts,0,progress}', null,
  'progress is per learner');
reset role;

-- P1-3: the search and domain-filter paths can use their indexes.
set local enable_seqscan = off;
select ok(
  pg_temp.explain_text($$select id from public.services where search_tsv @@ private.catalog_tsquery('elb')$$)
    ~ 'services_search_tsv_idx'
  and pg_temp.explain_text($$select concept_id from public.concept_certifications where exam_domain_id = '00000000-0000-0000-0000-000000000000'$$)
    ~ 'concept_certifications_domain_idx',
  'search and domain filter use their indexes (P1-3)');

select * from finish();
rollback;
