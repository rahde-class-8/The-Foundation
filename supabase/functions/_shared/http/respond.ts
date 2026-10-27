import { ApiError } from './errors.ts';

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** Wraps a POST handler: CORS preflight, JSON body parsing (64 KB cap), and the error envelope. */
export async function handle(
  request: Request,
  run: (body: unknown) => Promise<unknown>,
): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  const requestId = crypto.randomUUID();
  try {
    if (request.method !== 'POST') throw new ApiError('validation_failed', 'Use POST.');
    const text = await request.text();
    if (text.length > 64 * 1024)
      throw new ApiError('validation_failed', 'Request body is too large.');
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      throw new ApiError('validation_failed', 'Request body must be JSON.');
    }
    return json(await run(body));
  } catch (error) {
    const apiError =
      error instanceof ApiError ? error : new ApiError('internal', 'Something went wrong.', true);
    if (!(error instanceof ApiError))
      console.error(JSON.stringify({ requestId, error: String(error) }));
    return json(
      {
        error: {
          code: apiError.code,
          message: apiError.message,
          requestId,
          retryable: apiError.retryable,
        },
      },
      apiError.status,
    );
  }
}
