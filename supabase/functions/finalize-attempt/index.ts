// POST /finalize-attempt: freeze the grade and schedule the next review (API_CONTRACTS §4).
import { createPracticeStore } from '../_shared/db/practice-store.ts';
import { authenticate, readServerEnv, serviceClient } from '../_shared/http/auth.ts';
import { handle } from '../_shared/http/respond.ts';
import { finalizeAttempt } from '../_shared/practice/finalize.ts';

const env = readServerEnv((name) => Deno.env.get(name));
const store = createPracticeStore(serviceClient(env));

Deno.serve((request) =>
  handle(request, async (body) => {
    const userId = await authenticate(request, env);
    return finalizeAttempt({ store }, userId, body);
  }),
);
