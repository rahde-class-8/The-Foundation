// POST /ingest-source: validate, extract, and segment one batch of an import job (API_CONTRACTS §4).
import { ingestSource } from '../_shared/content/ingest.ts';
import { unpdfReader } from '../_shared/content/unpdf-reader.ts';
import { createContentStore } from '../_shared/db/content-store.ts';
import { authenticate, readServerEnv, serviceClient } from '../_shared/http/auth.ts';
import { handle } from '../_shared/http/respond.ts';

const env = readServerEnv((name) => Deno.env.get(name));
const store = createContentStore(serviceClient(env));

Deno.serve((request) =>
  handle(request, async (body) => {
    const userId = await authenticate(request, env);
    return ingestSource({ store, pdf: unpdfReader }, userId, body);
  }),
);
