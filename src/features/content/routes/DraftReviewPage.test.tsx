import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import * as api from '../api/content';
import { draft } from '../test/fixtures';
import { DraftReviewPage } from './DraftReviewPage';

vi.mock('../api/content', () => ({
  getDraft: vi.fn(),
  getDomains: vi.fn(),
  saveDraft: vi.fn(),
  publishDraft: vi.fn(),
  rejectDraft: vi.fn(),
}));
const m = vi.mocked(api);

function renderReview() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: '/content/drafts/:id', element: <DraftReviewPage /> },
      { path: '*', element: <p>elsewhere</p> },
    ],
    { initialEntries: ['/content/drafts/00000000-0000-4000-8000-0000000000d1'] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  vi.resetAllMocks();
  m.getDraft.mockResolvedValue(draft());
  m.getDomains.mockResolvedValue([
    { id: 'd1', code: 'D1', name: 'Resilient', certification: 'SAA' },
  ]);
  m.saveDraft.mockImplementation(async () => draft());
});

describe('Draft review (CNT-6, P4-4)', () => {
  it('shows cited passages beside the draft and flags notes-only content', async () => {
    renderReview();
    expect(await screen.findByLabelText('Title')).toHaveValue('Dead-letter queues');
    const aside = screen.getByRole('complementary', { name: 'Cited passages' });
    expect(aside).toHaveTextContent(
      'A dead-letter queue holds messages that failed several times.',
    );
    expect(aside).toHaveTextContent('Not verified against AWS docs');
    expect(aside).toHaveTextContent('Your notes');
  });

  it('approves only after the whole checklist is ticked, saving edits first', async () => {
    const user = userEvent.setup();
    m.publishDraft.mockResolvedValue({ id: 'x', status: 'published', revision: 1 });
    const router = renderReview();

    const approve = await screen.findByRole('button', { name: 'Approve and publish' });
    await user.clear(screen.getByLabelText('Prompt'));
    await user.type(screen.getByLabelText('Prompt'), 'When would you add a dead-letter queue?');
    await user.click(screen.getByLabelText(/D1 Resilient/));
    expect(approve).toBeDisabled();
    for (const box of screen
      .getAllByRole('checkbox')
      .filter((b) => b.closest('fieldset')?.textContent?.includes('Review checklist'))) {
      await user.click(box);
    }
    expect(approve).toBeEnabled();
    await user.click(approve);

    await waitFor(() => expect(router.state.location.pathname).toBe('/services/sqs'));
    expect(m.saveDraft).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-0000000000d1',
      expect.objectContaining({
        domainIds: ['d1'],
        questions: [
          expect.objectContaining({ promptMd: 'When would you add a dead-letter queue?' }),
        ],
      }),
    );
    expect(m.publishDraft).toHaveBeenCalledWith('00000000-0000-4000-8000-0000000000d1');
  });

  it('shows the server validation message when publishing fails', async () => {
    const user = userEvent.setup();
    m.publishDraft.mockRejectedValue(
      new Error(
        'Could not publish: cannot publish: placeholder text (TODO, TBD, [[…]]) must be replaced',
      ),
    );
    renderReview();
    await screen.findByRole('button', { name: 'Approve and publish' });
    for (const box of screen
      .getAllByRole('checkbox')
      .filter((b) => b.closest('fieldset')?.textContent?.includes('Review checklist'))) {
      await user.click(box);
    }
    await user.click(screen.getByRole('button', { name: 'Approve and publish' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('placeholder text');
  });

  it('rejects a draft', async () => {
    const user = userEvent.setup();
    m.rejectDraft.mockResolvedValue({ id: 'x', status: 'retired' });
    const router = renderReview();
    await user.click(await screen.findByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/content'));
    expect(m.saveDraft).not.toHaveBeenCalled();
  });
});
