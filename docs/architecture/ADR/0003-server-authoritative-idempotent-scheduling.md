# ADR-0003: Server-authoritative, idempotent scheduling

**Status:** Proposed

**Context.** Scheduling must be isolated, configurable, idempotent, and outside UI components. Retries, double-clicks, and two open tabs are realistic.

**Decision.** Split *computation* from *application*:
1. `core/scheduler.next(state, outcome, config, now, timezone)` is a pure function that returns the new state and an event payload.
2. Edge Functions (`finalize-attempt`, `override-schedule`) load the current state, call the core, then call
   `apply_review_transition` in Postgres. That function atomically (a) dedupes on `(user_id, idempotency_key)`, (b) checks the optimistic `version`,
   (c) inserts the immutable `review_events` row, and (d) updates `review_state`.
3. `review_state` has no direct write policy for clients.

**Consequences.** + Deterministic, unit-testable math. + Exactly-once effects under retries. + Full audit trail.
− Two round trips per finalize, which is acceptable at single-user scale.
On a version conflict the function reloads and recomputes once before returning 409.

**Alternatives.** All math in PL/pgSQL: atomic, but harder to test and to configure, and duplicates TS types. Client-side scheduling: violates the brief's isolation intent and is not authoritative.
