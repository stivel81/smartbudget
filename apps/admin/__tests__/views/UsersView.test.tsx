import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UsersView from '../../app/views/UsersView';
import * as api from '../../lib/api';
import { deferred, makeUser, pending } from '../testUtils/fixtures';

jest.mock('../../lib/api');
const mocked = jest.mocked(api);

const USERS = [
  makeUser({ id: 'u1', name: 'Alice Smith', email: 'alice@example.com', is_admin: true }),
  makeUser({ id: 'u2', name: null, email: 'bob@example.com' }),
  makeUser({ id: 'u3', name: 'Carol', email: null }),
];

function bodyRows() {
  return within(screen.getByRole('table')).getAllByRole('row').slice(1);
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('UsersView', () => {
  it('shows a loading state', () => {
    mocked.getUsers.mockReturnValue(pending());
    render(<UsersView accessToken="tok" onSelectUser={jest.fn()} />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(mocked.getUsers).toHaveBeenCalledWith('tok');
  });

  it('shows the API error', async () => {
    mocked.getUsers.mockRejectedValue({ message: 'Admin access required' });
    render(<UsersView accessToken="tok" onSelectUser={jest.fn()} />);
    expect(await screen.findByText('Admin access required')).toBeInTheDocument();
  });

  it('falls back to a generic error', async () => {
    mocked.getUsers.mockRejectedValue({});
    render(<UsersView accessToken="tok" onSelectUser={jest.fn()} />);
    expect(await screen.findByText('Failed to load users')).toBeInTheDocument();
  });

  it('renders the empty state', async () => {
    mocked.getUsers.mockResolvedValue({ users: [] });
    render(<UsersView accessToken="tok" onSelectUser={jest.fn()} />);
    expect(await screen.findByText('0 accounts total.')).toBeInTheDocument();
    expect(screen.getByText('No users match.')).toBeInTheDocument();
  });

  it('uses the singular for one account', async () => {
    mocked.getUsers.mockResolvedValue({ users: [USERS[0]] });
    render(<UsersView accessToken="tok" onSelectUser={jest.fn()} />);
    expect(await screen.findByText('1 account total.')).toBeInTheDocument();
  });

  it('renders every user with role badge and fallbacks', async () => {
    mocked.getUsers.mockResolvedValue({ users: USERS });
    render(<UsersView accessToken="tok" onSelectUser={jest.fn()} />);
    expect(await screen.findByText('3 accounts total.')).toBeInTheDocument();
    const rows = bodyRows();
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('Admin')).toBeInTheDocument();
    expect(within(rows[1]).getByText('—')).toBeInTheDocument();
    expect(within(rows[1]).getByText('User')).toBeInTheDocument();
    expect(within(rows[2]).getByText('CA')).toBeInTheDocument();
  });

  it('filters to admins and back to all', async () => {
    mocked.getUsers.mockResolvedValue({ users: USERS });
    render(<UsersView accessToken="tok" onSelectUser={jest.fn()} />);
    await screen.findByText('3 accounts total.');
    await userEvent.click(screen.getByRole('button', { name: 'Admins' }));
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(bodyRows()).toHaveLength(3);
  });

  it('searches by name or email, case-insensitively', async () => {
    mocked.getUsers.mockResolvedValue({ users: USERS });
    render(<UsersView accessToken="tok" onSelectUser={jest.fn()} />);
    await screen.findByText('3 accounts total.');
    const search = screen.getByPlaceholderText('Search by name or email…');
    await userEvent.type(search, 'BOB');
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
    await userEvent.clear(search);
    await userEvent.type(search, 'carol');
    expect(bodyRows()).toHaveLength(1);
    await userEvent.clear(search);
    await userEvent.type(search, 'nobody');
    expect(screen.getByText('No users match.')).toBeInTheDocument();
  });

  it('combines the admin filter with search', async () => {
    mocked.getUsers.mockResolvedValue({ users: USERS });
    render(<UsersView accessToken="tok" onSelectUser={jest.fn()} />);
    await screen.findByText('3 accounts total.');
    await userEvent.click(screen.getByRole('button', { name: 'Admins' }));
    await userEvent.type(screen.getByPlaceholderText('Search by name or email…'), 'bob');
    expect(screen.getByText('No users match.')).toBeInTheDocument();
  });

  it('applies and updates the initial search handed off from the topbar', async () => {
    mocked.getUsers.mockResolvedValue({ users: USERS });
    const { rerender } = render(<UsersView accessToken="tok" onSelectUser={jest.fn()} initialSearch="alice" />);
    await screen.findByText('3 accounts total.');
    expect(screen.getByPlaceholderText('Search by name or email…')).toHaveValue('alice');
    expect(bodyRows()).toHaveLength(1);
    rerender(<UsersView accessToken="tok" onSelectUser={jest.fn()} initialSearch="bob" />);
    expect(screen.getByPlaceholderText('Search by name or email…')).toHaveValue('bob');
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
  });

  it('selects a user when the row is clicked', async () => {
    mocked.getUsers.mockResolvedValue({ users: USERS });
    const onSelectUser = jest.fn();
    render(<UsersView accessToken="tok" onSelectUser={onSelectUser} />);
    await screen.findByText('3 accounts total.');
    await userEvent.click(screen.getByTestId('user-row-u2'));
    expect(onSelectUser).toHaveBeenCalledWith('u2');
  });

  it('selects a user exactly once from the row action button', async () => {
    mocked.getUsers.mockResolvedValue({ users: USERS });
    const onSelectUser = jest.fn();
    render(<UsersView accessToken="tok" onSelectUser={onSelectUser} />);
    await screen.findByText('3 accounts total.');
    await userEvent.click(screen.getByRole('button', { name: 'View bob@example.com' }));
    expect(onSelectUser).toHaveBeenCalledTimes(1);
    expect(onSelectUser).toHaveBeenCalledWith('u2');
  });

  it('does not update state after unmount', async () => {
    const d = deferred<{ users: api.AdminUserSummary[] }>();
    mocked.getUsers.mockReturnValue(d.promise);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<UsersView accessToken="tok" onSelectUser={jest.fn()} />);
    unmount();
    d.resolve({ users: USERS });
    await d.promise;
    await Promise.resolve();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('ignores a failure after unmount', async () => {
    const d = deferred<{ users: api.AdminUserSummary[] }>();
    mocked.getUsers.mockReturnValue(d.promise);
    const { unmount } = render(<UsersView accessToken="tok" onSelectUser={jest.fn()} />);
    unmount();
    d.reject({ message: 'late' });
    await d.promise.catch(() => {});
    await Promise.resolve();
    expect(screen.queryByText('late')).not.toBeInTheDocument();
  });
});
