'use client';

import { COLORS } from '../../lib/theme';
import {
  API_BASE_URL,
  CLAUDE_DAILY_CALL_LIMIT,
  CLAUDE_MONTHLY_BUDGET_USD,
} from '../../lib/config';
import { Card, CardHeader, Td, Th, pageSubtitleStyle, pageTitleStyle, tableStyle, tableWrapStyle } from '../components/ui';

const ROWS: { label: string; value: string; envVar: string; note: string }[] = [
  {
    label: 'API base URL',
    value: API_BASE_URL,
    envVar: 'NEXT_PUBLIC_API_BASE_URL',
    note: 'Backend this dashboard calls.',
  },
  {
    label: 'Monthly Claude budget',
    value: `$${CLAUDE_MONTHLY_BUDGET_USD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    envVar: 'NEXT_PUBLIC_CLAUDE_MONTHLY_BUDGET_USD',
    note: 'AI Monitor progress bar only — not enforced.',
  },
  {
    label: 'Daily Claude call limit',
    value: CLAUDE_DAILY_CALL_LIMIT.toLocaleString('en-US'),
    envVar: 'NEXT_PUBLIC_CLAUDE_DAILY_CALL_LIMIT',
    note: 'AI Monitor progress bar only — not enforced.',
  },
];

export default function SettingsView() {
  return (
    <div>
      <h1 style={pageTitleStyle}>Settings</h1>
      <p style={pageSubtitleStyle}>
        Read-only. Values come from the admin app&apos;s build-time environment (see apps/admin/.env.example).
      </p>

      <Card>
        <CardHeader title="Configuration" />
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Setting</Th>
                <Th>Value</Th>
                <Th>Env var</Th>
                <Th>Notes</Th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => {
                const last = i === ROWS.length - 1;
                return (
                  <tr key={row.envVar}>
                    <Td last={last}>{row.label}</Td>
                    <Td last={last}>
                      <span style={{ fontWeight: 600, color: COLORS.textPrimary }}>{row.value}</span>
                    </Td>
                    <Td last={last}>
                      <code style={{ fontSize: 11, color: COLORS.textSecondary }}>{row.envVar}</code>
                    </Td>
                    <Td last={last}>{row.note}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
