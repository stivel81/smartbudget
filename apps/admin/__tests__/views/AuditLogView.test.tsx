import { render, screen, within } from '@testing-library/react';
import AuditLogView from '../../app/views/AuditLogView';
import * as api from '../../lib/api';
import { deferred, makeAuditEntry, pending } from '../testUtils/fixtures';

jest.mock('../../lib/api');
const mocked = jest.mocked(api);

beforeEach(() => {
  jest.resetAllMocks();
});

describe('AuditLogView', () => {
  it('shows a loading state', () => {
    mocked.getAuditLog.mockReturnValue(pending());
    render(<AuditLogView accessToken="tok" />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(mocked.getAuditLog).toHaveBeenCalledWith('tok');
  });

  it('shows the API error', async () => {
    mocked.getAuditLog.mockRejectedValue({ message: 'Failed to fetch audit log' });
    render(<AuditLogView accessToken="tok" />);
    expect(await screen.findByText('Failed to fetch audit log')).toBeInTheDocument();
  });

  it('falls back to a generic error', async () => {
    mocked.getAuditLog.mockRejectedValue({});
    render(<AuditLogView accessToken="tok" />);
    expect(await screen.findByText('Failed to load audit log')).toBeInTheDocument();
  });

  it('renders the empty state', async () => {
    mocked.getAuditLog.mockResolvedValue({ auditLog: [] });
    render(<AuditLogView accessToken="tok" />);
    expect(await screen.findByText('No admin actions recorded yet.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders entries, resolving admin and target labels', async () => {
    mocked.getAuditLog.mockResolvedValue({
      auditLog: [
        makeAuditEntry({ id: 'a1' }),
        makeAuditEntry({ id: 'a2', admin_email: null, admin_id: 'admin-uuid', details: null, target_user_id: 'target-uuid', action: 'grant_admin' }),
        makeAuditEntry({ id: 'a3', details: { email: 42 }, target_user_id: null, action: 'delete_user_data' }),
      ],
    });
    render(<AuditLogView accessToken="tok" />);
    await screen.findByRole('table');
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    // details.email wins
    expect(within(rows[0]).getByText('admin@example.com')).toBeInTheDocument();
    expect(within(rows[0]).getByText('suspend_user')).toBeInTheDocument();
    expect(within(rows[0]).getByText('alice@example.com')).toBeInTheDocument();
    // admin_id fallback, target_user_id fallback
    expect(within(rows[1]).getByText('admin-uuid')).toBeInTheDocument();
    expect(within(rows[1]).getByText('target-uuid')).toBeInTheDocument();
    // non-string email and no target → dash
    expect(within(rows[2]).getByText('—')).toBeInTheDocument();
  });

  it('ignores results after unmount', async () => {
    const d = deferred<{ auditLog: api.AuditLogEntry[] }>();
    mocked.getAuditLog.mockReturnValue(d.promise);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<AuditLogView accessToken="tok" />);
    unmount();
    d.resolve({ auditLog: [] });
    await d.promise;
    await Promise.resolve();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('ignores errors after unmount', async () => {
    const d = deferred<{ auditLog: api.AuditLogEntry[] }>();
    mocked.getAuditLog.mockReturnValue(d.promise);
    const { unmount } = render(<AuditLogView accessToken="tok" />);
    unmount();
    d.reject({ message: 'late' });
    await d.promise.catch(() => {});
    await Promise.resolve();
    expect(screen.queryByText('late')).not.toBeInTheDocument();
  });
});
