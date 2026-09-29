// Keeps `transactions` in sync with a receipt's raw_response.items.
//
// receipts.raw_response remains the source of truth and drives every read;
// `transactions` is a derived copy (nothing reads it yet). After every
// receipt write (POST /receipts/scan, PATCH /receipts/:id) the receipt's
// transactions are REPLACED: delete all rows for the receipt, then insert one
// row per usable item. DELETE /receipts/:id needs nothing here — the FK
// cascades.
//
// BEST-EFFORT: syncReceiptTransactions never throws and never changes the
// scan/patch response; a failure is logged and the receipt simply keeps
// stale (or, if the insert failed after the delete, no) transactions until
// its next write. The two steps are separate PostgREST calls, so they are
// not atomic.
//
// The mapping rules are the same as the SQL backfill in migration
// 20260929100200_create_transactions.sql — keep the two in step.

import { supabase } from '@smartbudget/shared/lib/supabase';
import { CategoryRow, fetchUserCategories, resolveCategoryId, trimSpaces } from './categories';

export interface ReceiptForSync {
  id: string;
  user_id?: string;
  created_at?: string;
  raw_response?: { date?: unknown; items?: unknown } | null;
}

export interface TransactionRow {
  receipt_id: string;
  user_id: string;
  category_id: string;
  name: string | null;
  amount: number;
  date: string | null;
  position: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL_STRING = /^-?[0-9]+(\.[0-9]+)?$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A JSON number, or a plain decimal string ("12.50", "-3"); otherwise null. */
export function itemAmount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = trimSpaces(value);
    return DECIMAL_STRING.test(trimmed) ? Number(trimmed) : null;
  }
  return null;
}

/** "YYYY-MM-DD" when it is a real calendar date, else null. */
export function isoDateOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const roundTrips = date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  return roundTrips ? value : null;
}

/** The receipt's spend date: raw_response.date if valid, else created_at's UTC date. */
export function transactionDate(receipt: ReceiptForSync): string | null {
  const raw = isoDateOrNull(receipt.raw_response?.date);
  if (raw) return raw;
  if (typeof receipt.created_at === 'string') {
    const created = new Date(receipt.created_at);
    if (!Number.isNaN(created.getTime())) return created.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Pure mapping from a saved receipt to its transaction rows.
 * - position = index in raw_response.items (skipped items keep their gap)
 * - non-object items and items without a usable amount are skipped
 * - name = item.name when a string, else null
 * - category via resolveCategoryId (base, then user's custom, else Other)
 */
export function buildTransactionRows(
  userId: string,
  receipt: ReceiptForSync,
  categories: readonly CategoryRow[]
): TransactionRow[] {
  const items = receipt.raw_response?.items;
  if (!Array.isArray(items)) return [];
  const date = transactionDate(receipt);
  const rows: TransactionRow[] = [];
  items.forEach((item, position) => {
    if (!isPlainObject(item)) return;
    const amount = itemAmount(item.amount);
    if (amount === null) return;
    rows.push({
      receipt_id: receipt.id,
      user_id: userId,
      category_id: resolveCategoryId(item.category, userId, categories),
      name: typeof item.name === 'string' ? item.name : null,
      amount,
      date,
      position,
    });
  });
  return rows;
}

/**
 * Replaces the receipt's transactions from its saved raw_response.
 * Never throws; returns true on success, false (after logging) on failure.
 */
export async function syncReceiptTransactions(userId: string, receipt: ReceiptForSync): Promise<boolean> {
  try {
    if (!userId || !receipt?.id) {
      console.error('Transaction sync skipped: missing user or receipt id');
      return false;
    }

    const { data: categories, error: categoriesError } = await fetchUserCategories(userId);
    if (categoriesError || !categories) {
      console.error(`Transaction sync failed for receipt ${receipt.id} (categories):`, categoriesError);
      return false;
    }

    const rows = buildTransactionRows(userId, receipt, categories);

    const { error: deleteError } = await supabase
      .from('transactions')
      .delete()
      .eq('receipt_id', receipt.id)
      .eq('user_id', userId);
    if (deleteError) {
      console.error(`Transaction sync failed for receipt ${receipt.id} (delete):`, deleteError);
      return false;
    }

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from('transactions').insert(rows);
      if (insertError) {
        console.error(`Transaction sync failed for receipt ${receipt.id} (insert):`, insertError);
        return false;
      }
    }
    return true;
  } catch (err) {
    console.error(`Transaction sync failed for receipt ${receipt?.id}:`, err);
    return false;
  }
}
