# The Foundation — Project Documentation

*Formerly "AWS Architecture Muscle Memory"; renamed by the project owner at the start of Phase 1.*

**Status:** Architecture approved by the project owner on 2026-10-27. Phase 0 in progress.
**Doc set version:** 0.1 (planning)
**Last updated:** 2026-10-27

> Approval covered the checklist below. Open questions Q2–Q9 were not answered individually, so the
> **defaults listed for each are in effect** (including Option A for Q8). Any of them can still be changed
> before the phase that depends on it begins.

## Index

| Area | Document | Purpose |
|---|---|---|
| Product | [PRD](product/PRD.md) | Vision, scope, goals, non-goals |
| Product | [User Stories](product/USER_STORIES.md) | Stories grouped by module, with IDs |
| Product | [Acceptance Criteria](product/ACCEPTANCE_CRITERIA.md) | Testable criteria mapped to stories |
| Architecture | [System Architecture](architecture/SYSTEM_ARCHITECTURE.md) | Components, flows, code layout |
| Architecture | [Data Model](architecture/DATA_MODEL.md) | Entities, relationships, constraints, RLS |
| Architecture | [Security](architecture/SECURITY.md) | Threat model and controls |
| Architecture | [API Contracts](architecture/API_CONTRACTS.md) | Edge Functions, RPCs, table access |
| Architecture | [Directory Structure](architecture/DIRECTORY_STRUCTURE.md) | Application folder layout and boundary rules |
| Architecture | [ADRs](architecture/ADR/) | Architecture decision records |
| Learning | [Mastery Model](learning/MASTERY_MODEL.md) | What "mastered" means, per concept |
| Learning | [Grading Rubrics](learning/GRADING_RUBRICS.md) | Rubric format, AI grading contract |
| Learning | [Spaced Repetition](learning/SPACED_REPETITION.md) | Scheduler algorithm and config |
| Learning | [Content Governance](learning/CONTENT_GOVERNANCE.md) | Source trust, review, publication |
| Implementation | [Roadmap](implementation/ROADMAP.md) | Phase overview and dependencies |
| Implementation | [Phase 0](implementation/PHASE_0.md) – [Phase 5](implementation/PHASE_5.md) | Phase plans and exit criteria |
| Operations | [Local Setup](operations/LOCAL_SETUP.md), [Testing](operations/TESTING.md), [Deployment](operations/DEPLOYMENT.md) | Intended operational procedures |

Start with the **[Architecture Review package](ARCHITECTURE_REVIEW.md)**: it covers the requirements review, key decisions, risks, and the approval gate.

## Approval checklist

The project owner should approve or amend each item before Phase 0 begins.

- [x] **A1** Product scope and non-goals (PRD §3–4)
- [x] **A2** Concept-level mastery and review tracking (ADR-0005)
- [x] **A3** Data model, including the six entities added beyond the brief (DATA_MODEL §2)
- [x] **A4** Server-authoritative, idempotent scheduling (ADR-0003)
- [x] **A5** Grade finalization model: overrides happen before finalization (ADR-0008)
- [x] **A6** Scheduler default parameters (SPACED_REPETITION §4)
- [x] **A7** Cold-recall definition (MASTERY_MODEL §3)
- [x] **A8** AI provider abstraction and default provider (ADR-0004)
- [x] **A9** Curated catalog maintained as content-as-code (ADR-0007)
- [x] **A10** Phase ordering, including the Option A/B decision (ROADMAP §2)

## Open questions for the project owner

(Q1, about the truncated brief, was resolved when the full brief was received.)

| # | Question | Default assumed in this plan |
|---|---|---|
| Q2 | Who authors the initial curated SAA catalog, and how large is the MVP seed? | ~25 high-frequency SAA services, 5–10 concepts each, authored as YAML and reviewed by the owner. |
| Q3 | Which AI provider/account will be used initially? | Anthropic (Claude) adapter first; interface supports others. |
| Q4 | Hosting target for the SPA? | Static hosting (e.g. Netlify, Vercel, or S3+CloudFront) plus Supabase Cloud. Decided in Phase 5. |
| Q5 | Learner timezone for "due today" boundaries? | Stored in settings; defaults to the browser timezone on first login. |
| Q6 | Is a monthly AI spend ceiling required? | Yes: a configurable soft cap, falling back to self-assessment when exceeded. |
| Q7 | Which SAA exam guide version should the domains be seeded from? | The current published SAA exam guide, verified at seed time (the plan uses SAA-C03 domain names as placeholders). |
| Q8 | Pull the scheduler core into Phase 2 (Option A) or keep the brief's split with a backfill (Option B)? See ROADMAP §2. | Option A |
| Q9 | Is an 8-hour cold-recall gap acceptable (MASTERY_MODEL §3)? | 8 h, configurable |
