// Dashboard metrics (MASTERY_MODEL §6) as pure functions. dashboard_summary computes the same
// figures in SQL; tests/integration/analytics-parity.test.ts checks they agree (P3-1).
import type { Grade } from '../grading/evaluation.ts';
import type { Dimension } from '../grading/rubric.ts';
import { addDays, localDateOf, startOfLocalDay, type LocalDate } from '../scheduler/dates.ts';
import type { MasteryStatus } from '../scheduler/next.ts';
import { round4, sortByPriority } from '../scheduler/priority.ts';

export const WINDOW_DAYS = 30;
export const ACCURACY_WEEKS = 8;
export const READINESS_MIN_COLD_ATTEMPTS = 50;
export const READINESS_MIN_RETENTION_SAMPLE = 10;
export const WEAKEST_LIMIT = 10;
export const READINESS_LABEL = 'Estimate — not a prediction of exam results';

export type AnalyticsAttempt = {
  conceptId: string;
  attemptKind: 'initial' | 'correction';
  isCold: boolean;
  status: 'submitted' | 'evaluated' | 'finalized';
  /** Grade of the final evaluation; null until finalized. */
  grade: Grade | null;
  finalizedAt: string | null;
  dimension: Dimension;
};

export type AnalyticsState = {
  conceptId: string;
  masteryStatus: MasteryStatus;
  dueAt: string | null;
  ease: number;
  lastColdGrade: Grade | null;
};

export type AnalyticsInput = {
  now: Date;
  timeZone: string;
  /** Finalized and in-progress attempts of the learner. */
  attempts: readonly AnalyticsAttempt[];
  /** Active review states of practicable concepts. */
  states: readonly AnalyticsState[];
  /** Published concepts mapped to the certification, with their domains. */
  concepts: readonly { id: string; domainIds: readonly string[] }[];
  domains: readonly { id: string; code: string; name: string; weightPct: number }[];
  misconceptions: readonly {
    conceptId: string;
    status: 'active' | 'resolved';
    occurrenceCount: number;
  }[];
  sessions: readonly { status: 'active' | 'completed' | 'abandoned'; endedAt: string | null }[];
  newConceptsRemaining: number;
};

export type Accuracy = {
  n: number;
  pass: number;
  partial: number;
  strict: number | null;
  lenient: number | null;
};

type ColdFact = AnalyticsAttempt & {
  finalizedAt: string;
  grade: Grade;
  prevGapDays: number | null;
};

const ratio = (num: number, den: number) => (den === 0 ? null : round4(num / den));

export function accuracyOf(facts: readonly { grade: Grade }[]): Accuracy {
  const pass = facts.filter((f) => f.grade === 'pass').length;
  const partial = facts.filter((f) => f.grade === 'partial').length;
  return {
    n: facts.length,
    pass,
    partial,
    strict: ratio(pass, facts.length),
    lenient: ratio(pass + partial * 0.5, facts.length),
  };
}

/** Finalized cold initial attempts with the local-day gap since the previous one on the concept. */
export function coldFacts(attempts: readonly AnalyticsAttempt[], timeZone: string): ColdFact[] {
  const cold = attempts
    .filter(
      (a): a is AnalyticsAttempt & { finalizedAt: string; grade: Grade } =>
        a.attemptKind === 'initial' &&
        a.isCold &&
        a.status === 'finalized' &&
        a.grade !== null &&
        a.finalizedAt !== null,
    )
    .sort((a, b) => a.finalizedAt.localeCompare(b.finalizedAt));
  const last = new Map<string, LocalDate>();
  return cold.map((a) => {
    const day = localDateOf(new Date(a.finalizedAt), timeZone);
    const prev = last.get(a.conceptId);
    last.set(a.conceptId, day);
    return { ...a, prevGapDays: prev ? daysBetween(prev, day) : null };
  });
}

function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export type RetentionBucket = '1' | '2-6' | '7-20' | '21+';
export const RETENTION_BUCKETS: readonly RetentionBucket[] = ['1', '2-6', '7-20', '21+'];

export function retentionBucket(gapDays: number): RetentionBucket {
  if (gapDays <= 1) return '1';
  if (gapDays <= 6) return '2-6';
  if (gapDays <= 20) return '7-20';
  return '21+';
}

