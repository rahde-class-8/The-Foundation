# Product Requirements Document

**Product:** AWS Architecture Muscle Memory
**Status:** Draft for approval · **Version:** 0.1 · **Owner:** Project owner (single learner)

## 1. Problem

Studying for the AWS Solutions Architect Associate (SAA) exam usually means passive reading and multiple-choice
practice. That builds recognition, not recall. A learner can pick "Lambda" from a list and still be unable to say
what Lambda *does not* do, when SQS beats SNS, or what changes when ALB+EC2 replaces API Gateway+Lambda.

## 2. Mission and learning principle

> **"The foundation: every service, as muscle memory."**

For every service, the learner should be able to produce, unaided and quickly:

| # | Dimension | Example (Lambda) |
|---|---|---|
| 1 | What it is | Event-driven, managed compute that runs functions |
| 2 | How it works | Execution environments, invocation models, scaling per concurrent request |
| 3 | Problem it solves | Running code without managing servers or capacity |
| 4 | How it solves it | Provisions environments per request; billed per request and duration |
| 5 | What it does NOT do | No long-running jobs past the timeout; no persistent local state |
| 6 | When to choose it | Spiky, event-driven, short-duration workloads |
| 7 | Where it belongs | Compute tier behind API Gateway or event sources |
| 8 | Trade-offs | Cold starts, concurrency limits, VPC networking considerations |

The value chain the product optimizes is:
**Accurate knowledge → Active recall → Targeted correction → Spaced repetition → Architectural application.**

## 3. Scope

### 3.1 MVP (in scope)

| Module | Summary |
|---|---|
| A. Service Library | Searchable catalog of services → concepts, filterable by category and SAA domain, with source references and studied-state |
| B. Active Recall Engine | Open-ended questions, persisted answers, AI rubric grading with self-assessment fallback and override, correction loop |
| C. Weak Box | Concept-level spaced repetition: due/overdue/upcoming reviews, weakness priority, manual overrides, history, misconceptions |
| Dashboard | Due work, cold-recall accuracy, mastery distribution, weakest concepts, domain coverage, activity, *estimated* readiness |
| Content Import | Curated catalog, PDF and text-note upload, passage extraction, AI draft concepts, human review before publication, citations |

### 3.2 Non-goals for the MVP

- Multiple users, collaboration, sharing, social features, leaderboards
- Subscription billing
- The Architecture Lab (the data model leaves room for it; see DATA_MODEL §7)
- A drag-and-drop architecture canvas
- Multiple-choice exam simulation
- Native mobile apps (responsive web only)
- Offline mode (network failures are recoverable, but the app is not offline-first)
- Decorative gamification (streak fireworks, badges, points)

### 3.3 Future (design for, do not build)

- Additional certifications (Google PCA, AWS SAP, etc.) that reuse services and concepts across certifications
- Architecture Lab guided scenarios: "swap the architecture layer, understand the trade-offs"

## 4. Users

One authenticated learner who is also the content administrator. Self-registration is disabled.
The data model still keys every learner record by `user_id`, so adding users later is not a schema redesign.

## 5. Goals and success measures

Learning outcomes are the primary measure. Engagement is secondary.

| Goal | Metric (definitions in MASTERY_MODEL §6) | MVP target |
|---|---|---|
| Durable recall | Cold-recall pass rate on reviews with an interval of 7 days or more | Trend visible; no fixed target |
| Coverage | % of SAA-mapped concepts attempted at least once cold | Reported per domain |
| Weakness reduction | Count of concepts in the `lapsed` or `learning` state | Trend visible |
| Reliability | Submitted answers lost | 0 |
| Availability of practice | Sessions blocked by an AI outage | 0 (self-assessment fallback) |

The readiness estimate is labeled **"Estimate — not a prediction of exam results"** everywhere it appears.

## 6. Functional requirements (summary)

The full set is in USER_STORIES.md and ACCEPTANCE_CRITERIA.md. Key invariants:

1. Mastery is tracked **per concept**, never inferred for a whole service from one concept.
2. The reference answer is never sent to the client before the attempt is persisted as submitted.
3. The submitted answer is persisted **before** any AI call. A failed evaluation never loses an answer.
4. AI grades, self grades, and overrides are all stored. The final grade is explicit.
5. Only **cold** attempts advance the review interval. Same-session corrections are recorded but do not.
6. Scheduling is server-authoritative, configurable, isolated from UI code, and idempotent.
7. AI-generated content is never published without human review.
8. User-uploaded notes are always visually and structurally distinguishable from official AWS documentation.

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | Catalog list p95 < 300 ms for local DB reads; paginated (default 24, maximum 100); next question shown < 500 ms after the previous one is finalized |
| AI latency | Evaluation timeout 30 s total including retries; UI shows progress and offers self-assessment immediately |
| Accessibility | WCAG 2.2 AA; full keyboard operation of the practice loop |
| Responsiveness | Usable from 360 px width up |
| Security | See SECURITY.md |
| Data durability | Learning history is append-only where specified; backups documented in Phase 5 |

## 8. Release definition

The MVP is done when the brief's §14 Definition of Done is met. It is mirrored as the Phase 5 exit criteria.
