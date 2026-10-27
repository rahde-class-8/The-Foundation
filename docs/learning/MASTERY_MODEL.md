# Mastery Model

**Status:** Draft for approval

## 1. Unit of mastery

The **concept** is the unit (ADR-0005). A service is a collection of concepts, and service progress is an aggregate.
Each concept is probed by questions tagged with one of the eight **dimensions**:

| Code | Dimension | Prompt style example (Lambda › Execution time limits) |
|---|---|---|
| `what` | What it is | "What is the Lambda execution time limit and what does it govern?" |
| `how` | How it works | "What happens to an invocation that reaches the timeout?" |
| `problem` | Problem it solves | "Why does Lambda enforce a maximum duration?" |
| `solution` | How it solves it | "How does the timeout setting interact with retries for async invocations?" |
| `not_do` | What it does NOT do | "Name a workload Lambda cannot run because of this limit, and say what to use instead." |
| `when` | When to choose it | "When is Lambda still right despite the limit?" |
| `where` | Where it belongs | "Where do Step Functions fit when work exceeds the limit?" |
| `trade_offs` | Trade-offs | "What trade-offs come with splitting a long job into chained functions?" |

Authoring target: every published concept has ≥2 questions covering ≥2 dimensions, and `not_do` is covered for every service at least once.

## 2. Measurement principle

Only **cold recall** counts as evidence of memory. Reading, viewing the reference answer, and corrections are learning *events*, not evidence.

## 3. Cold recall (approval item A7)

An attempt is **cold** when all of the following hold. It is computed by `submit_attempt` and then frozen:

1. `attempt_kind = 'initial'` (corrections are never cold), and
2. the learner has had **no exposure** to this concept for `cold_gap_hours` (default **8 h**). Exposure means expanding its explanation (`mark_concept_exposed`),
   revealing a reference answer, or seeing AI feedback for it (`review_state.last_exposure_at`), and
3. no other initial attempt on the same concept exists in the same session.

A first-ever attempt with no prior exposure is cold. This lets a learner who already knows a concept prove it on day one.

*Rationale:* 8 hours approximates "a different study sitting" while still allowing morning/evening sessions. It is configurable.

## 4. Mastery status (per concept)

Derived deterministically by the core from `review_state` counters after every transition:

| Status | Rule |
|---|---|
| `new` | Never exposed and never attempted |
| `learning` | Exposed or attempted, `consecutive_cold_passes = 0`, and not lapsed |
| `reviewing` | `consecutive_cold_passes ≥ 1` |
| `mastered` | `consecutive_cold_passes ≥ 3` **and** `interval_days ≥ 21` |
| `lapsed` | Last cold grade was Miss or Partial **after** having reached `reviewing` or `mastered`. Returns to `reviewing` on the next cold Pass. |

Service progress = counts per status across its published concepts. "Studied" (LIB-7) = `first_studied_at IS NOT NULL`.

## 5. Question selection rules

The core `selection.rank(candidates, context)` is a pure, deterministic function given a seed.

**Step 1: candidate concept pool by session scope**

| Scope | Pool, in order |
|---|---|
| `due_reviews` | Active states with `due_at ≤ end of local today`, ordered by priority (SPACED_REPETITION §6) |
| `weak` | Status `lapsed` or `learning` with ≥1 attempt, plus concepts with an active misconception |
| `service` / `domain` | (a) due concepts in scope, (b) weak in scope, (c) new in scope up to the remaining `daily_new_limit` (default 10), (d) not-yet-due concepts least recently reviewed |
| `concept` | That concept only. Multiple questions allowed; only the first can be cold. |
| `mixed` | Due → weak → new, across the active certification |

**Step 2: question within a concept**
1. Exclude draft or retired questions.
2. Prefer the dimension with the lowest cold accuracy for this concept (unseen dimensions count as 0.5).
3. Avoid repeating the last question answered for this concept when an alternative exists.
4. Difficulty band: `new`/`learning`/`lapsed` → 1–2; `reviewing` → 2; `mastered` → 2–3. Fall back to any difficulty.

**Step 3: ordering within the session**
- Interleave: avoid consecutive questions from the same service when the pool allows (it improves discrimination between similar services).
- Session length default: 15 questions, or until the pool is exhausted. `daily_review_limit` default 100.

## 6. Analytics definitions

All metrics are computed from history tables. Each has a SQL view and a core TS function, and parity is verified on shared fixtures.
The default window is the last 30 days. "Finalized cold attempt" means `attempt_kind='initial' AND is_cold AND status='finalized'`.

| Metric | Definition |
|---|---|
| Reviews due today | Active states with `due_at < start of tomorrow (local)` and `due_at ≥ start of today (local)` |
| Overdue | Active states with `due_at < start of today (local)` |
| New concepts available | Published concepts in the active certification with status `new`, capped at the remaining `daily_new_limit` |
| Completed sessions | `study_sessions.status = 'completed'` in the window |
| **Cold-recall accuracy** | Pass ÷ finalized cold attempts (Partial counts as 0). A secondary "lenient" rate counts Partial as 0.5. |
| Retention by interval | Cold-recall accuracy grouped by days since the previous cold review: 1, 2–6, 7–20, 21+ |
| Mastery distribution | Count of active states per status, plus published concepts with no state as `new` |
| Weakest concepts | Top 10 attempted concepts by priority score (SPACED_REPETITION §6) |
| Domain coverage | Concepts mapped to the domain with ≥1 finalized cold attempt ÷ published concepts mapped to the domain |
| Domain performance | Cold-recall accuracy restricted to concepts mapped to the domain |
| Dimension accuracy | Cold-recall accuracy grouped by `questions.dimension` |
| Recurring misconceptions | `misconceptions.status='active' AND occurrence_count ≥ 2` |
| Recent activity | Last 20 of: finalized attempts, overrides, published content, sessions |
| **Readiness (estimate)** | Σ over domains of `weight_pct/100 × coverage × retention₇₊`, where retention₇₊ is the domain's cold accuracy on reviews with an interval ≥ 7 days (it falls back to overall domain accuracy when n < 10). Always labeled **"Estimate — not a prediction of exam results."** It is shown with sample sizes and is hidden until ≥50 finalized cold attempts exist. |

### Implementation notes (Phase 3)
- Windowed (last 30 local days): cold-recall accuracy, retention by interval, dimension accuracy, domain performance, completed sessions.
  All-time: domain coverage, readiness (including its retention₇₊ term), mastery distribution.
- Accuracy over time is shown as eight weekly buckets ending today (local days).
- "Days since the previous cold review" is the difference between local calendar dates; same-day reviews fall in the `1` bucket.
- Coverage, readiness, mastery distribution, and "new available" count concepts mapped to the selected certification; accuracy, due counts, and weakest concepts include every practicable concept.
- Ratios are rounded to 4 decimals in both implementations; `tests/integration/analytics-parity.test.ts` compares them (P3-1).
