// Pure calculations behind the admin dashboard and AI monitor.
//
// All day/month bucketing is in UTC, matching the backend: /admin/usage groups
// receipts by `created_at.slice(0, 10)` of a UTC ISO timestamp. Every function
// that depends on "now" takes it as a parameter so it can be tested with fixed
// dates.

import type { AdminUserSummary, DailyUsage } from './api';

// Claude Haiku 4.5 pricing — keep in sync with apps/backend/src/routes/admin.ts.
export const HAIKU_INPUT_COST_PER_TOKEN = 1 / 1_000_000;
export const HAIKU_OUTPUT_COST_PER_TOKEN = 5 / 1_000_000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD of the given instant, in UTC. */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The last `n` UTC days ending with (and including) today, oldest first. */
export function lastNDays(now: Date, n: number): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    days.push(isoDay(new Date(now.getTime() - i * DAY_MS)));
  }
  return days;
}

/** Claude cost in USD for a token count. */
export function claudeCostUsd(inputTokens: number, outputTokens: number): number {
  return inputTokens * HAIKU_INPUT_COST_PER_TOKEN + outputTokens * HAIKU_OUTPUT_COST_PER_TOKEN;
}

/** New signups per UTC day for the last `n` days (oldest first). */
export function signupsByDay(
  users: Pick<AdminUserSummary, 'created_at'>[],
  now: Date,
  n = 7
): { day: string; count: number }[] {
  return lastNDays(now, n).map((day) => ({
    day,
    count: users.filter((u) => u.created_at.slice(0, 10) === day).length,
  }));
}

/** Users created within the last `days` × 24h of `now`. */
export function countNewSince(users: Pick<AdminUserSummary, 'created_at'>[], now: Date, days = 7): number {
  const cutoff = now.getTime() - days * DAY_MS;
  return users.filter((u) => new Date(u.created_at).getTime() >= cutoff).length;
}

/** Successful scans and Claude cost for the current UTC day. */
export function todayUsage(byDay: DailyUsage[], now: Date): { scans: number; costUsd: number } {
  const entry = byDay.find((d) => d.date === isoDay(now));
  if (!entry) return { scans: 0, costUsd: 0 };
  return { scans: entry.scans, costUsd: claudeCostUsd(entry.inputTokens, entry.outputTokens) };
}

/** Claude cost for the current UTC calendar month. */
export function monthCostUsd(byDay: DailyUsage[], now: Date): number {
  const month = isoDay(now).slice(0, 7);
  return byDay
    .filter((d) => d.date.startsWith(month))
    .reduce((sum, d) => sum + claudeCostUsd(d.inputTokens, d.outputTokens), 0);
}

/** Average cost per scan, 0 when there were no scans. */
export function avgCostPerScan(costUsd: number, scans: number): number {
  return scans > 0 ? costUsd / scans : 0;
}

/** Whole-number success percentage; 100 when there's no data yet. */
export function successRatePercent(successCount: number, failedCount: number): number {
  const total = successCount + failedCount;
  return total > 0 ? Math.round((successCount / total) * 100) : 100;
}

/** SVG stroke-dashoffset for a donut ring of `radius` filled to `pct`%. */
export function donutDashOffset(pct: number, radius: number): number {
  const circumference = 2 * Math.PI * radius;
  return circumference * (1 - pct / 100);
}
