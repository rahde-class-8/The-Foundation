# Architecture Review Package

**For:** Project owner · **Status:** Awaiting approval · **Date:** 2026-10-27

This package covers brief §15 Steps 1 and 6. Steps 2–5 live in the linked documents.
**Implementation will not begin until the owner states: "Architecture approved. Begin Phase 0."**

---

## Step 1 — Requirements review

### 1.1 Ambiguous requirements → proposed interpretation

| # | Requirement | Ambiguity | Proposed interpretation | Where |
|---|---|---|---|---|
| AMB-1 | "Track cold recall separately from same-session corrections" | What counts as "cold"? | Initial attempt, no exposure to the concept for ≥ 8 h, first initial attempt in the session | MASTERY_MODEL §3 |
| AMB-2 | "First Pass → 3 days" | First pass ever, or first cold pass? | First **cold** pass. Non-cold passes never lengthen spacing. | SPACED_REPETITION §3, §5 |
| AMB-3 | "Regression → reduce interval" | Reduce by how much? | Due tomorrow, then recover at 50% (Miss) / 70% (Partial) of the pre-lapse interval | SPACED_REPETITION §4 |
| AMB-4 | "Repeated Pass → progressively increase" | Growth function? | interval × ease (SM-2-style, ease 1.3–3.0, cap 180 days) | SPACED_REPETITION §4 |
| AMB-5 | "Learner may override an AI grade" | When? Does it reschedule? | Before finalize only. After finalize, use a manual schedule override. | ADR-0008 |
| AMB-6 | "Track which concepts have been studied" | Viewed, or attempted? | Studied = explanation opened **or** attempted (`first_studied_at`) | DATA_MODEL §4.3 |
| AMB-7 | "Questions: recall prompts and evaluation rubrics" + "rubric versioning" | One table cannot version cleanly | `questions` (identity) + immutable `question_versions` | ADR-0006 |
| AMB-8 | "Partial" grade boundary | Undefined | Rubric-weighted coverage 40–79%, or a critical point missing | GRADING_RUBRICS §2, §5 |
| AMB-9 | "Exam readiness estimate" | Formula undefined | Domain-weighted coverage × long-interval retention, hidden below 50 samples, always labeled | MASTERY_MODEL §6 |
| AMB-10 | "Mastery" | Undefined | ≥ 3 consecutive cold passes **and** interval ≥ 21 days | MASTERY_MODEL §4 |
| AMB-11 | "Due today" | Timezone? | Learner's IANA timezone in settings, local-midnight due times | SPACED_REPETITION §2 |

### 1.2 Missing technical decisions (now proposed)

| # | Decision | Proposal | Where |
|---|---|---|---|
| MD-1 | Where shared business logic lives across Vite (Node) and Edge Functions (Deno) | `_shared/core` + path alias, validated by a Phase 0 spike | ADR-0002 |
| MD-2 | How scheduling stays isolated *and* atomic | Pure TS computes; a Postgres function applies with idempotency key + optimistic version | ADR-0003 |
| MD-3 | How grades resist prompt injection | The AI judges rubric points; the core derives the grade deterministically | GRADING_RUBRICS §5 |
| MD-4 | How to hide reference answers before submission | Column-level grants + `reveal_reference` RPC | DATA_MODEL §6.3 |
| MD-5 | Background processing for PDF ingest | Client-driven continuation with a job cursor (no queue) | ADR-0001 |
| MD-6 | Curated content authoring and review | YAML content-as-code validated in CI | ADR-0007 |
| MD-7 | AI cost control | Rate limit + monthly budget cap → self-assessment fallback | SECURITY §1 |
| MD-8 | Service-role key usage | None at runtime; all functions use the caller's JWT | SECURITY §5 |
| MD-9 | Timezone and date library | Zone-aware calendar math (Temporal polyfill vs date-fns-tz); chosen in Phase 0 | SPACED_REPETITION §2 |
| MD-10 | AI vendor data-retention terms | Reviewed before Phase 2 ships | ADR-0004 |

### 1.3 Conflicting requirements

