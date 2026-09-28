import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DeleteUserConfirm from '../../app/components/DeleteUserConfirm';
import * as api from '../../lib/api';
import { deferred } from '../testUtils/fixtures';

jest.mock('../../lib/api');
const mocked = jest.mocked(api);

function renderConfirm(user: { id: string; email: string | null } = { id: 'u1', email: 'alice@example.com' }) {
  const onDeleted = jest.fn();
  const onCancel = jest.fn();
  render(<DeleteUserConfirm user={user} accessToken="tok" onDeleted={onDeleted} onCancel={onCancel} />);
  return { onDeleted, onCancel };
}

beforeEach(() => jest.resetAllMocks());

describe('DeleteUserConfirm', () => {
  it('asks for the email and keeps Confirm disabled until it matches exactly', async () => {
    renderConfirm();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Confirm permanent deletion' });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Type to confirm deletion'), 'ALICE@example.com');
    expect(confirm).toBeDisabled();
    await userEvent.clear(screen.getByLabelText('Type to confirm deletion'));
    await userEvent.type(screen.getByLabelText('Type to confirm deletion'), 'alice@example.com');
    expect(confirm).toBeEnabled();
  });

  it('asks for the user id when there is no email', async () => {
    mocked.deleteUserData.mockResolvedValue(undefined);
    const { onDeleted } = renderConfirm({ id: 'user-uuid-1', email: null });
    expect(screen.getByText('user-uuid-1')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Type to confirm deletion'), 'user-uuid-1');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm permanent deletion' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(mocked.deleteUserData).toHaveBeenCalledWith('user-uuid-1', 'tok');
  });

  it('never calls the API without confirmation, even on a forced click', async () => {
    renderConfirm();
    const confirm = screen.getByRole('button', { name: 'Confirm permanent deletion' });
    confirm.removeAttribute('disabled');
    await userEvent.click(confirm);
    expect(mocked.deleteUserData).not.toHaveBeenCalled();
  });

  it('shows progress, then calls onDeleted', async () => {
    const d = deferred<void>();
    mocked.deleteUserData.mockReturnValue(d.promise);
    const { onDeleted } = renderConfirm();
    await userEvent.type(screen.getByLabelText('Type to confirm deletion'), 'alice@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm permanent deletion' }));
    expect(screen.getByRole('button', { name: 'Deleting...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(onDeleted).not.toHaveBeenCalled();
    d.resolve();
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });

  it('shows the API error and allows retry', async () => {
    mocked.deleteUserData.mockRejectedValueOnce({ message: 'You cannot delete your own account' });
    const { onDeleted } = renderConfirm();
    await userEvent.type(screen.getByLabelText('Type to confirm deletion'), 'alice@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm permanent deletion' }));
    expect(await screen.findByText('You cannot delete your own account')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm permanent deletion' })).toBeEnabled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('falls back to a generic error', async () => {
    mocked.deleteUserData.mockRejectedValueOnce({});
    renderConfirm();
    await userEvent.type(screen.getByLabelText('Type to confirm deletion'), 'alice@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm permanent deletion' }));
    expect(await screen.findByText('Failed to delete user data')).toBeInTheDocument();
  });

  it('calls onCancel', async () => {
    const { onCancel } = renderConfirm();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    expect(mocked.deleteUserData).not.toHaveBeenCalled();
  });
});
