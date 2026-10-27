# Phase 1 — Service Library

## Goals
Learner can browse, filter, and search a source-backed catalog and read standardized service and concept profiles.

## Deliverables
1. Migrations: extensions, helpers (`updated_at` trigger, `is_owner()`), catalog tables, content tables (`content_sources`, `source_passages`, `concept_sources`), indexes, RLS, and grants.
2. RPCs: `search_catalog`, `mark_concept_exposed` (writes exposure only; review_state is created lazily).
   *Note:* `review_state` is created in this phase's migration so that "studied" tracking (LIB-7) works. Scheduling columns stay unused until Phase 2/3.
3. Catalog YAML schema, `catalog-validate`, and `catalog-import` (idempotent upsert; question content hash → new version).
4. Seed content: certification SAA (current exam version), its domains, categories, and an initial set of ≥10 services authored to the governance checklist (target 25 by Phase 5).
5. UI: `/services` (category groups, domain filter, search, keyset pagination), `/services/:id` (8 dimensions, concepts, examples, limitations, citations with trust badges, related services, per-concept status, "Practice" entry points disabled until Phase 2).
6. Sanitized Markdown renderer component (shared with later phases).
7. Generated DB types are committed and checked in CI.

## Acceptance criteria
LIB-1a, LIB-2a, LIB-3a, LIB-4a, LIB-5a, LIB-7a, LIB-8a, LIB-Xa, X-1 (catalog/content tables), X-2, X-4, CNT-10a, plus:

| ID | Criterion |
|---|---|
| P1-1 | `supabase db reset && npm run catalog:import` is reproducible and idempotent (a second run has 0 changes) |
| P1-2 | Invalid YAML (a missing critical rubric point or citation) fails CI with a clear message |
| P1-3 | Catalog list query plan uses indexes (EXPLAIN test for search and domain filter) |
| P1-4 | The `/services` first page renders in < 1 s on local dev with 25 services × 10 concepts |

## Tests
pgTAP: RLS (owner vs second user vs anon), constraints, `search_catalog`. Vitest: YAML schema, import diffing. RTL: profile rendering states. Playwright: browse → filter → search → open profile.
