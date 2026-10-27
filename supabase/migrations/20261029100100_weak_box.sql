-- Phase 3 schema: test clock, misconceptions, and analytics views (DATA_MODEL §4.3, MASTERY_MODEL §6).

-- Test clock -------------------------------------------------------------------------------------
-- Learning functions read time through private.now_for(user), which adds a per-user offset.
-- Offsets can only be set by the service role, and only where the 'test_clock' environment flag
-- exists. supabase/seed.sql sets it for local stacks; hosted projects never run the seed.

create table private.environment_flags (
  flag text primary key check (flag in ('test_clock')),
  created_at timestamptz not null default now()
);

create table private.test_clock (
  user_id uuid primary key references auth.users (id) on delete cascade,
  offset_seconds bigint not null check (abs(offset_seconds) <= 3650 * 86400),
  updated_at timestamptz not null default now()
);

create function private.now_for(p_uid uuid) returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select now() + coalesce(
    (select make_interval(secs => t.offset_seconds::double precision) from private.test_clock t where t.user_id = p_uid),
    interval '0'
  );
$$;

grant execute on function private.now_for(uuid) to authenticated, service_role;

create function public.set_test_clock(p_user_id uuid, p_offset_seconds bigint) returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from private.environment_flags where flag = 'test_clock') then
    raise exception 'the test clock is disabled in this environment' using errcode = '42501';
  end if;
  insert into private.test_clock (user_id, offset_seconds) values (p_user_id, p_offset_seconds)
  on conflict (user_id) do update set offset_seconds = excluded.offset_seconds, updated_at = now();
  return private.now_for(p_user_id);
end;
$$;

-- The learner's current time as the database sees it (Edge Functions schedule with this clock).
create function public.server_now(p_user_id uuid) returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select private.now_for(p_user_id);
$$;

revoke all on function public.set_test_clock(uuid, bigint), public.server_now(uuid) from public, anon, authenticated;
grant execute on function public.set_test_clock(uuid, bigint), public.server_now(uuid) to service_role;

-- Misconceptions -----------------------------------------------------------------------------------

create table public.misconceptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  concept_id uuid not null references public.service_concepts (id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  statement_md text not null check (char_length(statement_md) between 1 and 300),
  correction_md text check (char_length(correction_md) <= 500),
  status text not null default 'active' check (status in ('active', 'resolved')),
  occurrence_count int not null default 0 check (occurrence_count >= 0),
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, concept_id, slug),
  check ((status = 'resolved') = (resolved_at is not null)),
  check (last_seen_at >= first_seen_at)
);

create index misconceptions_active_idx on public.misconceptions (user_id, concept_id) where status = 'active';
create trigger set_updated_at before update on public.misconceptions
  for each row execute function private.set_updated_at();

