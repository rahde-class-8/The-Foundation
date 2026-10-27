import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { EvaluationOutputSchema } from '../../core/grading/evaluation.ts';
import { buildGradingPrompt } from '../prompts/grading/v1.ts';
import type {
  EvaluationProvider,
  EvaluationRequest,
  ProviderResult,
  TokenUsage,
} from '../types.ts';

/** USD per million tokens (input, output); update with published pricing. */
export const PRICING: Record<string, [number, number]> = {
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
};

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** Claude grader using structured outputs, validated again by the core schema (ADR-0004). */
export class AnthropicEvaluationProvider implements EvaluationProvider {
  readonly id = 'anthropic';
  readonly model: string;
  private readonly effort: Effort;
  private readonly client: Anthropic;

  // Plain fields (no parameter properties) so Node can run this file directly (scripts/calibrate.ts).
  constructor(model: string, effort: Effort, apiKey: string) {
    this.model = model;
    this.effort = effort;
    // Retries and timeouts are owned by evaluateWithPolicy.
    this.client = new Anthropic({ apiKey, maxRetries: 0 });
  }

  async evaluate(
    request: EvaluationRequest,
    options: { signal: AbortSignal; timeoutMs: number },
  ): Promise<ProviderResult> {
    const { system, user } = buildGradingPrompt(request);
    try {
      const response = await this.client.beta.messages.parse(
        {
          model: this.model,
          max_tokens: 16000,
          system,
          messages: [{ role: 'user', content: user }],
          output_config: { effort: this.effort, format: zodOutputFormat(EvaluationOutputSchema) },
          // On a policy decline the API re-runs the request on Anthropic's recommended fallback model.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        },
        { signal: options.signal, timeout: options.timeoutMs },
      );

      const rawExcerpt = response.content
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('')
        .slice(0, 4000);
      if (response.stop_reason === 'refusal') {
        return {
          ok: false,
          error: 'refused',
          retryable: false,
          message: 'the model declined to grade this answer',
          rawExcerpt,
        };
      }
      const parsed = EvaluationOutputSchema.safeParse(response.parsed_output);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'invalid_response',
          retryable: false,
          message: parsed.error.message.slice(0, 500),
          rawExcerpt,
        };
      }
      return {
        ok: true,
        value: parsed.data,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        model: response.model,
        rawExcerpt,
      };
    } catch (error) {
      return mapError(error);
    }
  }

  costUsd(usage: TokenUsage): number {
    const [input, output] = PRICING[this.model] ?? [0, 0];
    return (usage.inputTokens * input + usage.outputTokens * output) / 1_000_000;
  }
}

export function mapError<T>(error: unknown): ProviderResult<T> {
  const message = error instanceof Error ? error.message.slice(0, 500) : String(error);
  if (
    error instanceof Anthropic.APIUserAbortError ||
    error instanceof Anthropic.APIConnectionTimeoutError
  ) {
    return { ok: false, error: 'timeout', retryable: true, message };
  }
  if (error instanceof Anthropic.RateLimitError)
    return { ok: false, error: 'rate_limited', retryable: true, message };
  if (error instanceof Anthropic.InternalServerError)
    return { ok: false, error: 'provider_error', retryable: true, message };
  if (error instanceof Anthropic.APIConnectionError)
    return { ok: false, error: 'provider_error', retryable: true, message };
  if (error instanceof Anthropic.APIError)
    return { ok: false, error: 'provider_error', retryable: false, message };
  if (error instanceof SyntaxError)
    return { ok: false, error: 'invalid_response', retryable: false, message };
  return { ok: false, error: 'provider_error', retryable: false, message };
}
