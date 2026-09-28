import { render, screen, within } from '@testing-library/react';
import AIMonitorView from '../../app/views/AIMonitorView';
import * as api from '../../lib/api';
import { deferred, freezeDate, makeScanLogEntry, makeUsage, pending } from '../testUtils/fixtures';

jest.mock('../../lib/api');
const mocked = jest.mocked(api);

function metricValue(label: string) {
  return screen.getByText(label).nextElementSibling?.textContent;
}

beforeEach(() => {
  jest.resetAllMocks();
  freezeDate();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('AIMonitorView', () => {
  it('shows a loading state', () => {
    mocked.getUsage.mockReturnValue(pending());
    mocked.getScanLog.mockReturnValue(pending());
    render(<AIMonitorView accessToken="tok" />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(mocked.getUsage).toHaveBeenCalledWith('tok');
    expect(mocked.getScanLog).toHaveBeenCalledWith('tok');
  });

  it('shows the API error', async () => {
    mocked.getUsage.mockRejectedValue({ message: 'Failed to fetch usage' });
    mocked.getScanLog.mockResolvedValue({ log: [] });
    render(<AIMonitorView accessToken="tok" />);
    expect(await screen.findByText('Failed to fetch usage')).toBeInTheDocument();
  });

  it('falls back to a generic error', async () => {
    mocked.getUsage.mockResolvedValue(makeUsage());
    mocked.getScanLog.mockRejectedValue({});
    render(<AIMonitorView accessToken="tok" />);
    expect(await screen.findByText('Failed to load AI monitor')).toBeInTheDocument();
  });

  it('renders the empty state', async () => {
    mocked.getUsage.mockResolvedValue(makeUsage());
    mocked.getScanLog.mockResolvedValue({ log: [] });
    render(<AIMonitorView accessToken="tok" />);
    expect(await screen.findByText('No scan activity yet.')).toBeInTheDocument();
    expect(metricValue('Month cost')).toBe('$0.00');
    expect(screen.getByText('of $50.00 budget')).toBeInTheDocument();
    expect(screen.getByText('$0.00 all-time')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Monthly budget used' })).toHaveAttribute('aria-valuenow', '0');
    expect(metricValue('API calls today')).toBe('0');
    expect(screen.getByText('of 2,000 daily limit')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Daily call limit used' })).toHaveAttribute('aria-valuenow', '0');
    expect(screen.queryByText(/failed$/)).not.toBeInTheDocument();
    expect(metricValue('Cost today')).toBe('$0.0000');
    expect(screen.queryByText(/per scan/)).not.toBeInTheDocument();
  });

  it('replaces the all-time hero with month cost vs budget (spec usage cards)', async () => {
    mocked.getUsage.mockResolvedValue(
      makeUsage({
        estimatedCostUsd: 40,
        byDay: [
          { date: '2026-03-02', scans: 100, inputTokens: 10_000_000, outputTokens: 0 }, // $10
          { date: '2026-03-01', scans: 100, inputTokens: 0, outputTokens: 500_000 }, // $2.50
          { date: '2026-02-28', scans: 100, inputTokens: 20_000_000, outputTokens: 0 }, // Feb — not this month
        ],
      })
    );
    mocked.getScanLog.mockResolvedValue({ log: [] });
    render(<AIMonitorView accessToken="tok" />);
    await screen.findByRole('heading', { name: 'AI Monitor' });
    expect(screen.queryByText('All-time cost')).not.toBeInTheDocument();
    expect(metricValue('Month cost')).toBe('$12.50');
    expect(screen.getByText('of $50.00 budget')).toBeInTheDocument();
    expect(screen.getByText('$40.00 all-time')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Monthly budget used' })).toHaveAttribute('aria-valuenow', '25');
  });

  it('flags month cost over budget and calls over the daily limit', async () => {
    mocked.getUsage.mockResolvedValue(
      makeUsage({
        byDay: [{ date: '2026-03-04', scans: 2500, inputTokens: 60_000_000, outputTokens: 0 }], // $60, 2,500 calls
      })
    );
    mocked.getScanLog.mockResolvedValue({ log: [] });
    render(<AIMonitorView accessToken="tok" />);
    await screen.findByRole('heading', { name: 'AI Monitor' });
    expect(screen.getByText('over $50.00 budget')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Monthly budget used' })).toHaveAttribute('aria-valuenow', '100');
    expect(metricValue('API calls today')).toBe('2,500');
    expect(screen.getByText('over 2,000 daily limit')).toHaveStyle({ color: '#dc2626' });
    expect(screen.getByRole('progressbar', { name: 'Daily call limit used' })).toHaveAttribute('aria-valuenow', '100');
  });

  it("renders today's usage and the API log", async () => {
    mocked.getUsage.mockResolvedValue(
      makeUsage({
        estimatedCostUsd: 12.3456,
        byDay: [
          { date: '2026-03-04', scans: 4, inputTokens: 4000, outputTokens: 800 }, // $0.008
          { date: '2026-03-03', scans: 10, inputTokens: 10000, outputTokens: 2000 },
        ],
      })
    );
    mocked.getScanLog.mockResolvedValue({
      log: [
        makeScanLogEntry({ id: 's1' }),
        makeScanLogEntry({
          id: 's2',
          email: null,
          status: 'failed',
          inputTokens: null,
          outputTokens: null,
          costUsd: null,
          error: 'Could not parse receipt',
        }),
        makeScanLogEntry({ id: 's3', inputTokens: 1000, outputTokens: null, costUsd: 0.001 }),
      ],
    });
    render(<AIMonitorView accessToken="tok" />);
    await screen.findByRole('heading', { name: 'AI Monitor' });
    expect(screen.getByText('Claude Haiku 4.5 — live usage & costs')).toBeInTheDocument();
    // 4 successful (usage) + 1 failed today (scan log)
    expect(metricValue('API calls today')).toBe('5');
    expect(screen.getByText('1 failed')).toBeInTheDocument();
    expect(metricValue('Cost today')).toBe('$0.0080');
    expect(screen.getByText('avg $0.0020 per scan')).toBeInTheDocument();

    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('alice@example.com')).toBeInTheDocument();
    expect(within(rows[0]).getByText('1,800')).toBeInTheDocument();
    expect(within(rows[0]).getByText('$0.0030')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Success')).toBeInTheDocument();
    expect(within(rows[1]).getAllByText('—')).toHaveLength(3);
    expect(within(rows[1]).getByText('Failed')).toBeInTheDocument();
    expect(rows[1]).toHaveAttribute('title', 'Could not parse receipt');
    expect(rows[0]).not.toHaveAttribute('title');
    expect(within(rows[2]).getByText('1,000')).toBeInTheDocument();
  });

  it('ignores results after unmount', async () => {
    const d = deferred<api.UsageSummary>();
    mocked.getUsage.mockReturnValue(d.promise);
    mocked.getScanLog.mockResolvedValue({ log: [] });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<AIMonitorView accessToken="tok" />);
    unmount();
    d.resolve(makeUsage());
    await d.promise;
    await Promise.resolve();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('ignores errors after unmount', async () => {
    const d = deferred<api.UsageSummary>();
    mocked.getUsage.mockReturnValue(d.promise);
    mocked.getScanLog.mockResolvedValue({ log: [] });
    const { unmount } = render(<AIMonitorView accessToken="tok" />);
    unmount();
    d.reject({ message: 'late' });
    await d.promise.catch(() => {});
    await Promise.resolve();
    expect(screen.queryByText('late')).not.toBeInTheDocument();
  });
});
