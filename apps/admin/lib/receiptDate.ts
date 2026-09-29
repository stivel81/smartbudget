// Receipt date display, matching the mobile app (apps/mobile/lib/spending.ts):
// the printed receipt date when it is an ISO date (or date-time), otherwise
// the upload time, shown day-first "DD/MM/YYYY" as Israeli receipts are.
// Ambiguous strings such as legacy "17/08/2026" are never guessed at.
import type { AdminReceipt } from './api';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T/;

/** A receipt date string as a local Date, or null if it isn't a valid ISO date/date-time. */
export function parseReceiptDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();

  const dateOnly = DATE_ONLY.exec(trimmed);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const monthIndex = Number(dateOnly[2]) - 1;
    const day = Number(dateOnly[3]);
    const date = new Date(year, monthIndex, day);
    const roundTrips = date.getFullYear() === year && date.getMonth() === monthIndex && date.getDate() === day;
    return roundTrips ? date : null;
  }

  if (ISO_DATE_TIME.test(trimmed)) {
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** "DD/MM/YYYY" (local calendar day); "—" for an invalid Date. */
export function formatDayMonthYear(date: Date): string {
  if (Number.isNaN(date.getTime())) return '—';
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function formatReceiptDate(receipt: Pick<AdminReceipt, 'raw_response' | 'created_at'>): string {
  return formatDayMonthYear(parseReceiptDate(receipt.raw_response?.date) ?? new Date(receipt.created_at));
}
