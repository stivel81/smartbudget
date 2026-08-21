'use client';

import { useEffect, useState } from 'react';
import { getUsers, AdminUserSummary } from '../../lib/api';
import { cellStyle } from '../../lib/styles';

export default function UsersView({
  accessToken,
  onSelectUser,
}: {
  accessToken: string;
  onSelectUser: (userId: string) => void;
}) {
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getUsers(accessToken)
      .then((res) => {
        if (!cancelled) setUsers(res.users);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err.message || 'Failed to load users');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: '#dc2626' }}>{error}</p>;

  return (
    <div>
      <h2 style={{ marginBottom: 12 }}>Users</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={cellStyle}>Email</th>
            <th style={cellStyle}>Name</th>
            <th style={cellStyle}>Created</th>
            <th style={cellStyle}>Admin</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr
              key={u.id}
              onClick={() => onSelectUser(u.id)}
              style={{ cursor: 'pointer' }}
              data-testid={`user-row-${u.id}`}
            >
              <td style={cellStyle}>{u.email}</td>
              <td style={cellStyle}>{u.name}</td>
              <td style={cellStyle}>{new Date(u.created_at).toLocaleDateString()}</td>
              <td style={cellStyle}>{u.is_admin ? 'Yes' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
