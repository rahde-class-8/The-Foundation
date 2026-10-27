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

### `search_catalog(q text, domain_id uuid?, category_id uuid?, after text?, limit int = 24)`
Returns `{ items: ServiceCard[], next_cursor: string | null }`.
`ServiceCard = { id, slug, name, category, concept_count, matched_concepts: {id,title}[], progress: {reviewing_or_better, total} }`.

### `start_session(scope_type, scope_id?) → study_sessions row`
Validates the scope and closes any stale `active` session older than 12 h as `abandoned`.

### `next_questions(session_id, limit int = 5) → QuestionCandidate[]`
Returns **candidates without reference answers**. The core `selection.rank()` orders them (LEARNING: MASTERY_MODEL §5).
`QuestionCandidate = { question_version_id, concept_id, prompt_md, dimension, difficulty, review: { due_at, mastery_status, ease, lapse_count } | null, last_attempt_at | null }`.

### `submit_attempt(session_id, question_version_id, answer_md, client_key, attempt_kind = 'initial', parent_attempt_id?, answer_duration_ms?) → Attempt`
Idempotent on `client_key`. Computes `is_cold`. Returns `{ id, status: 'submitted', is_cold }`.

### `reveal_reference(attempt_id) → { reference_answer_md, rubric_points: {id, text, weight, critical}[] }`
SECURITY DEFINER. Requires the attempt to be owned by the caller and submitted.

### `mark_concept_exposed(concept_id) → void`
SECURITY DEFINER. Called when the learner expands a concept's explanation in the library. Sets `first_studied_at` (once) and `last_exposure_at`.

### `apply_review_transition(...)`
Internal: called only by Edge Functions (user JWT). Signature: DATA_MODEL §9. Errors: `P0409 conflict`, `P0403 forbidden`.

### `due_reviews(window text = 'today' | 'overdue' | 'upcoming', limit int = 50) → DueReview[]`
Uses `user_settings.timezone`. Ordered by priority (SPACED_REPETITION §6).

### `concept_history(concept_id) → { events: ReviewEvent[], attempts: AttemptSummary[] }`

### `dashboard_summary(certification_id) → DashboardSummary` (definitions: MASTERY_MODEL §6)

### `publish_concept(concept_id) → service_concepts row`
Owner only. Validates required fields, ≥1 citation, citations resolvable, and every published question with a valid rubric.
Increments `revision` and writes a `concept_revisions` snapshot.

## 4. Edge Functions

### `POST /evaluate-attempt`
```ts
req:  { attemptId: string }
res:  { evaluation: { id, status: 'completed', grade, rubricScore, confidence, feedback: EvaluationResult } }
    | { evaluation: { id, status: 'failed'|'invalid_response'|'skipped_budget'|'skipped_disabled', errorCode }, fallback: 'self_assessment' }
```
- Re-invocation for the same attempt: returns the latest completed AI evaluation if one exists (no second AI call) unless `{ retry: true }` is passed after a failure.
- Deadline: 30 s. The SPA shows "Evaluating…" with a "Grade it myself" action available immediately.

### `POST /finalize-attempt`
```ts
req: { attemptId: string; finalEvaluationId: string }
res: { reviewState: { conceptId, dueAt, intervalDays, masteryStatus }, event: { id, eventType: 'graded' }, replayed: boolean }
```
- Validates: the evaluation belongs to the attempt, is `completed`, and is the latest `self`/`override`, or the AI evaluation if none exists.
- Correction attempts: marks the attempt finalized; **no scheduling event** (`event: null`).
- Non-cold initial attempts (e.g. a re-practice of an already-due-later concept the same day): recorded, with `event_type = graded`, but the scheduler applies the *non-cold rule* (SPACED_REPETITION §5).
- Idempotency: `graded:{attemptId}`. A retry returns `replayed: true`.

### `POST /override-schedule`
```ts
req: { conceptId: string; dueOn: string /* YYYY-MM-DD local */; reason: string; clientKey: string }
res: { reviewState, event: { id, eventType: 'manual_override' }, replayed: boolean }
```

### `POST /ingest-source`
```ts
req: { importJobId: string }
res: { job: { id, status, progressPct, errorCode? } }
```
Processes up to N pages per invocation. The SPA re-invokes while `status = 'running'` and `cursor` is present (client-driven continuation; no background queue needed in the MVP).

### `POST /generate-drafts`
```ts
req: { passageIds: string[] /* 1..20, same user */; serviceId: string; maxConcepts?: number /* ≤5 */ }
res: { job: { id, status }, drafts: { conceptId, title, questionIds: string[] }[] }
```
All created rows have `status = 'draft'` and `origin = 'ai_draft'`.

## 5. Client data-layer conventions

- Query keys: `['services', filters]`, `['service', id]`, `['session', id, 'next']`, `['reviews', window]`, `['dashboard', certId]`.
- Mutations invalidate the minimal set of keys (for example, finalize → `['reviews']`, `['dashboard']`, `['service', serviceId]`).
- Optimistic updates: none for learning-state writes (the server is authoritative). They are allowed for settings.
- Generated DB types (`database.types.ts`) give compile-time safety for table access. Function contracts come from shared Zod schemas.
