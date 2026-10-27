import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../api/settings';
import { SettingsPage } from './SettingsPage';

vi.mock('../api/settings', () => ({ getSettings: vi.fn(), updateSettings: vi.fn() }));

const settings = {
  timezone: 'UTC',
  aiGradingEnabled: true,
  defaultEvalMode: 'ai_first' as const,
  dailyNewLimit: 10,
  dailyReviewLimit: 100,
  activeCertificationId: null,
};

describe('SettingsPage', () => {
  it('saves timezone, grading mode, and limits (SET-1–3)', async () => {
    vi.mocked(api.getSettings).mockResolvedValue(settings);
    vi.mocked(api.updateSettings).mockImplementation(async (next) => ({
      ...next,
      activeCertificationId: null,
    }));
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SettingsPage />
      </QueryClientProvider>,
    );

    await userEvent.selectOptions(await screen.findByLabelText('Timezone'), 'Europe/London');
    await userEvent.click(screen.getByLabelText('Use AI grading when available'));
    await userEvent.selectOptions(screen.getByLabelText('After submitting an answer'), 'self_only');
    await userEvent.clear(screen.getByLabelText('New concepts per day'));
    await userEvent.type(screen.getByLabelText('New concepts per day'), '5');
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Settings saved.');
    expect(api.updateSettings).toHaveBeenCalledWith({
      timezone: 'Europe/London',
      aiGradingEnabled: false,
      defaultEvalMode: 'self_only',
      dailyNewLimit: 5,
      dailyReviewLimit: 100,
      activeCertificationId: null,
    });
  });
});
