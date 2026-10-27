-- Phase 3 functions (API_CONTRACTS §3–§4): Weak Box, history, dashboard, overrides, and misconceptions.
-- Phase 2 learner functions are redefined to read time from private.now_for (test clock); their
-- behavior is otherwise unchanged, except that the 'weak' scope now includes active misconceptions.

-- Clock-aware redefinitions --------------------------------------------------------------------------

create or replace function private.record_exposure(p_uid uuid, p_concept_id uuid) returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.review_state as r (user_id, concept_id, mastery_status, first_studied_at, last_exposure_at)
  values (p_uid, p_concept_id, 'learning', private.now_for(p_uid), private.now_for(p_uid))
  on conflict (user_id, concept_id) where is_active do update
    set last_exposure_at = excluded.last_exposure_at,
        first_studied_at = coalesce(r.first_studied_at, excluded.first_studied_at),
        mastery_status = case when r.mastery_status = 'new' then 'learning' else r.mastery_status end;
$$;

create or replace function public.start_session(scope_type text, scope_id uuid default null) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  v_session public.study_sessions;
  v_valid boolean;
begin
  if start_session.scope_type not in ('service', 'concept', 'domain', 'due_reviews', 'weak', 'mixed') then
    raise exception 'invalid scope type %', start_session.scope_type using errcode = '22023';
  end if;
  if (start_session.scope_type in ('service', 'concept', 'domain')) <> (start_session.scope_id is not null) then
    raise exception 'scope % requires % scope id', start_session.scope_type,
      case when start_session.scope_id is null then 'a' else 'no' end using errcode = '22023';
  end if;

  v_valid := case start_session.scope_type
    when 'service' then exists (select 1 from public.services s where s.id = start_session.scope_id and s.status = 'published')
    when 'concept' then private.practicable_concept(start_session.scope_id, v_uid)
    when 'domain' then exists (select 1 from public.exam_domains d where d.id = start_session.scope_id)
    else true
  end;
  if not v_valid then
    raise exception 'scope not found or not available for practice' using errcode = 'P0002';
  end if;

  perform private.settings_for(v_uid);

  -- Sessions left open for more than 12 hours are abandoned.
  update public.study_sessions s set status = 'abandoned', ended_at = private.now_for(v_uid)
  where s.user_id = v_uid and s.status = 'active' and s.started_at < private.now_for(v_uid) - interval '12 hours';

  insert into public.study_sessions (user_id, scope_type, scope_id, started_at)
  values (v_uid, start_session.scope_type, start_session.scope_id, private.now_for(v_uid))
  returning * into v_session;

  return jsonb_build_object('id', v_session.id, 'scopeType', v_session.scope_type, 'scopeId', v_session.scope_id,
                            'status', v_session.status, 'startedAt', v_session.started_at);
end;
$$;

create or replace function public.end_session(session_id uuid) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
begin
  update public.study_sessions s set status = 'completed', ended_at = private.now_for(v_uid)
  where s.id = end_session.session_id and s.user_id = v_uid and s.status = 'active';
  if not found and not exists (
    select 1 from public.study_sessions s where s.id = end_session.session_id and s.user_id = v_uid
  ) then
    raise exception 'session not found' using errcode = 'P0002';
  end if;

  return (
    select jsonb_build_object(
      'finalized', count(*),
      'pass', count(*) filter (where e.grade = 'pass'),
      'partial', count(*) filter (where e.grade = 'partial'),
      'miss', count(*) filter (where e.grade = 'miss'),
      'cold', count(*) filter (where a.is_cold),
      'toReview', coalesce(jsonb_agg(distinct jsonb_build_object('conceptId', c.id, 'title', c.title))
                           filter (where e.grade in ('partial', 'miss')), '[]'::jsonb)
    )
    from public.attempts a
    join public.evaluations e on e.id = a.final_evaluation_id
    join public.service_concepts c on c.id = a.concept_id
    where a.session_id = end_session.session_id and a.attempt_kind = 'initial'
  );
end;
$$;

create or replace function public.practice_scopes() returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_settings public.user_settings;
  v_end_of_today timestamptz;
begin
  select * into v_settings from public.user_settings where user_id = v_uid;
  v_end_of_today := ((((private.now_for(v_uid) at time zone coalesce(v_settings.timezone, 'UTC'))::date) + 1)::timestamp)
                    at time zone coalesce(v_settings.timezone, 'UTC');

  return jsonb_build_object(
    'services', coalesce((
      select jsonb_agg(jsonb_build_object('id', sv.id, 'slug', sv.slug, 'name', sv.name, 'questionCount', n) order by sv.name)
      from (
        select c.service_id, count(*) as n
        from public.questions q join public.service_concepts c on c.id = q.concept_id
        where q.status = 'published' and private.practicable_concept(c.id, v_uid)
        group by c.service_id
      ) counts
      join public.services sv on sv.id = counts.service_id
    ), '[]'::jsonb),
    'domains', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'code', d.code, 'name', d.name,
                                          'certification', cert.code || '-' || cert.exam_version, 'questionCount', n)
                       order by cert.code, d.sort_order)
      from (
        select cc.exam_domain_id, count(distinct q.id) as n
        from public.questions q
        join public.concept_certifications cc on cc.concept_id = q.concept_id
        where q.status = 'published' and private.practicable_concept(q.concept_id, v_uid)
        group by cc.exam_domain_id
      ) counts
      join public.exam_domains d on d.id = counts.exam_domain_id
      join public.certifications cert on cert.id = d.certification_id
    ), '[]'::jsonb),
    'dueCount', (
      select count(*) from public.review_state r
      where r.user_id = v_uid and r.is_active and r.due_at < v_end_of_today and private.practicable_concept(r.concept_id, v_uid)
    ),
    'weakCount', (
      select count(*) from public.service_concepts c
      where private.practicable_concept(c.id, v_uid)
        and (exists (
               select 1 from public.review_state r
               where r.user_id = v_uid and r.concept_id = c.id and r.is_active and r.total_cold_attempts > 0
                 and r.mastery_status in ('lapsed', 'learning'))
             or exists (
               select 1 from public.misconceptions m
               where m.user_id = v_uid and m.concept_id = c.id and m.status = 'active'))
    ),
    'totalQuestions', (
      select count(*) from public.questions q
      where q.status = 'published' and private.practicable_concept(q.concept_id, v_uid)
    )
  );
