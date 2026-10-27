import { z } from '../core/deps.ts';

const intFromEnv = (fallback: number, min: number, max: number) =>
  z.preprocess(
    (v) => (v === undefined || v === '' ? fallback : Number(v)),
    z.number().int().min(min).max(max),
  );
const numFromEnv = (fallback: number, min: number) =>
  z.preprocess((v) => (v === undefined || v === '' ? fallback : Number(v)), z.number().min(min));

/** AI configuration from Edge Function env/secrets (SYSTEM_ARCHITECTURE §6). */
export const AiConfigSchema = z.object({
  provider: z.enum(['anthropic', 'mock', 'none']),
  gradingModel: z.string().min(1),
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']),
  timeoutMs: intFromEnv(30_000, 1_000, 120_000),
  deadlineMs: intFromEnv(45_000, 1_000, 300_000),
  maxRetries: intFromEnv(2, 0, 5),
  monthlyBudgetUsd: numFromEnv(5, 0),
  rateLimitPerHour: intFromEnv(60, 1, 10_000),
  anthropicApiKey: z.string().optional(),
});

export type AiConfig = z.infer<typeof AiConfigSchema>;

/**
 * Reads AI settings. Without an explicit AI_PROVIDER, the local Supabase stack (SUPABASE_URL on the
 * internal "kong" host) uses the mock grader and anything else disables AI grading, so a deployment
 * never silently calls a paid provider or ships a fake grader.
 */
export function readAiConfig(env: (name: string) => string | undefined): AiConfig {
  const explicit = env('AI_PROVIDER');
  const isLocalStack = (env('SUPABASE_URL') ?? '').startsWith('http://kong');
  return AiConfigSchema.parse({
    provider: explicit && explicit !== '' ? explicit : isLocalStack ? 'mock' : 'none',
    gradingModel: env('AI_MODEL_GRADING') || 'claude-opus-5-5',
    effort: env('AI_EFFORT') || 'medium',
    timeoutMs: env('AI_TIMEOUT_MS'),
    deadlineMs: env('AI_DEADLINE_MS'),
    maxRetries: env('AI_MAX_RETRIES'),
    monthlyBudgetUsd: env('AI_MONTHLY_BUDGET_USD'),
    rateLimitPerHour: env('AI_RATE_LIMIT_PER_HOUR'),
    anthropicApiKey: env('ANTHROPIC_API_KEY') || undefined,
  });
}
