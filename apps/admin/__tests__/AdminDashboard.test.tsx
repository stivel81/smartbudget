import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminDashboard from '../app/AdminDashboard';
import * as api from '../lib/api';
import { COLORS } from '../lib/theme';
import { deferred, makeFailure, pending } from './testUtils/fixtures';

jest.mock('../lib/api');
const mocked = jest.mocked(api);

// Stub each view so these tests cover AdminDashboard's routing only; the
// views have their own test files.
jest.mock('../app/views/DashboardView', () => ({
  __esModule: true,
  default: ({ accessToken }: { accessToken: string }) => <div>DashboardView:{accessToken}</div>,
}));
jest.mock('../app/views/UsersView', () => ({
  __esModule: true,
  default: ({ initialSearch, onSelectUser }: { initialSearch: string; onSelectUser: (id: string) => void }) => (
    <div>
      UsersView search=[{initialSearch}]<button onClick={() => onSelectUser('user-42')}>select user-42</button>
    </div>
  ),
}));
jest.mock('../app/views/UserDetailView', () => ({
  __esModule: true,
  default: ({ userId, onBack }: { userId: string; onBack: () => void }) => (
    <div>
      UserDetailView:{userId}
      <button onClick={onBack}>back</button>
    </div>
  ),
}));
jest.mock('../app/views/AIMonitorView', () => ({ __esModule: true, default: () => <div>AIMonitorView</div> }));
jest.mock('../app/views/AuditLogView', () => ({ __esModule: true, default: () => <div>AuditLogView</div> }));
jest.mock('../app/views/RateLimitViolationsView', () => ({
  __esModule: true,
  default: () => <div>RateLimitViolationsView</div>,
}));
jest.mock('../app/views/SettingsView', () => ({ __esModule: true, default: () => <div>SettingsView</div> }));

function renderDashboard(onSignOut = jest.fn()) {
  render(<AdminDashboard accessToken="tok" userEmail="admin@example.com" onSignOut={onSignOut} />);
  return { onSignOut };
}

beforeEach(() => {
  jest.resetAllMocks();
  mocked.getFailedScans.mockResolvedValue({ failures: [] });
});

describe('AdminDashboard navigation', () => {
  it('starts on the dashboard view with the access token', () => {
    renderDashboard();
    expect(screen.getByText('DashboardView:tok')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dashboard' })).toHaveStyle({ color: COLORS.purple });
  });

  it.each([
    ['Users', 'UsersView search=[]'],
    ['AI Monitor', 'AIMonitorView'],
    ['Audit log', 'AuditLogView'],
    ['Rate limits', 'RateLimitViolationsView'],
    ['Settings', 'SettingsView'],
  ])('navigates to %s', async (label, text) => {
    renderDashboard();
    await userEvent.click(screen.getByRole('button', { name: label }));
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByText('DashboardView:tok')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    expect(screen.getByText('DashboardView:tok')).toBeInTheDocument();
  });

  it('opens user detail from Users, keeps Users highlighted, and goes back', async () => {
    renderDashboard();
    await userEvent.click(screen.getByRole('button', { name: 'Users' }));
    await userEvent.click(screen.getByRole('button', { name: 'select user-42' }));
    expect(screen.getByText('UserDetailView:user-42')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Users' })).toHaveStyle({ color: COLORS.purple });
    await userEvent.click(screen.getByRole('button', { name: 'back' }));
    expect(screen.getByText('UsersView search=[]')).toBeInTheDocument();
  });

  it('hands the topbar search off to the Users view', async () => {
    renderDashboard();
    await userEvent.type(screen.getByPlaceholderText('Search users…'), 'alice{Enter}');
    expect(screen.getByText('UsersView search=[alice]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Users' })).toHaveStyle({ color: COLORS.purple });
  });

  it('bell navigates to the AI Monitor', async () => {
    renderDashboard();
    await userEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(screen.getByText('AIMonitorView')).toBeInTheDocument();
  });

  it('passes sign-out through', async () => {
    const { onSignOut } = renderDashboard();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalled();
  });
});

describe('AdminDashboard failed-scan alerts', () => {
  it('checks failed scans with the access token', () => {
    renderDashboard();
    expect(mocked.getFailedScans).toHaveBeenCalledWith('tok');
  });

  it('shows the bell and AI Monitor dots when failed scans exist', async () => {
    mocked.getFailedScans.mockResolvedValue({ failures: [makeFailure()] });
    renderDashboard();
    expect(await screen.findByTestId('bell-alert-dot')).toBeInTheDocument();
    expect(screen.getByTestId('nav-alert-dot-AI Monitor')).toBeInTheDocument();
  });

  it('shows no dots when there are no failed scans', async () => {
    renderDashboard();
    await waitFor(() => expect(mocked.getFailedScans).toHaveBeenCalled());
    await Promise.resolve();
    expect(screen.queryByTestId('bell-alert-dot')).not.toBeInTheDocument();
    expect(screen.queryByTestId('nav-alert-dot-AI Monitor')).not.toBeInTheDocument();
  });

  it('stays quiet when the failed-scan check errors', async () => {
    mocked.getFailedScans.mockRejectedValue({ message: 'boom' });
    renderDashboard();
    await waitFor(() => expect(mocked.getFailedScans).toHaveBeenCalled());
    await Promise.resolve();
    expect(screen.queryByTestId('bell-alert-dot')).not.toBeInTheDocument();
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });

  it('does not update after unmount', async () => {
    const d = deferred<{ failures: api.ScanFailure[] }>();
    mocked.getFailedScans.mockReturnValue(d.promise);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<AdminDashboard accessToken="tok" userEmail="a@b.com" onSignOut={jest.fn()} />);
    unmount();
    d.resolve({ failures: [makeFailure()] });
    await d.promise;
    await Promise.resolve();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('keeps a pending check from blocking navigation', async () => {
    mocked.getFailedScans.mockReturnValue(pending());
    renderDashboard();
    await userEvent.click(screen.getByRole('button', { name: 'AI Monitor' }));
    expect(screen.getByText('AIMonitorView')).toBeInTheDocument();
  });
});