end;
$$;

create or replace function public.next_questions(session_id uuid) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  v_session public.study_sessions;
  v_settings public.user_settings;
  v_today date;
  v_end_of_today timestamptz;
  v_new_today int;
begin
  select * into v_session from public.study_sessions s where s.id = next_questions.session_id and s.user_id = v_uid;
  if not found then
    raise exception 'session not found' using errcode = 'P0002';
  end if;

  select * into v_settings from public.user_settings where user_id = v_uid;
  v_today := (private.now_for(v_uid) at time zone coalesce(v_settings.timezone, 'UTC'))::date;
  v_end_of_today := ((v_today + 1)::timestamp) at time zone coalesce(v_settings.timezone, 'UTC');

  -- New concepts started today: first initial attempt on the concept falls on the learner's today.
  select count(*) into v_new_today
  from (
    select a.concept_id from public.attempts a
    where a.user_id = v_uid and a.attempt_kind = 'initial'
    group by a.concept_id
    having (min(a.submitted_at) at time zone coalesce(v_settings.timezone, 'UTC'))::date = v_today
  ) started;

  return jsonb_build_object(
    'sessionStatus', v_session.status,
    'endOfToday', v_end_of_today,
    'newConceptsRemaining', greatest(coalesce(v_settings.daily_new_limit, 10) - v_new_today, 0),
    'candidates', coalesce((
      select jsonb_agg(candidate) from (
        select jsonb_build_object(
          'questionId', q.id,
          'questionVersionId', v.id,
          'conceptId', c.id,
          'conceptTitle', c.title,
          'serviceSlug', sv.slug,
          'serviceName', sv.name,
          'promptMd', v.prompt_md,
          'dimension', q.dimension,
          'difficulty', q.difficulty,
          'review', (
            select jsonb_build_object(
              'masteryStatus', r.mastery_status, 'dueAt', r.due_at, 'ease', r.ease, 'lapseCount', r.lapse_count,
              'lastColdGrade', r.last_cold_grade, 'totalColdAttempts', r.total_cold_attempts)
            from public.review_state r where r.user_id = v_uid and r.concept_id = c.id and r.is_active
          ),
          'lastAnsweredAt', (
            select max(a.submitted_at) from public.attempts a
            join public.question_versions av on av.id = a.question_version_id
            where a.user_id = v_uid and av.question_id = q.id
          ),
          'dimensionAccuracy', (
            select avg(case when e.grade = 'pass' then 1.0 else 0.0 end)
            from public.attempts a
            join public.evaluations e on e.id = a.final_evaluation_id
            join public.question_versions av on av.id = a.question_version_id
            join public.questions aq on aq.id = av.question_id
            where a.user_id = v_uid and a.concept_id = c.id and a.is_cold and aq.dimension = q.dimension
          ),
          'conceptAttemptedInSession', exists (
            select 1 from public.attempts a
            where a.session_id = v_session.id and a.concept_id = c.id and a.attempt_kind = 'initial'
          )
        ) as candidate
        from public.questions q
        join public.question_versions v on v.id = q.current_version_id
        join public.service_concepts c on c.id = q.concept_id
        join public.services sv on sv.id = c.service_id
        where q.status = 'published'
          and private.practicable_concept(c.id, v_uid)
          and case v_session.scope_type
            when 'service' then c.service_id = v_session.scope_id
            when 'concept' then c.id = v_session.scope_id
            when 'domain' then exists (
              select 1 from public.concept_certifications cc where cc.concept_id = c.id and cc.exam_domain_id = v_session.scope_id)
            when 'due_reviews' then exists (
              select 1 from public.review_state r
              where r.user_id = v_uid and r.concept_id = c.id and r.is_active and r.due_at < v_end_of_today)
            when 'weak' then exists (
              select 1 from public.review_state r
              where r.user_id = v_uid and r.concept_id = c.id and r.is_active
                and r.total_cold_attempts > 0 and r.mastery_status in ('lapsed', 'learning'))
              or exists (
                select 1 from public.misconceptions m
                where m.user_id = v_uid and m.concept_id = c.id and m.status = 'active')
            else true
          end
        limit 300
      ) candidates
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.submit_attempt(
  session_id uuid,
  question_version_id uuid,
  answer_md text,
  client_key uuid,
  attempt_kind text default 'initial',
  parent_attempt_id uuid default null,
  answer_duration_ms int default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  v_existing public.attempts;
  v_session public.study_sessions;
  v_concept_id uuid;
  v_parent public.attempts;
  v_settings public.user_settings;
  v_gap interval;
  v_exposure timestamptz;
  v_cold boolean := false;
  v_attempt public.attempts;
begin
  select * into v_existing from public.attempts a where a.user_id = v_uid and a.client_key = submit_attempt.client_key;
  if found then
    if v_existing.question_version_id <> submit_attempt.question_version_id then
      raise exception 'client key reused for a different question' using errcode = '23505';
    end if;
    return private.attempt_json(v_existing);
  end if;

  select * into v_session from public.study_sessions s where s.id = submit_attempt.session_id and s.user_id = v_uid;
  if not found then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  if v_session.status <> 'active' then
    raise exception 'session is not active' using errcode = '22023';
  end if;

  select q.concept_id into v_concept_id
  from public.question_versions v
  join public.questions q on q.id = v.question_id
  where v.id = submit_attempt.question_version_id and q.status = 'published';
  if v_concept_id is null or not private.practicable_concept(v_concept_id, v_uid) then
    raise exception 'question not available for practice' using errcode = 'P0002';
  end if;

  if submit_attempt.attempt_kind = 'correction' then
    select * into v_parent from public.attempts a
    where a.id = submit_attempt.parent_attempt_id and a.user_id = v_uid;
    if not found or v_parent.attempt_kind <> 'initial' or v_parent.session_id <> v_session.id
       or v_parent.concept_id <> v_concept_id then
      raise exception 'invalid parent attempt' using errcode = '22023';
    end if;
    if v_parent.status = 'finalized' then
      raise exception 'parent attempt is already finalized' using errcode = '22023';
    end if;
    if (select count(*) from public.attempts a where a.parent_attempt_id = v_parent.id) >= 2 then
      raise exception 'at most two correction rounds' using errcode = '22023';
    end if;
  elsif submit_attempt.attempt_kind <> 'initial' or submit_attempt.parent_attempt_id is not null then
    raise exception 'invalid attempt kind' using errcode = '22023';
  else
    -- Cold recall (MASTERY_MODEL §3): first initial attempt on the concept in this session, and no
    -- exposure to the concept within the cold gap.
    v_settings := private.settings_for(v_uid);
    v_gap := make_interval(secs => coalesce((v_settings.scheduler_overrides ->> 'coldGapHours')::numeric, 8) * 3600);
    select r.last_exposure_at into v_exposure from public.review_state r
    where r.user_id = v_uid and r.concept_id = v_concept_id and r.is_active;
    v_cold := not exists (
      select 1 from public.attempts a
      where a.session_id = v_session.id and a.concept_id = v_concept_id and a.attempt_kind = 'initial'
    ) and (v_exposure is null or v_exposure <= private.now_for(v_uid) - v_gap);
  end if;

  insert into public.attempts (user_id, session_id, question_version_id, concept_id, attempt_kind, parent_attempt_id,
                               is_cold, answer_md, client_key, answer_duration_ms, submitted_at)
  values (v_uid, v_session.id, submit_attempt.question_version_id, v_concept_id, submit_attempt.attempt_kind,
          submit_attempt.parent_attempt_id, v_cold, submit_attempt.answer_md, submit_attempt.client_key,
          submit_attempt.answer_duration_ms, private.now_for(v_uid))
  returning * into v_attempt;

  return private.attempt_json(v_attempt);
end;
$$;

create or replace function public.reveal_reference(attempt_id uuid) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  v_attempt public.attempts;
  v_version public.question_versions;
begin
  select * into v_attempt from public.attempts a where a.id = reveal_reference.attempt_id and a.user_id = v_uid;
  if not found then
    raise exception 'attempt not found' using errcode = 'P0002';
  end if;
  select * into v_version from public.question_versions v where v.id = v_attempt.question_version_id;

  if v_attempt.reference_revealed_at is null and v_attempt.status <> 'finalized' then
    update public.attempts a set reference_revealed_at = private.now_for(v_uid) where a.id = v_attempt.id;
  end if;
  perform private.record_exposure(v_uid, v_attempt.concept_id);

  return jsonb_build_object(
    'referenceAnswerMd', v_version.reference_answer_md,
    'rubric', jsonb_build_object(
      'points', coalesce((
        select jsonb_agg(jsonb_build_object('id', p ->> 'id', 'text', p ->> 'text', 'weight', (p ->> 'weight')::int,
                                            'critical', (p ->> 'critical')::boolean))
        from jsonb_array_elements(v_version.rubric -> 'points') p
      ), '[]'::jsonb),
      'knownMisconceptions', coalesce(v_version.rubric -> 'knownMisconceptions', '[]'::jsonb),
      'thresholds', coalesce(v_version.rubric -> 'thresholds', '{"pass": 0.8, "partial": 0.4}'::jsonb)
    )
  );
end;
$$;

create or replace function public.mark_concept_exposed(concept_id uuid) returns void
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
  values (v_uid, mark_concept_exposed.concept_id, 'learning', private.now_for(v_uid), private.now_for(v_uid))
  on conflict (user_id, concept_id) where is_active do update
    set last_exposure_at = excluded.last_exposure_at,
        first_studied_at = coalesce(r.first_studied_at, excluded.first_studied_at),
        mastery_status = case when r.mastery_status = 'new' then 'learning' else r.mastery_status end;
end;
$$;

-- Finalize (now also records misconceptions) ---------------------------------------------------------

drop function public.finalize_attempt(uuid, uuid, uuid, int, jsonb, text);

-- Finalizes an attempt and applies its review transition atomically and idempotently (ADR-0003).
-- p_transition is computed by core scheduler.next; null for corrections. p_misconceptions is
-- computed by core misconceptions.match: { record: [{slug, statementMd, correctionMd, excerpt}], resolve: [id] }.
create function public.finalize_attempt(
  p_user_id uuid,
  p_attempt_id uuid,
  p_final_evaluation_id uuid,
  p_expected_version int,
  p_transition jsonb,
  p_config_version text,
  p_misconceptions jsonb default null
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := private.now_for(p_user_id);
  v_attempt public.attempts;
  v_evaluation public.evaluations;
  v_state public.review_state;
  v_event public.review_events;
  v_key text := 'graded:' || p_attempt_id;
  v_ai_id uuid;
  v_item jsonb;
  v_misconception_id uuid;
begin
  select * into v_attempt from public.attempts a where a.id = p_attempt_id and a.user_id = p_user_id for update;
  if not found then
    raise exception 'attempt not found' using errcode = 'P0002';
  end if;

  if v_attempt.status = 'finalized' then
    select * into v_event from public.review_events e where e.user_id = p_user_id and e.idempotency_key = v_key;
    select * into v_state from public.review_state r
    where r.user_id = p_user_id and r.concept_id = v_attempt.concept_id and r.is_active;
    return jsonb_build_object('replayed', true, 'state', private.review_state_json(v_state),
                              'event', case when v_event.id is null then null else
                                jsonb_build_object('id', v_event.id, 'eventType', v_event.event_type) end);
  end if;

  select * into v_evaluation from public.evaluations e where e.id = p_final_evaluation_id and e.attempt_id = v_attempt.id;
  if not found or v_evaluation.status <> 'completed' then
    raise exception 'final evaluation must be a completed evaluation of this attempt' using errcode = '22023';
  end if;

  update public.attempts a
  set status = 'finalized', final_evaluation_id = v_evaluation.id, finalized_at = v_now
  where a.id = v_attempt.id;

  if v_attempt.attempt_kind = 'correction' or p_transition is null then
    return jsonb_build_object('replayed', false, 'state', null, 'event', null);
  end if;

  select * into v_state from public.review_state r
  where r.user_id = p_user_id and r.concept_id = v_attempt.concept_id and r.is_active for update;
  if not found then
    insert into public.review_state (user_id, concept_id) values (p_user_id, v_attempt.concept_id) returning * into v_state;
  end if;
  if v_state.version <> p_expected_version then
    raise exception 'review state changed (expected version %, found %)', p_expected_version, v_state.version
      using errcode = 'P0409';
  end if;

  insert into public.review_events (user_id, concept_id, review_state_id, event_type, attempt_id, idempotency_key,
                                    grade, is_cold, prev_due_at, new_due_at, prev_interval_days, new_interval_days,
                                    prev_ease, new_ease, prev_status, new_status, config_version, occurred_at)
  values (p_user_id, v_attempt.concept_id, v_state.id, 'graded', v_attempt.id, v_key, v_evaluation.grade,
          v_attempt.is_cold, v_state.due_at, (p_transition ->> 'dueAt')::timestamptz, v_state.interval_days,
          (p_transition ->> 'intervalDays')::int, v_state.ease, (p_transition ->> 'ease')::numeric,
          v_state.mastery_status, p_transition ->> 'masteryStatus', p_config_version, v_now)
  returning * into v_event;

  update public.review_state r set
    mastery_status = p_transition ->> 'masteryStatus',
    interval_days = (p_transition ->> 'intervalDays')::int,
    ease = (p_transition ->> 'ease')::numeric,
    consecutive_cold_passes = (p_transition ->> 'consecutiveColdPasses')::int,
    lapse_count = (p_transition ->> 'lapseCount')::int,
    pre_lapse_interval_days = (p_transition ->> 'preLapseIntervalDays')::int,
    total_cold_attempts = (p_transition ->> 'totalColdAttempts')::int,
    last_cold_grade = p_transition ->> 'lastColdGrade',
    last_reviewed_at = (p_transition ->> 'lastReviewedAt')::timestamptz,
    due_at = (p_transition ->> 'dueAt')::timestamptz,
    manual_due_override = coalesce((p_transition ->> 'manualDueOverride')::boolean, false),
    version = r.version + 1,
    config_version = p_config_version
  where r.id = v_state.id
  returning * into v_state;

  -- Misconceptions diagnosed by the latest completed AI evaluation (WB-6), and resolutions.
  if p_misconceptions is not null then
    select e.id into v_ai_id from public.evaluations e
    where e.attempt_id = v_attempt.id and e.source = 'ai' and e.status = 'completed'
    order by e.created_at desc limit 1;

    if v_ai_id is not null then
      for v_item in
        select distinct on (value ->> 'slug') value
        from jsonb_array_elements(coalesce(p_misconceptions -> 'record', '[]'::jsonb))
        order by value ->> 'slug'
      loop
        insert into public.misconceptions as m (user_id, concept_id, slug, statement_md, correction_md,
                                                occurrence_count, first_seen_at, last_seen_at)
        values (p_user_id, v_attempt.concept_id, v_item ->> 'slug', left(v_item ->> 'statementMd', 300),
                left(v_item ->> 'correctionMd', 500), 1, v_now, v_now)
        on conflict (user_id, concept_id, slug) do update
          set occurrence_count = m.occurrence_count + 1,
              last_seen_at = greatest(m.last_seen_at, excluded.last_seen_at),
              status = 'active',
              resolved_at = null,
              correction_md = coalesce(m.correction_md, excluded.correction_md)
        returning m.id into v_misconception_id;

        insert into public.misconception_occurrences (misconception_id, evaluation_id, attempt_id, user_id, excerpt, created_at)
        values (v_misconception_id, v_ai_id, v_attempt.id, p_user_id, left(v_item ->> 'excerpt', 500), v_now);
      end loop;
    end if;

    update public.misconceptions m set status = 'resolved', resolved_at = v_now
    where m.user_id = p_user_id and m.concept_id = v_attempt.concept_id and m.status = 'active'
      and m.id in (select x::uuid from jsonb_array_elements_text(coalesce(p_misconceptions -> 'resolve', '[]'::jsonb)) x);
  end if;

  return jsonb_build_object('replayed', false, 'state', private.review_state_json(v_state),
                            'event', jsonb_build_object('id', v_event.id, 'eventType', v_event.event_type));
end;
$$;

-- Manual reschedule (SPACED_REPETITION §7, WB-3). Service role only; the Edge Function computes the
-- local-midnight due date with the core and passes the version it read.
create function public.apply_manual_override(
  p_user_id uuid,
  p_concept_id uuid,
  p_due_at timestamptz,
  p_reason text,
  p_client_key uuid,
  p_expected_version int
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := private.now_for(p_user_id);
  v_key text := 'override:' || p_client_key;
  v_state public.review_state;
  v_event public.review_events;
begin
  select * into v_event from public.review_events e where e.user_id = p_user_id and e.idempotency_key = v_key;
  if found then
    if v_event.concept_id <> p_concept_id then
      raise exception 'client key reused for a different concept' using errcode = '23505';
    end if;
    select * into v_state from public.review_state r
    where r.user_id = p_user_id and r.concept_id = p_concept_id and r.is_active;
    return jsonb_build_object('replayed', true, 'state', private.review_state_json(v_state),
                              'event', jsonb_build_object('id', v_event.id, 'eventType', v_event.event_type));
  end if;

  if p_reason is null or btrim(p_reason) = '' or char_length(p_reason) > 300 then
    raise exception 'a reason of 1 to 300 characters is required' using errcode = '22023';
  end if;

  select * into v_state from public.review_state r
  where r.user_id = p_user_id and r.concept_id = p_concept_id and r.is_active for update;
  if not found then
    raise exception 'this concept has no review schedule yet' using errcode = 'P0002';
  end if;
  if v_state.version <> p_expected_version then
    raise exception 'review state changed (expected version %, found %)', p_expected_version, v_state.version
      using errcode = 'P0409';
  end if;

  insert into public.review_events (user_id, concept_id, review_state_id, event_type, idempotency_key,
                                    prev_due_at, new_due_at, prev_interval_days, new_interval_days, prev_ease, new_ease,
                                    prev_status, new_status, reason, config_version, occurred_at)
  values (p_user_id, p_concept_id, v_state.id, 'manual_override', v_key, v_state.due_at, p_due_at,
          v_state.interval_days, v_state.interval_days, v_state.ease, v_state.ease, v_state.mastery_status,
          v_state.mastery_status, btrim(p_reason), v_state.config_version, v_now)
  returning * into v_event;

  update public.review_state r
  set due_at = p_due_at, manual_due_override = true, version = r.version + 1
  where r.id = v_state.id
  returning * into v_state;

  return jsonb_build_object('replayed', false, 'state', private.review_state_json(v_state),
                            'event', jsonb_build_object('id', v_event.id, 'eventType', v_event.event_type));
end;
$$;

-- Shared helpers -----------------------------------------------------------------------------------

create function private.accuracy_json(p_n bigint, p_pass bigint, p_partial bigint) returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'n', p_n, 'pass', p_pass, 'partial', p_partial,
    'strict', case when p_n = 0 then null else round(p_pass::numeric / p_n, 4) end,
    'lenient', case when p_n = 0 then null else round((p_pass + p_partial * 0.5)::numeric / p_n, 4) end
  );
$$;

-- Weak Box -----------------------------------------------------------------------------------------

-- Due today / overdue / upcoming reviews in the learner's timezone (WB-1, WB-2). Today and overdue are
-- ordered by priority (SPACED_REPETITION §6); upcoming by due date.
create function public.due_reviews(due_window text default 'today', page_size int default 100) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_now timestamptz := private.now_for(v_uid);
  v_tz text;
  v_today date;
  v_start_today timestamptz;
  v_start_tomorrow timestamptz;
  v_limit int := least(greatest(coalesce(page_size, 100), 1), 500);
begin
  if due_window not in ('today', 'overdue', 'upcoming') then
    raise exception 'due_window must be today, overdue, or upcoming' using errcode = '22023';
  end if;
  select coalesce((select s.timezone from public.user_settings s where s.user_id = v_uid), 'UTC') into v_tz;
  v_today := (v_now at time zone v_tz)::date;
  v_start_today := v_today::timestamp at time zone v_tz;
  v_start_tomorrow := (v_today + 1)::timestamp at time zone v_tz;

  return (
    with base as (
      select r.concept_id, r.mastery_status, r.due_at, r.interval_days, r.ease, r.last_cold_grade, r.lapse_count,
             r.last_reviewed_at, r.manual_due_override, r.version, c.title, sv.slug as service_slug, sv.name as service_name,
             (select count(*) from public.misconceptions m
              where m.user_id = v_uid and m.concept_id = r.concept_id and m.status = 'active')::int as misconceptions,
             case when r.due_at < v_start_today then 'overdue'
                  when r.due_at < v_start_tomorrow then 'today' else 'upcoming' end as bucket
      from public.review_state r
      join public.service_concepts c on c.id = r.concept_id
      join public.services sv on sv.id = c.service_id
      where r.user_id = v_uid and r.is_active and r.due_at is not null
        and c.status = 'published' and sv.status = 'published' and (c.visibility = 'shared' or c.owner_id = v_uid)
    ),
    scored as (
      select b.*, private.priority_score(b.mastery_status, b.last_cold_grade, b.ease, b.due_at, b.misconceptions, v_now) as priority
      from base b where b.bucket = due_window
    ),
    page as (
      select * from scored
      order by
        case when due_window = 'upcoming' then null else priority end desc nulls last,
        due_at, priority desc, concept_id
      limit v_limit
    )
    select jsonb_build_object(
      'now', v_now,
      'timezone', v_tz,
      'today', v_today,
      'counts', (select jsonb_build_object(
                   'today', count(*) filter (where bucket = 'today'),
                   'overdue', count(*) filter (where bucket = 'overdue'),
                   'upcoming', count(*) filter (where bucket = 'upcoming')) from base),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'conceptId', p.concept_id, 'conceptTitle', p.title, 'serviceSlug', p.service_slug,
          'serviceName', p.service_name, 'masteryStatus', p.mastery_status, 'dueAt', p.due_at,
          'intervalDays', p.interval_days, 'ease', p.ease, 'lastColdGrade', p.last_cold_grade,
          'lapseCount', p.lapse_count, 'lastReviewedAt', p.last_reviewed_at,
          'manualDueOverride', p.manual_due_override, 'activeMisconceptions', p.misconceptions,
          'priority', p.priority, 'version', p.version)
          order by case when due_window = 'upcoming' then null else p.priority end desc nulls last,
                   p.due_at, p.priority desc, p.concept_id)
        from page p
      ), '[]'::jsonb)
    )
  );
end;
$$;

-- A concept's full learning history (WB-4): every review event and attempt, oldest first.
create function public.concept_history(concept_id uuid) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  v_state public.review_state;
begin
  if not exists (select 1 from public.service_concepts c where c.id = concept_history.concept_id) then
    raise exception 'concept not found' using errcode = 'P0002';
  end if;
  select * into v_state from public.review_state r
  where r.user_id = v_uid and r.concept_id = concept_history.concept_id and r.is_active;

  return jsonb_build_object(
    'concept', (
      select jsonb_build_object('id', c.id, 'title', c.title, 'serviceSlug', sv.slug, 'serviceName', sv.name)
      from public.service_concepts c join public.services sv on sv.id = c.service_id
      where c.id = concept_history.concept_id
    ),
    'state', private.review_state_json(v_state),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'eventType', e.event_type, 'occurredAt', e.occurred_at, 'attemptId', e.attempt_id,
        'grade', e.grade, 'isCold', e.is_cold, 'prevDueAt', e.prev_due_at, 'newDueAt', e.new_due_at,
        'prevIntervalDays', e.prev_interval_days, 'newIntervalDays', e.new_interval_days,
        'prevEase', e.prev_ease, 'newEase', e.new_ease, 'prevStatus', e.prev_status, 'newStatus', e.new_status,
        'reason', e.reason, 'configVersion', e.config_version) order by e.occurred_at, e.id)
      from public.review_events e
      where e.user_id = v_uid and e.concept_id = concept_history.concept_id
    ), '[]'::jsonb),
    'attempts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'attemptKind', a.attempt_kind, 'parentAttemptId', a.parent_attempt_id, 'isCold', a.is_cold,
        'status', a.status, 'submittedAt', a.submitted_at, 'finalizedAt', a.finalized_at,
        'grade', f.grade, 'gradeSource', f.source, 'dimension', q.dimension, 'questionVersion', v.version,
        'promptMd', v.prompt_md) order by a.submitted_at, a.id)
      from public.attempts a
      join public.question_versions v on v.id = a.question_version_id
      join public.questions q on q.id = v.question_id
      left join public.evaluations f on f.id = a.final_evaluation_id
      where a.user_id = v_uid and a.concept_id = concept_history.concept_id
    ), '[]'::jsonb),
    'misconceptions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'slug', m.slug, 'statementMd', m.statement_md, 'correctionMd', m.correction_md,
        'status', m.status, 'occurrenceCount', m.occurrence_count, 'lastSeenAt', m.last_seen_at)
        order by m.last_seen_at desc, m.id)
      from public.misconceptions m
      where m.user_id = v_uid and m.concept_id = concept_history.concept_id
    ), '[]'::jsonb)
  );
