import { z } from '../deps.ts';

// Weak Box contracts (API_CONTRACTS §4): POST /override-schedule.

export const OverrideRequestSchema = z
  .object({
    conceptId: z.uuid(),
    dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().max(300),
    clientKey: z.uuid(),
  })
  .strict();
export type OverrideRequest = z.infer<typeof OverrideRequestSchema>;

export const OverrideResponseSchema = z.object({
  replayed: z.boolean(),
  reviewState: z.object({
    conceptId: z.uuid(),
    masteryStatus: z.enum(['new', 'learning', 'reviewing', 'mastered', 'lapsed']),
    intervalDays: z.number().int(),
    dueAt: z.string().nullable(),
    manualDueOverride: z.boolean(),
  }),
  event: z.object({ id: z.uuid(), eventType: z.literal('manual_override') }),
});
export type OverrideResponse = z.infer<typeof OverrideResponseSchema>;
