'use client';

import { useEffect, useState } from 'react';
import { getAuditLog, AuditLogEntry } from '../../lib/api';
import { cardStyle, cellStyle } from '../../lib/styles';

function describeTarget(entry: AuditLogEntry): string {
  const detailEmail = typeof entry.details?.email === 'string' ? (entry.details.email as string) : null;
  if (detailEmail) return detailEmail;
  if (entry.target_user_id) return entry.target_user_id;
  return '—';
}

export default function AuditLogView({ accessToken }: { accessToken: string }) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getAuditLog(accessToken)
      .then((res) => {
        if (!cancelled) setEntries(res.auditLog);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err.message || 'Failed to load audit log');
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
      <h2 style={{ marginBottom: 12 }}>Audit log</h2>
      <div style={cardStyle}>
        {entries.length === 0 ? (
          <p>No admin actions recorded yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={cellStyle}>When</th>
                <th style={cellStyle}>Admin</th>
                <th style={cellStyle}>Action</th>
                <th style={cellStyle}>Target</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td style={cellStyle}>{new Date(e.created_at).toLocaleString()}</td>
                  <td style={cellStyle}>{e.admin_email || e.admin_id}</td>
                  <td style={cellStyle}>{e.action}</td>
                  <td style={cellStyle}>{describeTarget(e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
