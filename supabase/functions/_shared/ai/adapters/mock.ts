import type { EvaluationOutput } from '../../core/grading/evaluation.ts';
import type { EvaluationProvider, EvaluationRequest, ProviderResult } from '../types.ts';

const STOPWORDS = new Set([
  'that',
  'with',
  'from',
  'this',
  'than',
  'have',
  'they',
  'when',
  'into',
  'your',
  'their',
  'there',
  'which',
  'about',
  'only',
  'more',
  'does',
  'each',
]);
const words = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w)),
  );

/**
 * Deterministic stand-in grader for local development and tests (never a production default).
 * Marks a rubric point covered when the answer shares most of its key words. Markers in the answer
 * simulate failures: [[mock:timeout]], [[mock:rate-limited]], [[mock:error]], [[mock:invalid]], [[mock:refused]].
 * [[mock:misconception:<slug>]] diagnoses a misconception with that slug (Weak Box tests).
 */
export class MockEvaluationProvider implements EvaluationProvider {
  readonly id = 'mock';
  readonly model = 'mock-grader-v1';

  evaluate(request: EvaluationRequest): Promise<ProviderResult> {
    const answer = request.answer;
    if (answer.includes('[[mock:timeout]]'))
      return Promise.resolve({
        ok: false,
        error: 'timeout',
        retryable: true,
        message: 'mock timeout',
      });
    if (answer.includes('[[mock:rate-limited]]'))
      return Promise.resolve({
        ok: false,
        error: 'rate_limited',
        retryable: true,
        message: 'mock 429',
      });
    if (answer.includes('[[mock:error]]'))
      return Promise.resolve({
        ok: false,
        error: 'provider_error',
        retryable: true,
        message: 'mock 500',
      });
    if (answer.includes('[[mock:refused]]'))
      return Promise.resolve({
        ok: false,
        error: 'refused',
        retryable: false,
        message: 'mock refusal',
      });
    if (answer.includes('[[mock:invalid]]')) {
      return Promise.resolve({
        ok: false,
        error: 'invalid_response',
        retryable: false,
        message: 'mock invalid JSON',
        rawExcerpt: '{"pointJudgements": [',
      });
    }

    const answerWords = words(answer);
    const judgements = request.rubric.points.map((point) => {
      const pointWords = [...words(point.text)];
      const hits = pointWords.filter((w) => answerWords.has(w)).length;
      const ratio = pointWords.length === 0 ? 0 : hits / pointWords.length;
      return {
        pointId: point.id,
        verdict: ratio >= 0.5 ? 'covered' : ratio >= 0.25 ? 'partial' : 'missing',
        ratio,
      } as const;
    });
    const missing = request.rubric.points.filter(
      (p) => judgements.find((j) => j.pointId === p.id)?.verdict !== 'covered',
    );
    const covered = judgements.filter((j) => j.verdict === 'covered').length;

    const value: EvaluationOutput = {
      pointJudgements: judgements.map((j) => ({
        pointId: j.pointId,
        verdict: j.verdict,
        evidenceQuote: null,
      })),
      incorrectStatements: [],
      misconceptions: [...answer.matchAll(/\[\[mock:misconception:([a-z0-9-]+)\]\]/g)].map((m) => ({
        knownSlug: null,
        proposedSlug: m[1] ?? null,
        statement: `Mock misconception ${m[1] ?? ''}`,
        correction: 'Mock correction.',
      })),
      missingSummary:
        missing.length === 0
          ? 'Nothing important is missing.'
          : `Not covered: ${missing.map((p) => p.text).join('; ')}.`,
      feedbackMd: `Mock grader: ${covered} of ${judgements.length} rubric points matched by keywords.`,
      correctionPrompt:
        missing.length === 0 ? null : `In your own words, what about "${missing[0]?.text}"?`,
      suggestedGrade: missing.length === 0 ? 'pass' : covered > 0 ? 'partial' : 'miss',
      confidence: 0.5,
    };
    return Promise.resolve({
      ok: true,
      value,
      usage: { inputTokens: 0, outputTokens: 0 },
      model: this.model,
      rawExcerpt: JSON.stringify(value).slice(0, 4000),
    });
  }

  costUsd(): number {
    return 0;
  }
}