create table public.misconception_occurrences (
  misconception_id uuid not null references public.misconceptions (id) on delete restrict,
  evaluation_id uuid not null references public.evaluations (id) on delete restrict,
  attempt_id uuid not null references public.attempts (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  excerpt text check (char_length(excerpt) <= 500),
  created_at timestamptz not null default now(),
  primary key (misconception_id, evaluation_id),
  unique (misconception_id, attempt_id)
);

create index misconception_occurrences_attempt_idx on public.misconception_occurrences (attempt_id);
create trigger forbid_change before update or delete on public.misconception_occurrences
  for each row execute function private.forbid_change();

alter table public.misconceptions enable row level security;
alter table public.misconception_occurrences enable row level security;
create policy "own rows" on public.misconceptions for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows" on public.misconception_occurrences for select to authenticated
  using (user_id = (select auth.uid()));
-- Written only by finalize_attempt (service role, ADR-0011).
grant select on public.misconceptions, public.misconception_occurrences to authenticated;

-- Backfill from AI evaluations recorded in Phase 2: the latest completed AI evaluation of each
-- finalized initial attempt, unless the learner overrode it to a Pass. Slugs were normalized when the
-- evaluation was stored; resolution is left to future reviews.
with diagnoses as (
  select a.user_id, a.concept_id, a.id as attempt_id, ai.id as evaluation_id, a.finalized_at,
         left(a.answer_md, 500) as excerpt,
         coalesce(m ->> 'knownSlug', m ->> 'proposedSlug') as slug,
         coalesce(
           (select k ->> 'statement' from jsonb_array_elements(coalesce(v.rubric -> 'knownMisconceptions', '[]'::jsonb)) k
            where k ->> 'slug' = m ->> 'knownSlug' limit 1),
           m ->> 'statement') as statement_md,
         m ->> 'correction' as correction_md
  from public.attempts a
  join public.question_versions v on v.id = a.question_version_id
  join public.evaluations f on f.id = a.final_evaluation_id
  join lateral (
    select e.* from public.evaluations e
    where e.attempt_id = a.id and e.source = 'ai' and e.status = 'completed'
    order by e.created_at desc limit 1
  ) ai on true
  cross join lateral jsonb_array_elements(coalesce(ai.feedback -> 'misconceptions', '[]'::jsonb)) m
  where a.status = 'finalized' and a.attempt_kind = 'initial'
    and not (f.source <> 'ai' and f.grade = 'pass')
),
valid as (
  select distinct on (user_id, concept_id, slug, attempt_id) *
  from diagnoses
  where slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80 and char_length(statement_md) between 1 and 300
  order by user_id, concept_id, slug, attempt_id
),
inserted as (
  insert into public.misconceptions (user_id, concept_id, slug, statement_md, correction_md, occurrence_count,
                                     first_seen_at, last_seen_at)
  select distinct on (user_id, concept_id, slug)
         user_id, concept_id, slug, statement_md, left(correction_md, 500),
         count(*) over (partition by user_id, concept_id, slug),
         min(finalized_at) over (partition by user_id, concept_id, slug),
         max(finalized_at) over (partition by user_id, concept_id, slug)
  from valid
  order by user_id, concept_id, slug, finalized_at
  returning id, user_id, concept_id, slug
)
insert into public.misconception_occurrences (misconception_id, evaluation_id, attempt_id, user_id, excerpt, created_at)
select i.id, v.evaluation_id, v.attempt_id, v.user_id, v.excerpt, v.finalized_at
from valid v join inserted i using (user_id, concept_id, slug);

-- Analytics building blocks (MASTERY_MODEL §6) -------------------------------------------------------
-- Not exposed through the API; used by the SECURITY DEFINER dashboard functions.

create view private.cold_attempt_facts as
select a.user_id, a.concept_id, a.id as attempt_id, a.finalized_at, e.grade, q.dimension,
       lag(a.finalized_at) over (partition by a.user_id, a.concept_id order by a.finalized_at, a.id) as prev_finalized_at
from public.attempts a
join public.evaluations e on e.id = a.final_evaluation_id
join public.question_versions v on v.id = a.question_version_id
join public.questions q on q.id = v.question_id
where a.attempt_kind = 'initial' and a.is_cold and a.status = 'finalized';

-- Weak Box priority (SPACED_REPETITION §6); mirrors core scheduler/priority.ts, rounded to 4 places.
create function private.priority_score(
  p_status text, p_last_cold_grade text, p_ease numeric, p_due_at timestamptz, p_misconceptions int, p_now timestamptz
) returns numeric
language sql
immutable
set search_path = ''
as $$
  select round((
    case when p_status = 'lapsed' then 4 else 0 end
    + case p_last_cold_grade when 'miss' then 3 when 'partial' then 1.5 else 0 end
    + least(greatest(coalesce(extract(epoch from (p_now - p_due_at)) / 86400.0, 0), 0), 14) / 7.0
    + (3.0 - p_ease)
    + 0.5 * least(coalesce(p_misconceptions, 0), 3)
  )::numeric, 4);
$$;

create index review_events_override_idx on public.review_events (user_id, occurred_at desc) where event_type = 'manual_override';
create index attempts_finalized_idx on public.attempts (user_id, finalized_at desc) where status = 'finalized';
