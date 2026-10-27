import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import * as api from '../api/dashboard';
import type { Dashboard } from '../api/dashboard';
import { DashboardPage } from './DashboardPage';

vi.mock('../api/dashboard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/dashboard')>()),
  getDashboard: vi.fn(),
}));
const m = vi.mocked(api);

const accuracy = (n: number, pass: number, partial = 0) => ({
  n,
  pass,
  partial,
  strict: n ? pass / n : null,
  lenient: n ? (pass + partial / 2) / n : null,
});

function dashboard(over: Partial<Dashboard> = {}): Dashboard {
  return {
    now: '2026-11-10T15:00:00Z',
    today: '2026-11-10',
    timezone: 'UTC',
    windowDays: 30,
    certification: { id: 'c', code: 'SAA', examVersion: 'C03', name: 'Solutions Architect' },
    counts: {
      dueToday: 3,
      overdue: 1,
      newAvailable: 5,
      completedSessions: 4,
      recurringMisconceptions: 2,
    },
    coldAccuracy: accuracy(20, 15, 2),
    accuracyByWeek: Array.from({ length: 8 }, (_, i) => ({
      weekStart: `2026-09-${String(20 + i).padStart(2, '0')}`,
      ...accuracy(i, Math.floor(i / 2)),
    })),
    retentionByInterval: (['1', '2-6', '7-20', '21+'] as const).map((bucket) => ({
      bucket,
      ...accuracy(4, 3),
    })),
    dimensionAccuracy: [{ dimension: 'not_do', ...accuracy(4, 2) }],
    masteryDistribution: { new: 10, learning: 3, reviewing: 4, mastered: 2, lapsed: 1 },
    weakest: [
      {
        conceptId: 'k1',
        conceptTitle: 'Execution limits',
        serviceName: 'AWS Lambda',
        serviceSlug: 'lambda',
        masteryStatus: 'lapsed',
        lastColdGrade: 'miss',
        dueAt: null,
        priority: 8,
      },
    ],
    domains: [
      {
        id: 'd1',
        code: 'D1',
        name: 'Secure architectures',
        weightPct: 30,
        published: 10,
        covered: 4,
        coverage: 0.4,
        performance: accuracy(8, 6),
        retention7: accuracy(0, 0),
        readinessContribution: 0.09,
      },
    ],
    readiness: {
      label: 'Estimate — not a prediction of exam results',
      coldAttempts: 20,
      threshold: 50,
      visible: false,
      value: null,
    },
    recentActivity: [
      {
        type: 'attempt',
        at: '2026-11-09T15:00:00Z',
        conceptTitle: 'Execution limits',
        grade: 'miss',
        isCold: true,
      },
    ],
    ...over,
  };
}

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '/dashboard', element: <DashboardPage /> }], {
    initialEntries: ['/dashboard'],
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('Dashboard', () => {
  it('shows due counts, cold-recall accuracy, mastery, weakest concepts, and domains (DASH-1…6)', async () => {
    m.getDashboard.mockResolvedValue(dashboard());
    renderDashboard();

    const summary = await screen.findByRole('list', { name: 'Summary' });
    expect(
      within(summary).getByRole('link', { name: 'Due today' }).closest('li'),
    ).toHaveTextContent('3');
    expect(within(summary).getByRole('link', { name: 'Overdue' })).toHaveAttribute(
      'href',
      '/reviews?tab=overdue',
    );

    const accuracyPanel = screen.getByRole('region', { name: 'Cold-recall accuracy' });
    expect(accuracyPanel).toHaveTextContent('75%');
    expect(accuracyPanel).toHaveTextContent('15 of 20 passed in 30 days');
    expect(
      within(accuracyPanel).getByRole('img', { name: /Weekly cold-recall accuracy/ }),
    ).toBeInTheDocument();

    expect(screen.getByRole('region', { name: 'Concepts by mastery' })).toHaveTextContent(
      'Lapsed1',
    );
    expect(screen.getByRole('region', { name: 'Weakest concepts' })).toHaveTextContent(
      'Execution limits',
    );
    const domains = screen.getByRole('region', { name: /Exam domains/ });
    expect(domains).toHaveTextContent('SAA-C03');
    expect(within(domains).getByRole('row', { name: /D1 Secure architectures/ })).toHaveTextContent(
      '40% 4/10',
    );
  });

  it('always labels readiness as an estimate and hides it below the threshold (DASH-7a)', async () => {
    m.getDashboard.mockResolvedValue(dashboard());
    renderDashboard();

    const panel = await screen.findByRole('region', { name: 'Readiness' });
    expect(panel).toHaveTextContent('Estimate — not a prediction of exam results');
    expect(panel).toHaveTextContent(
      'Shown after 50 cold answers in this certification (20 so far)',
    );
  });

  it('labels a visible readiness figure as an estimate too (DASH-7a)', async () => {
    m.getDashboard.mockResolvedValue(
      dashboard({
        readiness: {
          label: 'Estimate — not a prediction of exam results',
          coldAttempts: 64,
          threshold: 50,
          visible: true,
          value: 0.42,
        },
      }),
    );
    renderDashboard();

    const panel = await screen.findByRole('region', { name: 'Readiness' });
    expect(panel).toHaveTextContent('Estimate — not a prediction of exam results');
    expect(panel).toHaveTextContent('42%');
  });
});
