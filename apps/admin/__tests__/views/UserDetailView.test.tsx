import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UserDetailView from '../../app/views/UserDetailView';
import * as api from '../../lib/api';
import { deferred, makeReceipt, makeUserDetail, pending } from '../testUtils/fixtures';

jest.mock('../../lib/api');
const mocked = jest.mocked(api);

const STATS = { receiptCount: 2, totalSpent: 60.25, budgetCount: 1 };
const BUDGETS = [{ id: 'b1', category: 'Groceries', monthly_limit: 500 }];

function mockDetail(user = makeUserDetail(), { receipts = [makeReceipt()], budgets = BUDGETS } = {}) {
  mocked.getUserDetail.mockResolvedValue({ user, stats: STATS, budgets });
  mocked.getUserReceipts.mockResolvedValue({ receipts });
}

function renderView(onBack = jest.fn()) {
  render(<UserDetailView accessToken="tok" userId="u1" onBack={onBack} />);
  return { onBack };
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('UserDetailView — loading & display', () => {
  it('shows a loading state and requests detail + receipts for the user', () => {
    mocked.getUserDetail.mockReturnValue(pending());
    mocked.getUserReceipts.mockReturnValue(pending());
    renderView();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(mocked.getUserDetail).toHaveBeenCalledWith('u1', 'tok');
    expect(mocked.getUserReceipts).toHaveBeenCalledWith('u1', 'tok');
  });

  it('shows the API error', async () => {
    mocked.getUserDetail.mockRejectedValue({ message: 'User not found' });
    mocked.getUserReceipts.mockResolvedValue({ receipts: [] });
    renderView();
    expect(await screen.findByText('User not found')).toBeInTheDocument();
  });

  it('falls back to a generic error', async () => {
    mocked.getUserDetail.mockRejectedValue({});
    mocked.getUserReceipts.mockResolvedValue({ receipts: [] });
    renderView();
    expect(await screen.findByText('Failed to load user')).toBeInTheDocument();
  });

  it('renders profile, activity, budgets and receipts', async () => {
    mockDetail();
    renderView();
    expect(await screen.findByRole('heading', { name: 'alice@example.com' })).toBeInTheDocument();
    expect(screen.getByText('Name: Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Email verified: Yes')).toBeInTheDocument();
    expect(screen.getByText('Status: Active')).toBeInTheDocument();
    expect(screen.getByText('Admin: No')).toBeInTheDocument();
    expect(screen.getByText('2 receipt(s), ₪60.25 total spent')).toBeInTheDocument();
    expect(screen.getByText('1 budget(s) set')).toBeInTheDocument();
    expect(screen.getByText('Groceries: ₪500')).toBeInTheDocument();
    expect(screen.getByText('Shufersal')).toBeInTheDocument();
    expect(screen.getByText('₪42.50')).toBeInTheDocument();
    // Receipt dates use the same day-first display as the mobile app.
    expect(screen.getByText('04/03/2026')).toBeInTheDocument();
    expect(screen.queryByText('2026-03-04')).not.toBeInTheDocument();
  });

  it('shows the upload day for receipts with no (or a legacy ambiguous) date', async () => {
    const created = new Date(2026, 8, 29, 10, 0, 0).toISOString();
    mockDetail(makeUserDetail(), {
      receipts: [
        makeReceipt({ id: 'a', created_at: created, raw_response: { merchant: 'NoDate', total: 1, date: null, items: [] } }),
        makeReceipt({ id: 'b', created_at: created, raw_response: { merchant: 'Legacy', total: 2, date: '17/08/2026', items: [] } }),
        makeReceipt({ id: 'c', raw_response: { merchant: 'Titanium', total: 350, date: '2026-08-17', items: [] } }),
      ],
    });
    renderView();
    expect(await screen.findByText('Titanium')).toBeInTheDocument();
    expect(screen.getAllByText('29/09/2026')).toHaveLength(2);
    expect(screen.getByText('17/08/2026')).toBeInTheDocument();
    expect(screen.queryByText('2026-08-17')).not.toBeInTheDocument();
  });

  it('renders fallbacks: no name, unverified, suspended, admin, no budgets, no receipts', async () => {
    mockDetail(
      makeUserDetail({ name: null, email_confirmed_at: null, banned_until: '2126-01-01T00:00:00Z', is_admin: true }),
      { receipts: [], budgets: [] }
    );
    renderView();
    expect(await screen.findByText('Name: —')).toBeInTheDocument();
    expect(screen.getByText('Email verified: No')).toBeInTheDocument();
    expect(screen.getByText(/^Status: Suspended until/)).toBeInTheDocument();
    expect(screen.getByText('Admin: Yes')).toBeInTheDocument();
    expect(screen.getByText('No receipts.')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('calls onBack from the back button', async () => {
    mockDetail();
    const { onBack } = renderView();
    await userEvent.click(screen.getByRole('button', { name: '← Back to users' }));
    expect(onBack).toHaveBeenCalled();
  });
});

describe('UserDetailView — admin role', () => {
  it('grants admin and reloads', async () => {
    mockDetail();
    mocked.grantAdmin.mockResolvedValue(undefined);
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: 'Grant admin access' }));
    expect(mocked.grantAdmin).toHaveBeenCalledWith('u1', 'tok');
    expect(mocked.revokeAdmin).not.toHaveBeenCalled();
    await waitFor(() => expect(mocked.getUserDetail).toHaveBeenCalledTimes(2));
  });

  it('revokes admin for an admin user', async () => {
    mockDetail(makeUserDetail({ is_admin: true }));
    mocked.revokeAdmin.mockResolvedValue(undefined);
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: 'Revoke admin access' }));
    expect(mocked.revokeAdmin).toHaveBeenCalledWith('u1', 'tok');
    expect(mocked.grantAdmin).not.toHaveBeenCalled();
  });

  it('shows "Working..." and disables actions while in flight', async () => {
    mockDetail();
    const d = deferred<void>();
    mocked.grantAdmin.mockReturnValue(d.promise);
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: 'Grant admin access' }));
    const working = screen.getAllByRole('button', { name: 'Working...' });
    expect(working).toHaveLength(3);
    working.forEach((b) => expect(b).toBeDisabled());
    d.resolve();
    expect(await screen.findByRole('button', { name: 'Grant admin access' })).toBeEnabled();
  });

  it('shows the action error (e.g. self-revoke refused)', async () => {
    mockDetail(makeUserDetail({ is_admin: true }));
    mocked.revokeAdmin.mockRejectedValue({ message: 'You cannot revoke your own admin access' });
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: 'Revoke admin access' }));
    expect(await screen.findByText('You cannot revoke your own admin access')).toBeInTheDocument();
  });

  it('falls back to a generic action error', async () => {
    mockDetail();
    mocked.grantAdmin.mockRejectedValue({});
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: 'Grant admin access' }));
    expect(await screen.findByText('Action failed')).toBeInTheDocument();
  });
});

