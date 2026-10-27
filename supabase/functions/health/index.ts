// Liveness probe that also proves Edge Functions can import the shared domain core (ADR-0002).
import { buildHealthResponse } from '../_shared/core/contracts/health.ts';

Deno.serve((request) => {
  if (request.method !== 'GET') {
    return new Response(null, { status: 405, headers: { Allow: 'GET' } });
  }
  return Response.json(buildHealthResponse('edge-functions', new Date()));
});
