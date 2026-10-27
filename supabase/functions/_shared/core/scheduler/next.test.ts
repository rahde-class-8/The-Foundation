import { resolveConfig, SR_V1 } from './config.ts';
import { addDays, localDateOf, startOfLocalDay } from './dates.ts';
import { initialSnapshot, next, type Grade, type ReviewSnapshot } from './next.ts';

const TZ = 'America/New_York';
const at = (iso: string) => new Date(iso);
const NOON = at('2026-10-27T16:00:00Z'); // 12:00 in New York

function grade(state: ReviewSnapshot, g: Grade, now = NOON, isCold = true) {
  return next(state, { kind: 'graded', grade: g, isCold }, SR_V1, now, TZ).next;
}

function run(grades: Grade[], start = initialSnapshot(SR_V1)): ReviewSnapshot {
  return grades.reduce((state, g) => grade(state, g), start);
}

const localDue = (state: ReviewSnapshot) => localDateOf(new Date(state.dueAt ?? ''), TZ);

describe('scheduler sr-v1', () => {
  it('SR-1 first cold pass → 3 days, reviewing', () => {
    const state = grade(initialSnapshot(SR_V1), 'pass');

    expect(state.intervalDays).toBe(3);
    expect(state.masteryStatus).toBe('reviewing');
    expect(localDue(state)).toBe('2026-10-30');
  });

  it('SR-2 first cold miss → 1 day, learning, no lapse', () => {
    const state = grade(initialSnapshot(SR_V1), 'miss');

    expect(state.intervalDays).toBe(1);
    expect(state.masteryStatus).toBe('learning');
    expect(state.lapseCount).toBe(0);
    expect(localDue(state)).toBe('2026-10-28');
  });

  it('SR-3 repeated passes grow monotonically and cap at 180 days', () => {
    let state = initialSnapshot(SR_V1);
    const intervals: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      state = grade(state, 'pass');
      intervals.push(state.intervalDays);
    }

    expect(intervals.slice(0, 3)).toEqual([3, 8, 22]);
    for (let i = 1; i < intervals.length; i += 1)
      expect(intervals[i]).toBeGreaterThanOrEqual(intervals[i - 1] ?? 0);
    expect(intervals.at(-1)).toBe(180);
  });

  it('reaches mastered after 3 consecutive cold passes with an interval of at least 21 days', () => {
    expect(run(['pass', 'pass']).masteryStatus).toBe('reviewing');
    expect(run(['pass', 'pass', 'pass']).masteryStatus).toBe('mastered');
  });

  it('SR-4 ease stays within [1.3, 3.0] over 1,000 random sequences', () => {
    let seed = 42;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const grades: Grade[] = ['pass', 'partial', 'miss'];
    for (let sequence = 0; sequence < 1000; sequence += 1) {
      let state = initialSnapshot(SR_V1);
      for (let step = 0; step < 25; step += 1) {
        state = grade(state, grades[Math.floor(random() * 3)] ?? 'pass');
        expect(state.ease).toBeGreaterThanOrEqual(1.3);
        expect(state.ease).toBeLessThanOrEqual(3.0);
        expect(state.intervalDays).toBeLessThanOrEqual(180);
      }
    }
  });

  it('SR-5 a miss from mastered lapses: lapse count +1, due tomorrow, pre-lapse interval kept', () => {
    const mastered = run(['pass', 'pass', 'pass']);
    const lapsed = grade(mastered, 'miss');

    expect(lapsed.masteryStatus).toBe('lapsed');
    expect(lapsed.lapseCount).toBe(1);
    expect(lapsed.intervalDays).toBe(1);
    expect(lapsed.preLapseIntervalDays).toBe(22);
    expect(localDue(lapsed)).toBe('2026-10-28');
  });

  it('SR-6 the recovery pass after a lapse uses the recovery factor and clears the pre-lapse interval', () => {
    const recovered = run(['pass', 'pass', 'pass', 'miss', 'pass']);

    expect(recovered.intervalDays).toBe(11); // 22 × 0.5
    expect(recovered.preLapseIntervalDays).toBeNull();
    expect(recovered.masteryStatus).toBe('reviewing');
  });

  it('SR-7 a partial from reviewing does not count as a lapse but keeps the pre-lapse interval', () => {
    const state = run(['pass', 'pass', 'partial']);

    expect(state.lapseCount).toBe(0);
    expect(state.preLapseIntervalDays).toBe(8);
    expect(state.masteryStatus).toBe('lapsed');
    expect(run(['pass', 'pass', 'partial', 'pass']).intervalDays).toBe(6); // max(3, round(8 × 0.7))
  });

  it('SR-8 a non-cold pass never increases the interval', () => {
    const reviewing = run(['pass', 'pass']);
    const after = grade(reviewing, 'pass', NOON, false);

    expect(after.intervalDays).toBe(reviewing.intervalDays);
    expect(after.ease).toBe(reviewing.ease);
    expect(after.consecutiveColdPasses).toBe(reviewing.consecutiveColdPasses);
    expect(after.dueAt).toBe(reviewing.dueAt);
  });

  it('a non-cold pass on a never-scheduled concept schedules the first cold check tomorrow', () => {
    const state = grade(initialSnapshot(SR_V1), 'pass', NOON, false);

    expect(localDue(state)).toBe('2026-10-28');
    expect(state.masteryStatus).toBe('learning');
    expect(state.totalColdAttempts).toBe(0);
  });

  it('SR-9 a non-cold miss pulls the due date earlier but never later', () => {
    const reviewing = run(['pass', 'pass']);
    const missed = grade(reviewing, 'miss', NOON, false);
    expect(localDue(missed)).toBe('2026-10-28');
    expect(missed.intervalDays).toBe(reviewing.intervalDays);

    const dueToday = { ...reviewing, dueAt: startOfLocalDay('2026-10-27', TZ).toISOString() };
    expect(grade(dueToday, 'miss', NOON, false).dueAt).toBe(dueToday.dueAt);
  });

  it('SR-10 a manual override keeps counters, sets the flag, and the next grade clears it', () => {
    const reviewing = run(['pass', 'pass']);
    const overridden = next(
      reviewing,
      { kind: 'manual_override', dueOn: '2026-11-15', reason: 'exam prep' },
      SR_V1,
      NOON,
      TZ,
    );

    expect(overridden.eventType).toBe('manual_override');
    expect(overridden.next.manualDueOverride).toBe(true);
    expect(localDue(overridden.next)).toBe('2026-11-15');
    expect({ ...overridden.next, dueAt: null, manualDueOverride: false }).toEqual({
      ...reviewing,
      dueAt: null,
    });
    expect(grade(overridden.next, 'pass').manualDueOverride).toBe(false);
  });

  it('SR-11 grading at 23:59 vs 00:01 local yields due dates one day apart', () => {
    const late = grade(initialSnapshot(SR_V1), 'miss', at('2026-10-28T03:59:00Z')); // 23:59 Oct 27 in New York
    const early = grade(initialSnapshot(SR_V1), 'miss', at('2026-10-28T04:01:00Z')); // 00:01 Oct 28

    expect(localDue(late)).toBe('2026-10-28');
    expect(localDue(early)).toBe('2026-10-29');
  });

  it.each([
    ['America/New_York', '2026-03-07T17:00:00Z', '2026-03-08', '2026-03-08T05:00:00.000Z'], // spring forward
    ['America/New_York', '2026-10-31T16:00:00Z', '2026-11-01', '2026-11-01T04:00:00.000Z'], // fall back
    ['Europe/London', '2026-03-28T12:00:00Z', '2026-03-29', '2026-03-29T00:00:00.000Z'],
    ['Europe/London', '2026-10-24T12:00:00Z', '2026-10-25', '2026-10-24T23:00:00.000Z'], // midnight is still BST
  ])('SR-12 DST in %s: due at local midnight', (zone, nowIso, expectedDate, expectedUtc) => {
    const state = next(
      initialSnapshot(SR_V1),
      { kind: 'graded', grade: 'miss', isCold: true },
      SR_V1,
      at(nowIso),
      zone,
    ).next;

    expect(localDateOf(new Date(state.dueAt ?? ''), zone)).toBe(expectedDate);
    expect(state.dueAt).toBe(expectedUtc);
  });

  it('SR-15 the config version is part of the config, and overrides produce a distinct version', () => {
    expect(SR_V1.version).toBe('sr-v1');
    const custom = resolveConfig({ firstPassIntervalDays: 4 });
    expect(custom.version).toBe('sr-v1+overrides');
    expect(
      next(
        initialSnapshot(custom),
        { kind: 'graded', grade: 'pass', isCold: true },
        custom,
        NOON,
        TZ,
      ).next.intervalDays,
    ).toBe(4);
    expect(resolveConfig({ unknownKey: 1 })).toBe(SR_V1);
    expect(resolveConfig(null)).toBe(SR_V1);
  });
});

describe('dates', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('finds local midnight in a zone east of UTC', () => {
    expect(startOfLocalDay('2026-10-27', 'Asia/Tokyo').toISOString()).toBe(
      '2026-10-26T15:00:00.000Z',
    );
  });
});
