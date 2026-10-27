import type { DueReview, DueReviews, History, Misconception } from '../api/schemas';

export const CONCEPT = '00000000-0000-4000-8000-0000000000c1';

export const item = (over: Partial<DueReview> = {}): DueReview => ({
  conceptId: CONCEPT,
  conceptTitle: 'Execution limits',
  serviceSlug: 'lambda',
  serviceName: 'AWS Lambda',
  masteryStatus: 'lapsed',
  dueAt: '2026-11-10T05:00:00Z',
  intervalDays: 1,
  ease: 2.2,
  lastColdGrade: 'miss',
  lapseCount: 1,
  lastReviewedAt: '2026-11-09T15:00:00Z',
  manualDueOverride: false,
  activeMisconceptions: 1,
  priority: 8.3,
  version: 4,
  ...over,
});

export const due = (
  items: DueReview[],
  counts = { today: items.length, overdue: 0, upcoming: 2 },
): DueReviews => ({
  now: '2026-11-10T15:00:00Z',
  timezone: 'America/New_York',
  today: '2026-11-10',
  counts,
  items,
});

export const history: History = {
  concept: {
    id: CONCEPT,
    title: 'Execution limits',
    serviceSlug: 'lambda',
    serviceName: 'AWS Lambda',
  },
  state: {
    masteryStatus: 'lapsed',
    intervalDays: 1,
    ease: 2.2,
    dueAt: '2026-11-10T05:00:00Z',
    lapseCount: 1,
  },
  events: [
    {
      id: 'e2',
      eventType: 'manual_override',
      occurredAt: '2026-11-09T16:00:00Z',
      attemptId: null,
      grade: null,
      isCold: null,
      prevDueAt: '2026-11-10T05:00:00Z',
      newDueAt: '2026-11-12T05:00:00Z',
      prevIntervalDays: 1,
      newIntervalDays: 1,
      prevStatus: 'lapsed',
      newStatus: 'lapsed',
      reason: 'Busy day',
    },
    {
      id: 'e1',
      eventType: 'graded',
      occurredAt: '2026-11-09T15:00:00Z',
      attemptId: 'a1',
      grade: 'miss',
      isCold: true,
      prevDueAt: '2026-11-09T05:00:00Z',
      newDueAt: '2026-11-10T05:00:00Z',
      prevIntervalDays: 8,
      newIntervalDays: 1,
      prevStatus: 'reviewing',
      newStatus: 'lapsed',
      reason: null,
    },
  ],
  attempts: [
    {
      id: 'a1',
      attemptKind: 'initial',
      isCold: true,
      status: 'finalized',
      submittedAt: '2026-11-09T14:59:00Z',
      finalizedAt: '2026-11-09T15:00:00Z',
      grade: 'miss',
      gradeSource: 'ai',
      dimension: 'what',
      questionVersion: 1,
    },
  ],
  misconceptions: [
    {
      id: 'm1',
      statementMd: 'Lambda runs for hours.',
      correctionMd: 'At most 15 minutes.',
      status: 'active',
      occurrenceCount: 2,
    },
  ],
};

export const misconceptions: Misconception[] = [
  {
    id: 'm1',
    slug: 'hours-long',
    statementMd: 'Lambda runs for hours.',
    correctionMd: 'At most 15 minutes.',
    occurrenceCount: 2,
    recurring: true,
    lastSeenAt: '2026-11-09T15:00:00Z',
    concept: {
      id: CONCEPT,
      title: 'Execution limits',
      serviceSlug: 'lambda',
      serviceName: 'AWS Lambda',
    },
  },
];
