-- Practice functions (API_CONTRACTS §3). Learner functions are SECURITY DEFINER with explicit
-- ownership checks; record_ai_evaluation and finalize_attempt are callable only by the service role,
-- so AI grades and review transitions can only come from the Edge Functions (ADR-0011).

-- A question can be practiced only when it, its concept, and its service are published (CONTENT_GOVERNANCE §3).
create function private.practicable_concept(p_concept_id uuid, p_uid uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.service_concepts c
    join public.services s on s.id = c.service_id
    where c.id = p_concept_id
      and c.status = 'published' and s.status = 'published'
      and (c.visibility = 'shared' or c.owner_id = p_uid)
  );
$$;

create function private.settings_for(p_uid uuid) returns public.user_settings
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_settings public.user_settings;
begin
  insert into public.user_settings (user_id) values (p_uid) on conflict (user_id) do nothing;
  select * into v_settings from public.user_settings where user_id = p_uid;
  return v_settings;
end;
$$;

-- Records that the learner saw a concept's reference answer or feedback (cold-recall exposure).
create function private.record_exposure(p_uid uuid, p_concept_id uuid) returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.review_state as r (user_id, concept_id, mastery_status, first_studied_at, last_exposure_at)
  values (p_uid, p_concept_id, 'learning', now(), now())
  on conflict (user_id, concept_id) where is_active do update
    set last_exposure_at = excluded.last_exposure_at,
        first_studied_at = coalesce(r.first_studied_at, excluded.first_studied_at),
        mastery_status = case when r.mastery_status = 'new' then 'learning' else r.mastery_status end;
$$;

create function private.require_uid() returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

grant execute on function private.require_uid() to authenticated, service_role;

-- Settings ---------------------------------------------------------------------------------------

create function public.get_settings() returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_settings public.user_settings := private.settings_for(private.require_uid());
begin
  return jsonb_build_object(
    'timezone', v_settings.timezone,
    'aiGradingEnabled', v_settings.ai_grading_enabled,
    'defaultEvalMode', v_settings.default_eval_mode,
    'dailyNewLimit', v_settings.daily_new_limit,
    'dailyReviewLimit', v_settings.daily_review_limit,
    'activeCertificationId', v_settings.active_certification_id
  );
end;
$$;

create function public.update_settings(
  timezone text,
  ai_grading_enabled boolean,
  default_eval_mode text,
  daily_new_limit int,
  daily_review_limit int
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
begin
  perform private.settings_for(v_uid);
  update public.user_settings s set
    timezone = update_settings.timezone,
    ai_grading_enabled = update_settings.ai_grading_enabled,
    default_eval_mode = update_settings.default_eval_mode,
    daily_new_limit = update_settings.daily_new_limit,
    daily_review_limit = update_settings.daily_review_limit
  where s.user_id = v_uid;
  return public.get_settings();
end;
$$;

-- Sessions ---------------------------------------------------------------------------------------

create function public.start_session(scope_type text, scope_id uuid default null) returns jsonb
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
  update public.study_sessions s set status = 'abandoned', ended_at = now()
  where s.user_id = v_uid and s.status = 'active' and s.started_at < now() - interval '12 hours';

  insert into public.study_sessions (user_id, scope_type, scope_id)
  values (v_uid, start_session.scope_type, start_session.scope_id)
  returning * into v_session;

  return jsonb_build_object('id', v_session.id, 'scopeType', v_session.scope_type, 'scopeId', v_session.scope_id,
                            'status', v_session.status, 'startedAt', v_session.started_at);
end;
$$;

create function public.session_state(session_id uuid) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id,
    'scopeType', s.scope_type,
    'scopeId', s.scope_id,
    'status', s.status,
    'startedAt', s.started_at,
    'endedAt', s.ended_at,
    'attempts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'attemptKind', a.attempt_kind,
        'parentAttemptId', a.parent_attempt_id,
        'isCold', a.is_cold,
        'status', a.status,
        'answerMd', a.answer_md,
        'questionVersionId', a.question_version_id,
        'conceptId', a.concept_id,
        'conceptTitle', c.title,
        'serviceName', sv.name,
        'promptMd', v.prompt_md,
        'dimension', q.dimension,
        'referenceRevealed', a.reference_revealed_at is not null,
        'finalEvaluationId', a.final_evaluation_id,
        'submittedAt', a.submitted_at,
        'finalizedAt', a.finalized_at,
        'evaluations', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', e.id, 'source', e.source, 'status', e.status, 'grade', e.grade,
            'rubricScore', e.rubric_score, 'confidence', e.confidence, 'feedback', e.feedback,
            'provider', e.provider, 'model', e.model, 'errorCode', e.error_code, 'createdAt', e.created_at
          ) order by e.created_at)
          from public.evaluations e where e.attempt_id = a.id
        ), '[]'::jsonb),
        'nextDueAt', (
          select ev.new_due_at from public.review_events ev
          where ev.user_id = a.user_id and ev.idempotency_key = 'graded:' || a.id
        )
      ) order by a.submitted_at)
      from public.attempts a
      join public.question_versions v on v.id = a.question_version_id
      join public.questions q on q.id = v.question_id
      join public.service_concepts c on c.id = a.concept_id
      join public.services sv on sv.id = c.service_id
      where a.session_id = s.id
    ), '[]'::jsonb)
  )
  from public.study_sessions s
  where s.id = session_state.session_id and s.user_id = private.require_uid();
