begin;
select plan(46);

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.local', '{"role":"owner"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'learner@test.local', '{}');

-- A published service with one curated concept that cites an official source last checked in 2024.
select public.import_catalog(jsonb_build_object(
  'categories', jsonb_build_array(jsonb_build_object('slug', 'compute', 'name', 'Compute', 'sort_order', 1)),
  'certifications', jsonb_build_array(jsonb_build_object(
    'vendor', 'aws', 'code', 'CIX', 'exam_version', 'X1', 'name', 'Content test', 'status', 'active', 'exam_guide_url', null,
    'domains', jsonb_build_array(jsonb_build_object('code', 'D1', 'name', 'Resilient', 'weight_pct', 100, 'sort_order', 1)))),
  'sources', jsonb_build_array(jsonb_build_object('key', 'docs', 'source_type', 'aws_documentation', 'title', 'Old docs',
    'url', 'https://docs.aws.amazon.com/', 'retrieved_at', '2024-01-01')),
  'services', jsonb_build_array(jsonb_build_object('provider', 'aws', 'slug', 'queues', 'name', 'Queue Service',
    'aliases', jsonb_build_array(), 'category', 'compute', 'summary_md', 'Queues.', 'status', 'published', 'origin', 'curated',
    'docs_url', null, 'related', jsonb_build_array(),
    'concepts', jsonb_build_array(jsonb_build_object(
      'slug', 'basics', 'title', 'Basics', 'sort_order', 1, 'summary_md', 'S.', 'explanation_md', 'E.',
      'examples_md', null, 'limitations_md', null, 'status', 'published', 'origin', 'curated',
      'mappings', jsonb_build_array(jsonb_build_object('vendor', 'aws', 'code', 'CIX', 'exam_version', 'X1', 'domain', 'D1', 'relevance', 'core')),
      'citations', jsonb_build_array(jsonb_build_object('source', 'docs', 'excerpt', 'Queues buffer work.', 'excerpt_kind', 'verbatim',
        'section_path', null, 'support_type', 'defines')),
      'questions', jsonb_build_array(jsonb_build_object('key', 'q-basics', 'dimension', 'what', 'difficulty', 2,
        'status', 'published', 'origin', 'curated', 'prompt_md', 'Why queues?', 'reference_answer_md', 'Buffering.',
        'rubric', jsonb_build_object('schemaVersion', 1, 'points', jsonb_build_array(
          jsonb_build_object('id', 'p1', 'text', 'Buffering', 'weight', 2, 'critical', true)), 'knownMisconceptions', jsonb_build_array()),
        'rubric_schema_version', 1))))))
), '00000000-0000-0000-0000-0000000000a1');

create temp table ids (name text primary key, id uuid);
create temp table vals (name text primary key, v jsonb);
grant all on ids, vals to authenticated, service_role;
create function pg_temp.id(p_name text) returns uuid language sql as $$ select id from ids where name = p_name $$;
create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'role', 'authenticated',
    'app_metadata', case when uid = '00000000-0000-0000-0000-0000000000a1' then '{"role":"owner"}'::jsonb else '{}'::jsonb end)::text, true);
$$;
grant execute on all functions in schema pg_temp to authenticated, service_role;
insert into ids select 'service', id from public.services where slug = 'queues';

-- 1–7: registering uploads (CNT-2a) -------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
insert into vals select 'upload', public.create_upload_source('Notes on queues.pdf', 4096, repeat('a', 64));
insert into ids select 'src', (v ->> 'sourceId')::uuid from vals where name = 'upload';
insert into ids select 'job', (v -> 'job' ->> 'id')::uuid from vals where name = 'upload';
select is((select v ->> 'storagePath' from vals where name = 'upload'),
  '00000000-0000-0000-0000-0000000000b2/' || pg_temp.id('src') || '.pdf', 'uploads go to the learner''s own folder');
select is((select v -> 'job' ->> 'status' from vals where name = 'upload'), 'queued', 'an extraction job is queued');
select throws_ok($$select public.create_upload_source('big.pdf', 21 * 1024 * 1024, repeat('b', 64))$$, '22023', 'file_too_large',
  'files over 20 MB are rejected before upload');
select throws_ok($$select public.create_upload_source('again.pdf', 4096, repeat('a', 64))$$, '22023', 'duplicate_source',
  'the same file cannot be uploaded twice');
