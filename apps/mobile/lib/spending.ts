// Pure spending helpers shared by DashboardScreen and BudgetScreen.
//
// Every function that depends on "the current time" takes `now` as a
// parameter so results are deterministic and testable.

import type { Budget, Receipt } from './api';

export interface CategoryTotal {
  category: string;
  spent: number;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T/;

/**
 * Parse a receipt date string. Date-only strings ("2026-09-01") are
 * interpreted as that LOCAL calendar day (JS would otherwise treat them as
 * UTC midnight, which lands on the previous day west of UTC). Full ISO
 * date-times are parsed as-is. Anything else — including impossible dates
 * like "2026-02-31" and locale formats such as "01/09/2026" whose day/month
 * order is ambiguous — returns null.
 */
export function parseReceiptDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();

  const dateOnly = DATE_ONLY.exec(trimmed);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const monthIndex = Number(dateOnly[2]) - 1;
    const day = Number(dateOnly[3]);
    const date = new Date(year, monthIndex, day);
    const roundTrips =
      date.getFullYear() === year && date.getMonth() === monthIndex && date.getDate() === day;
    return roundTrips ? date : null;
  }

  if (ISO_DATE_TIME.test(trimmed)) {
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

/**
 * The date a receipt's spending belongs to: the date printed on the receipt
 * (as extracted by the OCR step) when it is valid, otherwise the moment the
 * receipt was uploaded.
 */
export function receiptSpendDate(receipt: Receipt): Date {
  return parseReceiptDate(receipt.raw_response?.date) ?? new Date(receipt.created_at);
}

/** True when `date` falls in the same local calendar month and year as `now`. */
export function isInMonth(date: Date, now: Date): boolean {
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

/** Receipts whose spend date is in the current local month of `now`. */
export function receiptsForMonth(receipts: Receipt[], now: Date): Receipt[] {
  return receipts.filter((r) => isInMonth(receiptSpendDate(r), now));
}

/**
 * Receipts whose spend date is at or after `now` minus `days` calendar days
 * (same local wall-clock time, so DST shifts don't move the boundary).
 */
export function receiptsSince(receipts: Receipt[], days: number, now: Date): Receipt[] {
  const cutoff = new Date(now.getTime());
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffMs = cutoff.getTime();
  return receipts.filter((r) => receiptSpendDate(r).getTime() >= cutoffMs);
}

/** Sum of line-item amounts per category across all given receipts. */
export function categoryTotals(receipts: Receipt[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const receipt of receipts) {
    for (const item of receipt.raw_response?.items ?? []) {
      totals[item.category] = (totals[item.category] ?? 0) + item.amount;
    }
  }
  return totals;
}

/** Category totals as a list, largest spend first (ties broken by name). */
export function sortedCategoryTotals(receipts: Receipt[]): CategoryTotal[] {
  return Object.entries(categoryTotals(receipts))
    .map(([category, spent]) => ({ category, spent }))
    .sort((a, b) => b.spent - a.spent || a.category.localeCompare(b.category));
}

/** Sum of receipt grand totals. */
export function sumTotals(receipts: Receipt[]): number {
  let sum = 0;
  for (const receipt of receipts) sum += receipt.raw_response?.total ?? 0;
  return sum;
}

/** Sum of the `spent` field across rows. */
export function sumSpent(rows: readonly { spent: number }[]): number {
  let sum = 0;
  for (const row of rows) sum += row.spent;
  return sum;
}

/** Sum of monthly limits across budgets. */
export function sumLimits(budgets: readonly Pick<Budget, 'monthly_limit'>[]): number {
  let sum = 0;
  for (const budget of budgets) sum += budget.monthly_limit;
  return sum;
}

/**
 * `part` as a percentage of `whole`. Returns 0 when `whole` is not a positive
 * finite number (so callers never see NaN or Infinity).
 */
export function percentOf(part: number, whole: number): number {
  if (!(whole > 0) || !Number.isFinite(whole) || !Number.isFinite(part)) return 0;
  return (part / whole) * 100;
}

/** Spend as a percentage of a budget limit; 0 when the limit is ≤ 0. */
export function budgetUsagePct(spent: number, limit: number): number {
  return percentOf(spent, limit);
}

/** Budgets (with spend attached) whose usage is at or above `thresholdPct`. */
export function budgetsAtOrAbove<T extends { spent: number; monthly_limit: number }>(
  rows: readonly T[],
  thresholdPct: number
): T[] {
  return rows.filter((row) => budgetUsagePct(row.spent, row.monthly_limit) >= thresholdPct);
}

/** Attach each budget's spend for the given category totals. */
export function withSpend<T extends Pick<Budget, 'category'>>(
  budgets: readonly T[],
  totals: Record<string, number>
): (T & { spent: number })[] {
  return budgets.map((b) => ({ ...b, spent: totals[b.category] ?? 0 }));
}

/** Index budgets by category (last one wins on duplicates). */
export function budgetsByCategory<T extends Pick<Budget, 'category'>>(
  budgets: readonly T[]
): Record<string, T> {
  const index: Record<string, T> = {};
  for (const budget of budgets) index[budget.category] = budget;
  return index;
}
