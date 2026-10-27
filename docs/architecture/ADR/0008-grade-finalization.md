# ADR-0008: Grade finalization — overrides before finalize

**Status:** Accepted (2026-10-27)

**Context.** The learner may override AI grades, original and final grades must be stored, and scheduling must be idempotent.
If overrides were allowed after scheduling, every override would need to unwind and replay scheduling.

**Decision.** Each attempt has an explicit **finalize** step. Before finalize, any number of `self`/`override` evaluations may be added (all stored).
Finalize picks the final evaluation, sets `attempts.final_evaluation_id`, and triggers scheduling exactly once.
After finalize, grades are frozen. To correct the schedule later, use a **manual schedule override** (recorded as its own event). The UI makes finalize the natural "Next" action, so it adds no friction.

**Consequences.** + Simple, auditable, idempotent. − A post-finalize regrade is not possible in the MVP. If the owner needs it, add a `regraded` event type that replays from the prior snapshot (future ADR).
