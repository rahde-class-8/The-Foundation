import { z } from '../deps.ts';

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string().min(1),
  coreVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  checkedAt: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const CORE_VERSION = '0.1.0';

export function buildHealthResponse(service: string, now: Date): HealthResponse {
  return HealthResponseSchema.parse({
    status: 'ok',
    service,
    coreVersion: CORE_VERSION,
    checkedAt: now.toISOString(),
  });
}
