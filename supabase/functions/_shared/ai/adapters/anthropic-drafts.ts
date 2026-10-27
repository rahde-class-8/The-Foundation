import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { DraftOutputSchema, type DraftOutput } from '../../core/content/drafts.ts';
import { buildDraftPrompt } from '../prompts/drafts/v1.ts';
import type { DraftProvider, DraftRequest, ProviderResult, TokenUsage } from '../types.ts';
import { mapError, PRICING, type Effort } from './anthropic.ts';

/** Claude drafter using structured outputs; the core validates citations again (CONTENT_GOVERNANCE §5). */
export class AnthropicDraftProvider implements DraftProvider {
  readonly id = 'anthropic';
  readonly model: string;
  private readonly effort: Effort;
  private readonly client: Anthropic;

  constructor(model: string, effort: Effort, apiKey: string) {
    this.model = model;
    this.effort = effort;
    // Retries and timeouts are owned by withPolicy.
    this.client = new Anthropic({ apiKey, maxRetries: 0 });
  }

  async generateDrafts(
    request: DraftRequest,
    options: { signal: AbortSignal; timeoutMs: number },
  ): Promise<ProviderResult<DraftOutput>> {
    const { system, user } = buildDraftPrompt(request);
    try {
      const response = await this.client.beta.messages.parse(
        {
          model: this.model,
          max_tokens: 32000,
          system,
          messages: [{ role: 'user', content: user }],
          output_config: { effort: this.effort, format: zodOutputFormat(DraftOutputSchema) },
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
          message: 'the model declined to draft from these passages',
          rawExcerpt,
        };
      }
      const parsed = DraftOutputSchema.safeParse(response.parsed_output);
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
