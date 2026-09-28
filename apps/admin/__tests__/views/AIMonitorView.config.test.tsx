import { render, screen } from '@testing-library/react';
import AIMonitorView from '../../app/views/AIMonitorView';
import * as api from '../../lib/api';
import { freezeDate, makeUsage } from '../testUtils/fixtures';

jest.mock('../../lib/api');
// Stand-ins for NEXT_PUBLIC_CLAUDE_MONTHLY_BUDGET_USD / _DAILY_CALL_LIMIT overrides.
jest.mock('../../lib/config', () => ({ CLAUDE_MONTHLY_BUDGET_USD: 10, CLAUDE_DAILY_CALL_LIMIT: 8 }));
const mocked = jest.mocked(api);

beforeEach(() => freezeDate());
afterEach(() => jest.useRealTimers());

it('measures the usage cards against the configured budget and daily limit', async () => {
  mocked.getUsage.mockResolvedValue(
    makeUsage({ byDay: [{ date: '2026-03-04', scans: 2, inputTokens: 5_000_000, outputTokens: 0 }] }) // $5
  );
  mocked.getScanLog.mockResolvedValue({ log: [] });
  render(<AIMonitorView accessToken="tok" />);
  await screen.findByRole('heading', { name: 'AI Monitor' });
  expect(screen.getByText('of $10.00 budget')).toBeInTheDocument();
  expect(screen.getByText('of 8 daily limit')).toBeInTheDocument();
  expect(screen.getByRole('progressbar', { name: 'Monthly budget used' })).toHaveAttribute('aria-valuenow', '50');
  expect(screen.getByRole('progressbar', { name: 'Daily call limit used' })).toHaveAttribute('aria-valuenow', '25');
});
