# API Contracts

**Status:** Draft for approval. Shapes are TypeScript-style. Each is mirrored by a Zod schema in `_shared/core/contracts/` and shared with the SPA.

## 1. Access patterns

| Pattern | Used for | Auth |
|---|---|---|
| PostgREST table reads | Catalog browse, history views, settings | User JWT + RLS |
| PostgREST table writes | `user_settings`, `study_sessions`, self/override `evaluations`, notes, import job creation | User JWT + RLS + CHECK/trigger guards |
| Postgres RPC | Atomic or privileged-read operations | User JWT; SECURITY DEFINER where noted |
| Edge Functions | AI calls, scheduling orchestration, file processing | User JWT verified (`verify_jwt = true`) |

## 2. Error envelope (Edge Functions)

```ts
type ApiError = {
  error: {
    code: 'validation_failed' | 'not_found' | 'forbidden' | 'conflict' | 'rate_limited'
        | 'ai_unavailable' | 'ai_invalid_response' | 'budget_exceeded' | 'unsupported_file' | 'internal';
    message: string;          // safe for display
    requestId: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
};
```

HTTP status: 400 validation, 403 forbidden, 404 not found, 409 conflict, 429 rate limited, 502 AI upstream, 500 internal.
`ai_unavailable` responses still include `fallback: 'self_assessment'`.

## 3. RPCs (Postgres functions)

### `search_catalog(q text?, domain_id uuid?, category_id uuid?, after text?, page_size int = 24)` *(implemented, Phase 1)*
Returns `{ items: ServiceCard[], nextCursor: string | null }`, ordered by category then name (keyset pagination; `page_size` clamped to 1–100).
`ServiceCard = { id, slug, name, aliases, summaryMd, status, category: {id, slug, name}, conceptCount, progress: {reviewingOrBetter, studied}, matchedConcepts: {id, slug, title}[] }`.
Search: every term is prefix-matched against names, aliases, and slugs (`simple` config) and against concept text (`english` config).
A concept is "matched" when it satisfies the query itself or completes it with its service ("lambda concurrency"). Invalid cursors raise `22023`.

