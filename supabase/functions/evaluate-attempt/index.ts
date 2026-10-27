// POST /evaluate-attempt: AI grading with self-assessment fallback (API_CONTRACTS §4).
import { readAiConfig } from '../_shared/ai/config.ts';
import { createEvaluationProvider } from '../_shared/ai/index.ts';
import { createPracticeStore } from '../_shared/db/practice-store.ts';
import { authenticate, readServerEnv, serviceClient } from '../_shared/http/auth.ts';
import { handle } from '../_shared/http/respond.ts';
import { evaluateAttempt } from '../_shared/practice/evaluate.ts';

const env = readServerEnv((name) => Deno.env.get(name));
const config = readAiConfig((name) => Deno.env.get(name));
const provider = createEvaluationProvider(config);
const store = createPracticeStore(serviceClient(env));

Deno.serve((request) =>
  handle(request, async (body) => {
    const userId = await authenticate(request, env);
    return evaluateAttempt({ store, provider, config, now: () => new Date() }, userId, body);
  }),
);
