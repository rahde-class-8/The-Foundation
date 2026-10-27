// POST /generate-drafts: draft concepts and questions from selected passages (API_CONTRACTS §4).
import { readAiConfig } from '../_shared/ai/config.ts';
import { createDraftProvider } from '../_shared/ai/index.ts';
import { generateDrafts } from '../_shared/content/generate.ts';
import { createContentStore } from '../_shared/db/content-store.ts';
import { authenticate, readServerEnv, serviceClient } from '../_shared/http/auth.ts';
import { handle } from '../_shared/http/respond.ts';

const env = readServerEnv((name) => Deno.env.get(name));
const config = readAiConfig((name) => Deno.env.get(name));
const provider = createDraftProvider(config);
const store = createContentStore(serviceClient(env));

Deno.serve((request) =>
  handle(request, async (body) => {
    const userId = await authenticate(request, env);
    return generateDrafts({ store, provider, config }, userId, body);
  }),
);
