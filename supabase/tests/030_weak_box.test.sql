begin;
select plan(46);

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000c1', 'learner@test.local', '{}'),
  ('00000000-0000-0000-0000-0000000000c2', 'other@test.local', '{}'),
  ('00000000-0000-0000-0000-0000000000c3', 'dashboard@test.local', '{}'),
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.local', '{"role":"owner"}');

-- One published service with three concepts: two in domain D1, one in D2.
create temp table catalog_input as select jsonb_build_object(
  'categories', jsonb_build_array(jsonb_build_object('slug', 'compute', 'name', 'Compute', 'sort_order', 1)),
  'certifications', jsonb_build_array(jsonb_build_object(
    'vendor', 'aws', 'code', 'WBX', 'exam_version', 'X1', 'name', 'Weak box test', 'status', 'active', 'exam_guide_url', null,
    'domains', jsonb_build_array(
      jsonb_build_object('code', 'D1', 'name', 'Resilient', 'weight_pct', 60, 'sort_order', 1),
      jsonb_build_object('code', 'D2', 'name', 'Secure', 'weight_pct', 40, 'sort_order', 2)))),
  'sources', jsonb_build_array(jsonb_build_object('key', 'docs', 'source_type', 'aws_documentation', 'title', 'Docs',
    'url', 'https://docs.aws.amazon.com/', 'retrieved_at', '2026-10-01')),
  'services', jsonb_build_array(
    jsonb_build_object('provider', 'aws', 'slug', 'wb', 'name', 'Weak Box Service', 'aliases', jsonb_build_array(), 'category', 'compute',
      'summary_md', 'Compute.', 'status', 'published', 'origin', 'curated', 'docs_url', null, 'related', jsonb_build_array(),
      'concepts', (select jsonb_agg(jsonb_build_object(
        'slug', slug, 'title', initcap(slug), 'sort_order', n, 'summary_md', 'Summary.', 'explanation_md', 'Explanation.',
        'examples_md', null, 'limitations_md', null, 'status', 'published', 'origin', 'curated',
        'mappings', jsonb_build_array(jsonb_build_object('vendor', 'aws', 'code', 'WBX', 'exam_version', 'X1', 'domain', domain, 'relevance', 'core')),
        'citations', jsonb_build_array(jsonb_build_object('source', 'docs', 'excerpt', 'Excerpt ' || slug, 'excerpt_kind', 'verbatim',
          'section_path', null, 'support_type', 'defines')),
        'questions', jsonb_build_array(jsonb_build_object('key', 'q-' || slug, 'dimension', 'what', 'difficulty', 2,
          'status', 'published', 'origin', 'curated', 'prompt_md', 'Explain ' || slug, 'reference_answer_md', 'Answer ' || slug,
          'rubric', jsonb_build_object('schemaVersion', 1, 'points', jsonb_build_array(
            jsonb_build_object('id', 'p1', 'text', 'Key fact', 'weight', 2, 'critical', true)), 'knownMisconceptions', jsonb_build_array()),
          'rubric_schema_version', 1))) order by n)
        from (values (1, 'timeouts', 'D1'), (2, 'scaling', 'D1'), (3, 'retries', 'D2')) as t(n, slug, domain))))
) as doc;
select public.import_catalog((select doc from catalog_input), '00000000-0000-0000-0000-0000000000a1');

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, service_role;
insert into ids select slug, id from public.service_concepts where slug in ('timeouts', 'scaling', 'retries');

create function pg_temp.id(p_name text) returns uuid language sql as $$ select id from ids where name = p_name $$;
create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.qv(concept_slug text) returns uuid language sql as $$
  select q.current_version_id from public.questions q join public.service_concepts c on c.id = q.concept_id where c.slug = concept_slug;
$$;
-- Writes a finalized attempt directly (dashboard fixtures; the full flow is covered in 020_practice).
create function pg_temp.history(uid uuid, slug text, grade text, cold boolean, at timestamptz, parent uuid default null)
returns uuid language plpgsql as $$
declare
  v_session uuid;
  v_attempt uuid;
  v_eval uuid;
begin
  insert into public.study_sessions (user_id, scope_type, status, started_at, ended_at)
  values (uid, 'mixed', 'completed', at, at) returning id into v_session;
  insert into public.attempts (user_id, session_id, question_version_id, concept_id, attempt_kind, parent_attempt_id, is_cold,
                               answer_md, client_key, submitted_at)
  values (uid, v_session, pg_temp.qv(slug), pg_temp.id(slug), case when parent is null then 'initial' else 'correction' end,
          parent, cold, 'answer', gen_random_uuid(), at) returning id into v_attempt;
  insert into public.evaluations (attempt_id, user_id, source, status, grade, feedback)
  values (v_attempt, uid, 'self', 'completed', grade, '{"schemaVersion":1,"kind":"self","ticks":{}}') returning id into v_eval;
  update public.attempts set status = 'finalized', final_evaluation_id = v_eval, finalized_at = at where id = v_attempt;
  return v_attempt;