describe('UserDetailView — suspend', () => {
  it('suspends an active user and reloads', async () => {
    mockDetail();
    mocked.suspendUser.mockResolvedValue(undefined);
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: 'Suspend' }));
    expect(mocked.suspendUser).toHaveBeenCalledWith('u1', 'tok');
    await waitFor(() => expect(mocked.getUserDetail).toHaveBeenCalledTimes(2));
  });

  it('unsuspends a suspended user', async () => {
    mockDetail(makeUserDetail({ banned_until: '2126-01-01T00:00:00Z' }));
    mocked.unsuspendUser.mockResolvedValue(undefined);
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: 'Unsuspend' }));
    expect(mocked.unsuspendUser).toHaveBeenCalledWith('u1', 'tok');
    expect(mocked.suspendUser).not.toHaveBeenCalled();
  });

  it('treats a lapsed ban as active (offers Suspend, status Active)', async () => {
    mockDetail(makeUserDetail({ banned_until: '2020-01-01T00:00:00Z' }));
    mocked.suspendUser.mockResolvedValue(undefined);
    renderView();
    expect(await screen.findByText('Status: Active')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    expect(mocked.suspendUser).toHaveBeenCalledWith('u1', 'tok');
    expect(mocked.unsuspendUser).not.toHaveBeenCalled();
  });

  it('shows a suspend error', async () => {
    mockDetail();
    mocked.suspendUser.mockRejectedValue({ message: 'You cannot suspend your own account' });
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: 'Suspend' }));
    expect(await screen.findByText('You cannot suspend your own account')).toBeInTheDocument();
  });

  it('falls back to a generic suspend error', async () => {
    mockDetail();
    mocked.suspendUser.mockRejectedValue({});
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: 'Suspend' }));
    expect(await screen.findByText('Action failed')).toBeInTheDocument();
  });
});

