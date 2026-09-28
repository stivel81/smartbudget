import { render, screen, within } from '@testing-library/react';
import RateLimitViolationsView from '../../app/views/RateLimitViolationsView';
import * as api from '../../lib/api';
import { deferred, makeViolation, pending } from '../testUtils/fixtures';

jest.mock('../../lib/api');
const mocked = jest.mocked(api);

beforeEach(() => {
  jest.resetAllMocks();
});

describe('RateLimitViolationsView', () => {
  it('shows a loading state', () => {
    mocked.getRateLimitViolations.mockReturnValue(pending());
    render(<RateLimitViolationsView accessToken="tok" />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(mocked.getRateLimitViolations).toHaveBeenCalledWith('tok');
  });

  it('shows the API error', async () => {
    mocked.getRateLimitViolations.mockRejectedValue({ message: 'Failed to fetch rate limit violations' });
    render(<RateLimitViolationsView accessToken="tok" />);
    expect(await screen.findByText('Failed to fetch rate limit violations')).toBeInTheDocument();
  });

  it('falls back to a generic error', async () => {
    mocked.getRateLimitViolations.mockRejectedValue({});
    render(<RateLimitViolationsView accessToken="tok" />);
    expect(await screen.findByText('Failed to load rate limit violations')).toBeInTheDocument();
  });

  it('renders the empty state', async () => {
    mocked.getRateLimitViolations.mockResolvedValue({ violations: [] });
    render(<RateLimitViolationsView accessToken="tok" />);
    expect(await screen.findByText('No rate limit violations recorded.')).toBeInTheDocument();
  });

  it('renders violations with an IP fallback', async () => {
    mocked.getRateLimitViolations.mockResolvedValue({
      violations: [makeViolation(), makeViolation({ id: 'v2', ip: null, route: '/api/v1/auth/login' })],
    });
    render(<RateLimitViolationsView accessToken="tok" />);
    await screen.findByRole('table');
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('203.0.113.7')).toBeInTheDocument();
    expect(within(rows[0]).getByText('/api/v1/receipts/scan')).toBeInTheDocument();
    expect(within(rows[1]).getByText('—')).toBeInTheDocument();
    expect(within(rows[1]).getByText('/api/v1/auth/login')).toBeInTheDocument();
  });

  it('ignores results after unmount', async () => {
    const d = deferred<{ violations: api.RateLimitViolation[] }>();
    mocked.getRateLimitViolations.mockReturnValue(d.promise);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<RateLimitViolationsView accessToken="tok" />);
    unmount();
    d.resolve({ violations: [] });
    await d.promise;
    await Promise.resolve();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('ignores errors after unmount', async () => {
    const d = deferred<{ violations: api.RateLimitViolation[] }>();
    mocked.getRateLimitViolations.mockReturnValue(d.promise);
    const { unmount } = render(<RateLimitViolationsView accessToken="tok" />);
    unmount();
    d.reject({ message: 'late' });
    await d.promise.catch(() => {});
    await Promise.resolve();
    expect(screen.queryByText('late')).not.toBeInTheDocument();
  });
});
