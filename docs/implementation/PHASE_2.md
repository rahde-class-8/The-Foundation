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

## Implementation results

**Status:** Complete on branch `phase-2/active-recall` (not merged). CI run 40501099861 green: quality, deno,
supabase (pgTAP, integration, Playwright), gitleaks. Awaiting owner sign-off.

| ID | Result | Evidence |
|---|---|---|
| REC-2a | ✅ | pgTAP `020_practice`: `next_questions` and `session_state` never return reference answers; `reveal_reference` only after submit |
| REC-3a, REC-3b | ✅ | `drafts.ts` localStorage autosave with persisted client keys; `submit_attempt` idempotent on `client_key` (pgTAP, integration) |
| REC-4a, REC-4b | ✅ | `evaluate.test`/`handlers.test` (rubric-derived grade, confidence cap); `AiFeedback` component test |
| REC-5a | ✅ | Every AI failure records an evaluation and returns `fallback: 'self_assessment'`; E2E failure path |
| REC-6a | ✅ | Self-assessment ticks suggest a grade (`self.ts` tests); E2E |
| REC-7a | ✅ | Override creates `source='override'`; latest human evaluation wins (`final.ts` tests, pgTAP) |
| REC-8a | ✅ | Up to 2 correction rounds, no scheduling event for corrections (pgTAP, integration, E2E) |
| REC-9a | ✅ | Keyboard: ⌘/Ctrl+Enter submit, 1/2/3 grade, N next (component tests) |
| REC-10a | ✅ | Session summary from `end_session` (component test, E2E) |
| X-5 | ✅ | `user_settings.timezone` validated by trigger; due dates at local midnight |
| SR-1…SR-15 | ✅ | `scheduler/next.test.ts` (intervals, ease, cap, lapses, non-cold rule, DST); pgTAP SR-13/SR-14 (idempotency, version conflict) |
| P2-1 | ✅ | Mock markers `[[mock:timeout\|rate-limited\|error\|invalid\|refused]]` and an injected answer; `handlers.test.ts`, integration, E2E |
| P2-2 | ⏳ | Calibration set (30 cases, `_shared/ai/calibration/grading-v1.json`) and runner (`npm run ai:calibrate`) are in place; the run needs an Anthropic API key (owner action) |
| P2-3 | ✅ | E2E reload after submit shows the saved attempt with retry / "Grade it myself" |
| P2-4 | ✅ | pgTAP: cold gap (8 h), same-session, and correction cases |
| P2-5 | ✅ | E2E golden path `practice.spec.ts` |

### Decisions made during implementation
- Learning writes go through RPCs and service-role functions only (ADR-0011); learners have no direct write grants.
- `apply_review_transition` was implemented as `finalize_attempt` (service role), which validates, records the
  review event, and updates `review_state` atomically. A version conflict raises `P0409`; the function retries once.
- Settings are changed through `update_settings` instead of a table update policy.
- Default AI provider: `mock` against the local stack (`SUPABASE_URL` starts with `http://kong`), otherwise none until configured.

### Remaining
- Run the calibration (P2-2) with a real key before relying on Claude grades.
- Seed content is still `in_review`; practice shows only published concepts (`content/catalog/README.md`).
