'use client';

import { useState, CSSProperties, FormEvent } from 'react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

interface AdminUser {
  id: string;
  email: string | null;
  name: string | null;
  created_at: string;
  is_admin: boolean;
}

export default function AdminPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const loginRes = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const loginBody = await loginRes.json();
      if (!loginRes.ok) throw new Error(loginBody.error || 'Login failed');

      const token = loginBody.session.access_token as string;

      const usersRes = await fetch(`${API_BASE_URL}/api/v1/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const usersBody = await usersRes.json();
      if (!usersRes.ok) throw new Error(usersBody.error || 'Failed to load users');

      setAccessToken(token);
      setUsers(usersBody.users);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  if (!accessToken) {
    return (
      <main style={{ maxWidth: 360, margin: '80px auto', padding: 24 }}>
        <h1>SmartBudget Admin</h1>
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 12 }}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              required
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              required
            />
          </div>
          {error ? <p style={{ color: '#dc2626', fontSize: 14 }}>{error}</p> : null}
          <button type="submit" disabled={loading} style={buttonStyle}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <p style={{ fontSize: 13, color: '#666', marginTop: 16 }}>
          Requires an account with admin access (is_admin = true in Supabase).
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 800, margin: '40px auto', padding: 24 }}>
      <h1>Users</h1>
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
            <tr key={u.id}>
              <td style={cellStyle}>{u.email}</td>
              <td style={cellStyle}>{u.name}</td>
              <td style={cellStyle}>{new Date(u.created_at).toLocaleDateString()}</td>
              <td style={cellStyle}>{u.is_admin ? 'Yes' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: 8,
  boxSizing: 'border-box',
  border: '1px solid #d1d5db',
  borderRadius: 6,
};

const buttonStyle: CSSProperties = {
  width: '100%',
  padding: 10,
  borderRadius: 6,
  border: 'none',
  backgroundColor: '#1D9E75',
  color: '#ffffff',
  fontWeight: 600,
  cursor: 'pointer',
};

const cellStyle: CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  borderBottom: '1px solid #e5e5e5',
};