end;
$$;

-- Active misconceptions; recurring ones (≥ 2 attempts, WB-6a) first.
create function public.recurring_misconceptions(include_single boolean default false) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'slug', m.slug, 'statementMd', m.statement_md, 'correctionMd', m.correction_md,
    'occurrenceCount', m.occurrence_count, 'recurring', m.occurrence_count >= 2,
    'firstSeenAt', m.first_seen_at, 'lastSeenAt', m.last_seen_at,
    'concept', jsonb_build_object('id', c.id, 'title', c.title, 'serviceSlug', sv.slug, 'serviceName', sv.name))
    order by m.occurrence_count desc, m.last_seen_at desc, m.id), '[]'::jsonb)
  from public.misconceptions m
  join public.service_concepts c on c.id = m.concept_id
  join public.services sv on sv.id = c.service_id
  where m.user_id = private.require_uid() and m.status = 'active'
    and (include_single or m.occurrence_count >= 2);
$$;

-- Dashboard ----------------------------------------------------------------------------------------

-- Dashboard figures (MASTERY_MODEL §6). Mirrors core analytics/metrics.ts (parity test P3-1).
create function public.dashboard_summary(certification_id uuid default null) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  v_now timestamptz := private.now_for(v_uid);
  v_settings public.user_settings;
  v_tz text;
  v_today date;
  v_start_today timestamptz;
  v_start_tomorrow timestamptz;
  v_window_start timestamptz;
  v_cert public.certifications;
  v_new_today int;