select lives_ok($$insert into storage.objects (bucket_id, name) values ('sources',
  '00000000-0000-0000-0000-0000000000b2/' || pg_temp.id('src') || '.pdf')$$, 'the learner can upload to the pending source path');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('sources',
  '00000000-0000-0000-0000-0000000000b2/' || gen_random_uuid() || '.pdf')$$, '42501', null, 'uploads to other paths are refused');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('sources',
  '00000000-0000-0000-0000-0000000000a1/' || pg_temp.id('src') || '.pdf')$$, '42501', null, 'uploads to another user''s folder are refused');
reset role;

-- 8: daily limit.
insert into public.content_sources (id, owner_id, source_type, visibility, title, storage_path, status)
select g, '00000000-0000-0000-0000-0000000000b2', 'user_upload', 'private', 'old', '00000000-0000-0000-0000-0000000000b2/' || g || '.pdf', 'ready'
from (select gen_random_uuid() as g from generate_series(1, 9)) t;
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select throws_ok($$select public.create_upload_source('eleventh.pdf', 4096, repeat('c', 64))$$, '22023', 'rate_limited',
  'at most 10 uploads per day');
reset role;

-- 9–19: job lifecycle (P4-1, P4-2, CNT-4a) --------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select throws_ok(format($$select public.claim_import_job(auth.uid(), %L)$$, pg_temp.id('job')), '42501', null,
  'learners cannot run import jobs directly (ADR-0011)');
select throws_ok(format($$select public.record_import_progress(auth.uid(), %L, '[]', null, 0)$$, pg_temp.id('job')), '42501', null,
  'learners cannot write passages directly');
reset role;
set local role service_role;
select is((public.claim_import_job('00000000-0000-0000-0000-0000000000b2', pg_temp.id('job')) ->> 'claimed')::boolean, true,
  'the service role claims a queued job');
select is((public.claim_import_job('00000000-0000-0000-0000-0000000000b2', pg_temp.id('job')) ->> 'busy')::boolean, true,
  'a running job with a fresh heartbeat is busy');
select throws_ok(format($$select public.claim_import_job('00000000-0000-0000-0000-0000000000a1', %L)$$, pg_temp.id('job')),
  'P0002', null, 'jobs are scoped to their owner');
create temp table batch as select jsonb_build_array(
  jsonb_build_object('ordinal', 1, 'pageStart', 1, 'pageEnd', 1, 'sectionPath', 'Queues', 'charStart', 0, 'charEnd', 24,
    'text', 'Queues buffer bursts of work.', 'textHash', repeat('1', 64)),
  jsonb_build_object('ordinal', 2, 'pageStart', 1, 'pageEnd', 2, 'sectionPath', 'Queues', 'charStart', 25, 'charEnd', 60,
    'text', 'Consumers delete messages after processing.', 'textHash', repeat('2', 64))) as p;
grant select on batch to service_role;
select is((public.record_import_progress('00000000-0000-0000-0000-0000000000b2', pg_temp.id('job'), (select p from batch),
  '{"nextPage": 3}', 50, 4) ->> 'passageCount')::int, 2, 'passages and the cursor are recorded together');
select is((public.record_import_progress('00000000-0000-0000-0000-0000000000b2', pg_temp.id('job'), (select p from batch),
  '{"nextPage": 3}', 50) ->> 'passageCount')::int, 2, 're-sending the same passages adds nothing (P4-1)');
select is((select cursor from public.import_jobs where id = pg_temp.id('job')), '{"nextPage": 3}'::jsonb,
  'the cursor lets an interrupted job resume (P4-2)');
select is((public.claim_import_job('00000000-0000-0000-0000-0000000000b2', pg_temp.id('job')) ->> 'claimed')::boolean, true,
  'a recorded batch releases the job, so the next call continues at once');
select is((public.finish_import_job('00000000-0000-0000-0000-0000000000b2', pg_temp.id('job'), null, null, null, repeat('a', 64)) ->> 'status'),
  'succeeded', 'a finished job succeeds');
reset role;
select is((select status from public.content_sources where id = pg_temp.id('src')), 'ready', 'the source becomes ready');
select is((select count(*)::int from public.source_passages
           where source_id = pg_temp.id('src') and page_start is not null and page_end is not null
             and char_start is not null and char_end is not null and text_hash is not null), 2,
  'passages keep source, pages, offsets, and hash (CNT-4a)');
set local role service_role;
select is((public.claim_import_job('00000000-0000-0000-0000-0000000000b2', pg_temp.id('job'), true) ->> 'claimed')::boolean, true,
  'a finished job can be re-run from the start');
reset role;

