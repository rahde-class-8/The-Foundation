begin;
select plan(46);

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.local', '{"role":"owner"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'other@test.local', '{}');

-- One published service with two concepts and one question each, plus an unreviewed service.
select public.import_catalog(jsonb_build_object(
  'categories', jsonb_build_array(jsonb_build_object('slug', 'compute', 'name', 'Compute', 'sort_order', 1)),
  'certifications', jsonb_build_array(jsonb_build_object(
    'vendor', 'aws', 'code', 'TST', 'exam_version', 'X1', 'name', 'Test', 'status', 'active', 'exam_guide_url', null,
    'domains', jsonb_build_array(jsonb_build_object('code', 'D1', 'name', 'Resilient', 'weight_pct', 100, 'sort_order', 1)))),
  'sources', jsonb_build_array(jsonb_build_object('key', 'docs', 'source_type', 'aws_documentation', 'title', 'Docs',
    'url', 'https://docs.aws.amazon.com/', 'retrieved_at', '2026-10-01')),
  'services', jsonb_build_array(
    jsonb_build_object('provider', 'aws', 'slug', 'fn', 'name', 'Functions', 'aliases', jsonb_build_array(), 'category', 'compute',
      'summary_md', 'Compute.', 'status', 'published', 'origin', 'curated', 'docs_url', null, 'related', jsonb_build_array(),
      'concepts', (select jsonb_agg(jsonb_build_object(
        'slug', slug, 'title', initcap(slug), 'sort_order', n, 'summary_md', 'Summary.', 'explanation_md', 'Explanation.',
        'examples_md', null, 'limitations_md', null, 'status', 'published', 'origin', 'curated',
        'mappings', jsonb_build_array(jsonb_build_object('vendor', 'aws', 'code', 'TST', 'exam_version', 'X1', 'domain', 'D1', 'relevance', 'core')),
        'citations', jsonb_build_array(jsonb_build_object('source', 'docs', 'excerpt', 'Excerpt ' || slug, 'excerpt_kind', 'verbatim',
          'section_path', null, 'support_type', 'defines')),
        'questions', jsonb_build_array(jsonb_build_object('key', 'q-' || slug, 'dimension', 'what', 'difficulty', 2,
          'status', 'published', 'origin', 'curated', 'prompt_md', 'Explain ' || slug, 'reference_answer_md', 'Secret answer ' || slug,
          'rubric', jsonb_build_object('schemaVersion', 1, 'points', jsonb_build_array(
            jsonb_build_object('id', 'p1', 'text', 'Key fact', 'weight', 2, 'critical', true)), 'knownMisconceptions', jsonb_build_array()),
          'rubric_schema_version', 1))))
        from (values (1, 'timeouts'), (2, 'scaling')) as t(n, slug))),
    jsonb_build_object('provider', 'aws', 'slug', 'draft', 'name', 'Draft', 'aliases', jsonb_build_array(), 'category', 'compute',
      'summary_md', 'Draft.', 'status', 'in_review', 'origin', 'ai_draft', 'docs_url', null, 'related', jsonb_build_array(),
      'concepts', jsonb_build_array(jsonb_build_object(
        'slug', 'unreviewed', 'title', 'Unreviewed', 'sort_order', 1, 'summary_md', 'S.', 'explanation_md', 'E.',
        'examples_md', null, 'limitations_md', null, 'status', 'in_review', 'origin', 'ai_draft',
        'mappings', jsonb_build_array(jsonb_build_object('vendor', 'aws', 'code', 'TST', 'exam_version', 'X1', 'domain', 'D1', 'relevance', 'core')),
        'citations', jsonb_build_array(jsonb_build_object('source', 'docs', 'excerpt', 'Draft excerpt', 'excerpt_kind', 'paraphrase',
          'section_path', null, 'support_type', 'defines')),
        'questions', jsonb_build_array(jsonb_build_object('key', 'q-draft', 'dimension', 'what', 'difficulty', 2,
          'status', 'in_review', 'origin', 'ai_draft', 'prompt_md', 'Draft?', 'reference_answer_md', 'Draft.',
          'rubric', jsonb_build_object('schemaVersion', 1, 'points', jsonb_build_array(
            jsonb_build_object('id', 'p1', 'text', 'Fact', 'weight', 1, 'critical', true)), 'knownMisconceptions', jsonb_build_array()),
          'rubric_schema_version', 1))))))
), '00000000-0000-0000-0000-0000000000a1');

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.qv(concept_slug text) returns uuid language sql as $$
  select q.current_version_id from public.questions q join public.service_concepts c on c.id = q.concept_id where c.slug = concept_slug;
