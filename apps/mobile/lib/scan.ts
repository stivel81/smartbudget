// Pure helpers for the receipt scanner (ScanScreen). Kept free of React /
// native modules so they can be unit-tested directly.
import type { Receipt, ReceiptExtraction } from './api';
import { CATEGORY_META } from './theme';
import { parseAmountInput } from './currency';

// Claude resizes any image above this (long edge) before billing/processing
// it, so uploading larger buys nothing — this is also the size we store.
export const MAX_IMAGE_DIMENSION = 1568;

export type ResizeTarget = { width: number } | { height: number };

/**
 * Which edge to clamp so the image's long edge is at most `maxDimension`
 * (aspect ratio preserved by the manipulator). `null` means no resize needed.
 * Landscape and square images clamp width; portrait images clamp height.
 */
export function resizeTargetFor(
  width: number,
  height: number,
  maxDimension: number = MAX_IMAGE_DIMENSION
): ResizeTarget | null {
  if (Math.max(width, height) <= maxDimension) return null;
  return width >= height ? { width: maxDimension } : { height: maxDimension };
}

/** What the AI result card shows for a freshly scanned receipt. */
export interface ScanResult {
  id: string;
  merchant: string;
  category: string;
  date: string;
  total: number;
}

export const UNCATEGORIZED = 'Uncategorized';

/** Distinct line-item categories in first-seen order, comma-joined. */
export function summarizeCategories(items: ReceiptExtraction['items']): string {
  const categories = Array.from(new Set(items.map((item) => item.category)));
  return categories.length > 0 ? categories.join(', ') : UNCATEGORIZED;
}

export function toScanResult(receipt: Receipt): ScanResult {
  const extraction = receipt.raw_response;
  return {
    id: receipt.id,
    merchant: extraction.merchant,
    category: summarizeCategories(extraction.items),
    date: extraction.date,
    total: extraction.total,
  };
}

/**
 * Icon for the Category row: the first listed category's icon from
 * CATEGORY_META, or the "Other" icon for unknown / uncategorized values.
 */
export function categoryIconFor(categorySummary: string): string {
  const first = categorySummary.split(',')[0].trim();
  return (CATEGORY_META[first] ?? CATEGORY_META.Other).icon;
}

export type ReceiptEditOutcome =
  | { kind: 'invalid'; title: string; message: string }
  | { kind: 'unchanged' }
  | { kind: 'update'; updates: { merchant?: string; total?: number } };

/**
 * Validates the user's edits on the result card and works out the minimal
 * PATCH body: only fields that actually changed are sent.
 */
export function resolveReceiptEdits(
  original: Pick<ScanResult, 'merchant' | 'total'>,
  editedMerchant: string,
  editedTotal: string
): ReceiptEditOutcome {
  const merchant = editedMerchant.trim();
  // Accepts what the card pre-fills ("₪1,234.50") as well as plain typing ("1234.5").
  const totalNumber = parseAmountInput(editedTotal);

  if (!merchant) {
    return { kind: 'invalid', title: 'Merchant required', message: 'Merchant name cannot be empty.' };
  }
  if (!editedTotal || !(totalNumber > 0)) {
    return { kind: 'invalid', title: 'Invalid total', message: 'Total must be a positive number.' };
  }

  const merchantChanged = merchant !== original.merchant;
  const totalChanged = totalNumber !== original.total;
  if (!merchantChanged && !totalChanged) return { kind: 'unchanged' };

  return {
    kind: 'update',
    updates: {
      ...(merchantChanged && { merchant }),
      ...(totalChanged && { total: totalNumber }),
    },
  };
}