end;
$$;
create function pg_temp.state(uid uuid, slug text, status text, due timestamptz, ease numeric default 2.5, last_grade text default null)
returns void language sql as $$
  insert into public.review_state (user_id, concept_id, mastery_status, due_at, ease, last_cold_grade, total_cold_attempts)
  values (uid, pg_temp.id(slug), status, due, ease, last_grade, case when last_grade is null then 0 else 1 end);
$$;
grant execute on all functions in schema pg_temp to authenticated, service_role;

-- 1–6: test clock ------------------------------------------------------------------------------------
delete from private.environment_flags;
set local role service_role;
select throws_ok($$select public.set_test_clock('00000000-0000-0000-0000-0000000000c1', 60)$$, '42501', null,
  'the test clock is refused unless the environment enables it');
reset role;
insert into private.environment_flags (flag) values ('test_clock');
set local role service_role;
select ok(abs(extract(epoch from public.set_test_clock('00000000-0000-0000-0000-0000000000c1', 2 * 86400) - now()) - 2 * 86400) < 1,
  'the service role can move one learner''s clock');
select ok(abs(extract(epoch from public.server_now('00000000-0000-0000-0000-0000000000c2') - now())) < 1,
  'other learners keep the real clock');
select public.set_test_clock('00000000-0000-0000-0000-0000000000c1', 0);
reset role;
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select throws_ok($$select public.set_test_clock(auth.uid(), 86400)$$, '42501', null, 'learners cannot move the clock');
select throws_ok($$select public.server_now(auth.uid())$$, '42501', null, 'server_now is service-role only');
select throws_ok($$select public.apply_manual_override(auth.uid(), gen_random_uuid(), now(), 'x', gen_random_uuid(), 0)$$, '42501', null,
  'learners cannot write overrides directly (ADR-0011)');
reset role;

-- 7–8: the cold gap follows the learner's clock.
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
insert into ids select 's1', (public.start_session('concept', pg_temp.id('retries')) ->> 'id')::uuid;
insert into ids select 'a1', (public.submit_attempt(pg_temp.id('s1'), pg_temp.qv('retries'), 'first', gen_random_uuid()) ->> 'id')::uuid;
select public.reveal_reference(pg_temp.id('a1'));
insert into ids select 's2', (public.start_session('concept', pg_temp.id('retries')) ->> 'id')::uuid;
select is((public.submit_attempt(pg_temp.id('s2'), pg_temp.qv('retries'), 'right after reading', gen_random_uuid()) ->> 'isCold')::boolean,
  false, 'an attempt right after exposure is not cold');
reset role;
set local role service_role;
select public.set_test_clock('00000000-0000-0000-0000-0000000000c1', 9 * 3600);
reset role;
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
insert into ids select 's3', (public.start_session('concept', pg_temp.id('retries')) ->> 'id')::uuid;
select is((public.submit_attempt(pg_temp.id('s3'), pg_temp.qv('retries'), 'nine hours later', gen_random_uuid()) ->> 'isCold')::boolean,
  true, 'nine hours later on the learner''s clock the attempt is cold');
reset role;
set local role service_role;
select public.set_test_clock('00000000-0000-0000-0000-0000000000c1', 0);
reset role;

-- 9–15: due windows and priority (WB-1a, WB-2a) -------------------------------------------------------
update public.user_settings set timezone = 'America/New_York' where user_id = '00000000-0000-0000-0000-0000000000c1';
delete from public.review_state where user_id = '00000000-0000-0000-0000-0000000000c1';
-- 23:30 local today, 23:59 local yesterday, and local midnight tomorrow.
select pg_temp.state('00000000-0000-0000-0000-0000000000c1', 'timeouts', 'reviewing',
  ((now() at time zone 'America/New_York')::date::timestamp + interval '23 hours 30 minutes') at time zone 'America/New_York', 2.5, 'pass');
select pg_temp.state('00000000-0000-0000-0000-0000000000c1', 'scaling', 'lapsed',
  ((now() at time zone 'America/New_York')::date::timestamp - interval '1 minute') at time zone 'America/New_York', 2.2, 'miss');
