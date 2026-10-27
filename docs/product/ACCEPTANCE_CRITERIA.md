# Acceptance Criteria

**Status:** Draft for approval. Each criterion names its test layer:
U = unit (Vitest), C = component (RTL), D = database (pgTAP / integration), E = end-to-end (Playwright).

## Cross-cutting invariants

| ID | Criterion | Layer |
|---|---|---|
| X-1 | Every learner-owned table has RLS enabled. A second test user cannot read or write the first user's rows. | D |
| X-2 | The `anon` role can read no table (there is no public data). | D |
| X-3 | No service-role key or AI API key appears in the client bundle (build-output scan). | E/CI |
| X-4 | All timestamps are `timestamptz` and are written in UTC. | D |
| X-5 | Learning-history tables (`attempts`, `evaluations`, `review_events`) reject UPDATE/DELETE of historical fields. | D |

## Authentication

| ID | Story | Criterion | Layer |
|---|---|---|---|
| AUTH-1a | AUTH-1 | Unauthenticated access to any app route redirects to `/login`. | E |
| AUTH-2a | AUTH-2 | A sign-up API call is rejected (signups disabled in config). | D |

## Service Library

| ID | Story | Criterion | Layer |
|---|---|---|---|
| LIB-1a | LIB-1 | `/services` lists published services grouped by category, 24 per page by default, with stable ordering. | C/E |
| LIB-2a | LIB-2 | Filtering by a domain returns only services having ≥1 published concept mapped to that domain. | D/C |
| LIB-3a | LIB-3 | Searching "elb" finds Elastic Load Balancing via an alias. Searching a concept phrase returns the parent service with the matching concept highlighted. | D/E |
| LIB-4a | LIB-4 | `/services/:id` renders all eight dimensions. A missing dimension renders "Not yet authored", never blank. | C |
| LIB-5a | LIB-5 | Each published concept displays ≥1 citation. Citations show a source-type badge. | C/D |
| LIB-7a | LIB-7 | Service-level progress is shown as "n of m concepts at status ≥ reviewing", never a single "mastered" flag. | U/C |
| LIB-8a | LIB-8 | `user_note`/`user_upload` sources render with a distinct "Your notes" badge and are never labeled "AWS". | C |
| LIB-Xa | — | An unknown `:id` renders a not-found state, not a crash. | E |

## Active Recall

| ID | Story | Criterion | Layer |
|---|---|---|---|
| REC-2a | REC-2 | Before submission, no network response to the client contains `reference_answer` or rubric expected points. | E (network assertion) / D |
| REC-3a | REC-3 | An attempt row with status `submitted` exists before the evaluation request starts. If the evaluation function is killed, the attempt remains and the UI offers retry or self-assessment. | D/E |
| REC-3b | REC-3 | A double-submit (same client idempotency key) creates exactly one attempt. | D |
| REC-4a | REC-4 | The AI response is schema-validated. An invalid response is stored as `evaluation.status = invalid_response` and falls back to self-assessment. | U/D |
| REC-4b | REC-4 | The evaluation stores provider, model, prompt version, rubric version, latency, token usage, and confidence. | D |
| REC-5a | REC-5 | With the AI provider mocked to time out, the learner completes the question via self-assessment with no dead end. | E |
| REC-6a | REC-6 | An override creates a new `evaluations` row with `source = override` referencing the AI evaluation. The AI row is unchanged. | D |
| REC-7a | REC-7 | Correction attempts have `attempt_kind = correction` and do not change `review_state.interval_days`. | D/U |
| REC-8a | REC-8 | Finalizing an attempt produces exactly one `review_events` row, even if the finalize call is retried 3 times. | D |
| REC-9a | REC-9 | The practice loop is completable keyboard-only: ⌘/Ctrl+Enter submits, 1/2/3 self-grade, N goes to the next question. | E |
| REC-10a | REC-10 | Reloading mid-question restores the draft answer (local) or the submitted attempt state (server). | E |

## Weak Box

| ID | Story | Criterion | Layer |
|---|---|---|---|
| WB-1a | WB-1 | "Due today" uses the learner's timezone. A review due at 23:30 local time is due today, not tomorrow. | U/D |
| WB-2a | WB-2 | Ordering follows the priority score in SPACED_REPETITION §6. Ties are broken deterministically. | U |
| WB-3a | WB-3 | A manual override sets `due_at`, records a `review_events` row with `event_type = manual_override`, the previous due date, and the reason. | D |
| WB-4a | WB-4 | History shows every event in chronological order. Nothing is deleted when a concept is re-versioned. | D/C |
| WB-6a | WB-6 | A misconception diagnosed on ≥2 distinct attempts is flagged as recurring. | U/D |
| SR-* | — | All scheduler boundary cases in SPACED_REPETITION §8 pass. | U |

## Dashboard

| ID | Story | Criterion | Layer |
|---|---|---|---|
| DASH-3a | DASH-3 | Cold-recall accuracy equals cold Pass ÷ cold finalized attempts over the selected window (fixture-verified). | U/D |
| DASH-6a | DASH-6 | Domain coverage = distinct concepts mapped to the domain with ≥1 cold finalized attempt ÷ published concepts mapped to the domain. | U/D |
| DASH-7a | DASH-7 | The readiness widget always renders the "Estimate — not a prediction of exam results" label. | C |

## Content Import

| ID | Story | Criterion | Layer |
|---|---|---|---|
| CNT-2a | CNT-2 | Files over 20 MB, over 300 pages, or not `application/pdf` (by magic bytes, not extension) are rejected before processing. | U/D/E |
| CNT-4a | CNT-4 | Every passage stores `source_id`, `page_start`/`page_end` (PDF), `char_start`/`char_end`, and a content hash. | D |
| CNT-6a | CNT-6 | AI-generated concepts are created with `status = draft` and cannot be selected for practice until approved. | D |
| CNT-7a | CNT-7 | Publishing fails if any cited passage does not exist or belongs to another user. | D |
| CNT-8a | CNT-8 | Encrypted, corrupt, zero-page, image-only, and renamed non-PDF files each produce a failed `import_jobs` row with a typed error code. | U/E |
| CNT-9a | — | Passage text containing prompt-injection strings ("ignore previous instructions…") does not alter generation behavior or trigger any write outside the job's own draft rows (adversarial fixture). | U |
| CNT-10a | — | Imported content renders as sanitized Markdown. `<script>`, inline event handlers, and `javascript:` URLs are stripped. | C |

## Definition of Done (brief §14) → E2E "golden path"

A single Playwright scenario, `golden-path.spec.ts`, covers DoD steps 1–10 using a clock-controlled backend. It advances
time by one day to perform the cold review in step 9.