-- 20–22: failures (CNT-8a).
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
insert into vals select 'note', public.create_note_source('Queue notes', '# Queues' || chr(10) || 'They buffer work.');
reset role;
insert into ids select 'note_job', (v -> 'job' ->> 'id')::uuid from vals where name = 'note';
set local role service_role;
select public.claim_import_job('00000000-0000-0000-0000-0000000000b2', pg_temp.id('note_job'));
select is((public.finish_import_job('00000000-0000-0000-0000-0000000000b2', pg_temp.id('note_job'), 'no_extractable_text', 'empty')
           ->> 'errorCode'), 'no_extractable_text', 'failures carry a typed error code');
reset role;
select is((select (j.job_type, j.status, s.status) from public.import_jobs j join public.content_sources s on s.id = j.source_id
           where j.id = pg_temp.id('note_job')), ('note_segment'::text, 'failed'::text, 'failed'::text),
  'the job and its source are marked failed');
select throws_ok($$insert into public.import_jobs (user_id, job_type, status, error_code, finished_at)
  values ('00000000-0000-0000-0000-0000000000b2', 'draft_generation', 'failed', 'not_a_code', now())$$, '23514', null,
  'error codes are typed');

-- 23–25: privacy.
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.import_jobs), 0, 'learners see only their own jobs');
select is(jsonb_array_length(public.search_passages('bursts')), 0, 'other learners'' private passages are not searchable');
reset role;
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select is(jsonb_array_length(public.search_passages('bursts')), 1, 'own passages are searchable');
select is(jsonb_array_length(public.search_passages('buffer')), 2, 'shared official passages are searchable too');
reset role;

-- 26–31: drafts (CNT-6a, P4-3) ----------------------------------------------------------------------------
-- The owner's own note passage, and the learner's private one.
insert into public.content_sources (id, owner_id, source_type, visibility, title, note_body_md, status)
values ('00000000-0000-4000-8000-00000000aa01', '00000000-0000-0000-0000-0000000000a1', 'user_note', 'private', 'Owner note', 'x', 'ready');
insert into public.source_passages (id, source_id, ordinal, char_start, char_end, text, text_hash)
values ('00000000-0000-4000-8000-00000000bb01', '00000000-0000-4000-8000-00000000aa01', 1, 0, 30,
        'Dead-letter queues hold failed messages.', repeat('3', 64));
insert into ids select 'learner_passage', id from public.source_passages where source_id = pg_temp.id('src') and ordinal = 1;
create temp table draft_input as select jsonb_build_array(jsonb_build_object(
  'title', 'Dead-letter queues', 'summaryMd', 'Where failed messages go.', 'explanationMd', 'After N receives a message moves aside.',
  'limitationsMd', null, 'citations', jsonb_build_array(jsonb_build_object('passageId', '00000000-0000-4000-8000-00000000bb01', 'supportType', 'defines')),
  'questions', jsonb_build_array(jsonb_build_object('promptMd', 'What is a dead-letter queue for?', 'dimension', 'problem', 'difficulty', 2,
    'referenceAnswerMd', 'It holds messages that keep failing.', 'rubric', jsonb_build_object('schemaVersion', 1, 'points',
      jsonb_build_array(jsonb_build_object('id', 'p1', 'text', 'Holds repeatedly failing messages', 'weight', 3, 'critical', true)),
      'knownMisconceptions', '[]'::jsonb, 'thresholds', jsonb_build_object('pass', 0.8, 'partial', 0.4)))))) as d;
grant select on draft_input to service_role;
set local role service_role;
select throws_ok($$select public.start_draft_job('00000000-0000-0000-0000-0000000000b2', '{}')$$, '42501', null,
  'only the owner can generate drafts');
insert into ids select 'draft_job', (public.start_draft_job('00000000-0000-0000-0000-0000000000a1', '{}') ->> 'id')::uuid;
select throws_ok(format($$select public.create_drafts('00000000-0000-0000-0000-0000000000a1', %L, %L,
  jsonb_set((select d from draft_input), '{0,citations,0,passageId}', to_jsonb(%L::text)))$$,
  pg_temp.id('draft_job'), pg_temp.id('service'), pg_temp.id('learner_passage')), '22023', 'citation_mismatch',
  'drafts cannot cite another user''s private passage');
insert into ids select 'draft', ((public.create_drafts('00000000-0000-0000-0000-0000000000a1', pg_temp.id('draft_job'),
  pg_temp.id('service'), (select d from draft_input)) -> 'conceptIds') ->> 0)::uuid;
