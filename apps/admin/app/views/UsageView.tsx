'use client';

import { useEffect, useState } from 'react';
import { getUsage, UsageSummary } from '../../lib/api';
import { cardStyle, cellStyle } from '../../lib/styles';

export default function UsageView({ accessToken }: { accessToken: string }) {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getUsage(accessToken)
      .then((res) => {
        if (!cancelled) setUsage(res);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err.message || 'Failed to load usage');
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
  if (!usage) return null;

  return (
    <div>
      <h2 style={{ marginBottom: 12 }}>Claude API usage</h2>

      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <div style={{ ...cardStyle, flex: 1 }}>
          <p style={{ fontSize: 13, color: '#666', margin: 0 }}>Total scans</p>
          <p style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{usage.totalScans}</p>
        </div>
        <div style={{ ...cardStyle, flex: 1 }}>
          <p style={{ fontSize: 13, color: '#666', margin: 0 }}>Input / output tokens</p>
          <p style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
            {usage.totalInputTokens.toLocaleString()} / {usage.totalOutputTokens.toLocaleString()}
          </p>
        </div>
        <div style={{ ...cardStyle, flex: 1 }}>
          <p style={{ fontSize: 13, color: '#666', margin: 0 }}>Estimated cost (Haiku 4.5 rates)</p>
          <p style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>${usage.estimatedCostUsd.toFixed(4)}</p>
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>By day</h3>
        {usage.byDay.length === 0 ? (
          <p>No scans recorded yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={cellStyle}>Date</th>
                <th style={cellStyle}>Scans</th>
                <th style={cellStyle}>Input tokens</th>
                <th style={cellStyle}>Output tokens</th>
              </tr>
            </thead>
            <tbody>
              {usage.byDay.map((d) => (
                <tr key={d.date}>
                  <td style={cellStyle}>{d.date}</td>
                  <td style={cellStyle}>{d.scans}</td>
                  <td style={cellStyle}>{d.inputTokens.toLocaleString()}</td>
                  <td style={cellStyle}>{d.outputTokens.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
