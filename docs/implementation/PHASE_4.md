# Phase 4 — Content Import

## Goals
Turn the learner's own material into reviewed, cited learning content without compromising trust or safety.

## Deliverables
0. **Spike (day 1):** extract a 300-page PDF within Edge Function limits using page batching. Record the result in ADR-0001 and pick the in-browser fallback if needed (R3).
1. Migrations: `import_jobs`, Storage policies, and `content_sources` CHECKs for user types.
2. Edge Functions: `ingest-source` (validate → extract → segment → passages, resumable) and `generate-drafts` (generation prompt v1, citation validation).
3. RPC `publish_concept` with full validation and revision snapshots.
4. UI `/content`: sources list with trust badges, upload with progress, note editor, job status and errors, passage browser and search, draft review screen (side-by-side passages, edit, governance checklist, approve or reject), staleness report.
5. Test fixtures: valid PDF, encrypted, corrupt, zero-page, image-only, renamed `.exe`, oversized, 301 pages, and hostile-text passages.

## Acceptance criteria
CNT-2a, CNT-4a, CNT-6a, CNT-7a, CNT-8a, CNT-9a, CNT-10a, plus:

| ID | Criterion |
|---|---|
| P4-1 | Re-running ingestion on the same job creates no duplicate passages (hash dedupe) |
| P4-2 | A job interrupted mid-way resumes from its cursor to completion |
| P4-3 | Draft content never appears in `/practice` or `search_catalog` results |
| P4-4 | Content from notes renders the "Your notes" badge and "Not verified against AWS docs" until an Official citation exists |