select pg_temp.state('00000000-0000-0000-0000-0000000000c1', 'retries', 'reviewing',
  ((now() at time zone 'America/New_York')::date + 1)::timestamp at time zone 'America/New_York', 2.5, 'pass');
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select is((select jsonb_agg(i ->> 'conceptTitle') from jsonb_array_elements(public.due_reviews('today') -> 'items') i),
  '["Timeouts"]'::jsonb, 'a review due at 23:30 local time is due today (WB-1a)');
select is((select jsonb_agg(i ->> 'conceptTitle') from jsonb_array_elements(public.due_reviews('overdue') -> 'items') i),
  '["Scaling"]'::jsonb, 'a review due before local midnight is overdue');
select is((select jsonb_agg(i ->> 'conceptTitle') from jsonb_array_elements(public.due_reviews('upcoming') -> 'items') i),
  '["Retries"]'::jsonb, 'a review due at local midnight tomorrow is upcoming');
select is(public.due_reviews('today') -> 'counts', '{"today": 1, "overdue": 1, "upcoming": 1}'::jsonb, 'window counts');
select throws_ok($$select public.due_reviews('yesterday')$$, '22023', null, 'unknown windows are rejected');
reset role;
-- Make all three overdue by the same amount; lapsed first, then ties broken by concept id (WB-2a).
update public.review_state set due_at = now() - interval '3 days', mastery_status = 'reviewing', ease = 2.5, last_cold_grade = 'pass'
where user_id = '00000000-0000-0000-0000-0000000000c1';
update public.review_state set mastery_status = 'lapsed', last_cold_grade = 'miss'
where user_id = '00000000-0000-0000-0000-0000000000c1' and concept_id = pg_temp.id('retries');
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select is((select jsonb_agg(i -> 'conceptId') from jsonb_array_elements(public.due_reviews('overdue') -> 'items') i),
  (select jsonb_build_array(pg_temp.id('retries')) || jsonb_agg(to_jsonb(id) order by id)
   from ids where name in ('timeouts', 'scaling')),
  'overdue reviews are ordered by priority, then concept id (WB-2a)');
select is((public.due_reviews('overdue') -> 'items' -> 0 ->> 'priority')::numeric,
  round(4 + 3 + 3 / 7.0 + 0.5, 4), 'the priority score follows SPACED_REPETITION §6');
reset role;

-- 16–24: manual override (WB-3a, P3-4) ----------------------------------------------------------------
set local role service_role;
create temp table override_result as
select public.apply_manual_override('00000000-0000-0000-0000-0000000000c1', pg_temp.id('timeouts'),
  '2030-01-01T05:00:00Z', ' Exam week ', '22222222-2222-2222-2222-222222222222',
  (select version from public.review_state where user_id = '00000000-0000-0000-0000-0000000000c1' and concept_id = pg_temp.id('timeouts'))) as r;
select is((select r ->> 'replayed' from override_result), 'false', 'an override is applied');
select is((select (due_at, manual_due_override) from public.review_state
           where user_id = '00000000-0000-0000-0000-0000000000c1' and concept_id = pg_temp.id('timeouts')),
  ('2030-01-01T05:00:00Z'::timestamptz, true), 'the override sets due_at and the flag (WB-3a)');
select is((select (event_type, reason, new_due_at, prev_due_at < now()) from public.review_events
           where user_id = '00000000-0000-0000-0000-0000000000c1' and event_type = 'manual_override'),
  ('manual_override'::text, 'Exam week'::text, '2030-01-01T05:00:00Z'::timestamptz, true),
  'the event records the previous and new due dates and the reason (WB-3a)');
select is(public.apply_manual_override('00000000-0000-0000-0000-0000000000c1', pg_temp.id('timeouts'),
  '2031-01-01T05:00:00Z', 'Retry', '22222222-2222-2222-2222-222222222222', 0) ->> 'replayed', 'true',
  'a retry with the same client key replays (P3-4)');
select is((select count(*)::int from public.review_events where event_type = 'manual_override'), 1,
  'a retried override writes a single event (P3-4)');
select throws_ok($$select public.apply_manual_override('00000000-0000-0000-0000-0000000000c1', pg_temp.id('timeouts'),
  now(), 'Stale', gen_random_uuid(), 0)$$, 'P0409', null, 'a stale version is a conflict');
select throws_ok($$select public.apply_manual_override('00000000-0000-0000-0000-0000000000c1', pg_temp.id('timeouts'),
  now(), '  ', gen_random_uuid(), 1)$$, '22023', null, 'a reason is required');
