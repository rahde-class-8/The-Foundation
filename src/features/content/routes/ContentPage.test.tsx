import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import * as api from '../api/content';
import { job, overview } from '../test/fixtures';
import { ContentPage } from './ContentPage';

vi.mock('../api/content', () => ({
  getOverview: vi.fn(),
  searchPassages: vi.fn(),
  listServices: vi.fn(),
  uploadPdf: vi.fn(),
  createNote: vi.fn(),
  ingest: vi.fn(),
  generateDrafts: vi.fn(),
}));
const m = vi.mocked(api);

function renderContent(path = '/content') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '/content', element: <ContentPage /> }], {
    initialEntries: [path],
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

const pdf = (name: string, head: string, size = 1000) =>
  new File([head + 'x'.repeat(Math.max(0, size - head.length))], name, { type: 'application/pdf' });

beforeEach(() => {
  vi.resetAllMocks();
  m.getOverview.mockResolvedValue(overview());
  m.listServices.mockResolvedValue([
    { id: '00000000-0000-4000-8000-00000000c0de', name: 'Amazon SQS' },
  ]);
});

describe('Content: sources (CNT-2, CNT-3, CNT-8)', () => {
  it('lists sources with the "Your notes" badge and typed failure messages', async () => {
    renderContent();
    const list = await screen.findByRole('list', { name: 'Sources' });
    const [ready, failed] = within(list).getAllByRole('listitem');
    expect(ready).toHaveTextContent('SQS notes.pdf');
    expect(ready).toHaveTextContent('Your notes');
    expect(ready).toHaveTextContent('12 passages');
    expect(within(failed!).getByRole('alert')).toHaveTextContent(
      'No text was found. Scanned PDFs need OCR',
    );
  });

  it('rejects a renamed non-PDF before uploading anything (CNT-2a)', async () => {
    const user = userEvent.setup();
    renderContent();
    await screen.findByRole('list', { name: 'Sources' });

    await user.upload(screen.getByLabelText('Upload PDF'), pdf('setup.pdf', 'MZ\u0090\u0000'));

    expect(await screen.findByText('This is not a PDF file.')).toHaveAttribute('role', 'alert');
    expect(m.uploadPdf).not.toHaveBeenCalled();
  });

  it('uploads a PDF and keeps calling ingest-source until the job finishes', async () => {
    const user = userEvent.setup();
    const running = job({ status: 'queued', progressPct: 0, hasMore: true, passageCount: 0 });
    m.uploadPdf.mockImplementation(async (_file, _title, onProgress) => {
      onProgress(100);
      return running;
    });
    m.ingest
      .mockResolvedValueOnce({ job: { ...running, status: 'running', progressPct: 40 } })
      .mockResolvedValueOnce({ job: job({ passageCount: 7 }) });
    renderContent();
    await screen.findByRole('list', { name: 'Sources' });

    await user.upload(screen.getByLabelText('Upload PDF'), pdf('queues.pdf', '%PDF-1.7\n'));

    await waitFor(() => expect(m.ingest).toHaveBeenCalledTimes(2));
    expect(m.uploadPdf).toHaveBeenCalledWith(expect.any(File), 'queues.pdf', expect.any(Function));
    expect(m.getOverview.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('saves a note and segments it', async () => {
    const user = userEvent.setup();
    m.createNote.mockResolvedValue(
      job({ jobType: 'note_segment', status: 'queued', hasMore: true }),
    );
    m.ingest.mockResolvedValue({ job: job({ jobType: 'note_segment' }) });
    renderContent();

    await user.click(await screen.findByRole('button', { name: 'Add a note' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a note' });
    await user.type(within(dialog).getByLabelText('Title'), 'Queue notes');
    await user.type(within(dialog).getByLabelText('Note'), '# Queues{enter}They buffer work.');
    await user.click(within(dialog).getByRole('button', { name: 'Save note' }));

    await waitFor(() => expect(m.ingest).toHaveBeenCalled());
    expect(m.createNote).toHaveBeenCalledWith('Queue notes', '# Queues\nThey buffer work.');
  });
});

describe('Content: passages and drafts (CNT-4, CNT-5, CNT-10a)', () => {
  it('searches passages, renders them as sanitized Markdown, and generates drafts from a selection', async () => {
    const user = userEvent.setup();
    m.searchPassages.mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-0000000000e1',
        ordinal: 3,
        text: 'Messages move to a **dead-letter queue**. <script>window.hacked = true</script> [x](javascript:alert(1))',
        pageStart: 2,
        pageEnd: 3,
        sectionPath: 'Dead letters',
        sourceId: '00000000-0000-4000-8000-0000000000b1',
        sourceTitle: 'SQS notes.pdf',
        sourceType: 'user_upload',
        trustTier: 'personal',
      },
    ]);
    m.generateDrafts.mockResolvedValue({
      job: job({ jobType: 'draft_generation', sourceId: null }),
      drafts: [
        {
          conceptId: '00000000-0000-4000-8000-0000000000d9',
          title: 'Dead-letter queues',
          questionCount: 1,
        },
      ],
      rejected: [{ title: 'Other', reason: 'has no citations' }],
    });
    renderContent('/content?tab=passages');

    const list = await screen.findByRole('list', { name: 'Passages' });
    expect(list).toHaveTextContent('pages 2–3 · Dead letters');
    expect(list.querySelector('script')).toBeNull();
    expect(within(list).queryByRole('link')).toBeNull();
    await user.click(
      within(list).getByRole('checkbox', { name: 'Select passage 3 of SQS notes.pdf' }),
    );
    await user.selectOptions(screen.getByLabelText('Up to'), '2');
    await user.click(screen.getByRole('button', { name: 'Generate drafts' }));

    expect(await screen.findByRole('link', { name: 'Dead-letter queues' })).toHaveAttribute(
      'href',
      '/content/drafts/00000000-0000-4000-8000-0000000000d9',
    );
    expect(screen.getByText(/Skipped “Other”: has no citations/)).toBeInTheDocument();
    expect(m.generateDrafts).toHaveBeenCalledWith({
      passageIds: ['00000000-0000-4000-8000-0000000000e1'],
      serviceId: '00000000-0000-4000-8000-00000000c0de',
      maxConcepts: 2,
    });
  });

  it('lists drafts to review and stale citations', async () => {
    const user = userEvent.setup();
    renderContent('/content?tab=drafts');
    expect(await screen.findByRole('link', { name: 'Review Dead-letter queues' })).toHaveAttribute(
      'href',
      '/content/drafts/00000000-0000-4000-8000-0000000000d1',
    );
    await user.click(screen.getByRole('tab', { name: 'Re-check' }));
    expect(await screen.findByRole('list', { name: 'Stale citations' })).toHaveTextContent(
      'Last checked 2024-01-01',
    );
  });
});