describe('UserDetailView — export', () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  let clickSpy: jest.SpyInstance;

  beforeEach(() => {
    URL.createObjectURL = jest.fn(() => 'blob:export');
    URL.revokeObjectURL = jest.fn();
    clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    clickSpy.mockRestore();
  });

  it('downloads the export as a JSON file named after the email', async () => {
    mockDetail();
    const data = { exportedAt: '2026-03-04', profile: { id: 'u1' }, receipts: [], budgets: [] };
    mocked.exportUserData.mockResolvedValue(data);
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: 'Export data (GDPR)' }));
    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(mocked.exportUserData).toHaveBeenCalledWith('u1', 'tok');
    const anchor = clickSpy.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.download).toBe('alice@example.com-export.json');
    expect(anchor.href).toBe('blob:export');
    const blob = (URL.createObjectURL as jest.Mock).mock.calls[0][0] as Blob;
    expect(blob.type).toBe('application/json');
    // jsdom 20's Blob has no .text(); read it the old way.
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(blob);
    });
    expect(JSON.parse(text)).toEqual(data);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:export');
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('falls back to the user id in the filename when there is no email', async () => {
    mockDetail(makeUserDetail({ email: null }));
    mocked.exportUserData.mockResolvedValue({ exportedAt: '', profile: {}, receipts: [], budgets: [] });
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: 'Export data (GDPR)' }));
    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect((clickSpy.mock.instances[0] as unknown as HTMLAnchorElement).download).toBe('u1-export.json');
  });

  it('shows the export error', async () => {
    mockDetail();
    mocked.exportUserData.mockRejectedValue({ message: 'Failed to export' });
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: 'Export data (GDPR)' }));
    expect(await screen.findByText('Failed to export')).toBeInTheDocument();
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('falls back to a generic export error', async () => {
    mockDetail();
    mocked.exportUserData.mockRejectedValue({});
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: 'Export data (GDPR)' }));
    expect(await screen.findByText('Export failed')).toBeInTheDocument();
  });
});

describe('UserDetailView — delete (right-to-erasure) confirmation', () => {
  it('requires opening the confirm UI and typing the exact email', async () => {
    mockDetail();
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete all data' }));
    const confirm = screen.getByRole('button', { name: 'Confirm permanent deletion' });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByTestId('delete-confirm-input'), 'alice@example.co');
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByTestId('delete-confirm-input'), 'm');
    expect(confirm).toBeEnabled();
    expect(mocked.deleteUserData).not.toHaveBeenCalled();
  });

  it('does not call the API when a disabled confirm button is clicked', async () => {
    mockDetail();
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete all data' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm permanent deletion' }));
    expect(mocked.deleteUserData).not.toHaveBeenCalled();
  });

  it('deletes and navigates back after confirmation', async () => {
    mockDetail();
    const d = deferred<void>();
    mocked.deleteUserData.mockReturnValue(d.promise);
    const { onBack } = renderView();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete all data' }));
    await userEvent.type(screen.getByTestId('delete-confirm-input'), 'alice@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm permanent deletion' }));
    expect(mocked.deleteUserData).toHaveBeenCalledWith('u1', 'tok');
    expect(screen.getByRole('button', { name: 'Deleting...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    d.resolve();
    await waitFor(() => expect(onBack).toHaveBeenCalled());
  });

  it('shows a delete error and re-enables the form', async () => {
    mockDetail();
    mocked.deleteUserData.mockRejectedValue({ message: 'You cannot delete your own account' });
    const { onBack } = renderView();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete all data' }));
    await userEvent.type(screen.getByTestId('delete-confirm-input'), 'alice@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm permanent deletion' }));
    expect(await screen.findByText('You cannot delete your own account')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm permanent deletion' })).toBeEnabled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('falls back to a generic delete error', async () => {
    mockDetail();
    mocked.deleteUserData.mockRejectedValue({});
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete all data' }));
    await userEvent.type(screen.getByTestId('delete-confirm-input'), 'alice@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm permanent deletion' }));
    expect(await screen.findByText('Failed to delete user data')).toBeInTheDocument();
  });

  it('cancel closes the confirm UI and clears typed text and errors', async () => {
    mockDetail();
    mocked.deleteUserData.mockRejectedValue({ message: 'nope' });
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete all data' }));
    await userEvent.type(screen.getByTestId('delete-confirm-input'), 'alice@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm permanent deletion' }));
    await screen.findByText('nope');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('delete-confirm-input')).not.toBeInTheDocument();
    expect(screen.queryByText('nope')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete all data' }));
    expect(screen.getByTestId('delete-confirm-input')).toHaveValue('');
  });

  it('never uses window.confirm', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockImplementation(() => true);
    mockDetail();
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete all data' }));
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