### `service_profile(service_slug text, provider text = 'aws')` *(implemented)*
Returns the service with `dimensions` (the eight mastery dimensions, null when unauthored), `concepts` (with `domains`, `citations` including a derived `trustTier`, the caller's `progress`, and `questionCount`), and `related` services, or `null` if not found or not visible.

### `catalog_facets()` *(implemented)*
Returns `{ categories, certifications: [{ …, domains }] }` for the library filters.

### `import_catalog(p_catalog jsonb, p_owner_id uuid)` *(implemented; service role only)*
Atomic, idempotent sync of `content/catalog` (built by `scripts/catalog-import.ts`). Returns the number of rows changed per table; a re-run of the same catalog returns all zeros.

### Practice RPCs *(implemented, Phase 2; `supabase/migrations/20261028100200_practice_rpc.sql`)*
All return `jsonb` and act on `auth.uid()`; ownership is checked in every function.

| RPC | Returns / notes |
|---|---|
| `get_settings()` | Settings with defaults when no row exists |
| `update_settings(timezone, ai_grading_enabled, default_eval_mode, daily_new_limit, daily_review_limit)` | Validates the IANA timezone and limits |
| `practice_scopes()` | Published services and concepts available for practice |
| `start_session(scope_type, scope_id?)` | Validates the scope; closes stale `active` sessions older than 12 h as `abandoned` |
| `session_state(session_id)` | Session with its attempts and evaluations (no reference answers), for resume |
| `next_questions(session_id)` | `{ sessionStatus, endOfToday, newConceptsRemaining, candidates[] }`, **without reference answers**; ranked in the SPA by core `selection.rank()` |
| `submit_attempt(session_id, question_version_id, answer_md, client_key, attempt_kind = 'initial', parent_attempt_id?, answer_duration_ms?)` | Idempotent on `client_key`; computes `is_cold`; at most 2 corrections per attempt |
| `reveal_reference(attempt_id)` | `{ referenceAnswerMd, rubric }` after submit; records an exposure |
| `submit_self_evaluation(attempt_id, grade, ticks?, reason?)` | `source = 'override'` when a completed AI evaluation exists, otherwise `self` |
| `end_session(session_id)` | Session summary |
| `record_ai_evaluation(p_user_id, p_attempt_id, p_evaluation)` | **Service role only** (ADR-0011) |
| `finalize_attempt(p_user_id, p_attempt_id, p_final_evaluation_id, p_expected_version, p_transition, p_config_version)` | **Service role only.** Atomic finalize + review event + `review_state` update; replays when already finalized; `P0409` on version conflict |

### `mark_concept_exposed(concept_id) → void` *(implemented)*
SECURITY DEFINER. Called when the learner expands a concept's explanation in the library. Sets `first_studied_at` (once) and `last_exposure_at`.

### `apply_review_transition(...)`
Implemented as `finalize_attempt` (above), called with the service role by `finalize-attempt` (ADR-0011).
Since Phase 3 it takes `p_misconceptions jsonb` (`{ record: [{slug, statementMd, correctionMd, excerpt}], resolve: [id] }`),
computed by core `misconceptions/match.ts` and applied in the same transaction.

### Weak Box and dashboard RPCs *(implemented, Phase 3; `supabase/migrations/20261029100200_weak_box_rpc.sql`)*

| RPC | Returns / notes |
|---|---|
| `due_reviews(due_window = 'today', page_size = 100)` | `{ now, timezone, today, counts: {today, overdue, upcoming}, items: DueReview[] }`. Windows by local day in `user_settings.timezone`; today and overdue ordered by priority desc, due date, concept id (SPACED_REPETITION §6); upcoming by due date. `page_size` is clamped to 1–500. (`window` is a reserved word in SQL, hence `due_window`.) |
| `concept_history(concept_id)` | `{ concept, state, events, attempts, misconceptions }`, events and attempts oldest first (WB-4) |
| `recurring_misconceptions(include_single = false)` | Active misconceptions with their concept; recurring ones (≥ 2 attempts) first |
| `dashboard_summary(certification_id?)` | DASH-1…7 figures (MASTERY_MODEL §6); defaults to the learner's active certification, then the first active one |
| `apply_manual_override(p_user_id, p_concept_id, p_due_at, p_reason, p_client_key, p_expected_version)` | **Service role only.** Idempotent on `override:{client_key}`; `P0409` on a stale version, `P0002` without a schedule |
| `set_test_clock(p_user_id, p_offset_seconds)`, `server_now(p_user_id)` | **Service role only**; the test clock works only where the `test_clock` flag is seeded (ADR-0012) |

### Content RPCs *(implemented, Phase 4; `supabase/migrations/20261030100200_content_import_rpc.sql`)*

| RPC | Returns / notes |
|---|---|
| `create_upload_source(title, byte_size, sha256)` | `{ sourceId, storagePath, job }`. Rejects `file_too_large`, `duplicate_source`, `rate_limited` (10 per day) before the upload; the file then goes to Storage at `storagePath` |
| `create_note_source(title, body_md)` | `{ sourceId, job }` (≤ 50,000 characters) |
| `content_overview()` | `{ isOwner, sources (with latest job), drafts, stale }` for `/content` |
| `search_passages(q?, source_id?, page_size = 50)` | Passages from the caller's own or shared sources; full-text when `q` is given |
| `draft_detail(concept_id)` | Owner only: draft fields, domains, cited passages, questions with reference answers and rubrics |
| `update_draft(concept_id, title, summary_md, explanation_md, limitations_md, domain_ids, questions)` | Owner only; changed questions get a new immutable version (ADR-0006) |
| `publish_concept(concept_id)` | Owner only. Validates: published service, summary and explanation, ≥ 1 citation, no citation to another user's private passage (CNT-7a), ≥ 1 question, every rubric with a critical point, no placeholder text (`TODO`, `TBD`, `[[…]]`). Publishes the questions, increments the revision, writes `concept_revisions` |
| `reject_draft(concept_id)` | Owner only; retires the draft |
| `claim_import_job`, `record_import_progress`, `finish_import_job`, `start_draft_job`, `create_drafts` | **Service role only**, used by `ingest-source` and `generate-drafts` (ADR-0011). A recorded batch releases the job; a job whose call crashed resumes after two minutes |

## 4. Edge Functions

### `POST /evaluate-attempt` *(implemented, Phase 2)*
```ts
req:  { attemptId: string }
res:  { evaluation: { id, status: 'completed', grade, rubricScore, confidence, feedback: EvaluationResult } }
    | { evaluation: { id, status: 'failed'|'invalid_response'|'skipped_budget'|'skipped_disabled', errorCode }, fallback: 'self_assessment' }
```
- Re-invocation for the same attempt: returns the latest completed AI evaluation if one exists (no second AI call) unless `{ retry: true }` is passed after a failure.
- Timeouts: 30 s per provider attempt, 45 s overall deadline, up to 2 retries with backoff (`AI_TIMEOUT_MS`, `AI_DEADLINE_MS`, `AI_MAX_RETRIES`). The SPA shows "Evaluating…" with a "Grade it myself" action available immediately.

### `POST /finalize-attempt` *(implemented, Phase 2)*
```ts
req: { attemptId: string; finalEvaluationId: string }
res: { reviewState: { conceptId, dueAt, intervalDays, masteryStatus }, event: { id, eventType: 'graded' }, replayed: boolean }
```
- Validates: the evaluation belongs to the attempt, is `completed`, and is the latest `self`/`override`, or the AI evaluation if none exists.
- Correction attempts: marks the attempt finalized; **no scheduling event** (`event: null`).
- Non-cold initial attempts (e.g. a re-practice of an already-due-later concept the same day): recorded, with `event_type = graded`, but the scheduler applies the *non-cold rule* (SPACED_REPETITION §5).
- Idempotency: `graded:{attemptId}`. A retry returns `replayed: true`.

### `POST /override-schedule` *(implemented, Phase 3)*
```ts
req: { conceptId: string; dueOn: string /* YYYY-MM-DD local */; reason: string; clientKey: string }
res: { reviewState: { conceptId, masteryStatus, intervalDays, dueAt, manualDueOverride }, event: { id, eventType: 'manual_override' }, replayed: boolean }
```
- `dueOn` must be today or later (learner's local date) and within 365 days; `reason` 1–300 characters.
- Errors: `validation_failed` (bad date or reason), `not_found` (no schedule yet), `conflict` (changed twice concurrently).
- A retry with the same `clientKey` returns `replayed: true` and writes no second event (P3-4).

### `POST /ingest-source` *(implemented, Phase 4)*
```ts
req: { jobId: string; restart?: boolean }
res: { job: JobView /* id, status, progressPct, passageCount, errorCode, hasMore, … */; busy?: boolean }
```
- One batch per call: at most 50 pages or about 1 s of extraction (ADR-0001 spike). The SPA calls again while `job.hasMore`.
- First batch: size and `%PDF-` magic bytes, SHA-256 against other sources, then page count. Failures finish the job with a
  typed `errorCode` (CONTENT_GOVERNANCE §5) and delete the stored file.
- `restart: true` re-runs a finished job; passages are deduplicated by hash (P4-1).

### `POST /generate-drafts` *(implemented, Phase 4)*
```ts
req: { passageIds: string[] /* 1..20, own or shared */; serviceId: string; maxConcepts?: number /* 1..5, default 3 */ }
res: { job: JobView, drafts: { conceptId, title, questionCount }[], rejected: { title, reason }[] }
```
- Owner only. All created rows are private with `status = 'draft'` and `origin = 'ai_draft'`.
- Drafts citing passages that were not selected are rejected; if none remain the job fails with `citation_mismatch`.
- AI errors finish the job with `ai_unavailable` or `ai_invalid_response`. Locally the mock drafter is used.

## 5. Client data-layer conventions

- Query keys: `['services', filters]`, `['service', id]`, `['session', id, 'next']`, `['reviews', window]`, `['dashboard', certId]`.
- Mutations invalidate the minimal set of keys (for example, finalize → `['reviews']`, `['dashboard']`, `['service', serviceId]`).
- Optimistic updates: none for learning-state writes (the server is authoritative). They are allowed for settings.
- Generated DB types (`database.types.ts`) give compile-time safety for table access. Function contracts come from shared Zod schemas.
