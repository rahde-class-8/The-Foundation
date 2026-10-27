# User Stories

**Status:** Draft for approval. IDs are stable and are referenced by ACCEPTANCE_CRITERIA.md and the phase plans.
"I" is the single learner, who is also the content administrator.

## Authentication (AUTH)

- **AUTH-1** As the learner, I sign in with email and password (or a magic link) so that only I can reach my data.
- **AUTH-2** As the owner, I know self-registration is disabled so that strangers cannot create accounts.
- **AUTH-3** As the learner, my session persists across reloads and expires safely.

## Module A — Service Library (LIB)

- **LIB-1** I browse services grouped by category (Compute, Storage, Database, Networking, …).
- **LIB-2** I filter services and concepts by SAA exam domain.
- **LIB-3** I search by service name, alias (for example "ELB"), or concept text.
- **LIB-4** I open a service mastery profile showing the eight mastery dimensions (PRD §2) and its concepts.
- **LIB-5** Each concept shows examples, limitations ("what it does NOT do"), and cited sources.
- **LIB-6** I see related services (alternatives, commonly paired services, prerequisites) and can navigate to them.
- **LIB-7** I see which concepts I have studied and their mastery status. A service is never shown as "mastered" because of one concept.
- **LIB-8** I can tell at a glance whether a citation is official AWS documentation, curated content, or my own note.
- **LIB-9** I start practice directly from a service or concept.

## Module B — Active Recall (REC)

- **REC-1** I start a session scoped to a service, a concept, an exam domain, or "due reviews".
- **REC-2** I see an open-ended question with no hints and no reference answer.
- **REC-3** I submit my answer and it is saved even if the network or AI fails afterward.
- **REC-4** When AI is available, I receive Pass/Partial/Miss with incorrect statements, missing concepts, a confidence value, and a correction prompt.
- **REC-5** When AI is unavailable, slow, or disabled, I view the reference answer and self-grade Pass/Partial/Miss.
- **REC-6** I can override an AI grade before finalizing. Both the AI grade and my final grade are kept.
- **REC-7** After a Partial or Miss, I answer a targeted correction prompt. It is recorded as a correction, not cold recall.
- **REC-8** When I finalize a question, the concept is scheduled automatically.
- **REC-9** I move to the next question quickly using the keyboard.
- **REC-10** I can resume an interrupted session, including retrying a pending evaluation.
- **REC-11** I can end a session and see a short summary (counts by grade, concepts to review).

## Module C — Weak Box (WB)

- **WB-1** I see reviews that are due today, overdue, and upcoming.
- **WB-2** Weak concepts (recent misses, lapses, low ease) are prioritized first.
- **WB-3** I can manually reschedule a concept to a chosen date, and the change is recorded with a reason.
- **WB-4** I can view a concept's full review history: attempts, grades, intervals, and overrides.
- **WB-5** Cold-recall results are reported separately from correction results.
- **WB-6** I see recurring misconceptions and which concepts they affect.
- **WB-7** I can start a review session from the Weak Box.

## Dashboard (DASH)

- **DASH-1** I see counts for due today, overdue, and new concepts available.
- **DASH-2** I see completed sessions and recent activity.
- **DASH-3** I see cold-recall accuracy overall and over time.
- **DASH-4** I see concepts by mastery status.
- **DASH-5** I see my weakest concepts.
- **DASH-6** I see coverage and performance by SAA domain.
- **DASH-7** Any readiness figure is clearly labeled as an estimate.

## Content (CNT)

- **CNT-1** Curated catalog entries (services, concepts, questions, citations) are loaded from version-controlled files.
- **CNT-2** I upload a PDF within size and type limits and see the import job's progress and errors.
- **CNT-3** I add a text note as a source.
- **CNT-4** Extracted passages keep traceable locations (page, section, character offsets).
- **CNT-5** I request AI-generated draft concepts and questions from selected passages.
- **CNT-6** I review, edit, approve, or reject drafts. Nothing AI-generated is published without my approval.
- **CNT-7** Published content cites passages, and citations are validated against stored passages.
- **CNT-8** A malformed or unsupported file fails safely with a clear message.

## Settings (SET)

- **SET-1** I set my timezone (used for "due today").
- **SET-2** I enable or disable AI grading and choose a default evaluation mode.
- **SET-3** I set the daily new-concept limit and the review limit.
- **SET-4** I export my learning history as JSON.