begin
  select * into v_settings from public.user_settings s where s.user_id = v_uid;
  v_tz := coalesce(v_settings.timezone, 'UTC');
  v_today := (v_now at time zone v_tz)::date;
  v_start_today := v_today::timestamp at time zone v_tz;
  v_start_tomorrow := (v_today + 1)::timestamp at time zone v_tz;
  v_window_start := (v_today - 29)::timestamp at time zone v_tz;

  select * into v_cert from public.certifications c
  where c.id = coalesce(dashboard_summary.certification_id, v_settings.active_certification_id);
  if not found then
    if dashboard_summary.certification_id is not null then
      raise exception 'certification not found' using errcode = 'P0002';
    end if;
    select * into v_cert from public.certifications c where c.status = 'active' order by c.code, c.exam_version limit 1;
  end if;

  select count(*) into v_new_today
  from (
    select a.concept_id from public.attempts a
    where a.user_id = v_uid and a.attempt_kind = 'initial'
    group by a.concept_id
    having (min(a.submitted_at) at time zone v_tz)::date = v_today
  ) started;

  return (
    with practicable as (
      select c.id, c.title, c.published_at, sv.slug as service_slug, sv.name as service_name
      from public.service_concepts c join public.services sv on sv.id = c.service_id
      where c.status = 'published' and sv.status = 'published' and (c.visibility = 'shared' or c.owner_id = v_uid)
    ),
    concepts as (
      select p.id, array_agg(distinct cc.exam_domain_id) as domain_ids
      from practicable p
      join public.concept_certifications cc on cc.concept_id = p.id
      join public.exam_domains d on d.id = cc.exam_domain_id and d.certification_id = v_cert.id
      group by p.id
    ),
    states as (
      select r.*,
             (select count(*) from public.misconceptions m
              where m.user_id = v_uid and m.concept_id = r.concept_id and m.status = 'active')::int as misconceptions
      from public.review_state r join practicable p on p.id = r.concept_id
      where r.user_id = v_uid and r.is_active
    ),
    facts as (
      select f.*, (f.finalized_at at time zone v_tz)::date - (f.prev_finalized_at at time zone v_tz)::date as gap
      from private.cold_attempt_facts f where f.user_id = v_uid
    ),
    window_facts as (select * from facts where finalized_at >= v_window_start),
    cert_facts as (select f.*, c.domain_ids from facts f join concepts c on c.id = f.concept_id),
    domain_rows as (
      select d.id, d.code, d.name, d.weight_pct, d.sort_order,
             (select count(*) from concepts c where d.id = any (c.domain_ids)) as published,
             (select count(distinct f.concept_id) from cert_facts f where d.id = any (f.domain_ids)) as covered,
             (select count(*) from cert_facts f where d.id = any (f.domain_ids)) as all_n,
             (select count(*) filter (where f.grade = 'pass') from cert_facts f where d.id = any (f.domain_ids)) as all_pass,
             (select count(*) from cert_facts f where d.id = any (f.domain_ids) and f.gap >= 7) as long_n,
             (select count(*) filter (where f.grade = 'pass') from cert_facts f where d.id = any (f.domain_ids) and f.gap >= 7) as long_pass,
             (select count(*) filter (where f.grade = 'partial') from cert_facts f where d.id = any (f.domain_ids) and f.gap >= 7) as long_partial,
             (select count(*) from window_facts f join concepts c on c.id = f.concept_id where d.id = any (c.domain_ids)) as win_n,
             (select count(*) filter (where f.grade = 'pass') from window_facts f join concepts c on c.id = f.concept_id where d.id = any (c.domain_ids)) as win_pass,
             (select count(*) filter (where f.grade = 'partial') from window_facts f join concepts c on c.id = f.concept_id where d.id = any (c.domain_ids)) as win_partial
      from public.exam_domains d where d.certification_id = v_cert.id
    ),
    domain_scores as (
      select dr.*,
             case when published = 0 then null else round(covered::numeric / published, 4) end as coverage,
             round(dr.weight_pct / 100.0
                   * coalesce(case when published = 0 then null else round(covered::numeric / published, 4) end, 0)
                   * case when long_n >= 10 then round(long_pass::numeric / long_n, 4)
                          else coalesce(case when all_n = 0 then null else round(all_pass::numeric / all_n, 4) end, 0) end,
                   4) as contribution
      from domain_rows dr
    ),
    activity as (
      select a.finalized_at as at, jsonb_build_object('type', 'attempt', 'at', a.finalized_at, 'conceptId', a.concept_id,
               'conceptTitle', p.title, 'grade', f.grade, 'isCold', a.is_cold) as item
      from public.attempts a
      join practicable p on p.id = a.concept_id
      join public.evaluations f on f.id = a.final_evaluation_id
      where a.user_id = v_uid and a.status = 'finalized' and a.attempt_kind = 'initial'
      union all
      select e.occurred_at, jsonb_build_object('type', 'override', 'at', e.occurred_at, 'conceptId', e.concept_id,
               'conceptTitle', p.title, 'newDueAt', e.new_due_at, 'reason', e.reason)
      from public.review_events e join practicable p on p.id = e.concept_id
      where e.user_id = v_uid and e.event_type = 'manual_override'
      union all
      select s.ended_at, jsonb_build_object('type', 'session', 'at', s.ended_at, 'scopeType', s.scope_type)
      from public.study_sessions s where s.user_id = v_uid and s.status = 'completed'
      union all
      select p.published_at, jsonb_build_object('type', 'published', 'at', p.published_at, 'conceptId', p.id,
               'conceptTitle', p.title)
      from practicable p where p.published_at is not null
    )
    select jsonb_build_object(
      'now', v_now,
      'today', v_today,
      'timezone', v_tz,
      'windowDays', 30,
      'certification', case when v_cert.id is null then null else jsonb_build_object(
        'id', v_cert.id, 'code', v_cert.code, 'examVersion', v_cert.exam_version, 'name', v_cert.name) end,
      'counts', jsonb_build_object(
        'dueToday', (select count(*) from states where due_at >= v_start_today and due_at < v_start_tomorrow),
        'overdue', (select count(*) from states where due_at < v_start_today),
        'newAvailable', least(
          (select count(*) from concepts c left join states s on s.concept_id = c.id
           where coalesce(s.mastery_status, 'new') = 'new'),
          greatest(coalesce(v_settings.daily_new_limit, 10) - v_new_today, 0)),
        'completedSessions', (select count(*) from public.study_sessions s
                              where s.user_id = v_uid and s.status = 'completed' and s.ended_at >= v_window_start),
        'recurringMisconceptions', (select count(*) from public.misconceptions m
                                    where m.user_id = v_uid and m.status = 'active' and m.occurrence_count >= 2)
      ),
      'coldAccuracy', (select private.accuracy_json(count(*), count(*) filter (where grade = 'pass'),
                                                    count(*) filter (where grade = 'partial')) from window_facts),
      'accuracyByWeek', (
        select jsonb_agg(jsonb_build_object('weekStart', v_today - 7 * w - 6) || (
                 select private.accuracy_json(count(*), count(*) filter (where grade = 'pass'),
                                              count(*) filter (where grade = 'partial'))
                 from facts f
                 where (f.finalized_at at time zone v_tz)::date between v_today - 7 * w - 6 and v_today - 7 * w)
               order by w desc)
        from generate_series(0, 7) w
      ),
      'retentionByInterval', (
        select jsonb_agg(jsonb_build_object('bucket', b.bucket) || (
                 select private.accuracy_json(count(*), count(*) filter (where grade = 'pass'),
                                              count(*) filter (where grade = 'partial'))
                 from window_facts f
                 where f.gap is not null and case when f.gap <= 1 then '1' when f.gap <= 6 then '2-6'
                                                  when f.gap <= 20 then '7-20' else '21+' end = b.bucket)
               order by b.ord)
        from (values (1, '1'), (2, '2-6'), (3, '7-20'), (4, '21+')) b (ord, bucket)
      ),
      'dimensionAccuracy', coalesce((
        select jsonb_agg(jsonb_build_object('dimension', dimension) ||
                         private.accuracy_json(n, pass, partial) order by dimension collate "C")
        from (select dimension, count(*) as n, count(*) filter (where grade = 'pass') as pass,
                     count(*) filter (where grade = 'partial') as partial
              from window_facts group by dimension) d
      ), '[]'::jsonb),
      'masteryDistribution', (
        select jsonb_build_object(
          'new', count(*) filter (where coalesce(s.mastery_status, 'new') = 'new'),
          'learning', count(*) filter (where s.mastery_status = 'learning'),
          'reviewing', count(*) filter (where s.mastery_status = 'reviewing'),
          'mastered', count(*) filter (where s.mastery_status = 'mastered'),
          'lapsed', count(*) filter (where s.mastery_status = 'lapsed'))
        from concepts c left join states s on s.concept_id = c.id
      ),
      'weakest', coalesce((
        select jsonb_agg(jsonb_build_object('conceptId', w.concept_id, 'conceptTitle', w.title,
                                            'serviceName', w.service_name, 'serviceSlug', w.service_slug,
                                            'masteryStatus', w.mastery_status, 'lastColdGrade', w.last_cold_grade,
                                            'dueAt', w.due_at, 'priority', w.priority)
                         order by w.priority desc, w.due_at nulls last, w.concept_id)
        from (
          select s.concept_id, p.title, p.service_name, p.service_slug, s.mastery_status, s.last_cold_grade, s.due_at,
                 private.priority_score(s.mastery_status, s.last_cold_grade, s.ease, s.due_at, s.misconceptions, v_now) as priority
          from states s join practicable p on p.id = s.concept_id
          where exists (select 1 from public.attempts a where a.user_id = v_uid and a.concept_id = s.concept_id
                          and a.attempt_kind = 'initial' and a.status = 'finalized')
          order by priority desc, s.due_at nulls last, s.concept_id
          limit 10
        ) w
      ), '[]'::jsonb),
      'domains', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', d.id, 'code', d.code, 'name', d.name, 'weightPct', d.weight_pct, 'published', d.published,
          'covered', d.covered, 'coverage', d.coverage,
          'performance', private.accuracy_json(d.win_n, d.win_pass, d.win_partial),
          'retention7', private.accuracy_json(d.long_n, d.long_pass, d.long_partial),
          'readinessContribution', d.contribution) order by d.sort_order, d.code)
        from domain_scores d
      ), '[]'::jsonb),
      'readiness', jsonb_build_object(
        'label', 'Estimate — not a prediction of exam results',
        'coldAttempts', (select count(*) from cert_facts),
        'threshold', 50,
        'visible', (select count(*) from cert_facts) >= 50,
        'value', case when (select count(*) from cert_facts) >= 50
                      then (select round(coalesce(sum(contribution), 0), 4) from domain_scores) end
      ),
      'recentActivity', coalesce((
        select jsonb_agg(item order by at desc) from (select * from activity order by at desc limit 20) recent
      ), '[]'::jsonb)
    )
  );
end;
$$;

-- Grants ---------------------------------------------------------------------------------------------

grant execute on function
  public.due_reviews(text, int),
  public.concept_history(uuid),
  public.recurring_misconceptions(boolean),
  public.dashboard_summary(uuid)
  to authenticated;

revoke all on function public.finalize_attempt(uuid, uuid, uuid, int, jsonb, text, jsonb) from public, anon, authenticated;
revoke all on function public.apply_manual_override(uuid, uuid, timestamptz, text, uuid, int) from public, anon, authenticated;
grant execute on function public.finalize_attempt(uuid, uuid, uuid, int, jsonb, text, jsonb) to service_role;
grant execute on function public.apply_manual_override(uuid, uuid, timestamptz, text, uuid, int) to service_role;
