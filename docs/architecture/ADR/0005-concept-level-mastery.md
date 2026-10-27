# ADR-0005: Mastery and review state tracked per concept

**Status:** Accepted (2026-10-27)

**Context.** "Do not treat mastery of one concept as mastery of the entire service." Each concept has several questions (one per mastery dimension or more).

**Decision.** `review_state` is keyed by `(user_id, concept_id)`. Questions are interchangeable probes of a concept. Service-level progress is always an aggregate shown as a distribution ("4 of 9 concepts reviewing or better"). It is never a boolean.

**Consequences.** + Matches the learning model, and rotating questions reduces answer memorization. − A weakness in one dimension (e.g. "what it does NOT do") is averaged into the concept.
Mitigation: selection prefers dimensions with the worst recent results inside a due concept (MASTERY_MODEL §5), and per-dimension accuracy is reported.

**Alternative.** Per-question scheduling (Anki-style): finer-grained, but it inflates the review load and fragments "concept" mastery. Revisit if analytics show dimension-level weakness hiding.
