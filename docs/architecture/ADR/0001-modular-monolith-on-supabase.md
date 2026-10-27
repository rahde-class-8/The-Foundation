# ADR-0001: Modular monolith on Supabase

**Status:** Proposed

**Context.** The brief mandates React/Vite + Supabase and a modular monolith. There is one user. The protected operations are AI calls, scheduling, and file processing.

**Decision.** A single repository containing the SPA, SQL migrations, Edge Functions, a shared pure-TS domain core, and catalog content.
Edge Functions are thin adapters over the core and are deployed with the same release. There is no separate backend server, queue, or worker fleet.
Long-running ingestion uses client-driven continuation (re-invoke while a job has a cursor) instead of a queue.

**Consequences.** + Low operational cost, one deploy pipeline, and easy local parity with `supabase start`.
− Edge Function limits (wall-clock, CPU, memory) constrain PDF extraction, which is mitigated by page batching (Phase 4 spike).
− Deno (functions) vs Node (tooling) runtime split. See ADR-0002.

**Alternatives.** A Node API server (Fastify) on a container host: more control, but more ops and duplicates Supabase capabilities. Rejected for the MVP.
A background job queue (pgmq / Supabase Queues): reconsider if client-driven continuation proves unreliable.
