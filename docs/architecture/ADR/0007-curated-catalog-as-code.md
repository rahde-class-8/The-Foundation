# ADR-0007: Curated catalog as content-as-code

**Status:** Accepted (2026-10-27)

**Context.** The curated SAA catalog is the foundation of learning quality. It needs review, diffs, history, and reproducible environments.

**Decision.** Curated services, concepts, questions, rubrics, and citations live in `content/catalog/<cert>/<service>.yaml`, validated by a Zod schema in CI and loaded by an
idempotent upsert script (`catalog-import`). Rows imported from YAML have `origin = 'curated'`. Content created in-app (from uploads or notes) lives only in the DB, can be
exported to YAML for promotion, and stays visibly distinct.

**Consequences.** + Pull-request review of educational content, environment parity, and easy rollback. − Two authoring paths (YAML vs in-app), so the docs say which is canonical: YAML for curated content, DB for personal content.