select throws_ok($$select public.apply_manual_override('00000000-0000-0000-0000-0000000000c2', pg_temp.id('timeouts'),
  now(), 'No state', gen_random_uuid(), 0)$$, 'P0002', null, 'a concept without a schedule cannot be overridden');
select throws_ok($$select public.apply_manual_override('00000000-0000-0000-0000-0000000000c1', pg_temp.id('scaling'),
  now(), 'Reused key', '22222222-2222-2222-2222-222222222222', 1)$$, '23505', null,
  'a client key cannot be reused for another concept');
reset role;

-- 25–29: history (WB-4a) -----------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
create temp table history_before as select public.concept_history(pg_temp.id('retries')) as h;
reset role;
-- Re-version the retries question: change its prompt and re-import.
update catalog_input set doc = jsonb_set(doc, '{services,0,concepts,2,questions,0,prompt_md}', '"Explain retries, version 2"');
select public.import_catalog((select doc from catalog_input), '00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select is(jsonb_array_length(public.concept_history(pg_temp.id('retries')) -> 'attempts'), 3,
  'history keeps every attempt after the question is re-versioned (WB-4a)');
select is((select jsonb_agg(distinct a -> 'questionVersion') from jsonb_array_elements(public.concept_history(pg_temp.id('retries')) -> 'attempts') a),
  '[1]'::jsonb, 'attempts still point at the version that was answered');
select is((select max(version) from public.question_versions v join public.questions q on q.id = v.question_id where q.key = 'q-retries'), 2,
  'the re-import created version 2');
select is((select jsonb_agg(e ->> 'eventType') from jsonb_array_elements(public.concept_history(pg_temp.id('timeouts')) -> 'events') e),
  '["manual_override"]'::jsonb, 'overrides appear in the concept history (P3-4)');
select throws_ok($$select public.concept_history(gen_random_uuid())$$, 'P0002', null, 'unknown concepts are not found');
reset role;

-- 30–38: misconceptions (WB-6a) ------------------------------------------------------------------------
create function pg_temp.ai_graded(slug text, answer text) returns uuid language plpgsql as $$
declare
  v_session uuid;
  v_attempt uuid;
begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
  set local role authenticated;
  v_session := (public.start_session('concept', pg_temp.id(slug)) ->> 'id')::uuid;
  v_attempt := (public.submit_attempt(v_session, pg_temp.qv(slug), answer, gen_random_uuid()) ->> 'id')::uuid;
  set local role service_role;
  perform public.record_ai_evaluation('00000000-0000-0000-0000-0000000000c2', v_attempt,
    '{"status":"completed","grade":"miss","provider":"mock","feedback":{"schemaVersion":1}}'::jsonb);
  reset role;
  return v_attempt;
end;
$$;
create function pg_temp.finalize(attempt uuid, misconceptions jsonb) returns jsonb language plpgsql as $$
declare
  v_result jsonb;
begin
  set local role service_role;
  v_result := public.finalize_attempt('00000000-0000-0000-0000-0000000000c2', attempt,
    (select id from public.evaluations where attempt_id = attempt order by created_at desc limit 1),
    coalesce((select version from public.review_state r join public.attempts a on a.concept_id = r.concept_id and a.user_id = r.user_id
              where a.id = attempt and r.is_active), 0),
    jsonb_build_object('masteryStatus', 'learning', 'intervalDays', 1, 'ease', 2.2, 'consecutiveColdPasses', 0, 'lapseCount', 0,
      'preLapseIntervalDays', null, 'totalColdAttempts', 1, 'lastColdGrade', 'miss', 'lastReviewedAt', now(),
      'dueAt', now() + interval '1 day', 'manualDueOverride', false),
    'sr-v1', misconceptions);
  reset role;
  return v_result;
end;
$$;

insert into ids select 'm1', pg_temp.ai_graded('scaling', 'Scaling is instant');
select pg_temp.finalize(pg_temp.id('m1'),
  '{"record":[{"slug":"instant-scaling","statementMd":"Scaling is instant.","correctionMd":"It takes time.","excerpt":"Scaling is instant"},
              {"slug":"instant-scaling","statementMd":"dup","correctionMd":null,"excerpt":null}]}');
select is((select (occurrence_count, status) from public.misconceptions where slug = 'instant-scaling'), (1, 'active'::text),
  'a diagnosed misconception is recorded once per attempt');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
set local role authenticated;
select is(jsonb_array_length(public.recurring_misconceptions()), 0, 'one occurrence is not recurring yet');
select is(jsonb_array_length(public.recurring_misconceptions(true)), 1, 'single occurrences are listed on request');
reset role;

