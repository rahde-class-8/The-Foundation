# ADR-0001: Modular monolith on Supabase

**Status:** Accepted (2026-10-27)

**Context.** The brief mandates React/Vite + Supabase and a modular monolith. There is one user. The protected operations are AI calls, scheduling, and file processing.

**Decision.** A single repository containing the SPA, SQL migrations, Edge Functions, a shared pure-TS domain core, and catalog content.
Edge Functions are thin adapters over the core and are deployed with the same release. There is no separate backend server, queue, or worker fleet.
Long-running ingestion uses client-driven continuation (re-invoke while a job has a cursor) instead of a queue.

**Consequences.** + Low operational cost, one deploy pipeline, and easy local parity with `supabase start`.
− Edge Function limits (wall-clock, CPU, memory) constrain PDF extraction, which is mitigated by page batching (Phase 4 spike).
− Deno (functions) vs Node (tooling) runtime split. See ADR-0002.

**Alternatives.** A Node API server (Fastify) on a container host: more control, but more ops and duplicates Supabase capabilities. Rejected for the MVP.
A background job queue (pgmq / Supabase Queues): reconsider if client-driven continuation proves unreliable.

**Phase 4 spike (2026-10-29): PDF extraction stays in Edge Functions.** `unpdf` 1.8.1 (pdf.js for serverless
runtimes) in Deno 2, on a generated 300-page text PDF (≈ 416,000 characters):

| Measure | Result |
|---|---|
| Open document | ≈ 100 ms |
| Slowest 25-page batch, including re-opening the document as a new invocation would | ≈ 105 ms |
| Slowest 50-page batch | ≈ 150 ms |
| Whole document | < 1 s, ≈ 125 MB RSS |
| Encrypted / corrupt / renamed `.exe` / zero-page / image-only fixtures | `PasswordException` / `InvalidPDFException` / `InvalidPDFException` / 0 pages / 0 characters |

`ingest-source` therefore extracts on the server in **time-budgeted batches** (at most 50 pages or about 1 s of
work per invocation, whichever comes first) and the SPA re-invokes while the job has a cursor. The in-browser
fallback is not needed. Real-world PDFs with heavy fonts or images may be slower; the budget keeps each call well
under the hosted 2 s CPU limit, and a slow page only makes the job take more invocations.
