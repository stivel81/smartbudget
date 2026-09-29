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

import {
  BASE_CATEGORY_IDS,
  BASE_CATEGORY_LIST,
  CATEGORY_BASE_LOCKED_MESSAGE,
  CATEGORY_NAME_REQUIRED_MESSAGE,
  CATEGORY_NAME_TAKEN_MESSAGE,
  CATEGORY_NAME_TOO_LONG_MESSAGE,
  CATEGORY_NOT_FOUND_MESSAGE,
  CUSTOM_CATEGORY_COLORS,
  CUSTOM_CATEGORY_DEFAULT_COLOR,
  CUSTOM_CATEGORY_DEFAULT_ICON,
  CUSTOM_CATEGORY_ICONS,
  buildCategoryList,
  canonicalCategoryName,
  categoryErrorMessage,
  categoryTint,
  findCategory,
  isCategoryNameTaken,
  resolveCategoryMeta,
  toCategoryInfo,
  validateCategoryName,
} from '../../lib/categories';
import type { Category } from '../../lib/api';

function row(partial: Partial<Category> & { id: string; name: string }): Category {
  return {
    user_id: 'u1',
    icon: null,
    color: null,
    is_base: false,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...partial,
  };
}

const baseRows: Category[] = RECEIPT_CATEGORIES.map((name) =>
  row({ id: BASE_CATEGORY_IDS[name], name, is_base: true, user_id: null, icon: 'server-icon', color: '#123456' })
);
const pets = row({ id: 'c-pets', name: 'Pets', icon: 'paw', color: '#DB2777' });
const gifts = row({ id: 'c-gifts', name: 'Gifts' });

