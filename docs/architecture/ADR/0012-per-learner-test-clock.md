# ADR-0012: Per-learner test clock for time-dependent tests

**Status:** Accepted (2026-10-29, Phase 3).

**Context.** Phase 3 must prove that a concept comes back "tomorrow" and "in three days" (DoD 9–10,
P3-3), and that dashboard figures match their definitions over weeks of history (P3-1). The schedule
is computed from the database's time in several places: cold-recall gaps in `submit_attempt`, local
"today" in `due_reviews` and `dashboard_summary`, and timestamps written by `finalize_attempt`. A
browser-only clock (Playwright `page.clock`) cannot move those, and back-dating rows by hand would
bypass the append-only triggers that protect history.

**Decision.**
- Learning functions read time through `private.now_for(user_id)` = `now()` + that learner's offset
  in `private.test_clock` (none by default). Edge Functions read the same clock with
  `server_now(user_id)` before computing a transition.
- Offsets are set only by `set_test_clock(user_id, seconds)`, which is **service-role only** and refuses
  unless the `test_clock` flag exists in `private.environment_flags`. `supabase/seed.sql` sets the flag;
  seeds run only on local stacks (`supabase start` / `db reset`), never on a hosted project.
- Time-dependent integration and E2E tests create a throwaway learner per test, so moving one clock
  never affects the owner account or a parallel test.

**Consequences.** + Real end-to-end coverage of spacing, cold recall, and analytics windows over days
and months. + No test-only code paths in the scheduler itself. − Phase 2 learner functions were
redefined to use the clock (migration `20261029100200`). − Test learners accumulate in a local
database that is also used for study; they are isolated by RLS and can be removed with `db reset`.
