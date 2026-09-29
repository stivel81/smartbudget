// Pure helpers for the receipt scanner (ScanScreen). Kept free of React /
// native modules so they can be unit-tested directly.
import type { ItemCategoryUpdate, Receipt, ReceiptExtraction } from './api';
import { CATEGORY_META } from './theme';
import { parseAmountInput } from './currency';
import { formatReceiptDate } from './spending';

// Claude (Haiku 4.5) resizes any image above this (long edge) before
// billing/processing it, so uploading larger buys nothing — this is also the
// size we store. Token cost depends only on pixel count (≈ w×h/750, capped
// near 1,600 tokens by that server-side resize), never on JPEG quality.
export const MAX_IMAGE_DIMENSION = 1568;

// The photo is JPEG-encoded exactly once, by the resize step, at a quality
// that keeps small receipt print (Hebrew diacritics, thin digits) crisp for
// OCR. The picker hands over the original (quality 1) so the image isn't
// compressed twice. A 1568px JPEG at 0.9 is well under Claude's 5 MB image
// limit and the backend's 15 MB body limit.
export const PICKER_QUALITY = 1;
export const JPEG_QUALITY = 0.9;

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
  /** Display date, DD/MM/YYYY (see formatReceiptDate). */
  date: string;
  total: number;
  items: ReceiptExtraction['items'];
}

export const UNCATEGORIZED = 'Uncategorized';

/** Distinct line-item categories in first-seen order, comma-joined. */
export function summarizeCategories(items: ReceiptExtraction['items']): string {
  const categories = Array.from(new Set(items.map((item) => item.category)));
  return categories.length > 0 ? categories.join(', ') : UNCATEGORIZED;
}

/** Category row label when the lines have different categories. */
export const MIXED_CATEGORIES = 'Mixed';
/** Category row icon for mixed lines. */
export const MIXED_CATEGORIES_ICON = 'shape-outline';

/** The category every line shares, or null when they differ or there are no lines. */
export function commonCategory(items: ReceiptExtraction['items']): string | null {
  if (items.length === 0) return null;
  const first = items[0].category;
  return items.every((item) => item.category === first) ? first : null;
}

/**
 * What the result card's Category row shows: the shared category,
 * MIXED_CATEGORIES when the lines differ, UNCATEGORIZED with no lines.
 */
export function categoryRowLabel(items: ReceiptExtraction['items']): string {
  if (items.length === 0) return UNCATEGORIZED;
  return commonCategory(items) ?? MIXED_CATEGORIES;
}

/** Icon for the Category row: the shared category's icon, or MIXED_CATEGORIES_ICON. */
export function categoryRowIcon(items: ReceiptExtraction['items']): string {
  const common = commonCategory(items);
  if (common === null && items.length > 0) return MIXED_CATEGORIES_ICON;
  return categoryIconFor(common ?? UNCATEGORIZED);
}

export function toScanResult(receipt: Receipt): ScanResult {
  const extraction = receipt.raw_response;
  return {
    id: receipt.id,
    merchant: extraction.merchant,
    category: summarizeCategories(extraction.items),
    date: formatReceiptDate(receipt),
    total: extraction.total,
    items: extraction.items,
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

/** `items` with each line's category replaced by `categories[i]` (when given). */
export function withCategories(
  items: ReceiptExtraction['items'],
  categories: readonly string[]
): ReceiptExtraction['items'] {
  return items.map((item, i) => (categories[i] !== undefined ? { ...item, category: categories[i] } : item));
}

/**
 * The PATCH `items` entries for lines whose category the user changed:
 * `categories[i]` vs `items[i].category`, in index order. Entries past the
 * end of `items` are ignored.
 */
export function itemCategoryChanges(
  items: ReceiptExtraction['items'],
  categories: readonly string[]
): ItemCategoryUpdate[] {
  const changes: ItemCategoryUpdate[] = [];
  items.forEach((item, index) => {
    const category = categories[index];
    if (category !== undefined && category !== item.category) changes.push({ index, category });
  });
  return changes;
}

export type ReceiptEditOutcome =
  | { kind: 'invalid'; title: string; message: string }
  | { kind: 'unchanged' }
  | {
      kind: 'update';
      updates: { merchant?: string; total?: number; items?: ItemCategoryUpdate[] };
    };

/**
 * Validates the user's edits on the result card and works out the minimal
 * PATCH body: only fields that actually changed are sent (and only the
 * line items whose category changed).
 */
export function resolveReceiptEdits(
  original: Pick<ScanResult, 'merchant' | 'total'> & { items?: ReceiptExtraction['items'] },
  editedMerchant: string,
  editedTotal: string,
  editedCategories: readonly string[] = []
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
  const categoryChanges = itemCategoryChanges(original.items ?? [], editedCategories);
  if (!merchantChanged && !totalChanged && categoryChanges.length === 0) return { kind: 'unchanged' };

  return {
    kind: 'update',
    updates: {
      ...(merchantChanged && { merchant }),
      ...(totalChanged && { total: totalNumber }),
      ...(categoryChanges.length > 0 && { items: categoryChanges }),
    },
  };
}