describe('lib/categories: base + custom', () => {
  it('uses the fixed base ids', () => {
    expect(BASE_CATEGORY_IDS.Groceries).toBe('00000000-0000-4000-8000-000000000001');
    expect(BASE_CATEGORY_IDS.Other).toBe('00000000-0000-4000-8000-000000000006');
    expect(BASE_CATEGORY_LIST.map((c) => c.id)).toEqual(RECEIPT_CATEGORIES.map((n) => BASE_CATEGORY_IDS[n]));
  });

  it('base rows keep the CATEGORY_META look (server icon/color ignored)', () => {
    const info = toCategoryInfo(baseRows[0]);
    expect(info).toEqual({ id: BASE_CATEGORY_IDS.Groceries, name: 'Groceries', isBase: true, ...CATEGORY_META.Groceries });
  });

  it('custom rows use their own icon and color, tinted background', () => {
    expect(toCategoryInfo(pets)).toEqual({
      id: 'c-pets',
      name: 'Pets',
      isBase: false,
      icon: 'paw',
      color: '#DB2777',
      backgroundColor: '#DB27771F',
    });
  });

  it('custom rows without icon/color (or an invalid color) fall back to the defaults', () => {
    expect(toCategoryInfo(gifts)).toMatchObject({
      icon: CUSTOM_CATEGORY_DEFAULT_ICON,
      color: CUSTOM_CATEGORY_DEFAULT_COLOR,
    });
    expect(toCategoryInfo(row({ id: 'x', name: 'X', color: 'red', icon: '  ' }))).toMatchObject({
      icon: 'tag-outline',
      color: CUSTOM_CATEGORY_DEFAULT_COLOR,
    });
  });

  it('categoryTint appends ~12% alpha, invalid colors use the neutral', () => {
    expect(categoryTint('#4F46E5')).toBe('#4F46E51F');
    expect(categoryTint('nope')).toBe(`${CUSTOM_CATEGORY_DEFAULT_COLOR}1F`);
  });

  it('buildCategoryList: all base first (even if missing from the server), then custom in server order', () => {
    const list = buildCategoryList([pets, baseRows[1], gifts]);
    expect(list.map((c) => c.name)).toEqual([...RECEIPT_CATEGORIES, 'Pets', 'Gifts']);
    expect(list.filter((c) => c.isBase)).toHaveLength(6);
  });

  it('findCategory matches exactly first, then case-insensitively', () => {
    const list = buildCategoryList([...baseRows, pets]);
    expect(findCategory(list, 'Pets')?.id).toBe('c-pets');
    expect(findCategory(list, ' pets ')?.id).toBe('c-pets');
    expect(findCategory(list, 'dining')?.name).toBe('Dining');
    expect(findCategory(list, 'Travel')).toBeUndefined();
  });

  it('resolveCategoryMeta: base look, custom look, unknown -> Other', () => {
    const list = buildCategoryList([...baseRows, pets]);
    expect(resolveCategoryMeta(list, 'Dining')).toEqual(CATEGORY_META.Dining);
    expect(resolveCategoryMeta(list, 'Pets')).toEqual({ icon: 'paw', color: '#DB2777', backgroundColor: '#DB27771F' });
    expect(resolveCategoryMeta(list, 'Deleted')).toBe(CATEGORY_META.Other);
  });

  it('canonicalCategoryName folds unknown names into Other only when the list is complete', () => {
    const list = buildCategoryList([...baseRows, pets]);
    expect(canonicalCategoryName(list, 'pets', true)).toBe('Pets');
    expect(canonicalCategoryName(list, 'Deleted', true)).toBe('Other');
    expect(canonicalCategoryName(list, 'Deleted', false)).toBe('Deleted');
    expect(canonicalCategoryName(BASE_CATEGORY_LIST, 'groceries', false)).toBe('Groceries');
  });

  it('isCategoryNameTaken is case-insensitive, trims, and can exclude the row being edited', () => {
    const list = buildCategoryList([...baseRows, pets]);
    expect(isCategoryNameTaken(list, ' OTHER ')).toBe(true);
    expect(isCategoryNameTaken(list, 'pets')).toBe(true);
    expect(isCategoryNameTaken(list, 'PETS', 'c-pets')).toBe(false);
    expect(isCategoryNameTaken(list, 'Travel')).toBe(false);
  });

  it('validateCategoryName mirrors the server (1-30 chars after trim)', () => {
    expect(validateCategoryName('   ')).toBe(CATEGORY_NAME_REQUIRED_MESSAGE);
    expect(validateCategoryName('x'.repeat(31))).toBe(CATEGORY_NAME_TOO_LONG_MESSAGE);
    expect(validateCategoryName(` ${'x'.repeat(30)} `)).toBeNull();
    expect(validateCategoryName('Pets')).toBeNull();
  });

  it('categoryErrorMessage maps HTTP codes to UI text', () => {
    expect(categoryErrorMessage({ message: 'A category named "Pets" already exists', code: 409 }, 'net')).toBe(
      CATEGORY_NAME_TAKEN_MESSAGE
    );
    expect(categoryErrorMessage({ message: 'color must be a hex color', code: 400 }, 'net')).toBe(
      'color must be a hex color'
    );
    expect(categoryErrorMessage({ message: 'x', code: 403 }, 'net')).toBe(CATEGORY_BASE_LOCKED_MESSAGE);
    expect(categoryErrorMessage({ message: 'x', code: 404 }, 'net')).toBe(CATEGORY_NOT_FOUND_MESSAGE);
    expect(categoryErrorMessage(new TypeError('Network request failed'), 'net')).toBe('net');
    expect(categoryErrorMessage({ code: 500 }, 'net')).toBe('net');
  });

  it('offers 8-12 icons and 8 colors, all distinct', () => {
    expect(CUSTOM_CATEGORY_ICONS.length).toBeGreaterThanOrEqual(8);
    expect(CUSTOM_CATEGORY_ICONS.length).toBeLessThanOrEqual(12);
    expect(new Set(CUSTOM_CATEGORY_ICONS).size).toBe(CUSTOM_CATEGORY_ICONS.length);
    expect(CUSTOM_CATEGORY_COLORS).toHaveLength(8);
    expect(new Set(CUSTOM_CATEGORY_COLORS).size).toBe(8);
    for (const color of CUSTOM_CATEGORY_COLORS) expect(color).toMatch(/^#[0-9A-F]{6}$/);
  });
});