-- Replaying the finalize does not count again.
select pg_temp.finalize(pg_temp.id('m1'), '{"record":[{"slug":"instant-scaling","statementMd":"x","correctionMd":null,"excerpt":null}]}');
select is((select occurrence_count from public.misconceptions where slug = 'instant-scaling'), 1, 'a replayed finalize does not count again');

insert into ids select 'm2', pg_temp.ai_graded('scaling', 'Still instant');
select pg_temp.finalize(pg_temp.id('m2'), '{"record":[{"slug":"instant-scaling","statementMd":"Other wording","correctionMd":null,"excerpt":"Still instant"}]}');
select is((select (occurrence_count, statement_md) from public.misconceptions where slug = 'instant-scaling'), (2, 'Scaling is instant.'::text),
  'a second attempt with the same misconception increments it and keeps the first statement');
select is((select count(*)::int from public.misconception_occurrences), 2, 'one occurrence row per attempt');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
set local role authenticated;
select is((public.recurring_misconceptions() -> 0 ->> 'recurring')::boolean, true,
  'a misconception diagnosed on two distinct attempts is recurring (WB-6a)');
select is((public.practice_scopes() ->> 'weakCount')::int, 1, 'concepts with active misconceptions count as weak');
reset role;

insert into ids select 'm3', pg_temp.ai_graded('scaling', 'Better answer');
select pg_temp.finalize(pg_temp.id('m3'), jsonb_build_object('record', '[]'::jsonb,
  'resolve', jsonb_build_array((select id from public.misconceptions where slug = 'instant-scaling'))));
select is((select status from public.misconceptions where slug = 'instant-scaling'), 'resolved', 'misconceptions can be resolved');

-- 39–42: isolation and privileges.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;
select is((select count(*)::int from public.misconceptions), 0, 'learners see only their own misconceptions');
select is(jsonb_array_length(public.recurring_misconceptions(true)), 0, 'other learners'' misconceptions are not listed');
select throws_ok($$insert into public.misconceptions (user_id, concept_id, slug, statement_md, first_seen_at, last_seen_at)
  values (auth.uid(), gen_random_uuid(), 'x', 'x', now(), now())$$, '42501', null, 'learners cannot write misconceptions');
reset role;
set local role anon;
select throws_ok($$select public.dashboard_summary()$$, '42501', null, 'anon cannot read the dashboard');
reset role;

-- 43–46: dashboard (DASH-3a, DASH-6a, DASH-7) ------------------------------------------------------------
insert into ids select 'd1', pg_temp.history('00000000-0000-0000-0000-0000000000c3', 'timeouts', 'pass', true, now() - interval '3 days');
select pg_temp.history('00000000-0000-0000-0000-0000000000c3', 'timeouts', 'pass', false, now() - interval '3 days' + interval '1 hour');
select pg_temp.history('00000000-0000-0000-0000-0000000000c3', 'timeouts', 'pass', false, now() - interval '3 days' + interval '2 hours', pg_temp.id('d1'));
select pg_temp.history('00000000-0000-0000-0000-0000000000c3', 'scaling', 'miss', true, now() - interval '2 days');
select pg_temp.history('00000000-0000-0000-0000-0000000000c3', 'retries', 'pass', true, now() - interval '40 days');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
set local role authenticated;
create temp table summary as
select public.dashboard_summary((select id from public.certifications where code = 'WBX')) as s;
select is((select s -> 'coldAccuracy' from summary), '{"n": 2, "pass": 1, "partial": 0, "strict": 0.5000, "lenient": 0.5000}'::jsonb,
  'cold-recall accuracy = cold passes ÷ cold finalized attempts in the window (DASH-3a)');
select is((select jsonb_agg(jsonb_build_array(d ->> 'code', d -> 'covered', d -> 'published', d -> 'coverage'))
           from summary, jsonb_array_elements(s -> 'domains') d),
  '[["D1", 2, 2, 1.0000], ["D2", 1, 1, 1.0000]]'::jsonb,
  'domain coverage counts concepts with a cold finalized attempt over published mapped concepts (DASH-6a)');
select is((select s -> 'masteryDistribution' from summary), '{"new": 3, "learning": 0, "reviewing": 0, "mastered": 0, "lapsed": 0}'::jsonb,
  'concepts without a review state count as new');
select is((select s -> 'readiness' from summary),
  '{"label": "Estimate — not a prediction of exam results", "coldAttempts": 3, "threshold": 50, "visible": false, "value": null}'::jsonb,
  'readiness is labeled and hidden below 50 cold attempts (DASH-7)');
reset role;

select * from finish();
rollback;
