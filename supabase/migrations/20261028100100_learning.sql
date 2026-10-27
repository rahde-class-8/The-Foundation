-- Learning records (DATA_MODEL §4.3): settings, sessions, attempts, evaluations, review events.

create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete restrict,
  timezone text not null default 'UTC',
  ai_grading_enabled boolean not null default true,
  default_eval_mode text not null default 'ai_first' check (default_eval_mode in ('ai_first', 'self_only')),
  daily_new_limit int not null default 10 check (daily_new_limit between 0 and 100),
  daily_review_limit int not null default 100 check (daily_review_limit between 1 and 1000),
  active_certification_id uuid references public.certifications (id) on delete set null,
  scheduler_overrides jsonb not null default '{}'::jsonb check (jsonb_typeof(scheduler_overrides) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Rejects unknown IANA zones (Postgres raises on an invalid time zone name).
create function private.validate_timezone() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform now() at time zone new.timezone;
  return new;
exception when invalid_parameter_value then
  raise exception 'invalid time zone: %', new.timezone using errcode = '22023';
end;
$$;

create trigger validate_timezone before insert or update of timezone on public.user_settings
  for each row execute function private.validate_timezone();
create trigger set_updated_at before update on public.user_settings
  for each row execute function private.set_updated_at();

create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  scope_type text not null check (scope_type in ('service', 'concept', 'domain', 'due_reviews', 'weak', 'mixed')),
  -- Polymorphic and intentionally not a foreign key; validated by start_session.
  scope_id uuid,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'active') = (ended_at is null))
);

create index study_sessions_user_idx on public.study_sessions (user_id, status, started_at desc);
create trigger set_updated_at before update on public.study_sessions
  for each row execute function private.set_updated_at();

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  session_id uuid not null references public.study_sessions (id) on delete restrict,
  question_version_id uuid not null references public.question_versions (id) on delete restrict,
  concept_id uuid not null references public.service_concepts (id) on delete restrict,
  attempt_kind text not null check (attempt_kind in ('initial', 'correction')),
  parent_attempt_id uuid references public.attempts (id) on delete restrict,
  is_cold boolean not null,
  answer_md text not null check (char_length(answer_md) between 1 and 8000),
  client_key uuid not null,
  status text not null default 'submitted' check (status in ('submitted', 'evaluated', 'finalized')),
  final_evaluation_id uuid,
  reference_revealed_at timestamptz,
  answer_duration_ms int check (answer_duration_ms >= 0),
  submitted_at timestamptz not null default now(),
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_key),
  check ((attempt_kind = 'correction') = (parent_attempt_id is not null)),
  check (attempt_kind = 'initial' or not is_cold),
  check ((status = 'finalized') = (finalized_at is not null))
);

create index attempts_user_concept_idx on public.attempts (user_id, concept_id, submitted_at desc);
create index attempts_session_idx on public.attempts (session_id);
create index attempts_cold_idx on public.attempts (user_id, submitted_at) where is_cold;
create index attempts_parent_idx on public.attempts (parent_attempt_id) where parent_attempt_id is not null;

-- Answers and their context are immutable; nothing changes after finalization (DATA_MODEL §4.3).
create function private.guard_attempt_update() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'attempts cannot be deleted' using errcode = 'P0001';
  end if;
  if old.status = 'finalized' then
    raise exception 'attempt % is finalized', old.id using errcode = 'P0001';
  end if;
  if (new.user_id, new.session_id, new.question_version_id, new.concept_id, new.attempt_kind,
      new.parent_attempt_id, new.is_cold, new.answer_md, new.client_key, new.submitted_at)
     is distinct from
     (old.user_id, old.session_id, old.question_version_id, old.concept_id, old.attempt_kind,
      old.parent_attempt_id, old.is_cold, old.answer_md, old.client_key, old.submitted_at) then
    raise exception 'submitted answers are immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger guard_attempt_update before update or delete on public.attempts
  for each row execute function private.guard_attempt_update();
create trigger set_updated_at before update on public.attempts
  for each row execute function private.set_updated_at();

create table public.evaluations (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  source text not null check (source in ('ai', 'self', 'override')),
  status text not null
    check (status in ('completed', 'failed', 'invalid_response', 'skipped_budget', 'skipped_disabled')),
  grade text check (grade in ('pass', 'partial', 'miss')),
  rubric_score numeric(5, 2) check (rubric_score between 0 and 100),
  confidence numeric(3, 2) check (confidence between 0 and 1),
  feedback jsonb check (feedback is null or jsonb_typeof(feedback) = 'object'),
  overrides_evaluation_id uuid references public.evaluations (id) on delete restrict,
  override_reason text check (char_length(override_reason) <= 500),
  provider text,
  model text,
  prompt_version text,
  latency_ms int check (latency_ms >= 0),
  input_tokens int check (input_tokens >= 0),
  output_tokens int check (output_tokens >= 0),
  cost_usd numeric(10, 6) check (cost_usd >= 0),
  error_code text,
  raw_response_excerpt text check (char_length(raw_response_excerpt) <= 4000),
  created_at timestamptz not null default now(),
  check (status <> 'completed' or grade is not null),
  check (status = 'completed' or grade is null),
  check ((source = 'override') = (overrides_evaluation_id is not null)),
  check (source = 'ai' or status = 'completed')
);

create index evaluations_attempt_idx on public.evaluations (attempt_id, created_at);
create index evaluations_user_ai_idx on public.evaluations (user_id, created_at) where source = 'ai';

alter table public.attempts
  add constraint attempts_final_evaluation_fk
  foreign key (final_evaluation_id) references public.evaluations (id) on delete restrict;

create trigger forbid_change before update or delete on public.evaluations
  for each row execute function private.forbid_change();

create table public.review_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  concept_id uuid not null references public.service_concepts (id) on delete restrict,
  review_state_id uuid not null references public.review_state (id) on delete restrict,
  event_type text not null check (event_type in ('initialized', 'graded', 'manual_override', 'reset')),
  attempt_id uuid references public.attempts (id) on delete restrict,
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 200),
  grade text check (grade in ('pass', 'partial', 'miss')),
  is_cold boolean,
  prev_due_at timestamptz,
  new_due_at timestamptz,
  prev_interval_days int,
  new_interval_days int,
  prev_ease numeric(4, 2),
  new_ease numeric(4, 2),
  prev_status text,
  new_status text,
  reason text check (char_length(reason) <= 300),
  config_version text,
  occurred_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  check (event_type <> 'graded' or (attempt_id is not null and grade is not null)),
  check (event_type <> 'manual_override' or reason is not null)
);

create index review_events_concept_idx on public.review_events (user_id, concept_id, occurred_at);
create trigger forbid_change before update or delete on public.review_events
  for each row execute function private.forbid_change();

-- RLS: learners read their own records; every write goes through a function.
alter table public.user_settings enable row level security;
alter table public.study_sessions enable row level security;
alter table public.attempts enable row level security;
alter table public.evaluations enable row level security;
alter table public.review_events enable row level security;

create policy "own rows" on public.user_settings for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows" on public.study_sessions for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows" on public.attempts for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows" on public.evaluations for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows" on public.review_events for select to authenticated using (user_id = (select auth.uid()));

grant select on public.user_settings, public.study_sessions, public.attempts, public.evaluations, public.review_events
  to authenticated;
