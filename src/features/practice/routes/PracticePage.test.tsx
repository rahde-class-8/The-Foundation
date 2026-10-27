import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import * as settingsFeature from '@/features/settings';
import * as api from '../api/practice';
import {
  ATTEMPT,
  attempt,
  candidates,
  evaluation,
  QV,
  reference,
  SESSION,
  sessionState,
  settings,
} from '../test/fixtures';
import { PracticePage } from './PracticePage';

vi.mock('../api/practice', () => ({
  getScopes: vi.fn(),
  startSession: vi.fn(),
  getSessionState: vi.fn(),
  getCandidates: vi.fn(),
  submitAttempt: vi.fn(),
  revealReference: vi.fn(),
  submitSelfEvaluation: vi.fn(),
  evaluateAttempt: vi.fn(),
  finalizeAttempt: vi.fn(),
  endSession: vi.fn(),
}));
vi.mock('@/features/settings/api/settings', () => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
}));

const m = vi.mocked(api);

function renderPractice(path = `/practice?session=${SESSION}`) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '/practice', element: <PracticePage /> }], {
    initialEntries: [path],
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

/** Mimics the server: submitting creates the attempt that session_state then returns. */
function serverWith(initial = sessionState()) {
  let state = initial;
  m.getSessionState.mockImplementation(async () => state);
  m.getCandidates.mockImplementation(async () =>
    state.attempts.some((a) => a.status === 'finalized') ? { ...candidates(0) } : candidates(1),
  );
  m.submitAttempt.mockImplementation(async (input) => {
    if (input.parentAttemptId) {
      return {
        id: '00000000-0000-4000-8000-0000000000c1',
        status: 'submitted',
        isCold: false,
        attemptKind: 'correction',
        parentAttemptId: ATTEMPT,
        conceptId: attempt().conceptId,
        questionVersionId: QV,
        submittedAt: '',
      };
    }
    state = sessionState([attempt({ answerMd: input.answer })]);
    return {
      id: ATTEMPT,
      status: 'submitted',
      isCold: true,
      attemptKind: 'initial',
      parentAttemptId: null,
      conceptId: attempt().conceptId,
      questionVersionId: QV,
      submittedAt: '',
    };
  });
  m.finalizeAttempt.mockImplementation(async () => {
    state = sessionState([attempt({ status: 'finalized' })]);
    return {
      replayed: false,
      reviewState: {
        conceptId: attempt().conceptId,
        masteryStatus: 'reviewing',
        intervalDays: 3,
        dueAt: '2026-10-30T04:00:00.000Z',
      },
    };
  });
  return { setState: (next: typeof state) => (state = next) };
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(settingsFeature.getSettings).mockResolvedValue(settings);
  m.revealReference.mockResolvedValue(reference);
  m.endSession.mockResolvedValue({
    finalized: 1,
    pass: 1,
    partial: 0,
    miss: 0,
    cold: 1,
    toReview: [],
  });
});

async function answer(text: string) {
  await userEvent.type(await screen.findByLabelText('Your answer'), text);
  await userEvent.keyboard('{Control>}{Enter}{/Control}');
}

