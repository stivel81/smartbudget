'use client';

import { useEffect, useState } from 'react';
import {
  getUsers,
  getUsage,
  getFailedScans,
  AdminUserSummary,
  UsageSummary,
} from '../../lib/api';
import { COLORS, FONT_FAMILY } from '../../lib/theme';
import {
  countNewSince,
  donutDashOffset,
  monthCostUsd,
  signupsByDay as computeSignupsByDay,
  successRatePercent,
  todayUsage,
} from '../../lib/metrics';
import { Avatar, Badge, Card, CardHeader, MetricCard, Td, Th, tableStyle, tableWrapStyle, pageSubtitleStyle, pageTitleStyle } from '../components/ui';

function BarChart({ data }: { data: { day: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 70, padding: '0 4px' }}>
      {data.map((d) => {
        const isPeak = d.count === max && max > 0;
        const label = new Date(d.day + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'narrow' });
        return (
          <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
            <div
              title={`${d.day}: ${d.count} new user${d.count === 1 ? '' : 's'}`}
              style={{
                width: '100%',
                maxWidth: 22,
                height: `${Math.max(4, (d.count / max) * 52)}px`,
                background: isPeak ? COLORS.purple : COLORS.border,
                borderRadius: '4px 4px 0 0',
              }}
            />
            <span style={{ fontSize: 9, color: COLORS.textMuted, fontFamily: FONT_FAMILY }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function Donut({ successCount, failedCount }: { successCount: number; failedCount: number }) {
  const pct = successRatePercent(successCount, failedCount);
  const circumference = 2 * Math.PI * 30;
  const offset = donutDashOffset(pct, 30);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 70 }}>
      <svg width="76" height="76" viewBox="0 0 76 76">
        <circle cx="38" cy="38" r="30" fill="none" stroke={COLORS.purpleLight} strokeWidth="8" />
        <circle
          cx="38"
          cy="38"
          r="30"
          fill="none"
          stroke={COLORS.purple}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 38 38)"
        />
        <text x="38" y="36" textAnchor="middle" fontSize="13" fontWeight="700" fill={COLORS.purple} fontFamily={FONT_FAMILY}>
          {pct}%
        </text>
        <text x="38" y="48" textAnchor="middle" fontSize="8" fill={COLORS.textMuted} fontFamily={FONT_FAMILY}>
          success
        </text>
      </svg>
    </div>
  );
}

export default function DashboardView({ accessToken }: { accessToken: string }) {
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [failedCount, setFailedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getUsers(accessToken), getUsage(accessToken), getFailedScans(accessToken)])
      .then(([usersRes, usageRes, failedRes]) => {
        if (cancelled) return;
        setUsers(usersRes.users);
        setUsage(usageRes);
        setFailedCount(failedRes.failures.length);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err.message || 'Failed to load dashboard');
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
  const scansToday = todayUsage(usage.byDay, now).scans;
  const monthCost = monthCostUsd(usage.byDay, now);
  const newThisWeek = countNewSince(users, now, 7);
  const signupsByDay = computeSignupsByDay(users, now, 7);

  const recent = users.slice(0, 4);

  return (
    <div>
      <h1 style={pageTitleStyle}>Dashboard</h1>
      <p style={pageSubtitleStyle}>Overview of accounts and Claude usage across SmartBudget.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 18 }}>
        <MetricCard label="This month's Claude spend" value={`$${monthCost.toFixed(2)}`} accent />
        <MetricCard label="Total users" value={users.length.toLocaleString()} />
        <MetricCard
          label="New signups (7d)"
          value={newThisWeek.toString()}
          change={newThisWeek > 0 ? { label: `+${newThisWeek} this week`, positive: true } : undefined}
        />
        <MetricCard label="AI scans today" value={scansToday.toString()} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 18 }}>
        <Card>
          <CardHeader title="New users — last 7 days" />
          <div style={{ padding: 14 }}>
            <BarChart data={signupsByDay} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Scan success rate" />
          <div style={{ padding: '10px 14px 14px' }}>
            <Donut successCount={usage.totalScans} failedCount={failedCount} />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Recent signups" />
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Role</Th>
                <Th align="right">Joined</Th>
              </tr>
            </thead>
            <tbody>
              {recent.map((u, i) => (
                <tr key={u.id}>
                  <Td last={i === recent.length - 1}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Avatar label={(u.name || u.email || '?').slice(0, 2).toUpperCase()} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: COLORS.textPrimary }}>{u.name || '—'}</div>
                        <div style={{ fontSize: 10, color: COLORS.textMuted }}>{u.email}</div>
                      </div>
                    </div>
                  </Td>
                  <Td last={i === recent.length - 1}>
                    <Badge label={u.is_admin ? 'Admin' : 'User'} tone={u.is_admin ? 'purple' : 'grey'} />
                  </Td>
                  <Td align="right" last={i === recent.length - 1}>
                    {new Date(u.created_at).toLocaleDateString()}
                  </Td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <Td last>No signups yet.</Td>
                  <Td last>{''}</Td>
                  <Td last align="right">{''}</Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
