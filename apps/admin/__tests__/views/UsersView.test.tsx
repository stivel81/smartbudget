import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

describe('UsersView — filter pills and status', () => {
  const MIXED = [
    makeUser({ id: 'a', name: 'Ada', email: 'ada@example.com', is_admin: true }),
    makeUser({ id: 'b', name: 'Ben', email: 'ben@example.com', banned_until: '2126-01-01T00:00:00Z' }),
    makeUser({ id: 'c', name: 'Lou', email: 'lou@example.com', banned_until: '2020-01-01T00:00:00Z' }),
  ];

  it('offers All | Suspended | Admins (no plan filters), All active by default', async () => {
    mocked.getUsers.mockResolvedValue({ users: MIXED });
    render(<UsersView accessToken="tok" onSelectUser={jest.fn()} />);
    await screen.findByText('3 accounts total.');
    const pills = screen.getAllByRole('button', { pressed: false }).concat(screen.getAllByRole('button', { pressed: true }));
    expect(pills.map((p) => p.textContent).sort()).toEqual(['Admins', 'All', 'Suspended']);
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: /Premium|Free/ })).not.toBeInTheDocument();
  });

  it('shows a Suspended badge only for currently-suspended users', async () => {
    mocked.getUsers.mockResolvedValue({ users: MIXED });
    render(<UsersView accessToken="tok" onSelectUser={jest.fn()} />);
    await screen.findByText('3 accounts total.');
    expect(within(screen.getByTestId('user-row-b')).getByText('Suspended')).toBeInTheDocument();
    expect(within(screen.getByTestId('user-row-a')).getByText('Active')).toBeInTheDocument();
    expect(within(screen.getByTestId('user-row-c')).getByText('Active')).toBeInTheDocument();
  });

  it('Suspended filter shows only currently-suspended users', async () => {
    mocked.getUsers.mockResolvedValue({ users: MIXED });
    render(<UsersView accessToken="tok" onSelectUser={jest.fn()} />);
    await screen.findByText('3 accounts total.');
    await userEvent.click(screen.getByRole('button', { name: 'Suspended' }));
    expect(screen.getByRole('button', { name: 'Suspended' })).toHaveAttribute('aria-pressed', 'true');
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByTestId('user-row-b')).toBeInTheDocument();
  });
});