| # | Conflict | Resolution proposed |
|---|---|---|
| CF-1 | Recall workflow step 10 (scheduling) is in Module B / Phase 2, but the scheduler is built in Phase 3 | **Option A:** move only the scheduler core into Phase 2. Option B: backfill in Phase 3. (ROADMAP §2, Q8) |
| CF-2 | Misconception detection is part of the Evaluation Engine (Phase 2), but misconception *tracking* is Phase 3 | Phase 2 stores diagnoses inside evaluation feedback. Phase 3 materializes them into tables with a backfill. |
| CF-3 | "Grade overrides" vs "idempotent scheduling" | Finalization model (ADR-0008) |
| CF-4 | "Single user" vs "RLS / ownership" | Not a true conflict: full RLS keyed by `user_id`, signups disabled (ADR-0009) |
| CF-5 | Phase 1 "Implement source references" vs Phase 4 "Content import" | Phase 1 creates the source/passage tables for curated citations (URL + excerpt). Phase 4 adds the upload paths. |
| CF-6 | "Hide reference answer" vs a single owner who can read the YAML | It is a learning-integrity control, not secrecy (DATA_MODEL §6.3) |

### 1.4 Scope risks
- **Content volume** is the largest effort and the largest quality driver (R1). The software is only as good as the catalog.
- **AI grading quality** decides whether the learner trusts the loop (R2). Calibration and visible confidence are built in from Phase 2.
- **Architecture Lab and canvas creep** (R6) are explicitly out. Only the data-model hooks are in.
- **"Accurate progress" on the dashboard** depends on clean cold/non-cold separation. A wrong definition silently inflates metrics.

### 1.5 Dependencies
External: Supabase (Cloud + CLI), an AI provider account and API key, Docker, the current SAA exam guide (for domains and weights), AWS documentation (citations), and a hosting provider (Phase 5).
Internal: Phase 0 spike (ADR-0002) → all phases. Catalog content → Phases 2 and 3 testing. AI layer (Phase 2) → draft generation (Phase 4).

### 1.6 Assumptions requiring approval
See the [approval checklist](README.md#approval-checklist) (A1–A10) and [open questions](README.md#open-questions-for-the-project-owner) (Q2–Q9).

---

## Step 6 — Summary for the owner

### 1. Proposed architecture
A modular monolith: a React SPA, plus Supabase (Postgres with RLS, Auth, Storage, Edge Functions), plus an AI provider reached only from Edge Functions.
Business rules live in one pure-TypeScript **domain core** used by both sides. Postgres atomically applies learning-state changes.
→ [SYSTEM_ARCHITECTURE](architecture/SYSTEM_ARCHITECTURE.md), [DATA_MODEL](architecture/DATA_MODEL.md), [SECURITY](architecture/SECURITY.md), [API_CONTRACTS](architecture/API_CONTRACTS.md)

### 2. Important technical decisions
1. Concept-level mastery (ADR-0005).
2. Server-authoritative, idempotent scheduling (ADR-0003).
3. Deterministic grade derivation from AI rubric judgements (GRADING_RUBRICS §5).
4. Immutable question versions; append-only history (ADR-0006).
5. Finalize step; overrides happen before it (ADR-0008).
6. Provider-agnostic AI; mock provider in all tests (ADR-0004).
7. Curated catalog as YAML in the repo (ADR-0007).
8. No service-role key at runtime (SECURITY §5).
9. Six entities added to the brief's sixteen (DATA_MODEL §2).

### 3. Open questions
Q2 seed size and authorship · Q3 AI provider · Q4 hosting · Q5 timezone · Q6 AI budget · Q7 exam guide version · **Q8 Option A/B** · Q9 cold gap.

### 4. Top risks
R1 content effort · R2 grading trust · R3 PDF limits in Edge Functions · R4 Deno/Node sharing · R5 timezone bugs. → [ROADMAP §5](implementation/ROADMAP.md#5-risk-register)

### 5. Recommended implementation order
Phase 0 → 1 → 2 (with the scheduler core, Option A) → 3 → 4 → 5. Catalog authoring runs in parallel from Phase 1.

### 6. Approval checklist
A1–A10 in [README](README.md#approval-checklist).

**Stopping here.** Awaiting: *"Architecture approved. Begin Phase 0."*
