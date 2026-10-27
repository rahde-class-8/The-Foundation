# Phase 3 — Weak Box

## Goals
Make spaced repetition visible and controllable, and make progress measurable.
(Under Option B this phase also delivers the scheduler core and a replay backfill.)

## Deliverables
1. RPCs: `due_reviews`, `concept_history`, `dashboard_summary`. Edge Function: `override-schedule`.
2. Migrations: `misconceptions`, `misconception_occurrences`, analytics views, and a backfill from `evaluations.feedback`.
3. Core: `priority.score`, `analytics.*` (with SQL-parity fixtures), misconception matching (known slug → existing → new) and resolution rule.
4. UI `/reviews`: Due today / Overdue / Upcoming tabs, priority ordering, "Start review session", reschedule dialog (date + reason), concept history drawer, recurring misconceptions panel.
5. UI `/dashboard`: the DASH-1…7 widgets, the readiness estimate with label, sample sizes, and a hidden-until-threshold rule.
6. Clock control for tests (server `now()` override available only in the test environment) for cold-review E2E.

## Acceptance criteria
WB-1a, WB-2a, WB-3a, WB-4a, WB-6a, DASH-3a, DASH-6a, DASH-7a, plus:

| ID | Criterion |
|---|---|
| P3-1 | Analytics parity: SQL views and core functions agree on 5 fixture histories |
| P3-2 | `due_reviews('today')` p95 < 100 ms with 2,000 concepts × 50 events each (seeded perf fixture) |
| P3-3 | DoD steps 9–10 pass in E2E with the clock advanced by 1 and 4 days |
| P3-4 | A manual override survives retries (single event) and shows in history |
