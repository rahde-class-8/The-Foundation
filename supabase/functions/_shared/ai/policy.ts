import type { EvaluationProvider, EvaluationRequest, ProviderResult } from './types.ts';

export type PolicyOptions = {
  timeoutMs: number;
  deadlineMs: number;
  maxRetries: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

const BACKOFF_MS = [500, 1500, 3000, 5000, 8000];
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Provider-independent timeout, retry, and deadline handling (SYSTEM_ARCHITECTURE §6). Only
 * retryable failures are retried, with backoff and jitter, and never past the overall deadline.
 */
export function evaluateWithPolicy(
  provider: EvaluationProvider,
  request: EvaluationRequest,
  options: PolicyOptions,
): Promise<{ result: ProviderResult; attempts: number; latencyMs: number }> {
  return withPolicy((call) => provider.evaluate(request, call), options);
}

/** Runs any provider call under the shared timeout, retry, and deadline rules. */
export async function withPolicy<T>(
  call: (options: { signal: AbortSignal; timeoutMs: number }) => Promise<ProviderResult<T>>,
  options: PolicyOptions,
): Promise<{ result: ProviderResult<T>; attempts: number; latencyMs: number }> {
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const started = now();
  let attempts = 0;
  let result: ProviderResult<T> = {
    ok: false,
    error: 'timeout',
    retryable: false,
    message: 'deadline exceeded before the first attempt',
  };

  while (attempts <= options.maxRetries) {
    const remaining = options.deadlineMs - (now() - started);
    if (remaining <= 0) break;
    attempts += 1;

    const timeoutMs = Math.min(options.timeoutMs, remaining);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<ProviderResult<T>>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({
          ok: false,
          error: 'timeout',
          retryable: true,
          message: `no response within ${timeoutMs} ms`,
        });
      }, timeoutMs);
    });
    try {
      result = await Promise.race([
        call({ signal: controller.signal, timeoutMs }).catch(
          (error: unknown): ProviderResult<T> => ({
            ok: false,
            error: 'provider_error',
            retryable: true,
            message: error instanceof Error ? error.message : String(error),
          }),
        ),
        timeout,
      ]);
    } finally {
      clearTimeout(timer);
    }

    if (result.ok || !result.retryable || attempts > options.maxRetries) break;
    const base = BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)] ?? 1000;
    const wait = base + Math.floor(Math.random() * base * 0.2);
    if (now() - started + wait >= options.deadlineMs) break;
    await sleep(wait);
  }

  return { result, attempts, latencyMs: now() - started };
}