$$;

create function public.end_session(session_id uuid) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
begin
  update public.study_sessions s set status = 'completed', ended_at = now()
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

-- What can be practiced right now: published services and domains with question counts, plus due/weak counts.
create function public.practice_scopes() returns jsonb
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
  v_end_of_today := ((((now() at time zone coalesce(v_settings.timezone, 'UTC'))::date) + 1)::timestamp)
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
      select count(*) from public.review_state r
      where r.user_id = v_uid and r.is_active and r.total_cold_attempts > 0
        and r.mastery_status in ('lapsed', 'learning') and private.practicable_concept(r.concept_id, v_uid)
    ),
    'totalQuestions', (
      select count(*) from public.questions q
      where q.status = 'published' and private.practicable_concept(q.concept_id, v_uid)
    )
  );
end;
$$;

-- Question candidates (ranked client-side by core selection.rank; MASTERY_MODEL §5) --------------

create function public.next_questions(session_id uuid) returns jsonb
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
  v_today := (now() at time zone coalesce(v_settings.timezone, 'UTC'))::date;
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
            else true
          end
        limit 300
      ) candidates
    ), '[]'::jsonb)
  );
end;
$$;

-- Attempts ---------------------------------------------------------------------------------------

create function private.attempt_json(a public.attempts) returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('id', a.id, 'status', a.status, 'isCold', a.is_cold, 'attemptKind', a.attempt_kind,
                            'parentAttemptId', a.parent_attempt_id, 'conceptId', a.concept_id,
                            'questionVersionId', a.question_version_id, 'submittedAt', a.submitted_at);
$$;

-- Persists an answer before any evaluation (brief §11). Idempotent on client_key (REC-3b).
create function public.submit_attempt(
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
    ) and (v_exposure is null or v_exposure <= now() - v_gap);
  end if;

  insert into public.attempts (user_id, session_id, question_version_id, concept_id, attempt_kind, parent_attempt_id,
                               is_cold, answer_md, client_key, answer_duration_ms)
  values (v_uid, v_session.id, submit_attempt.question_version_id, v_concept_id, submit_attempt.attempt_kind,
          submit_attempt.parent_attempt_id, v_cold, submit_attempt.answer_md, submit_attempt.client_key,
          submit_attempt.answer_duration_ms)
  returning * into v_attempt;

  return private.attempt_json(v_attempt);
