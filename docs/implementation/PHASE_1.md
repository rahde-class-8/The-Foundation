# Phase 1 — Service Library

**Authorized:** 2026-10-27 ("proceed to phase 1"; the app was also renamed to "The Foundation").  
**Status:** Complete. All acceptance criteria are verified; CI run [40490522110](https://github.com/rahde-class-8/The-Foundation/actions/runs/40490522110). Awaiting owner sign-off.

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

## Implementation results

| ID | Result | Evidence |
|---|---|---|
| LIB-1a | ✅ | `ServicesPage.test.tsx` (grouping, links); E2E `library.spec.ts` |
| LIB-2a | ✅ | pgTAP `010_catalog` (domain filter); component test; E2E domain filter |
| LIB-3a | ✅ | pgTAP (alias `elb`, name prefix, concept phrase); component test (debounce, URL); E2E search |
| LIB-4a | ✅ | `ServiceProfilePage.test.tsx` (eight dimensions, "Not yet authored") |
| LIB-5a | ✅ | Every YAML concept must cite a source (validator); citation rendering test |
| LIB-7a | ✅ | Progress text "n of m concepts reviewing or better" in list and profile tests |
| LIB-8a | ✅ | "Your notes" vs "AWS docs" badge test |
| LIB-Xa | ✅ | Not-found test; `service_profile` returns null (pgTAP) |
| X-1 | ✅ | pgTAP: learner vs owner visibility, private review state |
| X-2 | ✅ | pgTAP and integration: `anon` denied on tables and functions |
| X-4 | ✅ | All timestamps are `timestamptz` |
| CNT-10a | ✅ | `Markdown.test.tsx`: scripts, event handlers, and unsafe URLs removed |
| P1-1 | ✅ | pgTAP second import = 0 changes; CI step `catalog:import -- --expect-no-changes` |
| P1-2 | ✅ | `catalog:validate` in CI; validator unit tests cover the failure cases |
| P1-3 | ✅ | pgTAP EXPLAIN assertion: `services_search_tsv_idx`, `concept_certifications_domain_idx` |
| P1-4 | ✅ | E2E: library renders in < 1 s with the real seed plus 25 × 10 synthetic services |

Reference answers and rubrics are not readable by learners (pgTAP and integration), ahead of REC-2a.

### Content status
10 services, 51 concepts, 51 questions, 56 sources. All AI-drafted and **in review** with paraphrased, unverified
citations (CONTENT_GOVERNANCE §9). Publishing them is owner work and a prerequisite for useful practice in Phase 2.

### Environment notes
- The development container cannot run the Supabase stack. Database work was iterated against a local PostgreSQL 16
  with a minimal Supabase/pgTAP stand-in, and verified on Postgres 17 in CI.
- AWS documentation was not reachable from the development container, which is why no citation is verbatim yet.
