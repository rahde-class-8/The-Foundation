import {
  coldFacts,
  dashboardMetrics,
  retentionBucket,
  type AnalyticsAttempt,
  type AnalyticsInput,
} from './metrics.ts';

const tz = 'UTC';
const now = new Date('2026-11-30T15:00:00Z');
const attempt = (
  conceptId: string,
  grade: AnalyticsAttempt['grade'],
  day: string,
  over: Partial<AnalyticsAttempt> = {},
): AnalyticsAttempt => ({
  conceptId,
  attemptKind: 'initial',
  isCold: true,
  status: 'finalized',
  grade,
  finalizedAt: `${day}T10:00:00Z`,
  dimension: 'what',
  ...over,
});

const base: AnalyticsInput = {
  now,
  timeZone: tz,
  attempts: [],
  states: [],
  concepts: [
    { id: 'c1', domainIds: ['d1'] },
    { id: 'c2', domainIds: ['d1'] },
    { id: 'c3', domainIds: ['d2'] },
  ],
  domains: [
    { id: 'd1', code: 'D1', name: 'Secure', weightPct: 30 },
    { id: 'd2', code: 'D2', name: 'Resilient', weightPct: 26 },
  ],
  misconceptions: [],
  sessions: [],
  newConceptsRemaining: 10,
};

describe('analytics (MASTERY_MODEL §6)', () => {
  it('computes cold-recall accuracy from finalized cold initial attempts only (DASH-3a)', () => {
    const m = dashboardMetrics({
      ...base,
      attempts: [
        attempt('c1', 'pass', '2026-11-20'),
        attempt('c1', 'partial', '2026-11-25'),
        attempt('c2', 'miss', '2026-11-26'),
        attempt('c2', 'pass', '2026-11-27', { isCold: false }),
        attempt('c2', 'pass', '2026-11-27', { attemptKind: 'correction', isCold: false }),
        attempt('c3', null, '2026-11-28', { status: 'evaluated', finalizedAt: null }),
        attempt('c3', 'pass', '2026-10-01'), // outside the 30-day window
      ],
    });
    expect(m.coldAccuracy).toEqual({ n: 3, pass: 1, partial: 1, strict: 0.3333, lenient: 0.5 });
  });

  it('computes domain coverage over published mapped concepts (DASH-6a)', () => {
    const m = dashboardMetrics({
      ...base,
      attempts: [
        attempt('c1', 'miss', '2026-11-20'),
        attempt('c1', 'pass', '2026-11-21'),
        attempt('c3', 'pass', '2026-10-01'),
        attempt('c2', 'pass', '2026-11-22', { isCold: false }),
      ],
    });
    expect(m.domains.map((d) => [d.code, d.covered, d.published, d.coverage])).toEqual([
      ['D1', 1, 2, 0.5],
      ['D2', 1, 1, 1],
    ]);
    expect(m.domains[1]?.performance.n).toBe(0);
  });

  it('buckets retention by days since the previous cold review', () => {
    expect(
      ['0', '1', '2', '6', '7', '20', '21', '90'].map((d) => retentionBucket(Number(d))),
    ).toEqual(['1', '1', '2-6', '2-6', '7-20', '7-20', '21+', '21+']);
    const facts = coldFacts(
      [
        attempt('c1', 'pass', '2026-11-01'),
        attempt('c1', 'pass', '2026-11-04'),
        attempt('c2', 'pass', '2026-11-04'),
      ],
      tz,
    );
    expect(facts.map((f) => f.prevGapDays)).toEqual([null, 3, null]);
  });

  it('counts due today and overdue by local day (WB-1a)', () => {
    const state = (conceptId: string, dueAt: string | null) => ({
      conceptId,
      masteryStatus: 'reviewing' as const,
      dueAt,
      ease: 2.5,
      lastColdGrade: 'pass' as const,
    });
    const m = dashboardMetrics({
      ...base,
      timeZone: 'America/New_York',
      states: [
        state('a', '2026-12-01T04:30:00Z'), // 23:30 local on Nov 30: due today
        state('b', '2026-11-30T04:59:00Z'), // 23:59 local on Nov 29: overdue
        state('c', '2026-12-01T05:00:00Z'), // midnight Dec 1 local: tomorrow
        state('d', null),
      ],
    });
    expect(m.counts).toMatchObject({ dueToday: 1, overdue: 1 });
  });

  it('distributes mastery, caps new concepts, and hides readiness below 50 cold attempts (DASH-7)', () => {
    const m = dashboardMetrics({
      ...base,
      states: [
        { conceptId: 'c1', masteryStatus: 'lapsed', dueAt: null, ease: 2.2, lastColdGrade: 'miss' },
      ],
      newConceptsRemaining: 1,
    });
    expect(m.masteryDistribution).toEqual({
      new: 2,
      learning: 0,
      reviewing: 0,
      mastered: 0,
      lapsed: 1,
    });
    expect(m.counts.newAvailable).toBe(1);
    expect(m.readiness).toMatchObject({
      visible: false,
      value: null,
      label: 'Estimate — not a prediction of exam results',
    });
  });

  it('computes readiness from coverage and long-interval retention', () => {
    const attempts: AnalyticsAttempt[] = [];
    // c1: 30 cold attempts every 7 days → 29 long-gap facts, all pass.
    for (let i = 0; i < 30; i += 1)
      attempts.push(
        attempt('c1', 'pass', new Date(Date.UTC(2026, 0, 1 + 7 * i)).toISOString().slice(0, 10)),
      );
    // c3: 20 attempts on consecutive days, half pass → short gaps only, falls back to overall accuracy.
    for (let i = 0; i < 20; i += 1)
      attempts.push(
        attempt(
          'c3',
          i % 2 ? 'pass' : 'miss',
          new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10),
        ),
      );
    const m = dashboardMetrics({ ...base, attempts });
    expect(m.readiness.coldAttempts).toBe(50);
    // D1: 0.30 × 0.5 coverage × 1.0 retention; D2: 0.26 × 1.0 × 0.5 overall accuracy.
    expect(m.readiness.value).toBeCloseTo(0.15 + 0.13);
    expect(m.readiness.visible).toBe(true);
  });

  it('lists the weakest attempted concepts by priority with misconceptions', () => {
    const m = dashboardMetrics({
      ...base,
      attempts: [attempt('c1', 'pass', '2026-11-20'), attempt('c2', 'pass', '2026-11-20')],
      states: [
        {
          conceptId: 'c1',
          masteryStatus: 'reviewing',
          dueAt: null,
          ease: 2.6,
          lastColdGrade: 'pass',
        },
        {
          conceptId: 'c2',
          masteryStatus: 'reviewing',
          dueAt: null,
          ease: 2.6,
          lastColdGrade: 'pass',
        },
        { conceptId: 'c3', masteryStatus: 'learning', dueAt: null, ease: 1.3, lastColdGrade: null },
      ],
      misconceptions: [
        { conceptId: 'c2', status: 'active', occurrenceCount: 2 },
        { conceptId: 'c1', status: 'resolved', occurrenceCount: 3 },
      ],
    });
    expect(m.weakest.map((w) => w.conceptId)).toEqual(['c2', 'c1']);
    expect(m.counts.recurringMisconceptions).toBe(1);
  });
});