end;
$$;

-- The reference answer and rubric, only for the owner of a submitted attempt (DATA_MODEL §6.3).
create function public.reveal_reference(attempt_id uuid) returns jsonb
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
    update public.attempts a set reference_revealed_at = now() where a.id = v_attempt.id;
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

create function private.evaluation_json(e public.evaluations) returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('id', e.id, 'attemptId', e.attempt_id, 'source', e.source, 'status', e.status,
                            'grade', e.grade, 'rubricScore', e.rubric_score, 'confidence', e.confidence,
                            'feedback', e.feedback, 'provider', e.provider, 'model', e.model,
                            'errorCode', e.error_code, 'overridesEvaluationId', e.overrides_evaluation_id,
                            'createdAt', e.created_at);
$$;

-- Self-assessment, or an override when a completed AI grade exists (GRADING_RUBRICS §6–§7).
create function public.submit_self_evaluation(
  attempt_id uuid,
  grade text,
  ticks jsonb default null,
  reason text default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
  v_attempt public.attempts;
  v_ai_id uuid;
  v_evaluation public.evaluations;
begin
  if submit_self_evaluation.grade not in ('pass', 'partial', 'miss') then
    raise exception 'invalid grade' using errcode = '22023';
  end if;
  if submit_self_evaluation.ticks is not null and jsonb_typeof(submit_self_evaluation.ticks) <> 'object' then
    raise exception 'ticks must be an object' using errcode = '22023';
  end if;

  select * into v_attempt from public.attempts a
  where a.id = submit_self_evaluation.attempt_id and a.user_id = v_uid for update;
  if not found then
    raise exception 'attempt not found' using errcode = 'P0002';
  end if;
  if v_attempt.status = 'finalized' then
    raise exception 'attempt is finalized; grades are frozen' using errcode = '22023';
  end if;

  select e.id into v_ai_id from public.evaluations e
  where e.attempt_id = v_attempt.id and e.source = 'ai' and e.status = 'completed'
  order by e.created_at desc limit 1;

  insert into public.evaluations (attempt_id, user_id, source, status, grade, feedback, overrides_evaluation_id, override_reason)
  values (v_attempt.id, v_uid, case when v_ai_id is null then 'self' else 'override' end, 'completed',
          submit_self_evaluation.grade,
          jsonb_build_object('schemaVersion', 1, 'kind', 'self', 'ticks', coalesce(submit_self_evaluation.ticks, '{}'::jsonb)),
          v_ai_id, submit_self_evaluation.reason)
  returning * into v_evaluation;

  update public.attempts a set status = 'evaluated' where a.id = v_attempt.id and a.status = 'submitted';
  return private.evaluation_json(v_evaluation);
end;
$$;

-- Service role only -------------------------------------------------------------------------------

create function public.record_ai_evaluation(p_user_id uuid, p_attempt_id uuid, p_evaluation jsonb) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_attempt public.attempts;
  v_evaluation public.evaluations;
begin
  select * into v_attempt from public.attempts a where a.id = p_attempt_id and a.user_id = p_user_id for update;
  if not found then
    raise exception 'attempt not found' using errcode = 'P0002';
  end if;
  if v_attempt.status = 'finalized' then
    raise exception 'attempt is finalized' using errcode = '22023';
  end if;

  insert into public.evaluations (attempt_id, user_id, source, status, grade, rubric_score, confidence, feedback,
                                  provider, model, prompt_version, latency_ms, input_tokens, output_tokens,
                                  cost_usd, error_code, raw_response_excerpt)
  values (v_attempt.id, p_user_id, 'ai', p_evaluation ->> 'status', p_evaluation ->> 'grade',
          (p_evaluation ->> 'rubricScore')::numeric, (p_evaluation ->> 'confidence')::numeric,
          p_evaluation -> 'feedback', p_evaluation ->> 'provider', p_evaluation ->> 'model',
          p_evaluation ->> 'promptVersion', (p_evaluation ->> 'latencyMs')::int,
          (p_evaluation ->> 'inputTokens')::int, (p_evaluation ->> 'outputTokens')::int,
          (p_evaluation ->> 'costUsd')::numeric, p_evaluation ->> 'errorCode',
          left(p_evaluation ->> 'rawResponseExcerpt', 4000))
  returning * into v_evaluation;

  if v_evaluation.status = 'completed' then
    update public.attempts a set status = 'evaluated' where a.id = v_attempt.id and a.status = 'submitted';
    perform private.record_exposure(p_user_id, v_attempt.concept_id);
  end if;
  return private.evaluation_json(v_evaluation);
end;
$$;

create function private.review_state_json(r public.review_state) returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when r.id is null then null else jsonb_build_object(
    'conceptId', r.concept_id, 'masteryStatus', r.mastery_status, 'intervalDays', r.interval_days, 'ease', r.ease,
    'consecutiveColdPasses', r.consecutive_cold_passes, 'lapseCount', r.lapse_count,
    'preLapseIntervalDays', r.pre_lapse_interval_days, 'totalColdAttempts', r.total_cold_attempts,
    'lastColdGrade', r.last_cold_grade, 'lastReviewedAt', r.last_reviewed_at, 'dueAt', r.due_at,
    'manualDueOverride', r.manual_due_override, 'version', r.version) end;
$$;

-- Finalizes an attempt and applies its review transition atomically and idempotently (ADR-0003).
-- p_transition is computed by core scheduler.next; null for corrections.
create function public.finalize_attempt(
  p_user_id uuid,
  p_attempt_id uuid,
  p_final_evaluation_id uuid,
  p_expected_version int,
  p_transition jsonb,
  p_config_version text
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_attempt public.attempts;
  v_evaluation public.evaluations;
  v_state public.review_state;
  v_event public.review_events;
  v_key text := 'graded:' || p_attempt_id;
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
  set status = 'finalized', final_evaluation_id = v_evaluation.id, finalized_at = now()
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
                                    prev_ease, new_ease, prev_status, new_status, config_version)
  values (p_user_id, v_attempt.concept_id, v_state.id, 'graded', v_attempt.id, v_key, v_evaluation.grade,
          v_attempt.is_cold, v_state.due_at, (p_transition ->> 'dueAt')::timestamptz, v_state.interval_days,
          (p_transition ->> 'intervalDays')::int, v_state.ease, (p_transition ->> 'ease')::numeric,
          v_state.mastery_status, p_transition ->> 'masteryStatus', p_config_version)
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

  return jsonb_build_object('replayed', false, 'state', private.review_state_json(v_state),
                            'event', jsonb_build_object('id', v_event.id, 'eventType', v_event.event_type));
end;
$$;

-- Grants.
grant execute on function
  public.get_settings(),
  public.update_settings(text, boolean, text, int, int),
  public.start_session(text, uuid),
  public.session_state(uuid),
  public.end_session(uuid),
  public.next_questions(uuid),
  public.practice_scopes(),
  public.submit_attempt(uuid, uuid, text, uuid, text, uuid, int),
  public.reveal_reference(uuid),
  public.submit_self_evaluation(uuid, text, jsonb, text)
  to authenticated;

revoke all on function public.record_ai_evaluation(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.finalize_attempt(uuid, uuid, uuid, int, jsonb, text) from public, anon, authenticated;
grant execute on function public.record_ai_evaluation(uuid, uuid, jsonb) to service_role;
grant execute on function public.finalize_attempt(uuid, uuid, uuid, int, jsonb, text) to service_role;
grant execute on function private.attempt_json(public.attempts), private.evaluation_json(public.evaluations),
  private.review_state_json(public.review_state), private.record_exposure(uuid, uuid) to service_role;
