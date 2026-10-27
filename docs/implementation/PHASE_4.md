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

## Implementation results

**Status:** Complete on branch `phase-4/content-import` (branched from `phase-3/weak-box`; not merged). CI run
40577165883 green: quality (239 unit and component tests), deno, supabase (185 pgTAP assertions, 31 integration tests,
13 Playwright tests, no retries), gitleaks. Awaiting owner sign-off.

| ID | Result | Evidence |
|---|---|---|
| Spike | ✅ | ADR-0001: a 300-page PDF extracts in under 1 s with `unpdf` in Deno; server-side extraction in time-budgeted batches, no browser fallback |
| CNT-2a | ✅ | Core `content.test` (magic bytes, size); pgTAP `040` (size, duplicate, daily limit, storage paths); component test (renamed `.exe` rejected before upload); integration; E2E |
| CNT-4a | ✅ | pgTAP and integration: every passage has source, pages, offsets, and hash; core tests check offsets are exact slices |
| CNT-6a | ✅ | pgTAP and integration: generated concepts are private drafts with `origin = ai_draft` and cannot start a session |
| CNT-7a | ✅ | pgTAP: drafts cannot cite, and publishing refuses, another user's private passage |
| CNT-8a | ✅ | Handler tests and integration: encrypted, corrupt, zero-page, image-only, renamed `.exe`, and 301-page files fail with typed codes and are deleted; E2E for the messages |
| CNT-9a | ✅ | Handler tests: hostile passages are escaped in the prompt; a model "obeying" them cites unknown passages and only the job's start and failure are written. Integration: the hostile fixture produces only draft rows |
| CNT-10a | ✅ | `Markdown.test.tsx`; content component test renders a passage with `<script>` and `javascript:` stripped |
| P4-1 | ✅ | pgTAP, handler tests, integration: re-sending or re-running adds no passages |
| P4-2 | ✅ | Handler tests (batched = one-shot passages); integration: a 120-page job stopped after one batch resumes and completes |
| P4-3 | ✅ | pgTAP and integration: drafts are absent from `search_catalog`, `service_profile`, and practice |
| P4-4 | ✅ | Draft review and library concept list show "Your notes" and "Not verified against AWS docs" without an official citation (component tests, E2E) |

### Decisions made during implementation
- Failed uploads are deleted immediately instead of being quarantined for 7 days.
- New error codes `pdf_empty` and `upload_missing`; the full list is in CONTENT_GOVERNANCE §5.
- Draft generation, review, and publishing are owner-only (SYSTEM_ARCHITECTURE §5). Uploads and notes work for any
  signed-in user and stay private.
- Drafts are attached to an existing service; the reviewer picks exam domains on the review screen.
- A recorded batch releases the job immediately; a crashed call blocks the job for two minutes, then it resumes.
- The mock drafter can simulate failures with `[[mock:draft-error]]` and `[[mock:cite-unknown]]`.

### Remaining
- No download of uploaded files yet (SECURITY §6 signed URLs are not needed until there is one).
- P2-2 (AI calibration with a real key) is still pending; drafting with Claude is untested against the real API for the same reason.
