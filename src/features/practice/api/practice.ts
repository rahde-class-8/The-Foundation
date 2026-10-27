import {
  EvaluateResponseSchema,
  EvaluationViewSchema,
  FinalizeResponseSchema,
} from '@core/contracts/practice.ts';
import { invokeFunction } from '@/lib/functions';
import { supabase } from '@/lib/supabase';
import {
  AttemptSchema,
  CandidatesSchema,
  ReferenceSchema,
  ScopesSchema,
  SessionSchema,
  SessionStateSchema,
  SummarySchema,
  type Grade,
} from './schemas';

export type ScopeType = 'service' | 'concept' | 'domain' | 'due_reviews' | 'weak' | 'mixed';

function unwrap<T>(context: string, result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
}

export async function getScopes() {
  return ScopesSchema.parse(
    unwrap('Could not load practice options', await supabase.rpc('practice_scopes')),
  );
}

export async function startSession(scopeType: ScopeType, scopeId?: string) {
  const data = unwrap(
    'Could not start a session',
    await supabase.rpc('start_session', {
      scope_type: scopeType,
      ...(scopeId ? { scope_id: scopeId } : {}),
    }),
  );
  return SessionSchema.parse(data);
}

export async function getSessionState(sessionId: string) {
  const data = unwrap(
    'Could not load the session',
    await supabase.rpc('session_state', { session_id: sessionId }),
  );
  return data === null ? null : SessionStateSchema.parse(data);
}

export async function getCandidates(sessionId: string) {
  return CandidatesSchema.parse(
    unwrap(
      'Could not load questions',
      await supabase.rpc('next_questions', { session_id: sessionId }),
    ),
  );
}

export async function submitAttempt(input: {
  sessionId: string;
  questionVersionId: string;
  answer: string;
  clientKey: string;
  parentAttemptId?: string;
  durationMs?: number;
}) {
  const data = unwrap(
    'Could not save your answer',
    await supabase.rpc('submit_attempt', {
      session_id: input.sessionId,
      question_version_id: input.questionVersionId,
      answer_md: input.answer,
      client_key: input.clientKey,
      attempt_kind: input.parentAttemptId ? 'correction' : 'initial',
      ...(input.parentAttemptId ? { parent_attempt_id: input.parentAttemptId } : {}),
      ...(input.durationMs !== undefined
        ? { answer_duration_ms: Math.round(input.durationMs) }
        : {}),
    }),
  );
  return AttemptSchema.parse(data);
}

export async function revealReference(attemptId: string) {
  return ReferenceSchema.parse(
    unwrap(
      'Could not load the reference answer',
      await supabase.rpc('reveal_reference', { attempt_id: attemptId }),
    ),
  );
}

export async function submitSelfEvaluation(input: {
  attemptId: string;
  grade: Grade;
  ticks?: Record<string, string>;
  reason?: string;
}) {
  const data = unwrap(
    'Could not save your grade',
    await supabase.rpc('submit_self_evaluation', {
      attempt_id: input.attemptId,
      grade: input.grade,
      ...(input.ticks ? { ticks: input.ticks } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
    }),
  );
  return EvaluationViewSchema.parse(data);
}

export function evaluateAttempt(attemptId: string, retry = false) {
  return invokeFunction(
    'evaluate-attempt',
    { attemptId, ...(retry ? { retry: true } : {}) },
    EvaluateResponseSchema,
  );
}

export function finalizeAttempt(attemptId: string, finalEvaluationId: string) {
  return invokeFunction(
    'finalize-attempt',
    { attemptId, finalEvaluationId },
    FinalizeResponseSchema,
  );
}

export async function endSession(sessionId: string) {
  return SummarySchema.parse(
    unwrap(
      'Could not end the session',
      await supabase.rpc('end_session', { session_id: sessionId }),
    ),
  );
}