describe('PracticePage', () => {
  it('runs the golden path: answer, AI grade, accept, schedule, next (DoD 4–8)', async () => {
    serverWith();
    m.evaluateAttempt.mockResolvedValue({ evaluation: evaluation() });

    renderPractice();
    await answer('Fifteen minutes; use Step Functions.');

    expect(m.submitAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        questionVersionId: QV,
        answer: 'Fifteen minutes; use Step Functions.',
      }),
    );
    expect(await screen.findByRole('heading', { name: 'AI grade' })).toBeInTheDocument();
    expect(screen.getByText('Pass')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Accept and continue' }));
    await userEvent.click(await screen.findByRole('button', { name: /Continue/ }));

    expect(await screen.findByText(/Next review:/)).toHaveTextContent('Friday, October 30');
    expect(m.finalizeAttempt).toHaveBeenCalledWith(ATTEMPT, expect.any(String));
    await userEvent.keyboard('n');
    expect(
      await screen.findByText('Nothing more to practice in this session.'),
    ).toBeInTheDocument();
  });

  it('falls back to self-assessment when AI grading fails, with keyboard grading (REC-5, REC-9)', async () => {
    serverWith();
    m.evaluateAttempt.mockResolvedValue({
      evaluation: evaluation({
        status: 'failed',
        grade: null,
        errorCode: 'timeout',
        feedback: null,
      }),
      fallback: 'self_assessment',
    });
    m.submitSelfEvaluation.mockResolvedValue(
      evaluation({
        source: 'self',
        grade: 'partial',
        feedback: { schemaVersion: 1, kind: 'self', ticks: {} },
      }),
    );

    renderPractice();
    await answer('Fifteen minutes.');

    expect(await screen.findByRole('heading', { name: 'Grade it yourself' })).toBeInTheDocument();
    expect(screen.getByText('The AI grader took too long.')).toBeInTheDocument();
    expect(screen.getByText('A Lambda invocation can run for at most 15 minutes.')).toBeVisible();
    const p1 = screen.getByRole('radiogroup', { name: 'Maximum duration is 15 minutes' });
    await userEvent.click(within(p1).getByLabelText('Covered'));
    const p2 = screen.getByRole('radiogroup', { name: 'Use Step Functions or containers instead' });
    await userEvent.click(within(p2).getByLabelText('Missing'));
    expect(screen.getByText(/Suggested grade from your checklist/)).toHaveTextContent('partial');

    await userEvent.keyboard('2');

    expect(m.submitSelfEvaluation).toHaveBeenCalledWith({
      attemptId: ATTEMPT,
      grade: 'partial',
      ticks: { p1: 'covered', p2: 'missing' },
    });
    expect(await screen.findByRole('heading', { name: 'Correct it' })).toBeInTheDocument();
    expect(screen.getByText(/Use Step Functions or containers instead/)).toBeInTheDocument();
  });

  it('lets the learner override an AI grade, then correct and continue (REC-6, REC-7)', async () => {
    serverWith();
    m.evaluateAttempt.mockResolvedValueOnce({ evaluation: evaluation() }).mockResolvedValueOnce({
      evaluation: evaluation({
        grade: 'pass',
        attemptId: '00000000-0000-4000-8000-0000000000c1',
      }),
    });
    m.submitSelfEvaluation.mockResolvedValue(
      evaluation({ source: 'override', grade: 'miss', createdAt: '2026-10-27T15:07:00Z' }),
    );

    renderPractice();
    await answer('A guess.');
    await userEvent.click(await screen.findByRole('button', { name: 'Change the grade' }));
    await userEvent.type(screen.getByLabelText(/Why are you changing the grade/), 'I guessed');
    await userEvent.click(screen.getByRole('button', { name: /Miss/ }));

    expect(m.submitSelfEvaluation).toHaveBeenCalledWith({
      attemptId: ATTEMPT,
      grade: 'miss',
      reason: 'I guessed',
    });
    await userEvent.type(
      await screen.findByLabelText(/Your correction/),
      'Lambda stops at 15 minutes; use Step Functions.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Submit correction' }));

    expect(m.submitAttempt).toHaveBeenLastCalledWith(
      expect.objectContaining({ parentAttemptId: ATTEMPT }),
    );
    expect(await screen.findByText(/Correction graded/)).toHaveTextContent('pass');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/Next review:/)).toBeInTheDocument();
  });

  it('switches to self-grading while the AI is still working', async () => {
    serverWith();
    m.evaluateAttempt.mockReturnValue(new Promise(() => {}));

    renderPractice();
    await answer('Fifteen minutes.');
    expect(await screen.findByRole('status')).toHaveTextContent('Your answer is saved. Grading');
    await userEvent.click(screen.getByRole('button', { name: 'Grade it myself' }));

    expect(await screen.findByRole('heading', { name: 'Grade it yourself' })).toBeInTheDocument();
  });

  it('resumes an interrupted attempt after a reload (REC-10)', async () => {
    serverWith(sessionState([attempt({ status: 'evaluated', evaluations: [evaluation()] })]));

    renderPractice();

    expect(await screen.findByRole('heading', { name: 'AI grade' })).toBeInTheDocument();
    expect(screen.getByText('It stops at fifteen minutes.')).toBeInTheDocument();
    expect(m.evaluateAttempt).not.toHaveBeenCalled();
  });

  it('keeps the draft and its client key when saving fails, so a retry cannot duplicate (REC-3)', async () => {
    serverWith();
    m.submitAttempt.mockRejectedValueOnce(new Error('Could not save your answer: network down'));
    m.evaluateAttempt.mockResolvedValue({ evaluation: evaluation() });

    renderPractice();
    await answer('My answer');

    expect(await screen.findByRole('alert')).toHaveTextContent('network down');
    expect(screen.getByLabelText('Your answer')).toHaveValue('My answer');
    await userEvent.click(screen.getByRole('button', { name: 'Submit answer' }));

    await waitFor(() => expect(m.submitAttempt).toHaveBeenCalledTimes(2));
    const keys = m.submitAttempt.mock.calls.map(([input]) => input.clientKey);
    expect(keys[0]).toBe(keys[1]);
  });

  it('restores an unsent draft after a reload', async () => {
    serverWith();
    const first = renderPractice();
    await userEvent.type(await screen.findByLabelText('Your answer'), 'Half-written thought');
    first.dispose();
    document.body.innerHTML = '';

    renderPractice();

    expect(await screen.findByLabelText('Your answer')).toHaveValue('Half-written thought');
  });

  it('explains when nothing is available to practice', async () => {
    m.getSessionState.mockResolvedValue(sessionState());
    m.getCandidates.mockResolvedValue(candidates(0));

    renderPractice();

    expect(
      await screen.findByText('No questions are available for this selection.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Practice uses published content only/)).toBeInTheDocument();
  });

  it('ends a session with a summary', async () => {
    serverWith();

    renderPractice();
    await userEvent.click(await screen.findByRole('button', { name: 'End session' }));

    expect(await screen.findByRole('heading', { name: 'Session complete' })).toBeInTheDocument();
  });
});

