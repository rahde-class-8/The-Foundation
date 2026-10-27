import type { EvaluationView } from '@core/contracts/practice.ts';
import type { Candidates, Reference, SessionAttempt, SessionState } from '../api/schemas';

export const SESSION = '00000000-0000-4000-8000-000000000001';
export const ATTEMPT = '00000000-0000-4000-8000-000000000002';
export const CONCEPT = '00000000-0000-4000-8000-000000000003';
export const QV = '00000000-0000-4000-8000-000000000004';
let n = 100;
export const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

export const settings = {
  timezone: 'America/New_York',
  aiGradingEnabled: true,
  defaultEvalMode: 'ai_first' as const,
  dailyNewLimit: 10,
  dailyReviewLimit: 100,
  activeCertificationId: null,
};

export const candidates = (count = 1): Candidates => ({
  sessionStatus: 'active',
  endOfToday: '2026-10-28T04:00:00.000Z',
  newConceptsRemaining: 10,
  candidates: Array.from({ length: count }, (_, i) => ({
    questionId: uuid(),
    questionVersionId: i === 0 ? QV : uuid(),
    conceptId: i === 0 ? CONCEPT : uuid(),
    conceptTitle: 'Execution limits',
    serviceSlug: 'lambda',
    serviceName: 'AWS Lambda',
    promptMd: 'Why is Lambda wrong for a **40-minute** job?',
    dimension: 'not_do',
    difficulty: 2,
    review: null,
    lastAnsweredAt: null,
    dimensionAccuracy: null,
    conceptAttemptedInSession: false,
  })),
});

export const sessionState = (attempts: SessionAttempt[] = []): SessionState => ({
  id: SESSION,
  scopeType: 'mixed',
  scopeId: null,
  status: 'active',
  startedAt: '2026-10-27T15:00:00Z',
  endedAt: null,
  attempts,
});

export const attempt = (overrides: Partial<SessionAttempt> = {}): SessionAttempt => ({
  id: ATTEMPT,
  attemptKind: 'initial',
  parentAttemptId: null,
  isCold: true,
  status: 'submitted',
  answerMd: 'It stops at fifteen minutes.',
  questionVersionId: QV,
  conceptId: CONCEPT,
  conceptTitle: 'Execution limits',
  serviceName: 'AWS Lambda',
  promptMd: 'Why is Lambda wrong for a **40-minute** job?',
  dimension: 'not_do',
  referenceRevealed: false,
  finalEvaluationId: null,
  submittedAt: '2026-10-27T15:05:00Z',
  finalizedAt: null,
  evaluations: [],
  nextDueAt: null,
  ...overrides,
});

export const reference: Reference = {
  referenceAnswerMd: 'A Lambda invocation can run for at most 15 minutes.',
  rubric: {
    points: [
      { id: 'p1', text: 'Maximum duration is 15 minutes', weight: 3, critical: true },
      { id: 'p2', text: 'Use Step Functions or containers instead', weight: 2, critical: true },
    ],
    knownMisconceptions: [],
    thresholds: { pass: 0.8, partial: 0.4 },
  },
};

export const evaluation = (overrides: Partial<EvaluationView> = {}): EvaluationView => ({
  id: uuid(),
  attemptId: ATTEMPT,
  source: 'ai',
  status: 'completed',
  grade: 'pass',
  rubricScore: 100,
  confidence: 0.9,
  feedback: {
    schemaVersion: 1,
    pointJudgements: [
      { pointId: 'p1', verdict: 'covered', evidenceQuote: null },
      { pointId: 'p2', verdict: 'covered', evidenceQuote: null },
    ],
    incorrectStatements: [],
    misconceptions: [],
    missingSummary: '',
    feedbackMd: 'Clear and correct.',
    correctionPrompt: null,
    suggestedGrade: 'pass',
    confidence: 0.9,
  },
  provider: 'anthropic',
  model: 'claude-opus-5-5',
  errorCode: null,
  overridesEvaluationId: null,
  createdAt: '2026-10-27T15:06:00Z',
  ...overrides,
});
