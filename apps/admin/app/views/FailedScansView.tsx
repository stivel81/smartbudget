'use client';

import { useEffect, useState } from 'react';
import { getFailedScans, ScanFailure } from '../../lib/api';
import { cardStyle, cellStyle } from '../../lib/styles';

export default function FailedScansView({ accessToken }: { accessToken: string }) {
  const [failures, setFailures] = useState<ScanFailure[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getFailedScans(accessToken)
      .then((res) => {
        if (!cancelled) setFailures(res.failures);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err.message || 'Failed to load failed scans');
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
      <h2 style={{ marginBottom: 12 }}>Failed scans</h2>
      <div style={cardStyle}>
        {failures.length === 0 ? (
          <p>No failed scans recorded.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={cellStyle}>When</th>
                <th style={cellStyle}>User ID</th>
                <th style={cellStyle}>Media type</th>
                <th style={cellStyle}>Error</th>
              </tr>
            </thead>
            <tbody>
              {failures.map((f) => (
                <tr key={f.id}>
                  <td style={cellStyle}>{new Date(f.created_at).toLocaleString()}</td>
                  <td style={cellStyle}>{f.user_id}</td>
                  <td style={cellStyle}>{f.media_type || '—'}</td>
                  <td style={{ ...cellStyle, maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {f.error_message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
