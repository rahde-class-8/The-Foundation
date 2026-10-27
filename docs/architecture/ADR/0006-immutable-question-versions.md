# ADR-0006: Immutable question versions

**Status:** Accepted (2026-10-27)

**Context.** Rubric and content versioning are required, and historical grades must stay interpretable.

**Decision.** `questions` holds identity and status. `question_versions` holds the prompt, reference answer, and rubric, and is immutable once any attempt references it (enforced by trigger).
Editing a question creates version N+1 and moves `current_version_id`. Concepts are mutable working documents, but every publish appends a `concept_revisions` snapshot.

**Consequences.** + Every evaluation can be traced to the exact rubric used. − Slightly more complex authoring, which is handled by the catalog import script (a content hash change → new version).
