import { render, screen, within } from '@testing-library/react';
import DashboardView from '../../app/views/DashboardView';
import * as api from '../../lib/api';
import { deferred, freezeDate, makeFailure, makeUsage, makeUser, pending } from '../testUtils/fixtures';

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

function setup({
  users = [] as api.AdminUserSummary[],
  usage = makeUsage(),
  failures = [] as api.ScanFailure[],
} = {}) {
  mocked.getUsers.mockResolvedValue({ users });
  mocked.getUsage.mockResolvedValue(usage);
  mocked.getFailedScans.mockResolvedValue({ failures });
  return render(<DashboardView accessToken="tok" />);
}

describe('DashboardView', () => {
  it('shows a loading state while requests are in flight', () => {
    mocked.getUsers.mockReturnValue(pending());
    mocked.getUsage.mockReturnValue(pending());
    mocked.getFailedScans.mockReturnValue(pending());
    render(<DashboardView accessToken="tok" />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('passes the access token to every request', async () => {
    setup();
    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(mocked.getUsers).toHaveBeenCalledWith('tok');
    expect(mocked.getUsage).toHaveBeenCalledWith('tok');
    expect(mocked.getFailedScans).toHaveBeenCalledWith('tok');
  });

  it('shows the API error message when any request fails', async () => {
    mocked.getUsers.mockResolvedValue({ users: [] });
    mocked.getUsage.mockRejectedValue({ message: 'Admin access required', code: 403 });
    mocked.getFailedScans.mockResolvedValue({ failures: [] });
    render(<DashboardView accessToken="tok" />);
    expect(await screen.findByText('Admin access required')).toBeInTheDocument();
  });

  it('falls back to a generic error message', async () => {
    mocked.getUsers.mockRejectedValue({});
    mocked.getUsage.mockResolvedValue(makeUsage());
    mocked.getFailedScans.mockResolvedValue({ failures: [] });
    render(<DashboardView accessToken="tok" />);
    expect(await screen.findByText('Failed to load dashboard')).toBeInTheDocument();
  });

  it('renders the empty state', async () => {
    setup();
    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(metricValue("This month's Claude spend")).toBe('$0.00');
    expect(metricValue('Total users')).toBe('0');
    expect(metricValue('New signups (7d)')).toBe('0');
    expect(metricValue('AI scans today')).toBe('0');
    expect(screen.queryByText(/this week/)).not.toBeInTheDocument();
    expect(screen.getByText('No signups yet.')).toBeInTheDocument();
    // No scans yet → donut shows 100%.
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('renders populated metrics, chart, donut and recent signups', async () => {
    const users = [
      makeUser({ id: 'u1', name: 'Alice Smith', email: 'alice@example.com', created_at: '2026-03-04T10:00:00Z', is_admin: true }),
      makeUser({ id: 'u2', name: null, email: 'bob@example.com', created_at: '2026-03-04T09:00:00Z' }),
      makeUser({ id: 'u3', name: 'Carol', email: 'carol@example.com', created_at: '2026-03-01T09:00:00Z' }),
      makeUser({ id: 'u4', name: 'Dan', email: 'dan@example.com', created_at: '2026-02-01T09:00:00Z' }),
      makeUser({ id: 'u5', name: 'Eve', email: 'eve@example.com', created_at: '2026-01-01T09:00:00Z' }),
    ];
    const usage = makeUsage({
      totalScans: 3,
      byDay: [
        { date: '2026-03-04', scans: 2, inputTokens: 1_000_000, outputTokens: 100_000 }, // $1.50
        { date: '2026-03-02', scans: 1, inputTokens: 500_000, outputTokens: 0 }, // $0.50
        { date: '2026-02-27', scans: 9, inputTokens: 9_000_000, outputTokens: 0 }, // previous month
      ],
    });
    setup({ users, usage, failures: [makeFailure()] });

    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(metricValue("This month's Claude spend")).toBe('$2.00');
    expect(metricValue('Total users')).toBe('5');
    expect(metricValue('New signups (7d)')).toBe('3');
    expect(screen.getByText('+3 this week')).toBeInTheDocument();
    expect(metricValue('AI scans today')).toBe('2');

    // 3 successes, 1 failure → 75%.
    expect(screen.getByText('75%')).toBeInTheDocument();

    // Bar chart: 7 bars, today has 2 signups and is the peak.
    expect(screen.getByTitle('2026-03-04: 2 new users')).toBeInTheDocument();
    expect(screen.getByTitle('2026-03-01: 1 new user')).toBeInTheDocument();
    expect(screen.getAllByTitle(/new users?$/)).toHaveLength(7);

    // Recent signups: first 4, with role badges and a name fallback.
    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(4);
    expect(within(rows[0]).getByText('Alice Smith')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Admin')).toBeInTheDocument();
    expect(within(rows[1]).getByText('—')).toBeInTheDocument();
    expect(within(rows[1]).getByText('BO')).toBeInTheDocument();
    expect(within(rows[1]).getByText('User')).toBeInTheDocument();
    expect(screen.queryByText('eve@example.com')).not.toBeInTheDocument();
  });

  it('uses real Claude spend as the hero metric and shows no billing/plan metrics (the product has no billing)', async () => {
    setup({ users: [makeUser()], usage: makeUsage({ totalScans: 1 }) });
    await screen.findByRole('heading', { name: 'Dashboard' });
    const hero = screen.getByText("This month's Claude spend");
    // Accent card label colour (white at 70%) marks the hero.
    expect(hero).toHaveStyle({ color: 'rgba(255,255,255,0.7)' });
    expect(screen.queryByText(/revenue/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/premium/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\bfree\b/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/₪/)).not.toBeInTheDocument();
  });

  it('does not update state after unmount', async () => {
    const users = deferred<{ users: api.AdminUserSummary[] }>();
    mocked.getUsers.mockReturnValue(users.promise);
    mocked.getUsage.mockResolvedValue(makeUsage());
    mocked.getFailedScans.mockResolvedValue({ failures: [] });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<DashboardView accessToken="tok" />);
    unmount();
    users.resolve({ users: [] });
    await users.promise;
    await Promise.resolve();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('ignores a failure that arrives after unmount', async () => {
    const users = deferred<{ users: api.AdminUserSummary[] }>();
    mocked.getUsers.mockReturnValue(users.promise);
    mocked.getUsage.mockResolvedValue(makeUsage());
    mocked.getFailedScans.mockResolvedValue({ failures: [] });
    const { unmount } = render(<DashboardView accessToken="tok" />);
    unmount();
    users.reject({ message: 'late' });
    await users.promise.catch(() => {});
    await Promise.resolve();
    expect(screen.queryByText('late')).not.toBeInTheDocument();
  });
});
