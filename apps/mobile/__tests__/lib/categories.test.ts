import { RECEIPT_CATEGORIES, categoryMeta } from '../../lib/categories';
import { RECEIPT_CATEGORIES as FROM_API } from '../../lib/api';
import { CATEGORY_META } from '../../lib/theme';

describe('lib/categories', () => {
  it('lists the backend categories in order', () => {
    expect(RECEIPT_CATEGORIES).toEqual(['Groceries', 'Dining', 'Transport', 'Entertainment', 'Health', 'Other']);
  });

  it('is the same list lib/api re-exports', () => {
    expect(FROM_API).toBe(RECEIPT_CATEGORIES);
  });

  it('has display metadata for every category', () => {
    for (const category of RECEIPT_CATEGORIES) {
      expect(categoryMeta(category)).toBe(CATEGORY_META[category]);
    }
  });

  it('falls back to the Other look for unknown categories', () => {
    expect(categoryMeta('Pets')).toBe(CATEGORY_META.Other);
    expect(categoryMeta('')).toBe(CATEGORY_META.Other);
  });
});
