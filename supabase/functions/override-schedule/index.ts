// POST /override-schedule: move a concept's next review to a chosen date (API_CONTRACTS §4).
import { createPracticeStore } from '../_shared/db/practice-store.ts';
import { authenticate, readServerEnv, serviceClient } from '../_shared/http/auth.ts';
import { handle } from '../_shared/http/respond.ts';
import { overrideSchedule } from '../_shared/reviews/override.ts';

const env = readServerEnv((name) => Deno.env.get(name));
const store = createPracticeStore(serviceClient(env));

Deno.serve((request) =>
  handle(request, async (body) => {
    const userId = await authenticate(request, env);
    return overrideSchedule({ store }, userId, body);
  }),
);
