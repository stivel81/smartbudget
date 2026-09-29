// Likely-duplicate receipt detection (advisory only — never blocks a save).
//
// A receipt is a likely duplicate of another receipt of the SAME user when
// both have the same merchant (case-insensitive, trimmed, inner whitespace
// collapsed), the same ISO receipt date (raw_response.date, which every write
// path normalizes to "YYYY-MM-DD") and the same total in cents.
//
// Uses the backend's service-role client like the rest of routes/receipts.ts,
// so ownership is enforced by the explicit `.eq('user_id', userId)` filter —
// exactly as every other receipts route does it.

import { supabase } from '@smartbudget/shared/lib/supabase';

export interface DuplicateOf {
  id: string;
  merchant: string;
  date: string;
  total: number;
}

interface ReceiptLike {
  id: string;
  raw_response?: { merchant?: unknown; total?: unknown; date?: unknown } | null;
}

/** Lower-cased, trimmed, inner whitespace collapsed; null when not a non-blank string. */
export function normalizeMerchant(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/g, ' ').toLowerCase();
  return normalized || null;
}

/** Integer cents (money-safe comparison); null when not a finite number. */
export function totalInCents(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The most recent OTHER receipt of `userId` that looks like a duplicate of
 * `receipt`, or null. Never throws: a failed lookup is logged and reported
 * as null so the scan/patch that called it still succeeds.
 */
export async function findDuplicateReceipt(userId: string, receipt: ReceiptLike): Promise<DuplicateOf | null> {
  try {
    const raw = receipt.raw_response ?? {};
    const merchant = normalizeMerchant(raw.merchant);
    const cents = totalInCents(raw.total);
    const date = typeof raw.date === 'string' && ISO_DATE.test(raw.date) ? raw.date : null;
    if (!userId || !receipt.id || merchant === null || cents === null || date === null) return null;

    // Narrow in the DB to this user's other receipts on the same date, newest
    // first; merchant/total normalization is applied below (per-user per-day
    // row counts are tiny).
    const { data, error } = await supabase
      .from('receipts')
      .select('id, raw_response, created_at')
      .eq('user_id', userId)
      .eq('raw_response->>date', date)
      .neq('id', receipt.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Duplicate receipt lookup failed:', error);
      return null;
    }
    if (!Array.isArray(data)) return null;

    for (const candidate of data as ReceiptLike[]) {
      if (!candidate || candidate.id === receipt.id) continue;
      const other = candidate.raw_response ?? {};
      if (other.date !== date) continue;
      if (normalizeMerchant(other.merchant) !== merchant) continue;
      if (totalInCents(other.total) !== cents) continue;
      return {
        id: candidate.id,
        merchant: String(other.merchant),
        date,
        total: cents / 100,
      };
    }
    return null;
  } catch (err) {
    console.error('Duplicate receipt lookup failed:', err);
    return null;
  }
}
