'use client';

import { useState, FormEvent } from 'react';
import { login, getUsers } from '../lib/api';
import { inputStyle, buttonStyle } from '../lib/styles';
import AdminDashboard from './AdminDashboard';

export default function AdminPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [signedInEmail, setSignedInEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { session } = await login(email, password);
      // Confirm admin access before treating the login as successful —
      // a valid but non-admin login should not reach the dashboard.
      await getUsers(session.access_token);
      setSignedInEmail(session.user.email);
      setAccessToken(session.access_token);
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
          <button type="submit" disabled={loading} style={{ ...buttonStyle, width: '100%' }}>
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
    <AdminDashboard
      accessToken={accessToken}
      userEmail={signedInEmail}
      onSignOut={() => {
        setAccessToken(null);
        setSignedInEmail('');
        setEmail('');
        setPassword('');
      }}
    />
  );
}
