import type { JobView } from '@core/contracts/content.ts';
import type { Draft, Overview } from '../api/schemas';

export const job = (over: Partial<JobView> = {}): JobView => ({
  id: '00000000-0000-4000-8000-0000000000j1'.replace('j', 'a'),
  sourceId: '00000000-0000-4000-8000-0000000000s1'.replace('s', 'b'),
  jobType: 'pdf_extract',
  status: 'succeeded',
  progressPct: 100,
  passageCount: 12,
  errorCode: null,
  errorDetail: null,
  hasMore: false,
  runCount: 1,
  result: null,
  createdAt: '2026-10-29T10:00:00Z',
  finishedAt: '2026-10-29T10:01:00Z',
  ...over,
});

export const overview = (over: Partial<Overview> = {}): Overview => ({
  isOwner: true,
  sources: [
    {
      id: '00000000-0000-4000-8000-0000000000b1',
      title: 'SQS notes.pdf',
      sourceType: 'user_upload',
      trustTier: 'personal',
      status: 'ready',
      byteSize: 4096,
      pageCount: 3,
      createdAt: '2026-10-29T10:00:00Z',
      passageCount: 12,
      job: job(),
    },
    {
      id: '00000000-0000-4000-8000-0000000000b2',
      title: 'Scan.pdf',
      sourceType: 'user_upload',
      trustTier: 'personal',
      status: 'failed',
      byteSize: 4096,
      pageCount: null,
      createdAt: '2026-10-29T09:00:00Z',
      passageCount: 0,
      job: job({
        id: '00000000-0000-4000-8000-0000000000a2',
        status: 'failed',
        errorCode: 'no_extractable_text',
        progressPct: 0,
      }),
    },
  ],
  drafts: [
    {
      id: '00000000-0000-4000-8000-0000000000d1',
      title: 'Dead-letter queues',
      status: 'draft',
      serviceName: 'Amazon SQS',
      serviceSlug: 'sqs',
      createdAt: '2026-10-29T10:00:00Z',
      questionCount: 1,
      citationCount: 1,
    },
  ],
  stale: [
    {
      id: 's',
      title: 'SQS quotas',
      url: 'https://docs.aws.amazon.com/sqs',
      sourceType: 'aws_documentation',
      retrievedAt: '2024-01-01T00:00:00Z',
      conceptCount: 2,
    },
  ],
  ...over,
});

export const draft = (over: Partial<Draft> = {}): Draft => ({
  id: '00000000-0000-4000-8000-0000000000d1',
  title: 'Dead-letter queues',
  status: 'draft',
  origin: 'ai_draft',
  summaryMd: 'Where failed messages go.',
  explanationMd: 'After several receives a message moves aside.',
  limitationsMd: null,
  revision: 1,
  service: { id: 'svc', slug: 'sqs', name: 'Amazon SQS' },
  domainIds: [],
  citations: [
    {
      passageId: 'p1',
      supportType: 'defines',
      text: 'A dead-letter queue holds messages that failed several times.',
      pageStart: 2,
      pageEnd: 2,
      sectionPath: 'Dead letters',
      sourceTitle: 'SQS notes.pdf',
      sourceType: 'user_upload',
      trustTier: 'personal',
    },
  ],
  questions: [
    {
      id: 'q1',
      dimension: 'problem',
      difficulty: 2,
      status: 'draft',
      version: 1,
      promptMd: 'Why add a dead-letter queue?',
      referenceAnswerMd: 'To hold messages that keep failing.',
      rubric: {
        schemaVersion: 1,
        points: [{ id: 'p1', text: 'Holds failing messages', weight: 3, critical: true }],
      },
    },
  ],
  ...over,
});
