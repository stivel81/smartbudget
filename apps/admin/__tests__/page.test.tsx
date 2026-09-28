import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from '../app/page';
import * as api from '../lib/api';
import { deferred } from './testUtils/fixtures';

jest.mock('../lib/api');
const mocked = jest.mocked(api);

jest.mock('../app/AdminDashboard', () => ({
  __esModule: true,
  default: ({ accessToken, userEmail, onSignOut }: { accessToken: string; userEmail: string; onSignOut: () => void }) => (
    <div>
      AdminDashboard:{accessToken}:{userEmail}
      <button onClick={onSignOut}>sign out</button>
    </div>
  ),
}));

const SESSION = {
  session: { access_token: 'tok-1', refresh_token: 'r', user: { id: 'u1', email: 'admin@example.com' } },
};

async function fillAndSubmit() {
  await userEvent.type(screen.getByPlaceholderText('Email'), 'admin@example.com');
  await userEvent.type(screen.getByPlaceholderText('Password'), 'secret');
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('Admin login page', () => {
  it('renders the sign-in form', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: 'SmartBudget Admin' })).toBeInTheDocument();
    expect(screen.getByText(/Requires an account with admin access/)).toBeInTheDocument();
  });

  it('logs in, verifies admin access, then shows the dashboard', async () => {
    mocked.login.mockResolvedValue(SESSION);
    mocked.getUsers.mockResolvedValue({ users: [] });
    render(<Home />);
    await fillAndSubmit();
    expect(await screen.findByText('AdminDashboard:tok-1:admin@example.com')).toBeInTheDocument();
    expect(mocked.login).toHaveBeenCalledWith('admin@example.com', 'secret');
    expect(mocked.getUsers).toHaveBeenCalledWith('tok-1');
  });

  it('shows "Signing in..." while the request is in flight', async () => {
    const d = deferred<api.LoginResult>();
    mocked.login.mockReturnValue(d.promise);
    render(<Home />);
    await fillAndSubmit();
    expect(screen.getByRole('button', { name: 'Signing in...' })).toBeDisabled();
    d.reject({ message: 'Invalid login credentials' });
    expect(await screen.findByText('Invalid login credentials')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('rejects a valid login without admin access', async () => {
    mocked.login.mockResolvedValue(SESSION);
    mocked.getUsers.mockRejectedValue({ message: 'Admin access required', code: 403 });
    render(<Home />);
    await fillAndSubmit();
    expect(await screen.findByText('Admin access required')).toBeInTheDocument();
    expect(screen.queryByText(/AdminDashboard/)).not.toBeInTheDocument();
  });

  it('falls back to a generic error', async () => {
    mocked.login.mockRejectedValue({});
    render(<Home />);
    await fillAndSubmit();
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
  });

  it('signs out back to an empty login form', async () => {
    mocked.login.mockResolvedValue(SESSION);
    mocked.getUsers.mockResolvedValue({ users: [] });
    render(<Home />);
    await fillAndSubmit();
    await userEvent.click(await screen.findByRole('button', { name: 'sign out' }));
    expect(screen.getByPlaceholderText('Email')).toHaveValue('');
    expect(screen.getByPlaceholderText('Password')).toHaveValue('');
  });
});