$$;
create function pg_temp.transition(due text, interval_days int) returns jsonb language sql as $$
  select jsonb_build_object('masteryStatus', 'reviewing', 'intervalDays', interval_days, 'ease', 2.6,
    'consecutiveColdPasses', 1, 'lapseCount', 0, 'preLapseIntervalDays', null, 'totalColdAttempts', 1,
    'lastColdGrade', 'pass', 'lastReviewedAt', now(), 'dueAt', due, 'manualDueOverride', false);
$$;
grant execute on all functions in schema pg_temp to authenticated;
create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;
insert into ids select 'draft', id from public.services where slug = 'draft';

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');

-- 1–5: sessions and candidates.
select throws_ok($$select public.start_session('service')$$, '22023', null, 'service scope requires a scope id');
select throws_ok($$select public.start_session('service', (select id from ids where name = 'draft'))$$, 'P0002', null,
  'unpublished services cannot be practiced');
insert into ids select 's1', (public.start_session('service', (select id from public.services where slug = 'fn')) ->> 'id')::uuid;
select is(jsonb_array_length(public.next_questions((select id from ids where name = 's1')) -> 'candidates'), 2,
  'candidates include only published questions in scope');
select is((public.next_questions((select id from ids where name = 's1')) ->> 'newConceptsRemaining')::int, 10,
  'the daily new-concept budget starts at the default limit');
select is((select timezone from public.user_settings), 'UTC', 'settings are created with defaults');

-- 6–13: submitting answers.
select throws_ok(format($$select public.submit_attempt(%L, %L, 'x', gen_random_uuid())$$,
  (select id from ids where name = 's1'), (select v.id from public.question_versions v join public.questions q on q.id = v.question_id where q.key = 'q-draft')),
  'P0002', null, 'unpublished questions cannot be answered');
insert into ids select 'a1', (public.submit_attempt((select id from ids where name = 's1'), pg_temp.qv('timeouts'),
  'Fifteen minutes', '11111111-1111-1111-1111-111111111111') ->> 'id')::uuid;
select is((select is_cold from public.attempts where id = (select id from ids where name = 'a1')), true,
  'a first attempt with no exposure is cold (P2-4)');
select is((public.submit_attempt((select id from ids where name = 's1'), pg_temp.qv('timeouts'), 'Different text',
  '11111111-1111-1111-1111-111111111111') ->> 'id')::uuid, (select id from ids where name = 'a1'),
  'resubmitting with the same client key returns the same attempt (REC-3b)');
select is((select count(*)::int from public.attempts), 1, 'exactly one attempt exists after a double submit');
select is((public.submit_attempt((select id from ids where name = 's1'), pg_temp.qv('timeouts'), 'Second try',
  gen_random_uuid()) ->> 'isCold')::boolean, false, 'a second initial attempt on the concept in one session is not cold (P2-4)');
select throws_ok($$update public.attempts set answer_md = 'edited'$$, '42501', null, 'learners cannot write attempts directly');
select lives_ok($$select prompt_md from public.question_versions limit 1$$, 'prompts are readable');
select throws_ok($$select reference_answer_md from public.question_versions$$, '42501', null,
  'reference answers are not readable directly (REC-2a)');

