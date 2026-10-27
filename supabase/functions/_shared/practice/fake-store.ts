import type { EvaluationView } from '../core/contracts/practice.ts';
import type { ReviewSnapshot } from '../core/scheduler/next.ts';
import {
  VersionConflictError,
  type AiEvaluationRecord,
  type AttemptContext,
  type PracticeStore,
  type StoredReviewState,
} from './store.ts';

/** In-memory PracticeStore for handler tests. */
export class FakeStore implements PracticeStore {
  contexts = new Map<string, AttemptContext>();
  states = new Map<string, StoredReviewState>();
  recorded: AiEvaluationRecord[] = [];
  usage = { count: 0, costUsd: 0 };
  conflictsToThrow = 0;
  finalizeCalls: { transition: ReviewSnapshot | null; expectedVersion: number }[] = [];
  private seq = 0;

  async getAttemptContext(_userId: string, attemptId: string) {
    return this.contexts.get(attemptId) ?? null;
  }

  async aiUsageSince() {
    return this.usage;
  }

  async recordAiEvaluation(
    _userId: string,
    attemptId: string,
    record: AiEvaluationRecord,
  ): Promise<EvaluationView> {
    this.recorded.push(record);
    const view: EvaluationView = {
      id: `00000000-0000-4000-8000-${String(++this.seq).padStart(12, '0')}`,
      attemptId,
      source: 'ai',
      status: record.status,
      grade: record.grade ?? null,
      rubricScore: record.rubricScore ?? null,
      confidence: record.confidence ?? null,
      feedback: record.feedback ?? null,
      provider: record.provider ?? null,
      model: record.model ?? null,
      errorCode: record.errorCode ?? null,
      overridesEvaluationId: null,
      createdAt: new Date(Date.UTC(2026, 9, 27, 10, 0, this.seq)).toISOString(),
    };
    this.contexts.get(attemptId)?.evaluations.push(view);
    return view;
  }

  async getReviewState(_userId: string, conceptId: string) {
    return this.states.get(conceptId) ?? null;
  }

  async finalizeAttempt(input: Parameters<PracticeStore['finalizeAttempt']>[0]) {
    this.finalizeCalls.push({
      transition: input.transition,
      expectedVersion: input.expectedVersion,
    });
    if (this.conflictsToThrow > 0) {
      this.conflictsToThrow -= 1;
      throw new VersionConflictError('conflict');
    }
    const context = this.contexts.get(input.attemptId);
    if (!context) throw new Error('missing attempt');
    const replayed = context.attempt.status === 'finalized';
    context.attempt.status = 'finalized';
    if (!replayed && input.transition) {
      const previous = this.states.get(context.attempt.conceptId);
      this.states.set(context.attempt.conceptId, {
        ...input.transition,
        version: (previous?.version ?? 0) + 1,
      });
    }
    const state = this.states.get(context.attempt.conceptId);
    return {
      replayed,
      state:
        input.transition || replayed
          ? state
            ? { ...state, conceptId: context.attempt.conceptId }
            : null
          : null,
    };
  }
}