describe('scope picker', () => {
  it('explains that unreviewed content cannot be practiced', async () => {
    m.getScopes.mockResolvedValue({
      services: [],
      domains: [],
      dueCount: 0,
      weakCount: 0,
      totalQuestions: 0,
    });

    renderPractice('/practice');

    expect(await screen.findByText('No published questions yet.')).toBeInTheDocument();
  });

  it('starts a session for a chosen service', async () => {
    m.getScopes.mockResolvedValue({
      services: [
        {
          id: '00000000-0000-4000-8000-0000000000f1',
          slug: 'lambda',
          name: 'AWS Lambda',
          questionCount: 6,
        },
      ],
      domains: [],
      dueCount: 0,
      weakCount: 0,
      totalQuestions: 6,
    });
    m.startSession.mockResolvedValue({
      id: SESSION,
      scopeType: 'service',
      scopeId: null,
      status: 'active',
      startedAt: '',
    });
    serverWith();
    const router = renderPractice('/practice');

    await userEvent.click(await screen.findByLabelText(/One service/));
    await userEvent.click(screen.getByRole('button', { name: 'Start session' }));

    expect(m.startSession).toHaveBeenCalledWith('service', '00000000-0000-4000-8000-0000000000f1');
    await waitFor(() => expect(router.state.location.search).toBe(`?session=${SESSION}`));
  });

  it('starts directly from a "Practice this service" link (LIB-9)', async () => {
    m.startSession.mockResolvedValue({
      id: SESSION,
      scopeType: 'service',
      scopeId: null,
      status: 'active',
      startedAt: '',
    });
    serverWith();
    const router = renderPractice(
      '/practice?start=service&id=00000000-0000-4000-8000-0000000000f1',
    );

    await waitFor(() => expect(router.state.location.search).toBe(`?session=${SESSION}`));
    expect(m.startSession).toHaveBeenCalledWith('service', '00000000-0000-4000-8000-0000000000f1');
  });
});