-- 14–17: corrections.
insert into ids select 'c1', (public.submit_attempt((select id from ids where name = 's1'), pg_temp.qv('timeouts'), 'Correction',
  gen_random_uuid(), 'correction', (select id from ids where name = 'a1')) ->> 'id')::uuid;
select is((select is_cold from public.attempts where id = (select id from ids where name = 'c1')), false,
  'corrections are never cold');
select lives_ok(format($$select public.submit_attempt(%L, %L, 'Second correction', gen_random_uuid(), 'correction', %L)$$,
  (select id from ids where name = 's1'), pg_temp.qv('timeouts'), (select id from ids where name = 'a1')), 'a second correction round is allowed');
select throws_ok(format($$select public.submit_attempt(%L, %L, 'Third', gen_random_uuid(), 'correction', %L)$$,
  (select id from ids where name = 's1'), pg_temp.qv('timeouts'), (select id from ids where name = 'a1')), '22023', null,
  'at most two correction rounds');
select throws_ok(format($$select public.submit_attempt(%L, %L, 'Wrong concept', gen_random_uuid(), 'correction', %L)$$,
  (select id from ids where name = 's1'), pg_temp.qv('scaling'), (select id from ids where name = 'a1')), '22023', null,
  'a correction must target its parent''s concept');

-- 18–20: reveal reference.
select is(public.reveal_reference((select id from ids where name = 'a1')) ->> 'referenceAnswerMd', 'Secret answer timeouts',
  'the reference answer is revealed for a submitted attempt');
select isnt((select reference_revealed_at from public.attempts where id = (select id from ids where name = 'a1')), null,
  'revealing is recorded on the attempt');
select isnt((select last_exposure_at from public.review_state), null, 'revealing counts as exposure to the concept');

-- 21–25: evaluations.
select throws_ok($$select public.record_ai_evaluation(auth.uid(), (select id from ids where name = 'a1'), '{}'::jsonb)$$, '42501', null,
  'learners cannot record AI evaluations (ADR-0011)');
select throws_ok($$select public.finalize_attempt(auth.uid(), (select id from ids where name = 'a1'), gen_random_uuid(), 0, null, null)$$,
  '42501', null, 'learners cannot finalize directly (ADR-0011)');
select is(public.submit_self_evaluation((select id from ids where name = 'a1'), 'partial', '{"p1":"partial"}') ->> 'source', 'self',
  'without an AI grade, a self-assessment is recorded as self');
select throws_ok($$select public.submit_self_evaluation((select id from ids where name = 'a1'), 'excellent')$$, '22023', null,
  'grades are validated');
select is((select status from public.attempts where id = (select id from ids where name = 'a1')), 'evaluated',
  'a completed evaluation marks the attempt evaluated');
reset role;

-- 26–28: an AI evaluation (service path), then an override keeps both (REC-6a).
select is(public.record_ai_evaluation('00000000-0000-0000-0000-0000000000a1', (select id from ids where name = 'a1'),
  '{"status":"completed","grade":"pass","rubricScore":100,"confidence":0.9,"provider":"mock","model":"mock-grader","promptVersion":"grading-v1"}') ->> 'status',
  'completed', 'the service role records a completed AI evaluation');
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into ids select 'ov', (public.submit_self_evaluation((select id from ids where name = 'a1'), 'miss', null, 'Too vague') ->> 'id')::uuid;
select is((select source || ':' || (overrides_evaluation_id is not null)::text from public.evaluations where id = (select id from ids where name = 'ov')),
  'override:true', 'a learner grade after an AI grade is an override that references it (REC-6a)');
select is((select count(*)::int from public.evaluations where attempt_id = (select id from ids where name = 'a1')), 3,
  'original and final grades are all kept');
reset role;

-- 29–36: finalization (service path).
select throws_ok($$update public.evaluations set grade = 'pass'$$, 'P0001', null, 'evaluations are immutable (X-5)');
select throws_ok(format($$select public.finalize_attempt('00000000-0000-0000-0000-0000000000a1', %L, %L, 5, pg_temp.transition('2026-10-31', 3), 'sr-v1')$$,
  (select id from ids where name = 'a1'), (select id from ids where name = 'ov')), 'P0409', null,
  'a stale expected version is rejected (SR-14)');
