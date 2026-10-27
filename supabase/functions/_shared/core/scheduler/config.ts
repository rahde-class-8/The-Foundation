import { z } from '../deps.ts';

/** Scheduler parameters (SPACED_REPETITION §4). Configs are immutable and versioned by name. */
export const SchedulerConfigSchema = z.object({
  version: z.string().min(1),
  missIntervalDays: z.number().int().min(0).max(30),
  partialIntervalDays: z.number().int().min(0).max(30),
  firstPassIntervalDays: z.number().int().min(1).max(60),
  initialEase: z.number().min(1.3).max(3),
  easeMin: z.number().min(1),
  easeMax: z.number().max(5),
  easeDeltaPass: z.number(),
  easeDeltaPartial: z.number(),
  easeDeltaMiss: z.number(),
  recoveryFactorPartial: z.number().min(0).max(1),
  recoveryFactorMiss: z.number().min(0).max(1),
  maxIntervalDays: z.number().int().min(1).max(3650),
  masteredMinPasses: z.number().int().min(1),
  masteredMinIntervalDays: z.number().int().min(1),
  coldGapHours: z.number().min(0).max(168),
});

export type SchedulerConfig = z.infer<typeof SchedulerConfigSchema>;

export const SR_V1: SchedulerConfig = Object.freeze({
  version: 'sr-v1',
  missIntervalDays: 1,
  partialIntervalDays: 1,
  firstPassIntervalDays: 3,
  initialEase: 2.5,
  easeMin: 1.3,
  easeMax: 3.0,
  easeDeltaPass: 0.1,
  easeDeltaPartial: -0.15,
  easeDeltaMiss: -0.3,
  recoveryFactorPartial: 0.7,
  recoveryFactorMiss: 0.5,
  maxIntervalDays: 180,
  masteredMinPasses: 3,
  masteredMinIntervalDays: 21,
  coldGapHours: 8,
});

/** Per-learner overrides (user_settings.scheduler_overrides) applied on top of a base config. */
export const SchedulerOverridesSchema = SchedulerConfigSchema.omit({ version: true })
  .partial()
  .strict();

export function resolveConfig(overrides: unknown, base: SchedulerConfig = SR_V1): SchedulerConfig {
  const parsed = SchedulerOverridesSchema.safeParse(overrides ?? {});
  if (!parsed.success || Object.keys(parsed.data).length === 0) return base;
  return SchedulerConfigSchema.parse({
    ...base,
    ...parsed.data,
    version: `${base.version}+overrides`,
  });
}
