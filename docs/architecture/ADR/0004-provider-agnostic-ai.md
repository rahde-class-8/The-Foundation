# ADR-0004: Provider-agnostic AI with schema-validated output

**Status:** Accepted (2026-10-27). Default provider: Anthropic (Q3 default in effect).

**Context.** The brief forbids coupling business logic to one model provider and requires structured, versioned, server-side evaluation with fallback.

**Decision.**
- `EvaluationProvider` and `GenerationProvider` interfaces in `_shared/ai`. Adapters: `anthropic` (first), `mock` (tests and local dev). Others can be added without core changes.
- The core owns the result schemas (`EvaluationResult`, `DraftConceptResult`). Adapters only translate transport.
- Prompts are versioned files (`grading/v1.ts`, `generation/v1.ts`), and the version is persisted on every evaluation.
- The model is chosen per task via env (`AI_MODEL_GRADING`, `AI_MODEL_GENERATION`), so models change without code changes. The grading model is fixed per prompt version in evaluation metadata, so analytics can segment by model.
- Timeout, retry, and budget policies live in a provider-independent wrapper.

**Consequences.** + Swappable providers and reproducible audits. − Lowest-common-denominator structured output: the plan relies on JSON output plus Zod rather than provider-specific features.
A small offline **grading calibration set** (≈30 answer/grade pairs) is kept in the repo to compare providers and prompt versions before switching (Phase 2).

**Open:** provider data-retention and training-use terms to be reviewed and recorded here before Phase 2 ships.
