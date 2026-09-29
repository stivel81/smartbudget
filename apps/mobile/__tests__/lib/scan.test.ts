import {
  JPEG_QUALITY,
  MAX_IMAGE_DIMENSION,
  PICKER_QUALITY,
  UNCATEGORIZED,
  MIXED_CATEGORIES,
  MIXED_CATEGORIES_ICON,
  categoryRowIcon,
  categoryRowLabel,
  commonCategory,
  itemCategoryChanges,
  withCategories,
  categoryIconFor,
  resizeTargetFor,
  resolveReceiptEdits,
  summarizeCategories,
  toScanResult,
  duplicateFrom,
  duplicateWarningText,
} from '../../lib/scan';
import { CATEGORY_META } from '../../lib/theme';
import type { Receipt } from '../../lib/api';

describe('lib/scan', () => {
  describe('resizeTargetFor', () => {
    it('uses 1568px (Claude\'s internal long-edge limit) by default', () => {
      expect(MAX_IMAGE_DIMENSION).toBe(1568);
    });

    it('returns null when the long edge is within the limit', () => {
      expect(resizeTargetFor(1200, 900)).toBeNull();
    });

    it('returns null when the long edge is exactly the limit', () => {
      expect(resizeTargetFor(1568, 1000)).toBeNull();
      expect(resizeTargetFor(1000, 1568)).toBeNull();
    });

    it('clamps width for landscape images', () => {
      expect(resizeTargetFor(4000, 3000)).toEqual({ width: 1568 });
    });

    it('clamps height for portrait images', () => {
      expect(resizeTargetFor(3000, 4000)).toEqual({ height: 1568 });
    });

    it('clamps width for square images', () => {
      expect(resizeTargetFor(2000, 2000)).toEqual({ width: 1568 });
    });

    it('honours a custom limit', () => {
      expect(resizeTargetFor(1000, 500, 800)).toEqual({ width: 800 });
      expect(resizeTargetFor(700, 500, 800)).toBeNull();
    });
  });

  describe('summarizeCategories', () => {
    it('returns distinct categories in first-seen order', () => {
      expect(
        summarizeCategories([
          { name: 'a', amount: 1, category: 'Dining' },
          { name: 'b', amount: 1, category: 'Groceries' },
          { name: 'c', amount: 1, category: 'Dining' },
        ])
      ).toBe('Dining, Groceries');
    });

    it('returns a single category unchanged', () => {
      expect(summarizeCategories([{ name: 'a', amount: 1, category: 'Health' }])).toBe('Health');
    });

    it('returns Uncategorized for no items', () => {
      expect(summarizeCategories([])).toBe(UNCATEGORIZED);
      expect(UNCATEGORIZED).toBe('Uncategorized');
    });
  });

  describe('toScanResult', () => {
    it('maps a scanned receipt to the result-card fields', () => {
      const receipt: Receipt = {
        id: 'r9',
        user_id: 'u1',
        created_at: '2026-09-01T00:00:00Z',
        image_path: 'u1/r9.jpg',
        raw_response: {
          merchant: 'Café Aroma',
          total: 32.5,
          date: '2026-09-01',
          items: [{ name: 'Latte', amount: 32.5, category: 'Dining' }],
        },
      };
      expect(toScanResult(receipt)).toEqual({
        id: 'r9',
        merchant: 'Café Aroma',
        category: 'Dining',
        date: '01/09/2026',
        total: 32.5,
        items: [{ name: 'Latte', amount: 32.5, category: 'Dining' }],
      });
    });

    it('shows a normalized ISO date day-first (the Israeli receipt that was misfiled)', () => {
      const receipt: Receipt = {
        id: 'r1',
        user_id: 'u1',
        created_at: '2026-09-29T10:00:00Z',
        image_path: null,
        raw_response: { merchant: 'טיטניום בע"מ', total: 350, date: '2026-08-17', items: [] },
      };
      expect(toScanResult(receipt).date).toBe('17/08/2026');
    });

    it('falls back to the upload day when the receipt has no date', () => {
      const created = new Date(2026, 8, 29, 10, 0, 0);
      const receipt: Receipt = {
        id: 'r1',
        user_id: 'u1',
        created_at: created.toISOString(),
        image_path: null,
        raw_response: { merchant: 'M', total: 1, date: null, items: [] },
      };
      expect(toScanResult(receipt).date).toBe('29/09/2026');
    });
  });

  describe('upload image quality', () => {
    it('lets the picker hand over the original (no double JPEG compression)', () => {
      expect(PICKER_QUALITY).toBe(1);
    });

    it('encodes once at a high JPEG quality for OCR of small print', () => {
      expect(JPEG_QUALITY).toBeGreaterThanOrEqual(0.85);
      expect(JPEG_QUALITY).toBeLessThanOrEqual(1);
      expect(JPEG_QUALITY).toBe(0.9);
    });
  });

  describe('withCategories', () => {
    const items = [
      { name: 'Milk', amount: 10, category: 'Groceries' },
      { name: 'Coffee', amount: 12, category: 'Groceries' },
    ];

    it('replaces each line category with the edited one', () => {
      expect(withCategories(items, ['Groceries', 'Dining'])).toEqual([
        { name: 'Milk', amount: 10, category: 'Groceries' },
        { name: 'Coffee', amount: 12, category: 'Dining' },
      ]);
    });

    it('keeps the original category where no edit is given', () => {
      expect(withCategories(items, [])).toEqual(items);
      expect(withCategories(items, ['Health'])[1].category).toBe('Groceries');
    });

    it('does not mutate the input', () => {
      withCategories(items, ['Health', 'Health']);
      expect(items[0].category).toBe('Groceries');
    });
  });

  describe('itemCategoryChanges', () => {
    const items = [
      { name: 'Milk', amount: 10, category: 'Groceries' },
      { name: 'Coffee', amount: 12, category: 'Groceries' },
      { name: 'Bus', amount: 8, category: 'Other' },
    ];

    it('returns nothing when no category changed', () => {
      expect(itemCategoryChanges(items, ['Groceries', 'Groceries', 'Other'])).toEqual([]);
      expect(itemCategoryChanges(items, [])).toEqual([]);
    });

    it('returns only the changed lines, in index order', () => {
      expect(itemCategoryChanges(items, ['Groceries', 'Dining', 'Transport'])).toEqual([
        { index: 1, category: 'Dining' },
        { index: 2, category: 'Transport' },
      ]);
    });

    it('ignores edits past the last item', () => {
      expect(itemCategoryChanges(items, ['Groceries', 'Groceries', 'Other', 'Health'])).toEqual([]);
    });

    it('handles a receipt with no items', () => {
      expect(itemCategoryChanges([], ['Dining'])).toEqual([]);
    });
  });

  describe('categoryIconFor', () => {
    it('uses the CATEGORY_META icon for a known category', () => {
      expect(categoryIconFor('Groceries')).toBe(CATEGORY_META.Groceries.icon);
    });

    it('uses the first category of a comma-joined summary', () => {
      expect(categoryIconFor('Transport, Dining')).toBe(CATEGORY_META.Transport.icon);
    });

    it('falls back to the Other icon for unknown or Uncategorized', () => {
      expect(categoryIconFor('Uncategorized')).toBe(CATEGORY_META.Other.icon);
      expect(categoryIconFor('Pets')).toBe(CATEGORY_META.Other.icon);
      expect(categoryIconFor('')).toBe(CATEGORY_META.Other.icon);
    });
  });

  describe('resolveReceiptEdits', () => {
    const original = { merchant: 'Rami Levy', total: 100 };

    it('rejects an empty or whitespace merchant', () => {
      expect(resolveReceiptEdits(original, '   ', '100')).toEqual({
        kind: 'invalid',
        title: 'Merchant required',
        message: 'Merchant name cannot be empty.',
      });
    });

    it.each(['', '0', '-1', 'abc', 'NaN', '1,5', '1e3', '₪', '₪0.00'])('rejects a non-positive / non-numeric total (%p)', (total) => {
      expect(resolveReceiptEdits(original, 'Rami Levy', total)).toEqual({
        kind: 'invalid',
        title: 'Invalid total',
        message: 'Total must be a positive number.',
      });
    });

    it('checks the merchant before the total', () => {
      expect(resolveReceiptEdits(original, '', '0')).toEqual(
        expect.objectContaining({ title: 'Merchant required' })
      );
    });

    it('reports unchanged when nothing differs (formatting and whitespace ignored)', () => {
      expect(resolveReceiptEdits(original, 'Rami Levy', '100.00')).toEqual({ kind: 'unchanged' });
      expect(resolveReceiptEdits(original, ' Rami Levy ', '100')).toEqual({ kind: 'unchanged' });
    });

    it('sends only the trimmed merchant when only it changed', () => {
      expect(resolveReceiptEdits(original, '  Shufersal ', '100.00')).toEqual({
        kind: 'update',
        updates: { merchant: 'Shufersal' },
      });
    });

    it('sends only the total when only it changed', () => {
      expect(resolveReceiptEdits(original, 'Rami Levy', '99.9')).toEqual({
        kind: 'update',
        updates: { total: 99.9 },
      });
    });

    it('sends both when both changed', () => {
      expect(resolveReceiptEdits(original, 'Shufersal', '12')).toEqual({
        kind: 'update',
        updates: { merchant: 'Shufersal', total: 12 },
      });
    });
  });
});

