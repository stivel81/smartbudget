'use client';

import { useEffect, useState } from 'react';
import { getRateLimitViolations, RateLimitViolation } from '../../lib/api';
import { cardStyle, cellStyle } from '../../lib/styles';

export default function RateLimitViolationsView({ accessToken }: { accessToken: string }) {
  const [violations, setViolations] = useState<RateLimitViolation[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getRateLimitViolations(accessToken)
      .then((res) => {
        if (!cancelled) setViolations(res.violations);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err.message || 'Failed to load rate limit violations');
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
      <h2 style={{ marginBottom: 12 }}>Rate limit violations</h2>
      <div style={cardStyle}>
        {violations.length === 0 ? (
          <p>No rate limit violations recorded.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={cellStyle}>When</th>
                <th style={cellStyle}>IP</th>
                <th style={cellStyle}>Route</th>
              </tr>
            </thead>
            <tbody>
              {violations.map((v) => (
                <tr key={v.id}>
                  <td style={cellStyle}>{new Date(v.created_at).toLocaleString()}</td>
                  <td style={cellStyle}>{v.ip || '—'}</td>
                  <td style={cellStyle}>{v.route}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
