import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import * as api from '../api/reviews';
import { CONCEPT, due, history, item, misconceptions } from '../test/fixtures';
import { ReviewsPage } from './ReviewsPage';

vi.mock('../api/reviews', () => ({
  getDueReviews: vi.fn(),
  getConceptHistory: vi.fn(),
  getMisconceptions: vi.fn(),
  overrideSchedule: vi.fn(),
}));
const m = vi.mocked(api);

function renderReviews(path = '/reviews') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '/reviews', element: <ReviewsPage /> }], {
    initialEntries: [path],
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  vi.resetAllMocks();
  m.getDueReviews.mockImplementation(async (window) =>
    window === 'today'
      ? due([
          item(),
          item({
            conceptId: '00000000-0000-4000-8000-0000000000c2',
            conceptTitle: 'Concurrency',
            masteryStatus: 'reviewing',
            lastColdGrade: 'pass',
            activeMisconceptions: 0,
            priority: 0.4,
          }),
        ])
      : due([], { today: 2, overdue: 0, upcoming: 2 }),
  );
  m.getMisconceptions.mockResolvedValue(misconceptions);
  m.getConceptHistory.mockResolvedValue(history);
});

describe('Weak Box', () => {
  it('lists due reviews in priority order with status and links to start a session (WB-1, WB-2, WB-7)', async () => {
    renderReviews();

    const list = await screen.findByRole('list', { name: 'Reviews' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Execution limits');
    expect(rows[0]).toHaveTextContent('Lapsed');
    expect(rows[0]).toHaveTextContent('1 misconception');
    expect(rows[1]).toHaveTextContent('Concurrency');
    expect(screen.getByRole('link', { name: 'Start review session (2)' })).toHaveAttribute(
      'href',
      '/practice?start=due_reviews',
    );
    expect(screen.getByRole('link', { name: 'Practice weak concepts' })).toHaveAttribute(
      'href',
      '/practice?start=weak',
    );
  });

  it('switches windows with the tabs and the arrow keys', async () => {
    const user = userEvent.setup();
    const router = renderReviews();
    await screen.findByRole('list', { name: 'Reviews' });

    await user.click(screen.getByRole('tab', { name: /Upcoming/ }));
    expect(await screen.findByText(/No upcoming reviews yet/)).toBeInTheDocument();
    expect(router.state.location.search).toBe('?tab=upcoming');

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: /Overdue/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Overdue/ })).toHaveFocus();
  });

  it('reschedules with a date and reason, reusing the client key on retry (WB-3, P3-4)', async () => {
    const user = userEvent.setup();
    m.overrideSchedule.mockRejectedValueOnce(
      new Error('The override-schedule service is unavailable.'),
    );
    m.overrideSchedule.mockResolvedValueOnce({
      replayed: false,
      reviewState: {
        conceptId: CONCEPT,
        masteryStatus: 'lapsed',
        intervalDays: 1,
        dueAt: '2026-11-12T05:00:00Z',
        manualDueOverride: true,
      },
      event: { id: '00000000-0000-4000-8000-00000000e001', eventType: 'manual_override' },
    });
    renderReviews();

    await user.click(await screen.findByRole('button', { name: 'Reschedule Execution limits' }));
    const dialog = screen.getByRole('dialog', { name: 'Reschedule Execution limits' });
    const date = within(dialog).getByLabelText('New review date');
    expect(date).toHaveAttribute('min', '2026-11-10');
    expect(within(dialog).getByRole('button', { name: 'Reschedule' })).toBeDisabled();
    await user.clear(date);
    await user.type(date, '2026-11-12');
    await user.type(within(dialog).getByLabelText('Reason'), 'Busy day');
    await user.click(within(dialog).getByRole('button', { name: 'Reschedule' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('unavailable');

    await user.click(within(dialog).getByRole('button', { name: 'Reschedule' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Execution limits moved to');
    const [first, second] = m.overrideSchedule.mock.calls.map(([input]) => input);
    expect(first).toEqual({
      conceptId: CONCEPT,
      dueOn: '2026-11-12',
      reason: 'Busy day',
      clientKey: expect.any(String),
    });
    expect(second?.clientKey).toBe(first?.clientKey);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows the full history of a concept, oldest first (WB-4)', async () => {
    const user = userEvent.setup();
    renderReviews();

    await user.click(await screen.findByRole('button', { name: 'History of Execution limits' }));

    const drawer = await screen.findByRole('dialog', { name: 'Execution limits' });
    const entries = within(within(drawer).getByRole('list', { name: 'Timeline' })).getAllByRole(
      'listitem',
    );
    expect(entries.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Answer'),
      expect.stringContaining('Scheduled'),
      expect.stringContaining('Rescheduled'),
    ]);
    expect(within(drawer).getByText(/Busy day/)).toBeInTheDocument();
    expect(within(drawer).getByText('Lambda runs for hours.')).toBeInTheDocument();
  });

  it('lists recurring misconceptions with the affected concept (WB-6)', async () => {
    renderReviews();

    const panel = (await screen.findByRole('heading', { name: 'Misconceptions' })).closest(
      'section',
    )!;
    expect(await within(panel).findByText('Recurring')).toBeInTheDocument();
    expect(
      within(panel).getByRole('link', { name: 'AWS Lambda: Execution limits' }),
    ).toHaveAttribute('href', '/services/lambda');
  });
});
