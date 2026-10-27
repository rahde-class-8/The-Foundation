# Spaced Repetition

**Status:** Draft for approval (checklist A4, A6)

## 1. Scope

The scheduler decides **when each concept is next due** for a cold review. It lives in `_shared/core/scheduler/`, is pure, and is applied atomically and idempotently by Postgres (ADR-0003).

```ts
next(input: {
  state: ReviewStateSnapshot;       // counters, interval, ease, status, due_at, pre_lapse_interval
  outcome: { kind: 'graded'; grade: Grade; isCold: boolean }
         | { kind: 'manual_override'; dueOn: LocalDate; reason: string };
  config: SchedulerConfig;          // versioned
  now: Instant;                     // injected clock
  timezone: IanaZone;
}): { newState: ReviewStateSnapshot; event: ReviewEventPayload }
```

## 2. Date semantics

- An interval is counted in **local calendar days** in the learner's timezone.
- `due_at` = **00:00 local** on `today_local + interval_days`, stored as UTC.
- A concept is "due today" from local midnight. Overdue means `due_at < start of today (local)`.
- DST transitions are handled by doing calendar math in the zone (Temporal polyfill or date-fns-tz; choice deferred to Phase 0). They are tested explicitly.

## 3. Mapping to the brief's rules

| Brief rule | Implementation |
|---|---|
| Miss → correction + next-day review | Interval 1, correction workflow offered |
| Partial → targeted correction + next-day review | Interval 1, correction workflow offered |
| First Pass → 3 days | First cold Pass (`consecutive_cold_passes` 0 → 1, no prior lapse) → interval 3 |
| Repeated Pass → progressively increase | Interval × ease |
| Regression → reduce interval | Lapse: tomorrow, then recover at a fraction of the pre-lapse interval |
| Manual override → selected date, recorded | `manual_override` event with reason; counters unchanged |

## 4. Algorithm (config `sr-v1`)

| Parameter | Default |
|---|---|
| `missIntervalDays` | 1 |
| `partialIntervalDays` | 1 |
| `firstPassIntervalDays` | 3 |
| `initialEase` | 2.5 |
| `easeMin` / `easeMax` | 1.3 / 3.0 |
| `easeDeltaPass` / `easeDeltaPartial` / `easeDeltaMiss` | +0.10 / −0.15 / −0.30 |
| `recoveryFactorPartial` / `recoveryFactorMiss` | 0.7 / 0.5 |
| `maxIntervalDays` | 180 |
| `masteredMinPasses` / `masteredMinInterval` | 3 / 21 |
| `coldGapHours` | 8 |

**Cold Pass**
```
if pre_lapse_interval is set:            # recovering from a regression
    interval = max(firstPass, round(pre_lapse_interval × recoveryFactor[lastGrade]))
    pre_lapse_interval = null
elif consecutive_cold_passes == 0:       # first pass
    interval = firstPass
else:                                    # repeated pass
    interval = max(interval + 1, round(interval × ease))
interval = min(interval, maxInterval)
ease = clamp(ease + easeDeltaPass)
consecutive_cold_passes += 1
```

**Cold Partial / Miss**
```
if interval ≥ firstPass AND pre_lapse_interval is null:
    pre_lapse_interval = interval        # remember earned spacing
if grade == miss AND status ∈ {reviewing, mastered}: lapse_count += 1
interval = (miss ? missInterval : partialInterval)
ease = clamp(ease + (miss ? easeDeltaMiss : easeDeltaPartial))
consecutive_cold_passes = 0
```
Status is then derived per MASTERY_MODEL §4, and `due_at` per §2.

Worked example: Pass(3) → Pass(3×2.6=8) → Pass(8×2.7=22, mastered) → Miss (lapse; due tomorrow; pre_lapse=22) → Pass (max(3, 22×0.5)=11).

## 5. Non-cold attempts

Non-cold initial attempts (e.g. practicing again in the same sitting after reading) are recorded with an event but **never lengthen spacing**:
- Pass: no change to interval, ease, or counters. If the concept has no due date yet, `due_at` = tomorrow (the first cold check).
- Partial/Miss: `due_at = min(current due_at, tomorrow)`. Ease and counters are unchanged.

Corrections produce no scheduling event at all.

## 6. Weak Box priority

```
priority = 4·[status = lapsed]
         + 3·[last_cold_grade = miss] + 1.5·[last_cold_grade = partial]
         + 1.0·min(overdue_days, 14) / 7
         + (easeMax − ease)
         + 0.5·min(active_misconceptions, 3)
```
Ordering: priority desc, then `due_at` asc, then `concept_id` (deterministic tie-break, WB-2a). The weights are config, so they can be tuned in one place.

## 7. Manual overrides

- Input: a local date (≥ today), a reason (required, ≤ 300 chars), and a client key (idempotency).
- Effect: `due_at` = that date at 00:00 local; `manual_due_override = true`; interval, ease, and counters are unchanged. The next graded transition clears the flag.
- Recorded as a `review_events` row (`manual_override`) with previous and new due dates.

## 8. Required boundary tests (SR-*)

| ID | Case |
|---|---|
| SR-1 | First-ever cold Pass → 3 days, status `reviewing` |
| SR-2 | First-ever cold Miss → 1 day, status `learning`, lapse_count 0 |
| SR-3 | Repeated passes grow monotonically and cap at 180 |
| SR-4 | Ease never leaves [1.3, 3.0] over 1,000 random sequences (property test) |
| SR-5 | Miss from `mastered` → `lapsed`, lapse_count+1, due tomorrow, pre_lapse stored |
| SR-6 | Recovery Pass after lapse uses the recovery factor and clears pre_lapse |
| SR-7 | Partial from `reviewing` does not increment lapse_count but stores pre_lapse |
| SR-8 | Non-cold Pass never increases the interval |
| SR-9 | Non-cold Miss pulls the due date earlier but never later |
| SR-10 | Manual override keeps counters, sets the flag, and the next grade clears it |
| SR-11 | Grading at 23:59 vs 00:01 local yields due dates one day apart |
| SR-12 | DST spring-forward/fall-back in America/New_York and Europe/London: due at 00:00 local, never 23:00/01:00 |
| SR-13 | Same idempotency key applied twice → one event, identical state (DB test) |
| SR-14 | Stale `expected_version` → conflict (DB test) |
| SR-15 | Config version recorded on every event; changing the config does not rewrite history |

## 9. Config evolution

Configs are immutable, named objects (`sr-v1`, `sr-v2`, …). Per-user overrides of individual parameters live in `user_settings.scheduler_overrides` (validated).
New configs apply to future transitions only. A future "reschedule all" tool, if built, writes `manual_override`-style events and never mutates history.
