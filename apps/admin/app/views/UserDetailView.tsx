'use client';

import { useEffect, useState } from 'react';
import {
  getUserDetail,
  getUserReceipts,
  grantAdmin,
  revokeAdmin,
  exportUserData,
  AdminUserDetail,
  AdminUserStats,
  AdminBudget,
  AdminReceipt,
} from '../../lib/api';
import { buttonStyle, cardStyle, cellStyle, dangerButtonStyle, secondaryButtonStyle } from '../../lib/styles';
import { isSuspended, toggleSuspension } from '../../lib/users';
import DeleteUserConfirm from '../components/DeleteUserConfirm';

export default function UserDetailView({
  accessToken,
  userId,
  onBack,
}: {
  accessToken: string;
  userId: string;
  onBack: () => void;
}) {
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [stats, setStats] = useState<AdminUserStats | null>(null);
  const [budgets, setBudgets] = useState<AdminBudget[]>([]);
  const [receipts, setReceipts] = useState<AdminReceipt[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const loadDetail = () => {
    setLoading(true);
    return Promise.all([getUserDetail(userId, accessToken), getUserReceipts(userId, accessToken)])
      .then(([detail, receiptsRes]) => {
        setUser(detail.user);
        setStats(detail.stats);
        setBudgets(detail.budgets);
        setReceipts(receiptsRes.receipts);
      })
      .catch((err: any) => {
        setError(err.message || 'Failed to load user');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, accessToken]);

  const handleToggleAdmin = async () => {
    if (!user) return;
    setActionError('');
    setActionLoading(true);
    try {
      if (user.is_admin) {
        await revokeAdmin(userId, accessToken);
      } else {
        await grantAdmin(userId, accessToken);
      }
      await loadDetail();
    } catch (err: any) {
      setActionError(err.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExport = async () => {
    if (!user) return;
    setActionError('');
    setActionLoading(true);
    try {
      const data = await exportUserData(userId, accessToken);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${user.email || userId}-export.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setActionError(err.message || 'Export failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleSuspend = async () => {
    if (!user) return;
    setActionError('');
    setActionLoading(true);
    try {
      await toggleSuspension(user, accessToken, new Date());
      await loadDetail();
    } catch (err: any) {
      setActionError(err.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const suspended = user ? isSuspended(user, new Date()) : false;

  return (
    <div>
      <button onClick={onBack} style={{ ...secondaryButtonStyle, marginBottom: 16 }}>
        ← Back to users
      </button>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}

      {user && stats && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>{user.email}</h2>
            <p>Name: {user.name || '—'}</p>
            <p>Joined: {new Date(user.created_at).toLocaleString()}</p>
            <p>Email verified: {user.email_confirmed_at ? 'Yes' : 'No'}</p>
            <p>Status: {suspended ? `Suspended until ${new Date(user.banned_until as string).toLocaleString()}` : 'Active'}</p>
            <p>Admin: {user.is_admin ? 'Yes' : 'No'}</p>

            {actionError && <p style={{ color: '#dc2626', fontSize: 14 }}>{actionError}</p>}

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={handleToggleAdmin} disabled={actionLoading} style={buttonStyle}>
                {actionLoading ? 'Working...' : user.is_admin ? 'Revoke admin access' : 'Grant admin access'}
              </button>
              <button
                onClick={handleToggleSuspend}
                disabled={actionLoading}
                style={suspended ? buttonStyle : dangerButtonStyle}
              >
                {actionLoading ? 'Working...' : suspended ? 'Unsuspend' : 'Suspend'}
              </button>
              <button onClick={handleExport} disabled={actionLoading} style={secondaryButtonStyle}>
                {actionLoading ? 'Working...' : 'Export data (GDPR)'}
              </button>
            </div>
          </div>

          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Activity</h3>
            <p>{stats.receiptCount} receipt(s), ₪{stats.totalSpent.toFixed(2)} total spent</p>
            <p>{stats.budgetCount} budget(s) set</p>
            {budgets.length > 0 && (
              <ul>
                {budgets.map((b) => (
                  <li key={b.id}>
                    {b.category}: ₪{b.monthly_limit}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Receipts</h3>
            {receipts.length === 0 ? (
              <p>No receipts.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={cellStyle}>Merchant</th>
                    <th style={cellStyle}>Date</th>
                    <th style={cellStyle}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((r) => (
                    <tr key={r.id}>
                      <td style={cellStyle}>{r.raw_response.merchant}</td>
                      <td style={cellStyle}>{r.raw_response.date}</td>
                      <td style={cellStyle}>₪{r.raw_response.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ ...cardStyle, borderColor: '#fca5a5' }}>
            <h3 style={{ marginTop: 0, color: '#dc2626' }}>Danger zone</h3>
            <p style={{ fontSize: 14 }}>
              Permanently deletes this user's receipts (and stored photos), budgets, profile, and account.
              This cannot be undone.
            </p>

            {!showDeleteConfirm ? (
              <button onClick={() => setShowDeleteConfirm(true)} style={dangerButtonStyle}>
                Delete all data
              </button>
            ) : (
              <DeleteUserConfirm
                user={user}
                accessToken={accessToken}
                onDeleted={onBack}
                onCancel={() => setShowDeleteConfirm(false)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