reset role;
select is((select (status, origin, visibility) from public.service_concepts where id = pg_temp.id('draft')),
  ('draft'::text, 'ai_draft'::text, 'private'::text), 'generated concepts are private drafts (CNT-6a)');
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select throws_ok(format($$select public.start_session('concept', %L)$$, pg_temp.id('draft')), 'P0002', null,
  'drafts cannot be practiced (P4-3)');
select is((select jsonb_agg(c ->> 'title') from jsonb_array_elements(public.search_catalog('dead letter') -> 'items') i,
           jsonb_array_elements(i -> 'matchedConcepts') c), null, 'drafts do not appear in search results (P4-3)');
select is((select count(*)::int from jsonb_array_elements(public.service_profile('queues') -> 'concepts') c
           where c ->> 'status' = 'draft'), 0, 'drafts do not appear in the service profile');
reset role;

-- 32–40: review and publish -----------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select throws_ok(format($$select public.draft_detail(%L)$$, pg_temp.id('draft')), '42501', null, 'only the owner reviews drafts');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into vals select 'detail', public.draft_detail(pg_temp.id('draft'));
select is((select v -> 'citations' -> 0 ->> 'text' from vals where name = 'detail'), 'Dead-letter queues hold failed messages.',
  'the review shows the cited passage');
select public.update_draft(pg_temp.id('draft'), 'Dead-letter queues', 'Where failed messages go.', 'TODO explain redrive.', null,
  array[(select id from public.exam_domains where code = 'D1')],
  (select jsonb_agg(q - 'version' - 'status') from vals, jsonb_array_elements(v -> 'questions') q where name = 'detail'));
select is((select count(*)::int from public.question_versions v join public.questions q on q.id = v.question_id
           where q.concept_id = pg_temp.id('draft')), 1, 'saving unchanged questions creates no new version');
select throws_ok(format($$select public.publish_concept(%L)$$, pg_temp.id('draft')), '22023',
  'cannot publish: placeholder text (TODO, TBD, [[…]]) must be replaced', 'placeholder text blocks publishing');
select public.update_draft(pg_temp.id('draft'), 'Dead-letter queues', 'Where failed messages go.',
  'After a set number of receives a message moves to a separate queue.', null,
  array[(select id from public.exam_domains where code = 'D1')],
  (select jsonb_agg(jsonb_set(q - 'version' - 'status', '{promptMd}', '"Why add a dead-letter queue?"'))
   from vals, jsonb_array_elements(v -> 'questions') q where name = 'detail'));
select is((select max(v.version) from public.question_versions v join public.questions q on q.id = v.question_id
           where q.concept_id = pg_temp.id('draft')), 2, 'editing a question creates version 2 (ADR-0006)');
select is(public.publish_concept(pg_temp.id('draft')) ->> 'revision', '1', 'a valid draft publishes as revision 1');
select is((select (c.status, (select count(*)::int from public.concept_revisions r where r.concept_id = c.id),
                   (select q.status from public.questions q where q.concept_id = c.id))
           from public.service_concepts c where c.id = pg_temp.id('draft')),
  ('published'::text, 1, 'published'::text), 'publishing snapshots the revision and publishes its questions');
select lives_ok(format($$select public.start_session('concept', %L)$$, pg_temp.id('draft')),
  'the published concept can be practiced by its owner');
reset role;

-- CNT-7a: a citation to another user's private passage blocks publishing.
set local role service_role;
insert into ids select 'draft2', ((public.create_drafts('00000000-0000-0000-0000-0000000000a1', pg_temp.id('draft_job'),
  pg_temp.id('service'), (select d from draft_input)) -> 'conceptIds') ->> 0)::uuid;
reset role;
insert into public.concept_sources (concept_id, passage_id, support_type) values (pg_temp.id('draft2'), pg_temp.id('learner_passage'), 'evidence');
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select throws_ok(format($$select public.publish_concept(%L)$$, pg_temp.id('draft2')), '22023',
  'cannot publish: a citation points to another user''s passage', 'publishing validates citation ownership (CNT-7a)');
select is(public.reject_draft(pg_temp.id('draft2')) ->> 'status', 'retired', 'a rejected draft is retired');

-- 41–42: overview and staleness.
select is((select jsonb_agg(d ->> 'title') from jsonb_array_elements(public.content_overview() -> 'drafts') d), null,
  'published and rejected drafts leave the review list');
select is((public.content_overview() -> 'stale' -> 0 ->> 'title'), 'Old docs',
  'official citations older than 12 months are listed for re-verification');
reset role;

select * from finish();
rollback;