describe('UsersView — row action menu', () => {
  const ROWS = [
    makeUser({ id: 'u1', name: 'Alice', email: 'alice@example.com' }),
    makeUser({ id: 'u2', name: 'Ben', email: 'ben@example.com', banned_until: '2126-01-01T00:00:00Z' }),
    makeUser({ id: 'u3', name: 'No Email', email: null }),
  ];

  async function setup(onSelectUser = jest.fn()) {
    mocked.getUsers.mockResolvedValue({ users: ROWS });
    render(<UsersView accessToken="tok" onSelectUser={onSelectUser} />);
    await screen.findByText('3 accounts total.');
    return { onSelectUser };
  }

  async function openMenu(label: string) {
    await userEvent.click(screen.getByRole('button', { name: `Actions for ${label}` }));
    return screen.getByRole('menu', { name: `Actions for ${label}` });
  }

  it('opens a menu with View, Suspend and Delete without navigating', async () => {
    const { onSelectUser } = await setup();
    const toggle = screen.getByRole('button', { name: 'Actions for alice@example.com' });
    expect(toggle).toHaveTextContent('⋮');
    expect(toggle).toHaveAttribute('aria-haspopup', 'menu');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const menu = await openMenu('alice@example.com');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['View', 'Suspend', 'Delete']);
    expect(onSelectUser).not.toHaveBeenCalled();
  });

  it('offers Unsuspend for a suspended user', async () => {
    await setup();
    const menu = await openMenu('ben@example.com');
    expect(within(menu).getByRole('menuitem', { name: 'Unsuspend' })).toBeInTheDocument();
  });

  it('keeps only one menu open at a time', async () => {
    await setup();
    await openMenu('alice@example.com');
    await openMenu('ben@example.com');
    expect(screen.getAllByRole('menu')).toHaveLength(1);
  });

  it('View opens the user detail once and closes the menu', async () => {
    const { onSelectUser } = await setup();
    const menu = await openMenu('alice@example.com');
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'View' }));
    expect(onSelectUser).toHaveBeenCalledTimes(1);
    expect(onSelectUser).toHaveBeenCalledWith('u1');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    await setup();
    await openMenu('alice@example.com');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('ignores other keys', async () => {
    await setup();
    await openMenu('alice@example.com');
    await userEvent.keyboard('a');
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('closes on an outside click but not on a click inside the menu', async () => {
    await setup();
    const menu = await openMenu('alice@example.com');
    fireEvent.mouseDown(menu);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('heading', { name: 'Users' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes when the ⋮ toggle is clicked again', async () => {
    const { onSelectUser } = await setup();
    await openMenu('alice@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Actions for alice@example.com' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(onSelectUser).not.toHaveBeenCalled();
  });

  it('labels users without an email by id', async () => {
    await setup();
    expect(screen.getByRole('button', { name: 'Actions for u3' })).toBeInTheDocument();
  });

  describe('Suspend / Unsuspend', () => {
    it('suspends via the shared API call, reloads, and confirms', async () => {
      await setup();
      const d = deferred<void>();
      mocked.suspendUser.mockReturnValue(d.promise);
      const menu = await openMenu('alice@example.com');
      await userEvent.click(within(menu).getByRole('menuitem', { name: 'Suspend' }));
      expect(mocked.suspendUser).toHaveBeenCalledWith('u1', 'tok');
      expect(mocked.unsuspendUser).not.toHaveBeenCalled();
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      const toggle = screen.getByRole('button', { name: 'Actions for alice@example.com' });
      expect(toggle).toBeDisabled();
      expect(toggle).toHaveTextContent('…');

      mocked.getUsers.mockResolvedValue({
        users: [{ ...ROWS[0], banned_until: '2126-01-01T00:00:00Z' }, ROWS[1], ROWS[2]],
      });
      d.resolve();
      expect(await screen.findByRole('status')).toHaveTextContent('Suspended alice@example.com.');
      expect(mocked.getUsers).toHaveBeenCalledTimes(2);
      expect(within(screen.getByTestId('user-row-u1')).getByText('Suspended')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Actions for alice@example.com' })).toBeEnabled();
    });

    it('unsuspends a suspended user', async () => {
      await setup();
      mocked.unsuspendUser.mockResolvedValue(undefined);
      const menu = await openMenu('ben@example.com');
      await userEvent.click(within(menu).getByRole('menuitem', { name: 'Unsuspend' }));
      expect(mocked.unsuspendUser).toHaveBeenCalledWith('u2', 'tok');
      expect(await screen.findByRole('status')).toHaveTextContent('Unsuspended ben@example.com.');
    });

    it('shows the API error (e.g. self-suspend refused)', async () => {
      await setup();
      mocked.suspendUser.mockRejectedValue({ message: 'You cannot suspend your own account' });
      const menu = await openMenu('alice@example.com');
      await userEvent.click(within(menu).getByRole('menuitem', { name: 'Suspend' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('You cannot suspend your own account');
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('falls back to a generic error', async () => {
      await setup();
      mocked.suspendUser.mockRejectedValue({});
      const menu = await openMenu('alice@example.com');
      await userEvent.click(within(menu).getByRole('menuitem', { name: 'Suspend' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Action failed');
    });

    it('disables Suspend/Delete in other menus while an action is running', async () => {
      await setup();
      mocked.suspendUser.mockReturnValue(pending());
      const menu = await openMenu('alice@example.com');
      await userEvent.click(within(menu).getByRole('menuitem', { name: 'Suspend' }));
      const other = await openMenu('ben@example.com');
      expect(within(other).getByRole('menuitem', { name: 'Unsuspend' })).toBeDisabled();
      expect(within(other).getByRole('menuitem', { name: 'Delete' })).toBeDisabled();
      expect(within(other).getByRole('menuitem', { name: 'View' })).toBeEnabled();
    });
  });

  describe('Delete (right-to-erasure)', () => {
    it('opens an in-page confirmation instead of deleting, and never uses window.confirm', async () => {
      const confirmSpy = jest.spyOn(window, 'confirm').mockImplementation(() => true);
      await setup();
      const menu = await openMenu('alice@example.com');
      await userEvent.click(within(menu).getByRole('menuitem', { name: 'Delete' }));
      const panel = screen.getByRole('region', { name: 'Confirm deletion' });
      expect(within(panel).getByRole('heading', { name: 'Delete all data for alice@example.com?' })).toBeInTheDocument();
      expect(within(panel).getByText(/cannot be undone/)).toBeInTheDocument();
      expect(within(panel).getByRole('button', { name: 'Confirm permanent deletion' })).toBeDisabled();
      expect(mocked.deleteUserData).not.toHaveBeenCalled();
      expect(confirmSpy).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    it('deletes after the email is typed, then reloads and confirms', async () => {
      await setup();
      mocked.deleteUserData.mockResolvedValue(undefined);
      const menu = await openMenu('alice@example.com');
      await userEvent.click(within(menu).getByRole('menuitem', { name: 'Delete' }));
      await userEvent.type(screen.getByLabelText('Type to confirm deletion'), 'alice@example.com');
      mocked.getUsers.mockResolvedValue({ users: [ROWS[1], ROWS[2]] });
      await userEvent.click(screen.getByRole('button', { name: 'Confirm permanent deletion' }));
      expect(mocked.deleteUserData).toHaveBeenCalledWith('u1', 'tok');
      expect(await screen.findByRole('status')).toHaveTextContent('Deleted all data for alice@example.com.');
      expect(screen.queryByRole('region', { name: 'Confirm deletion' })).not.toBeInTheDocument();
      await waitFor(() => expect(screen.queryByTestId('user-row-u1')).not.toBeInTheDocument());
    });

    it('requires the user id for users without an email', async () => {
      await setup();
      mocked.deleteUserData.mockResolvedValue(undefined);
      const menu = await openMenu('u3');
      await userEvent.click(within(menu).getByRole('menuitem', { name: 'Delete' }));
      expect(screen.getByRole('heading', { name: 'Delete all data for u3?' })).toBeInTheDocument();
      await userEvent.type(screen.getByLabelText('Type to confirm deletion'), 'u3');
      await userEvent.click(screen.getByRole('button', { name: 'Confirm permanent deletion' }));
      expect(mocked.deleteUserData).toHaveBeenCalledWith('u3', 'tok');
    });

    it('cancel closes the confirmation without deleting', async () => {
      await setup();
      const menu = await openMenu('alice@example.com');
      await userEvent.click(within(menu).getByRole('menuitem', { name: 'Delete' }));
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('region', { name: 'Confirm deletion' })).not.toBeInTheDocument();
      expect(mocked.deleteUserData).not.toHaveBeenCalled();
    });

    it('shows the API error inside the confirmation (e.g. self-delete refused)', async () => {
      await setup();
      mocked.deleteUserData.mockRejectedValue({ message: 'You cannot delete your own account' });
      const menu = await openMenu('alice@example.com');
      await userEvent.click(within(menu).getByRole('menuitem', { name: 'Delete' }));
      await userEvent.type(screen.getByLabelText('Type to confirm deletion'), 'alice@example.com');
      await userEvent.click(screen.getByRole('button', { name: 'Confirm permanent deletion' }));
      const panel = screen.getByRole('region', { name: 'Confirm deletion' });
      expect(await within(panel).findByText('You cannot delete your own account')).toBeInTheDocument();
      expect(mocked.getUsers).toHaveBeenCalledTimes(1);
    });

    it('reports a reload failure after a successful delete', async () => {
      await setup();
      mocked.deleteUserData.mockResolvedValue(undefined);
      const menu = await openMenu('alice@example.com');
      await userEvent.click(within(menu).getByRole('menuitem', { name: 'Delete' }));
      await userEvent.type(screen.getByLabelText('Type to confirm deletion'), 'alice@example.com');
      mocked.getUsers.mockRejectedValueOnce({ message: 'Failed to fetch users' });
      await userEvent.click(screen.getByRole('button', { name: 'Confirm permanent deletion' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Failed to fetch users');
      expect(screen.getByRole('status')).toHaveTextContent('Deleted all data for alice@example.com.');
    });

    it('falls back to a generic reload error', async () => {
      await setup();
      mocked.deleteUserData.mockResolvedValue(undefined);
      const menu = await openMenu('alice@example.com');
      await userEvent.click(within(menu).getByRole('menuitem', { name: 'Delete' }));
      await userEvent.type(screen.getByLabelText('Type to confirm deletion'), 'alice@example.com');
      mocked.getUsers.mockRejectedValueOnce({});
      await userEvent.click(screen.getByRole('button', { name: 'Confirm permanent deletion' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Failed to reload users');
    });

    it('opening Delete clears a previous notice or error', async () => {
      await setup();
      mocked.suspendUser.mockRejectedValue({ message: 'boom' });
      let menu = await openMenu('alice@example.com');
      await userEvent.click(within(menu).getByRole('menuitem', { name: 'Suspend' }));
      await screen.findByRole('alert');
      menu = await openMenu('alice@example.com');
      await userEvent.click(within(menu).getByRole('menuitem', { name: 'Delete' }));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
