import { AnthropicEvaluationProvider } from './adapters/anthropic.ts';
import { MockEvaluationProvider } from './adapters/mock.ts';
import type { AiConfig } from './config.ts';
import type { EvaluationProvider } from './types.ts';

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
