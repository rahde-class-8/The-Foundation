import { SR_V1 } from './config.ts';
import { initialSnapshot } from './next.ts';
import { planOverride } from './override.ts';
import { priorityScore, sortByPriority } from './priority.ts';

const now = new Date('2026-11-10T12:00:00Z');

describe('Weak Box ordering (WB-2a)', () => {
  const base = { masteryStatus: 'reviewing' as const, lastColdGrade: 'pass' as const, ease: 2.5 };

  it('scores lapses, misses, overdue days, low ease, and misconceptions', () => {
    expect(priorityScore({ ...base, dueAt: null }, now)).toBeCloseTo(0.5);
    expect(
      priorityScore(
        {
          masteryStatus: 'lapsed',
          lastColdGrade: 'miss',
          ease: 1.3,
          dueAt: '2026-10-01T00:00:00Z',
          activeMisconceptions: 5,
        },
        now,
      ),
    ).toBeCloseTo(4 + 3 + 2 + 1.7 + 1.5);
    expect(
      priorityScore({ ...base, lastColdGrade: 'partial', dueAt: '2026-11-03T12:00:00Z' }, now),
    ).toBeCloseTo(1.5 + 1 + 0.5);
  });

  it('orders by priority, then due date, then concept id', () => {
    const items = [
      { ...base, conceptId: 'c', dueAt: '2026-11-10T00:00:00Z' },
      { ...base, conceptId: 'b', dueAt: '2026-11-09T00:00:00Z', ease: 2.5 },
      { ...base, conceptId: 'a', dueAt: '2026-11-10T00:00:00Z' },
      { ...base, conceptId: 'z', masteryStatus: 'lapsed' as const, dueAt: '2026-11-12T00:00:00Z' },
    ];
    // b is one day more overdue than a and c; a and c tie and fall back to concept id.
    expect(sortByPriority(items, now).map((i) => i.conceptId)).toEqual(['z', 'b', 'a', 'c']);
  });
});

describe('manual override (SPACED_REPETITION §7, SR-10)', () => {
  const state = {
    ...initialSnapshot(SR_V1),
    masteryStatus: 'reviewing' as const,
    intervalDays: 6,
    ease: 2.6,
    consecutiveColdPasses: 2,
    dueAt: '2026-11-16T05:00:00.000Z',
  };

  it('moves the due date to local midnight and keeps counters', () => {
    const plan = planOverride(
      state,
      { dueOn: '2026-11-12', reason: 'Exam soon' },
      SR_V1,
      now,
      'America/New_York',
    );
    expect(plan).toEqual({
      ok: true,
      next: { ...state, dueAt: '2026-11-12T05:00:00.000Z', manualDueOverride: true },
    });
  });

  it('accepts today and rejects past dates, far dates, bad dates, and empty reasons', () => {
    const at = (dueOn: string, reason = 'r') =>
      planOverride(state, { dueOn, reason }, SR_V1, now, 'Pacific/Auckland');
    // 12:00Z on Nov 10 is already Nov 11 in Auckland.
    expect(at('2026-11-11').ok).toBe(true);
    expect(at('2026-11-10')).toEqual({ ok: false, message: 'Pick today or a later date.' });
    expect(at('2028-01-01').ok).toBe(false);
    expect(at('2026-02-30').ok).toBe(false);
    expect(at('2026-11-12', '   ').ok).toBe(false);
  });
});
