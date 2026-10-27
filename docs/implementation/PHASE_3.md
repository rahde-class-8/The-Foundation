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

## Implementation results

**Status:** Complete on branch `phase-3/weak-box` (branched from `phase-2/active-recall`; not merged). CI run
40523632779 green: quality (196 unit and component tests), deno, supabase (139 pgTAP assertions, 18 integration
tests, 11 Playwright tests), gitleaks. Awaiting owner sign-off.

| ID | Result | Evidence |
|---|---|---|
| WB-1a | ✅ | pgTAP `030_weak_box`: due 23:30 local is today, 23:59 yesterday is overdue, local midnight tomorrow is upcoming; core `metrics.test` |
| WB-2a | ✅ | pgTAP ordering by priority then concept id, score checked against SPACED_REPETITION §6; core `weak-box.test` |
| WB-3a | ✅ | pgTAP: `manual_override` event with previous/new due date and reason, flag set; handler tests; E2E reschedule |
| WB-4a | ✅ | pgTAP: history keeps every attempt and its question version after a re-import creates version 2; component test; E2E history drawer |
| WB-6a | ✅ | pgTAP and integration: second attempt with the same misconception → recurring; component test |
| DASH-3a | ✅ | pgTAP fixture (cold passes ÷ cold finalized, window-limited); core test; parity |
| DASH-6a | ✅ | pgTAP fixture (covered ÷ published per domain); core test; parity |
| DASH-7a | ✅ | Component tests (hidden and visible); pgTAP; E2E |
| P3-1 | ✅ | `tests/integration/analytics-parity.test.ts`: five histories in `tests/fixtures/histories/` replayed through the API; SQL and core agree on every figure |
| P3-2 | ✅ | pgTAP `031_due_reviews_perf`: 2,000 concepts × 50 events, p95 ≈ 29 ms locally (limit 100 ms) |
| P3-3 | ✅ | E2E `weak-box.spec.ts`: miss → +1 day due in the Weak Box → cold pass → +4 days due again, dashboard shows 1 of 2 |
| P3-4 | ✅ | pgTAP and integration: retried override replays with one event; shown in `concept_history` |

WB-5 (cold results reported separately from corrections) and WB-7 (start a review session from the Weak Box) are
also covered: the dashboard counts cold answers only and says so, and the Weak Box links to `due_reviews` and `weak`
sessions.

### Decisions made during implementation
- **Test clock (ADR-0012).** Deliverable 6 is a per-learner clock (`private.now_for`) set by a service-role
  function that works only where `supabase/seed.sql` enabled it. Time-dependent tests use throwaway learners.
- Manual overrides are written by `apply_manual_override` (service role) behind `override-schedule`, in line with
  ADR-0011.
- `due_reviews` takes `due_window` instead of `window` (reserved word in SQL).
- Misconceptions are taken from the latest AI evaluation unless the learner overrode the grade to a Pass. The mock
  grader can diagnose one on request with `[[mock:misconception:<slug>]]`.
- Analytics windows and certification scope are listed in MASTERY_MODEL §6 implementation notes.
- The practice fixture gained a third concept (Streams) in a second exam domain.
- Fixed a Phase 0 bug found by the E2E test: signing in now returns to the original page with its query string.

### Remaining
- Seed content is still `in_review`; the Weak Box fills up only after practicing published concepts.
- P2-2 (AI calibration with a real key) is still pending from Phase 2.
