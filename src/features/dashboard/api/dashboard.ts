import { z } from 'zod';
import { supabase } from '@/lib/supabase';

const num = z.coerce.number();
const ratio = num.nullable();
const accuracy = z.object({
  n: z.number(),
  pass: z.number(),
  partial: z.number(),
  strict: ratio,
  lenient: ratio,
});
const status = z.enum(['new', 'learning', 'reviewing', 'mastered', 'lapsed']);

export const DashboardSchema = z.object({
  now: z.string(),
  today: z.string(),
  timezone: z.string(),
  windowDays: z.number(),
  certification: z
    .object({ id: z.string(), code: z.string(), examVersion: z.string(), name: z.string() })
    .nullable(),
  counts: z.object({
    dueToday: z.number(),
    overdue: z.number(),
    newAvailable: z.number(),
    completedSessions: z.number(),
    recurringMisconceptions: z.number(),
  }),
  coldAccuracy: accuracy,
  accuracyByWeek: z.array(accuracy.extend({ weekStart: z.string() })),
  retentionByInterval: z.array(accuracy.extend({ bucket: z.enum(['1', '2-6', '7-20', '21+']) })),
  dimensionAccuracy: z.array(accuracy.extend({ dimension: z.string() })),
  masteryDistribution: z.record(status, z.number()),
  weakest: z.array(
    z.object({
      conceptId: z.string(),
      conceptTitle: z.string(),
      serviceName: z.string(),
      serviceSlug: z.string(),
      masteryStatus: status,
      lastColdGrade: z.enum(['pass', 'partial', 'miss']).nullable(),
      dueAt: z.string().nullable(),
      priority: num,
    }),
  ),
  domains: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      weightPct: num,
      published: z.number(),
      covered: z.number(),
      coverage: ratio,
      performance: accuracy,
      retention7: accuracy,
      readinessContribution: num,
    }),
  ),
  readiness: z.object({
    label: z.string(),
    coldAttempts: z.number(),
    threshold: z.number(),
    visible: z.boolean(),
    value: ratio,
  }),
  recentActivity: z.array(
    z.object({
      type: z.enum(['attempt', 'override', 'session', 'published']),
      at: z.string(),
      conceptTitle: z.string().optional(),
      grade: z.enum(['pass', 'partial', 'miss']).nullable().optional(),
      isCold: z.boolean().optional(),
      newDueAt: z.string().nullable().optional(),
      reason: z.string().nullable().optional(),
      scopeType: z.string().optional(),
    }),
  ),
});
export type Dashboard = z.infer<typeof DashboardSchema>;

export async function getDashboard(certificationId?: string) {
  const { data, error } = await supabase.rpc(
    'dashboard_summary',
    certificationId ? { certification_id: certificationId } : {},
  );
  if (error) throw new Error(`Could not load the dashboard: ${error.message}`);
  return DashboardSchema.parse(data);
}
