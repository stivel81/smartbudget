'use client';

import { useEffect, useState } from 'react';
import { getUsage, getScanLog, ScanLogEntry, UsageSummary } from '../../lib/api';
import { COLORS, FONT_FAMILY } from '../../lib/theme';
import {
  Card,
  CardHeader,
  MetricCard,
  StatusDot,
  Td,
  Th,
  tableStyle,
  tableWrapStyle,
  pageSubtitleStyle,
  pageTitleStyle,
} from '../components/ui';

const HAIKU_INPUT_COST_PER_TOKEN = 1 / 1_000_000;
const HAIKU_OUTPUT_COST_PER_TOKEN = 5 / 1_000_000;

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AIMonitorView({ accessToken }: { accessToken: string }) {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [log, setLog] = useState<ScanLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getUsage(accessToken), getScanLog(accessToken)])
      .then(([usageRes, logRes]) => {
        if (cancelled) return;
        setUsage(usageRes);
        setLog(logRes.log);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err.message || 'Failed to load AI monitor');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (loading) return <p style={{ fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.textSecondary }}>Loading…</p>;
  if (error) return <p style={{ fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.dangerText }}>{error}</p>;
  if (!usage) return null;

  const today = isoDay(new Date());
  const todayEntry = usage.byDay.find((d) => d.date === today);
  const scansToday = todayEntry?.scans ?? 0;
  const costToday = todayEntry
    ? todayEntry.inputTokens * HAIKU_INPUT_COST_PER_TOKEN + todayEntry.outputTokens * HAIKU_OUTPUT_COST_PER_TOKEN
    : 0;
  const avgPerScan = scansToday > 0 ? costToday / scansToday : 0;

  return (
    <div>
      <h1 style={pageTitleStyle}>AI Monitor</h1>
      <p style={pageSubtitleStyle}>Claude Haiku 4.5 — live usage &amp; costs</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18 }}>
        <MetricCard label="All-time cost" value={`$${usage.estimatedCostUsd.toFixed(2)}`} accent />
        <MetricCard label="API calls today" value={scansToday.toString()} />
        <MetricCard
          label="Cost today"
          value={`$${costToday.toFixed(4)}`}
          change={scansToday > 0 ? { label: `avg $${avgPerScan.toFixed(4)} per scan`, positive: true } : undefined}
        />
      </div>

      <Card>
        <CardHeader title="API log" />
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Time</Th>
                <Th>User</Th>
                <Th align="right">Tokens</Th>
                <Th align="right">Cost</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {log.map((entry, i) => {
                const last = i === log.length - 1;
                return (
                  <tr key={entry.id} title={entry.error ?? undefined}>
                    <Td last={last}>{formatTime(entry.createdAt)}</Td>
                    <Td last={last}>{entry.email ?? '—'}</Td>
                    <Td align="right" last={last}>
                      <span style={{ color: COLORS.purple, fontVariantNumeric: 'tabular-nums' }}>
                        {entry.inputTokens != null ? (entry.inputTokens + (entry.outputTokens ?? 0)).toLocaleString() : '—'}
                      </span>
                    </Td>
                    <Td align="right" last={last}>
                      {entry.costUsd != null ? `$${entry.costUsd.toFixed(4)}` : '—'}
                    </Td>
                    <Td last={last}>
                      <StatusDot status={entry.status} />
                    </Td>
                  </tr>
                );
              })}
              {log.length === 0 && (
                <tr>
                  <Td last>No scan activity yet.</Td>
                  <Td last>{''}</Td>
                  <Td last align="right">{''}</Td>
                  <Td last align="right">{''}</Td>
                  <Td last>{''}</Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
