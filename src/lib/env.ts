import { z } from 'zod';

const EnvSchema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid environment configuration. See .env.example.\n${problems.join('\n')}`);
  }
  return result.data;
}

export const env: Env = parseEnv(import.meta.env);
