'use client';

import { useState } from 'react';
import { deleteUserData } from '../../lib/api';
import { deleteConfirmPhrase } from '../../lib/users';
import { dangerButtonStyle, inputStyle, secondaryButtonStyle } from '../../lib/styles';

/**
 * In-page confirmation for right-to-erasure (DELETE /api/v1/admin/users/:id).
 * The admin must type the user's email (or id, if they have no email) before
 * the irreversible call is allowed. Used by both the Users list action menu
 * and the user detail Danger zone — deliberately no window.confirm.
 */
export default function DeleteUserConfirm({
  user,
  accessToken,
  onDeleted,
  onCancel,
}: {
  user: { id: string; email: string | null };
  accessToken: string;
  onDeleted: () => void;
  onCancel: () => void;
}) {
  const phrase = deleteConfirmPhrase(user);
  const [text, setText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const confirmed = text === phrase;

  const handleDelete = async () => {
    if (!confirmed) return;
    setError('');
    setDeleting(true);
    try {
      await deleteUserData(user.id, accessToken);
      onDeleted();
    } catch (err: any) {
      setError(err.message || 'Failed to delete user data');
      setDeleting(false);
    }
  };

  return (
    <div>
      <p style={{ fontSize: 14 }}>
        Type <strong>{phrase}</strong> to confirm:
      </p>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Type to confirm deletion"
        style={{ ...inputStyle, maxWidth: 320, marginBottom: 8 }}
        data-testid="delete-confirm-input"
      />
      {error && <p style={{ color: '#dc2626', fontSize: 14 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleDelete} disabled={deleting || !confirmed} style={dangerButtonStyle}>
          {deleting ? 'Deleting...' : 'Confirm permanent deletion'}
        </button>
        <button onClick={onCancel} disabled={deleting} style={secondaryButtonStyle}>
          Cancel
        </button>
      </div>
    </div>
  );
}