describe('resolveReceiptEdits with formatted totals', () => {
  const original = { merchant: 'Rami Levy', total: 1234.5 };

  it('treats the pre-filled formatCurrency value as unchanged', () => {
    expect(resolveReceiptEdits(original, 'Rami Levy', '₪1,234.50')).toEqual({ kind: 'unchanged' });
  });

  it('accepts ₪ and thousands separators in an edited total', () => {
    expect(resolveReceiptEdits(original, 'Rami Levy', '₪2,000')).toEqual({
      kind: 'update',
      updates: { total: 2000 },
    });
  });

  it('still accepts plain typed numbers', () => {
    expect(resolveReceiptEdits(original, 'Rami Levy', '1300.25')).toEqual({
      kind: 'update',
      updates: { total: 1300.25 },
    });
  });
});

describe('resolveReceiptEdits with category changes', () => {
  const original = {
    merchant: 'Rami Levy',
    total: 22,
    items: [
      { name: 'Milk', amount: 10, category: 'Groceries' },
      { name: 'Coffee', amount: 12, category: 'Groceries' },
    ],
  };

  it('is unchanged when categories match the originals', () => {
    expect(resolveReceiptEdits(original, 'Rami Levy', '22', ['Groceries', 'Groceries'])).toEqual({
      kind: 'unchanged',
    });
  });

  it('sends only the changed item categories', () => {
    expect(resolveReceiptEdits(original, 'Rami Levy', '22', ['Groceries', 'Dining'])).toEqual({
      kind: 'update',
      updates: { items: [{ index: 1, category: 'Dining' }] },
    });
  });

  it('combines category changes with merchant and total edits', () => {
    expect(resolveReceiptEdits(original, 'Aroma', '30', ['Dining', 'Dining'])).toEqual({
      kind: 'update',
      updates: {
        merchant: 'Aroma',
        total: 30,
        items: [
          { index: 0, category: 'Dining' },
          { index: 1, category: 'Dining' },
        ],
      },
    });
  });

  it('still validates merchant/total before considering categories', () => {
    expect(resolveReceiptEdits(original, '', '22', ['Dining', 'Dining']).kind).toBe('invalid');
  });

  it('treats a result without items as having no category changes', () => {
    expect(resolveReceiptEdits({ merchant: 'M', total: 1 }, 'M', '1', ['Dining'])).toEqual({ kind: 'unchanged' });
  });
});

