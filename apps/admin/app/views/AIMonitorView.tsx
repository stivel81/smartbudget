'use client';

import { useEffect, useState } from 'react';
import { getUsage, getScanLog, ScanLogEntry, UsageSummary } from '../../lib/api';
import { COLORS, FONT_FAMILY } from '../../lib/theme';
import { apiCallsToday, avgCostPerScan, monthCostUsd, todayUsage, usageFraction } from '../../lib/metrics';
import { CLAUDE_DAILY_CALL_LIMIT, CLAUDE_MONTHLY_BUDGET_USD } from '../../lib/config';
import {
  Card,
  CardHeader,
  MetricCard,
  ProgressBar,
  StatusDot,
  Td,
  Th,
  tableStyle,
  tableWrapStyle,
  pageSubtitleStyle,
  pageTitleStyle,
} from '../components/ui';

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

  const now = new Date();
  const { scans: scansToday, costUsd: costToday } = todayUsage(usage.byDay, now);
  const avgPerScan = avgCostPerScan(costToday, scansToday);
  const calls = apiCallsToday(usage.byDay, log, now);
  const monthCost = monthCostUsd(usage.byDay, now);
  const budgetUsed = usageFraction(monthCost, CLAUDE_MONTHLY_BUDGET_USD);
  const callsUsed = usageFraction(calls.total, CLAUDE_DAILY_CALL_LIMIT);
  const budgetLabel = `$${CLAUDE_MONTHLY_BUDGET_USD.toFixed(2)} budget`;
  const limitLabel = `${CLAUDE_DAILY_CALL_LIMIT.toLocaleString('en-US')} daily limit`;
  const captionStyle = { margin: '6px 0 0', fontFamily: FONT_FAMILY, fontSize: 10 };

  return (
    <div>
      <h1 style={pageTitleStyle}>AI Monitor</h1>
      <p style={pageSubtitleStyle}>Claude Haiku 4.5 — live usage &amp; costs</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18 }}>
        <MetricCard
          label="Month cost"
          value={`$${monthCost.toFixed(2)}`}
          change={{ label: `${budgetUsed > 1 ? 'over' : 'of'} ${budgetLabel}`, positive: budgetUsed <= 1 }}
          accent
        >
          <ProgressBar value={budgetUsed} label="Monthly budget used" onAccent />
          <p style={{ ...captionStyle, color: 'rgba(255,255,255,0.7)' }}>
            ${usage.estimatedCostUsd.toFixed(2)} all-time
          </p>
        </MetricCard>
        <MetricCard
          label="API calls today"
          value={calls.total.toLocaleString('en-US')}
          change={{ label: `${callsUsed > 1 ? 'over' : 'of'} ${limitLabel}`, positive: callsUsed <= 1 }}
        >
          <ProgressBar value={callsUsed} label="Daily call limit used" />
          {calls.failed > 0 && (
            <p style={{ ...captionStyle, color: COLORS.dangerText }}>{calls.failed} failed</p>
          )}
        </MetricCard>
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
