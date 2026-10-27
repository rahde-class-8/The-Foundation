import { z } from '../deps.ts';
import type { SchedulerConfig } from './config.ts';
import { localDateOf, type LocalDate } from './dates.ts';
import { next, type ReviewSnapshot } from './next.ts';

export const MAX_OVERRIDE_DAYS_AHEAD = 365;

export const OverrideInputSchema = z.object({
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dueOn must be YYYY-MM-DD'),
  reason: z.string().trim().min(1, 'A reason is required.').max(300),
});

export type OverridePlan = { ok: true; next: ReviewSnapshot } | { ok: false; message: string };

/**
 * Manual reschedule (SPACED_REPETITION §7): due at 00:00 local on a date from today onwards;
 * interval, ease, and counters stay as they are.
 */
export function planOverride(
  state: ReviewSnapshot,
  input: { dueOn: LocalDate; reason: string },
  config: SchedulerConfig,
  now: Date,
  timeZone: string,
): OverridePlan {
  const parsed = OverrideInputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  const { dueOn } = parsed.data;
  const date = new Date(`${dueOn}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dueOn)
    return { ok: false, message: 'dueOn is not a valid date.' };
  const today = localDateOf(now, timeZone);
  if (dueOn < today) return { ok: false, message: 'Pick today or a later date.' };
  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + MAX_OVERRIDE_DAYS_AHEAD);
  if (date > limit) return { ok: false, message: 'Pick a date within the next year.' };
  return {
    ok: true,
    next: next(
      state,
      { kind: 'manual_override', dueOn, reason: parsed.data.reason },
      config,
      now,
      timeZone,
    ).next,
  };
}
