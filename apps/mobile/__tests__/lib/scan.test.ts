import {
  MAX_IMAGE_DIMENSION,
  UNCATEGORIZED,
  categoryIconFor,
  resizeTargetFor,
  resolveReceiptEdits,
  summarizeCategories,
  toScanResult,
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
        date: '2026-09-01',
        total: 32.5,
      });
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
