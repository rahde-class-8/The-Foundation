import { AnthropicDraftProvider } from './adapters/anthropic-drafts.ts';
import { AnthropicEvaluationProvider } from './adapters/anthropic.ts';
import { MockDraftProvider } from './adapters/mock-drafts.ts';
import { MockEvaluationProvider } from './adapters/mock.ts';
import type { AiConfig } from './config.ts';
import type { DraftProvider, EvaluationProvider } from './types.ts';

/** Returns the configured grader, or null when AI grading is disabled or not configured. */
export function createEvaluationProvider(config: AiConfig): EvaluationProvider | null {
  switch (config.provider) {
    case 'mock':
      return new MockEvaluationProvider();
    case 'anthropic':
      return config.anthropicApiKey
        ? new AnthropicEvaluationProvider(
            config.gradingModel,
            config.effort,
            config.anthropicApiKey,
          )
        : null;
    case 'none':
      return null;
  }
}

/** Returns the configured drafter, or null when AI is disabled or not configured. */
export function createDraftProvider(config: AiConfig): DraftProvider | null {
  switch (config.provider) {
    case 'mock':
      return new MockDraftProvider();
    case 'anthropic':
      return config.anthropicApiKey
        ? new AnthropicDraftProvider(config.gradingModel, config.effort, config.anthropicApiKey)
        : null;
    case 'none':
      return null;
  }
}
