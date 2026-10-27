# Curated catalog

Content-as-code for the service library (ADR-0007). `npm run catalog:validate` checks it, and
`npm run catalog:import` loads it into the local database (idempotent).

| Path                              | Contents                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| `categories.yaml`                 | Service categories (browse groups)                                                   |
| `sources.yaml`                    | Citable sources. `retrievedAt` = the date the page was checked against its excerpts. |
| `certifications/*.yaml`           | Certifications and exam domains                                                      |
| `services/<provider>/<slug>.yaml` | One service: eight mastery dimensions, concepts, citations, questions                |

## Status of the seed content

The initial ten services were **drafted by AI** (`origin: ai_draft`) during Phase 1 in an environment
without access to AWS documentation. Therefore:

- Everything is `status: in_review`. The library shows it to the owner with an "In review" badge.
  Practice (Phase 2) only uses `published` content.
- Every citation is a **paraphrase** (`excerptKind: paraphrase`) of the named AWS page, not a quotation,
  and no source has `retrievedAt` yet.

## Publishing a concept (owner review)

1. Open each cited URL and check the concept, its examples and limitations, and the question's rubric against it.
2. Replace at least one paraphrase with a **verbatim** excerpt (`excerptKind: verbatim`), and set
   `retrievedAt` on each source you checked.
3. Add `review: { by: <you>, at: <YYYY-MM-DD> }` to the concept (or the service, to cover all its concepts).
4. Set `status: published` on the service and on the concepts you approved.
5. Run `npm run catalog:validate`. It refuses publication when any of the above is missing.