export function dashboardMetrics(input: AnalyticsInput) {
  const { now, timeZone } = input;
  const today = localDateOf(now, timeZone);
  const startOfToday = startOfLocalDay(today, timeZone).getTime();
  const startOfTomorrow = startOfLocalDay(addDays(today, 1), timeZone).getTime();
  const windowStart = startOfLocalDay(addDays(today, -(WINDOW_DAYS - 1)), timeZone).getTime();

  const facts = coldFacts(input.attempts, timeZone);
  const inWindow = facts.filter((f) => Date.parse(f.finalizedAt) >= windowStart);
  const certConcepts = new Map(input.concepts.map((c) => [c.id, c.domainIds]));
  const stateByConcept = new Map(input.states.map((s) => [s.conceptId, s]));
  const activeMisconceptions = new Map<string, number>();
  for (const m of input.misconceptions)
    if (m.status === 'active')
      activeMisconceptions.set(m.conceptId, (activeMisconceptions.get(m.conceptId) ?? 0) + 1);

  const due = (s: AnalyticsState) => (s.dueAt === null ? null : Date.parse(s.dueAt));
  const dueToday = input.states.filter(
    (s) => (due(s) ?? Infinity) >= startOfToday && (due(s) ?? Infinity) < startOfTomorrow,
  ).length;
  const overdue = input.states.filter((s) => (due(s) ?? Infinity) < startOfToday).length;
  const unseen = input.concepts.filter(
    (c) => (stateByConcept.get(c.id)?.masteryStatus ?? 'new') === 'new',
  ).length;

  const accuracyByWeek = Array.from({ length: ACCURACY_WEEKS }, (_, i) => {
    const index = ACCURACY_WEEKS - 1 - i;
    const from = addDays(today, -7 * index - 6);
    const to = addDays(today, -7 * index);
    const bucket = facts.filter((f) => {
      const day = localDateOf(new Date(f.finalizedAt), timeZone);
      return day >= from && day <= to;
    });
    return { weekStart: from, ...accuracyOf(bucket) };
  });

  const attemptedConcepts = new Set(
    input.attempts
      .filter((a) => a.attemptKind === 'initial' && a.status === 'finalized')
      .map((a) => a.conceptId),
  );
  const weakest = sortByPriority(
    input.states
      .filter((s) => attemptedConcepts.has(s.conceptId))
      .map((s) => ({ ...s, activeMisconceptions: activeMisconceptions.get(s.conceptId) ?? 0 })),
    now,
  )
    .slice(0, WEAKEST_LIMIT)
    .map((s) => ({ conceptId: s.conceptId, priority: s.priority }));

  const certFacts = facts.filter((f) => certConcepts.has(f.conceptId));
  const domains = input.domains.map((d) => {
    const conceptIds = new Set(
      input.concepts.filter((c) => c.domainIds.includes(d.id)).map((c) => c.id),
    );
    const all = certFacts.filter((f) => conceptIds.has(f.conceptId));
    const covered = new Set(all.map((f) => f.conceptId)).size;
    const longGap = all.filter((f) => f.prevGapDays !== null && f.prevGapDays >= 7);
    const allTime = accuracyOf(all);
    const retention = accuracyOf(longGap);
    const readinessRetention =
      retention.n >= READINESS_MIN_RETENTION_SAMPLE
        ? (retention.strict ?? 0)
        : (allTime.strict ?? 0);
    return {
      id: d.id,
      code: d.code,
      name: d.name,
      weightPct: d.weightPct,
      published: conceptIds.size,
      covered,
      coverage: ratio(covered, conceptIds.size),
      performance: accuracyOf(inWindow.filter((f) => conceptIds.has(f.conceptId))),
      retention7: retention,
      readinessContribution: round4(
        (d.weightPct / 100) * (ratio(covered, conceptIds.size) ?? 0) * readinessRetention,
      ),
    };
  });

  const distribution: Record<MasteryStatus, number> = {
    new: 0,
    learning: 0,
    reviewing: 0,
    mastered: 0,
    lapsed: 0,
  };
  for (const c of input.concepts)
    distribution[stateByConcept.get(c.id)?.masteryStatus ?? 'new'] += 1;

  const dimensions = new Map<Dimension, ColdFact[]>();
  for (const f of inWindow)
    dimensions.set(f.dimension, [...(dimensions.get(f.dimension) ?? []), f]);

  return {
    today,
    counts: {
      dueToday,
      overdue,
      newAvailable: Math.min(unseen, Math.max(input.newConceptsRemaining, 0)),
      completedSessions: input.sessions.filter(
        (s) =>
          s.status === 'completed' && s.endedAt !== null && Date.parse(s.endedAt) >= windowStart,
      ).length,
      recurringMisconceptions: input.misconceptions.filter(
        (m) => m.status === 'active' && m.occurrenceCount >= 2,
      ).length,
    },
    coldAccuracy: accuracyOf(inWindow),
    accuracyByWeek,
    retentionByInterval: RETENTION_BUCKETS.map((bucket) => ({
      bucket,
      ...accuracyOf(
        inWindow.filter((f) => f.prevGapDays !== null && retentionBucket(f.prevGapDays) === bucket),
      ),
    })),
    dimensionAccuracy: [...dimensions.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dimension, list]) => ({ dimension, ...accuracyOf(list) })),
    masteryDistribution: distribution,
    weakest,
    domains,
    readiness: {
      label: READINESS_LABEL,
      coldAttempts: certFacts.length,
      threshold: READINESS_MIN_COLD_ATTEMPTS,
      visible: certFacts.length >= READINESS_MIN_COLD_ATTEMPTS,
      value:
        certFacts.length >= READINESS_MIN_COLD_ATTEMPTS
          ? round4(domains.reduce((sum, d) => sum + d.readinessContribution, 0))
          : null,
    },
  };
}

export type DashboardMetrics = ReturnType<typeof dashboardMetrics>;
