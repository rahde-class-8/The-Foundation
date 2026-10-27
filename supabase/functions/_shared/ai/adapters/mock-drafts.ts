import type { DraftOutput } from '../../core/content/drafts.ts';
import type { DraftProvider, DraftRequest, ProviderResult } from '../types.ts';

const sentences = (text: string) =>
  text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

/**
 * Deterministic drafter for local development and tests. One concept per passage, built from its
 * sentences. Markers simulate failures: [[mock:draft-error]] (provider error) and
 * [[mock:cite-unknown]] (cites a passage that was not provided).
 */
export class MockDraftProvider implements DraftProvider {
  readonly id = 'mock';
  readonly model = 'mock-drafter-v1';

  generateDrafts(request: DraftRequest): Promise<ProviderResult<DraftOutput>> {
    const all = request.passages.map((p) => p.text).join('\n');
    if (all.includes('[[mock:draft-error]]')) {
      return Promise.resolve({
        ok: false,
        error: 'provider_error',
        retryable: false,
        message: 'mock drafting error',
      });
    }
    const concepts: DraftOutput['concepts'] = request.passages
      .slice(0, request.maxConcepts)
      .map((passage) => {
        const parts = sentences(passage.text.replace(/\[\[mock:[a-z-]+\]\]/g, ''));
        const first = parts[0] ?? passage.text.slice(0, 120);
        const words = first
          .split(' ')
          .slice(0, 6)
          .join(' ')
          .replace(/[.,;:!?]$/, '');
        return {
          title: words || `Passage ${passage.alias}`,
          summary: first,
          explanation: parts.slice(0, 4).join(' ') || first,
          limitations: null,
          citations: [
            {
              passage: passage.text.includes('[[mock:cite-unknown]]') ? 'P99' : passage.alias,
              support: 'defines',
            },
          ],
          questions: [
            {
              prompt: `In your own words, explain: ${words}.`,
              dimension: 'what',
              difficulty: 2,
              referenceAnswer: parts.slice(0, 2).join(' ') || first,
              rubricPoints: (parts.length > 1 ? parts.slice(0, 2) : [first]).map((text, i) => ({
                text: text.slice(0, 300),
                weight: i === 0 ? 3 : 2,
                critical: i === 0,
              })),
            },
          ],
        };
      });
    return Promise.resolve({
      ok: true,
      value: { concepts },
      usage: { inputTokens: 0, outputTokens: 0 },
      model: this.model,
      rawExcerpt: JSON.stringify({ concepts: concepts.length }),
    });
  }

  costUsd(): number {
    return 0;
  }
}
