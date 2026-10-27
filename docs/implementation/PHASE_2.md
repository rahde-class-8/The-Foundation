# Phase 2 — Active Recall

## Goals
The complete question loop: select → answer → persist → AI or self grade → override → correct → finalize (→ schedule ⟵A).

## Deliverables
1. Migrations: `user_settings`, `study_sessions`, `attempts`, `evaluations`, append-only triggers, and the RPCs `start_session`, `next_questions`, `submit_attempt`, and `reveal_reference`. Column-level grants hide reference answers.
2. Core: `selection.rank`, `grading.derive`, `grading.validateEvaluation`, `correction.plan`, and the contract schemas.
3. AI layer: provider interfaces, `anthropic` + `mock` adapters, timeout/retry/budget wrapper, grading prompt v1, calibration set and runner script.
4. Edge Functions: `evaluate-attempt`, `finalize-attempt`.
5. ⟵A Core `scheduler.next` (sr-v1) and the `apply_review_transition` RPC with idempotency and versioning, plus the `review_events` table. `finalize-attempt` schedules.
6. UI `/practice`: scope picker, question view (no hints), local draft autosave, submit, evaluating state with a "Grade it myself" escape, feedback view (missing points, incorrect statements, confidence), self-assessment checklist, override, correction rounds, finalize/next, session summary. Keyboard shortcuts.
7. Settings: timezone, AI toggle, daily limits.
8. Misconceptions from AI output are stored inside `evaluations.feedback`. They are materialized into tables in Phase 3.

## Acceptance criteria
REC-2a, REC-3a, REC-3b, REC-4a, REC-4b, REC-5a, REC-6a, REC-7a, REC-8a, REC-9a, REC-10a, X-5, SR-1…SR-15 (⟵A), plus:

| ID | Criterion |
|---|---|
| P2-1 | Fault-injection: the mock provider configured for timeout, 500, 429, invalid JSON, and prompt-injected answers. Each yields a persisted attempt, the correct evaluation status, and a usable self-assessment path. |
| P2-2 | Calibration: ≥ 90% grade agreement, 0 Pass↔Miss inversions for the chosen provider/model |
| P2-3 | Killing the network after submit and reloading shows the submitted attempt and offers retry or self-grade |
| P2-4 | Is-cold computed per MASTERY_MODEL §3 (DB tests for gap, same-session, and correction cases) |
| P2-5 | DoD steps 1–8 pass in an E2E test |

## Risks
R2 (grading quality) and R1 (content volume). If content lags, Phase 2 proceeds with ≥10 services.
