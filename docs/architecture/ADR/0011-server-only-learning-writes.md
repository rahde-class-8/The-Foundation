# ADR-0011: Server-only writes for AI evaluations and review transitions

**Status:** Accepted (2026-10-28, Phase 2). Amends SECURITY §5 ("no service-role key at runtime").

**Context.** ADR-0003 computes scheduling in TypeScript and applies it in Postgres. If the apply
function accepted calls from the learner's JWT, any client could post an arbitrary "AI" grade or
review state through PostgREST, and "server-authoritative" scheduling would be a convention, not a
guarantee. For a single learner the risk is self-deception rather than an attack, but grade history
is the product's core data and analytics depend on its integrity.

**Decision.**
- `record_ai_evaluation` and `finalize_attempt` are executable **only by `service_role`**.
- The Edge Functions `evaluate-attempt` and `finalize-attempt` (1) verify the caller's JWT with
  Supabase Auth, (2) scope every read and write to that user id, and (3) call these two functions
  with a service-role client created from the runtime-provided `SUPABASE_SERVICE_ROLE_KEY`.
- Everything else a learner does (sessions, submitting answers, self-assessment, overrides, revealing
  reference answers, settings) goes through SECURITY DEFINER functions that use `auth.uid()`.
- The service-role key stays inside the Edge runtime; it is never sent to the SPA (the bundle scan
  enforces this) and never logged.

**Consequences.** + AI grades, rubric-derived scores, and review transitions can only be produced by
server code. + Learner tables have no direct write grants. − Two functions hold a privileged client,
so their user scoping is covered by unit tests (fake store) and integration tests.