select is((select status from public.attempts where id = (select id from ids where name = 'a1')), 'evaluated',
  'a rejected finalize changes nothing');
select is(public.finalize_attempt('00000000-0000-0000-0000-0000000000a1', (select id from ids where name = 'a1'),
  (select id from ids where name = 'ov'), 0, pg_temp.transition('2026-10-31T00:00:00Z', 3), 'sr-v1') ->> 'replayed', 'false',
  'finalize applies the transition');
select is(public.finalize_attempt('00000000-0000-0000-0000-0000000000a1', (select id from ids where name = 'a1'),
  (select id from ids where name = 'ov'), 0, pg_temp.transition('2027-01-01T00:00:00Z', 9), 'sr-v1') ->> 'replayed', 'true',
  'retrying finalize replays the original result (SR-13)');
select is((select count(*)::int from public.review_events), 1, 'exactly one review event after retries (REC-8a)');
select is((select interval_days || '/' || version from public.review_state), '3/1', 'the transition is applied once');
select throws_ok(format($$update public.attempts set answer_md = 'x' where id = %L$$, (select id from ids where name = 'a1')), 'P0001', null,
  'finalized attempts are immutable');

-- 37–38: corrections finalize without scheduling (REC-7a).
select lives_ok(format($$select public.record_ai_evaluation('00000000-0000-0000-0000-0000000000a1', %L,
  '{"status":"failed","errorCode":"timeout","provider":"mock"}')$$, (select id from ids where name = 'c1')),
  'a failed AI evaluation is stored without a grade');
select is((select count(*)::int from public.review_events where attempt_id = (select id from ids where name = 'c1')), 0,
  'corrections create no review event');

-- 39–40: cold gap.
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into ids select 's2', (public.start_session('concept', (select id from public.service_concepts where slug = 'timeouts')) ->> 'id')::uuid;
select is((public.submit_attempt((select id from ids where name = 's2'), pg_temp.qv('timeouts'), 'Again', gen_random_uuid()) ->> 'isCold')::boolean,
  false, 'an attempt within 8 hours of exposure is not cold (P2-4)');
reset role;
update public.review_state set last_exposure_at = now() - interval '9 hours';
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into ids select 's3', (public.start_session('concept', (select id from public.service_concepts where slug = 'timeouts')) ->> 'id')::uuid;
select is((public.submit_attempt((select id from ids where name = 's3'), pg_temp.qv('timeouts'), 'Later', gen_random_uuid()) ->> 'isCold')::boolean,
  true, 'an attempt after the cold gap is cold again (P2-4)');

-- 41–42: another learner sees and touches nothing of the owner's.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select is((select count(*)::int from public.attempts) + (select count(*)::int from public.evaluations)
  + (select count(*)::int from public.review_events) + (select count(*)::int from public.study_sessions), 0,
  'other learners cannot read practice records (X-1)');
select throws_ok(format($$select public.submit_attempt(%L, %L, 'Intrusion', gen_random_uuid())$$,
  (select id from ids where name = 's1'), pg_temp.qv('timeouts')), 'P0002', null, 'other learners cannot answer in someone else''s session');
reset role;

select is(public.practice_scopes() ->> 'totalQuestions', '2', 'practice scopes count only published questions');

-- 43–45: settings.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select is(public.update_settings('America/New_York', false, 'self_only', 5, 50) ->> 'timezone', 'America/New_York',
  'learners update their settings');
select throws_ok($$select public.update_settings('Mars/Olympus', true, 'ai_first', 5, 50)$$, '22023', null,
  'unknown time zones are rejected');
reset role;
set local role anon;
select throws_ok($$select public.get_settings()$$, '42501', null, 'anon cannot read settings');
reset role;

select * from finish();
rollback;