describe('lib/scan Category row helpers', () => {
  const item = (category: string) => ({ name: 'x', amount: 1, category });

  describe('commonCategory', () => {
    it('is the shared category when every line has it', () => {
      expect(commonCategory([item('Dining')])).toBe('Dining');
      expect(commonCategory([item('Dining'), item('Dining'), item('Dining')])).toBe('Dining');
    });

    it('is null when lines differ (even only the last one)', () => {
      expect(commonCategory([item('Dining'), item('Dining'), item('Health')])).toBeNull();
      expect(commonCategory([item('Health'), item('Dining')])).toBeNull();
    });

    it('is null without lines', () => {
      expect(commonCategory([])).toBeNull();
    });
  });

  describe('categoryRowLabel', () => {
    it('shared -> the category, mixed -> "Mixed", none -> "Uncategorized"', () => {
      expect(MIXED_CATEGORIES).toBe('Mixed');
      expect(categoryRowLabel([item('Groceries'), item('Groceries')])).toBe('Groceries');
      expect(categoryRowLabel([item('Groceries'), item('Other')])).toBe(MIXED_CATEGORIES);
      expect(categoryRowLabel([])).toBe(UNCATEGORIZED);
    });
  });

  describe('categoryRowIcon', () => {
    it("shared -> that category's icon", () => {
      expect(categoryRowIcon([item('Transport'), item('Transport')])).toBe(CATEGORY_META.Transport.icon);
    });

    it('mixed -> the mixed icon', () => {
      expect(MIXED_CATEGORIES_ICON).toBe('shape-outline');
      expect(categoryRowIcon([item('Transport'), item('Dining')])).toBe(MIXED_CATEGORIES_ICON);
    });

    it("none, or an unknown shared category -> the Other icon", () => {
      expect(categoryRowIcon([])).toBe(CATEGORY_META.Other.icon);
      expect(categoryRowIcon([item('Pets')])).toBe(CATEGORY_META.Other.icon);
    });
  });

  describe('duplicateFrom', () => {
    const DUP = { id: 'd1', merchant: 'SHUFERSAL DEAL', date: '2026-09-28', total: 72.6 };

    it('returns the duplicate summary when present', () => {
      expect(duplicateFrom({ duplicate_of: DUP })).toEqual(DUP);
    });

    it.each([
      ['absent (older backend)', {}],
      ['null', { duplicate_of: null }],
      ['not an object', { duplicate_of: 'd1' }],
      ['missing id', { duplicate_of: { merchant: 'X', date: '2026-09-28', total: 1 } }],
      ['empty id', { duplicate_of: { ...DUP, id: '' } }],
    ])('returns null when %s', (_label, response) => {
      expect(duplicateFrom(response)).toBeNull();
    });

    it('tolerates missing or mistyped fields other than id', () => {
      expect(duplicateFrom({ duplicate_of: { id: 'd1', total: 'x' } })).toEqual({
        id: 'd1',
        merchant: '',
        date: '',
        total: NaN,
      });
    });
  });

  describe('duplicateWarningText', () => {
    it('formats merchant · DD/MM/YYYY · ₪total', () => {
      expect(duplicateWarningText({ id: 'd1', merchant: 'SHUFERSAL DEAL', date: '2026-09-28', total: 72.6 })).toBe(
        'Looks like a duplicate of SHUFERSAL DEAL · 28/09/2026 · ₪72.60'
      );
    });

    it('works with a Hebrew merchant and thousands separators', () => {
      expect(duplicateWarningText({ id: 'd1', merchant: 'רמי לוי', date: '2026-01-05', total: 1234.5 })).toBe(
        'Looks like a duplicate of רמי לוי · 05/01/2026 · ₪1,234.50'
      );
    });

    it('shows a non-ISO date as given', () => {
      expect(duplicateWarningText({ id: 'd1', merchant: 'A', date: '28/09/2026', total: 1 })).toBe(
        'Looks like a duplicate of A · 28/09/2026 · ₪1.00'
      );
    });

    it('leaves out missing parts', () => {
      expect(duplicateWarningText({ id: 'd1', merchant: 'A', date: '', total: NaN })).toBe('Looks like a duplicate of A');
      expect(duplicateWarningText({ id: 'd1', merchant: ' ', date: '', total: NaN })).toBe(
        'Looks like a duplicate of a receipt you already have'
      );
    });
  });
});
