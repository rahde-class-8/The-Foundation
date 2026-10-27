# ADR-0009: Single-user auth with full RLS

**Status:** Accepted (2026-10-27)

**Context.** There is one user, but the brief forbids an unsecured public database, and the Supabase anon key is public by design.

**Decision.** Supabase Auth with signups disabled. RLS is on all tables and keyed by `user_id`/`owner_id`. An `owner` role claim gates catalog writes. Cross-user isolation is tested with two fixture users.

**Consequences.** + Secure by default, and multi-user ready without schema changes. − Slight policy overhead, which is acceptable.
