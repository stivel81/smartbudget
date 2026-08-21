'use client';

import { useEffect, useState } from 'react';
import {
  getUserDetail,
  getUserReceipts,
  AdminUserDetail,
  AdminUserStats,
  AdminBudget,
  AdminReceipt,
} from '../../lib/api';
import { cardStyle, cellStyle, secondaryButtonStyle } from '../../lib/styles';

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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getUserDetail(userId, accessToken), getUserReceipts(userId, accessToken)])
      .then(([detail, receiptsRes]) => {
        if (cancelled) return;
        setUser(detail.user);
        setStats(detail.stats);
        setBudgets(detail.budgets);
        setReceipts(receiptsRes.receipts);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err.message || 'Failed to load user');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, accessToken]);

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
            <p>Status: {user.banned_until ? `Suspended until ${new Date(user.banned_until).toLocaleString()}` : 'Active'}</p>
            <p>Admin: {user.is_admin ? 'Yes' : 'No'}</p>
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
        </div>
      )}
    </div>
  );
}
