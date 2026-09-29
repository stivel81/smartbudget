// Receipt categories and their display metadata. Kept out of lib/api so
// screens can use them even where tests mock the API module (lib/api only
// contributes types here).
//
// Two kinds of category exist:
//   - base: the 6 built-in ones below (fixed ids, today's CATEGORY_META look);
//   - custom: created by the user (GET /api/v1/categories), with their own
//     icon/color, falling back to CUSTOM_CATEGORY_DEFAULT_ICON / _COLOR.
// Receipts store a category NAME per line item. Screens resolve a name with
// the helpers below (through lib/categoriesContext's useCategories); an
// unknown name (e.g. a custom category deleted meanwhile) renders like Other.
import type { Category } from './api';
import { CATEGORY_META, CUSTOM_CATEGORY_COLORS, CUSTOM_CATEGORY_DEFAULT_COLOR } from './theme';

// Must stay in sync with the base categories in the backend (seeded rows with
// the ids below).
export const RECEIPT_CATEGORIES = [
  'Groceries',
  'Dining',
  'Transport',
  'Entertainment',
  'Health',
  'Other',
] as const;

export type BaseCategoryName = (typeof RECEIPT_CATEGORIES)[number];

/** The fallback bucket for unknown names. */
export const OTHER_CATEGORY: BaseCategoryName = 'Other';

/** Fixed ids of the base categories (same on every backend). */
export const BASE_CATEGORY_IDS: Record<BaseCategoryName, string> = {
  Groceries: '00000000-0000-4000-8000-000000000001',
  Dining: '00000000-0000-4000-8000-000000000002',
  Transport: '00000000-0000-4000-8000-000000000003',
  Entertainment: '00000000-0000-4000-8000-000000000004',
  Health: '00000000-0000-4000-8000-000000000005',
  Other: '00000000-0000-4000-8000-000000000006',
};

export type CategoryMeta = (typeof CATEGORY_META)[string];

/** Icon/colors for a BASE category; unknown categories use the "Other" look. */
export function categoryMeta(category: string): CategoryMeta {
  return CATEGORY_META[category] ?? CATEGORY_META.Other;
}

// Choices on the Manage categories screen (MaterialCommunityIcons names).
export const CUSTOM_CATEGORY_ICONS: readonly string[] = [
  'tag-outline',
  'home-outline',
  'paw',
  'gift-outline',
  'school-outline',
  'airplane',
  'dumbbell',
  'tshirt-crew-outline',
  'baby-carriage',
  'car-wrench',
  'lightning-bolt-outline',
  'briefcase-outline',
];

export const CUSTOM_CATEGORY_DEFAULT_ICON = CUSTOM_CATEGORY_ICONS[0];

export { CUSTOM_CATEGORY_COLORS, CUSTOM_CATEGORY_DEFAULT_COLOR };

/** Server limits for a category name (after trimming). */
export const CATEGORY_NAME_MAX_LENGTH = 30;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Light background for an icon tile in `color`: the color at ~12% alpha
 * (8-digit #RRGGBBAA, which React Native supports). Invalid colors get the
 * neutral default's tint.
 */
export function categoryTint(color: string): string {
  const base = HEX_COLOR.test(color) ? color : CUSTOM_CATEGORY_DEFAULT_COLOR;
  return `${base}1F`;
}

/** A category ready for display: identity plus resolved icon/colors. */
export interface CategoryInfo extends CategoryMeta {
  id: string;
  name: string;
  isBase: boolean;
}

/** The base categories, in display order, with today's look. */
export const BASE_CATEGORY_LIST: readonly CategoryInfo[] = RECEIPT_CATEGORIES.map((name) => ({
  id: BASE_CATEGORY_IDS[name],
  name,
  isBase: true,
  ...CATEGORY_META[name],
}));

function isBaseName(name: string): name is BaseCategoryName {
  return (RECEIPT_CATEGORIES as readonly string[]).includes(name);
}

/** A GET /categories row as display info (base rows keep CATEGORY_META; custom rows fall back to defaults). */
export function toCategoryInfo(row: Category): CategoryInfo {
  if (row.is_base && isBaseName(row.name)) {
    return { id: row.id, name: row.name, isBase: true, ...CATEGORY_META[row.name] };
  }
  const color = row.color && HEX_COLOR.test(row.color) ? row.color : CUSTOM_CATEGORY_DEFAULT_COLOR;
  const icon = row.icon && row.icon.trim() ? row.icon : CUSTOM_CATEGORY_DEFAULT_ICON;
  return {
    id: row.id,
    name: row.name,
    isBase: row.is_base,
    icon,
    color,
    backgroundColor: categoryTint(color),
  };
}

/**
 * Base + custom, in display order: always all 6 base categories first (even if
 * the server omitted some), then the user's custom rows in server order.
 */
export function buildCategoryList(rows: readonly Category[]): CategoryInfo[] {
  const custom = rows.filter((row) => !(row.is_base && isBaseName(row.name))).map(toCategoryInfo);
  return [...BASE_CATEGORY_LIST, ...custom];
}

const lower = (name: string) => name.trim().toLocaleLowerCase();

/** The category named `name`: exact match first, else case-insensitive. */
export function findCategory(list: readonly CategoryInfo[], name: string): CategoryInfo | undefined {
  return list.find((c) => c.name === name) ?? list.find((c) => lower(c.name) === lower(name));
}

/** Display metadata for `name` in `list`; unknown names look like Other. */
export function resolveCategoryMeta(list: readonly CategoryInfo[], name: string): CategoryMeta {
  const found = findCategory(list, name);
  if (!found) return CATEGORY_META.Other;
  return { icon: found.icon, color: found.color, backgroundColor: found.backgroundColor };
}

/**
 * The name spending is grouped under. A known name (any casing) maps to the
 * category's own name. An unknown one maps to Other when `list` is the
 * user's complete list (`complete`), and is kept as is otherwise (e.g. while
 * the list is loading or failed to load, so custom names aren't lumped into
 * Other just because they aren't known yet).
 */
export function canonicalCategoryName(list: readonly CategoryInfo[], name: string, complete: boolean): string {
  const found = findCategory(list, name);
  if (found) return found.name;
  return complete ? OTHER_CATEGORY : name;
}

/** True when `name` clashes (case-insensitively, after trim) with a category in `list` other than `exceptId`. */
export function isCategoryNameTaken(list: readonly CategoryInfo[], name: string, exceptId?: string): boolean {
  const wanted = lower(name);
  return list.some((c) => c.id !== exceptId && lower(c.name) === wanted);
}

export const CATEGORY_NAME_TAKEN_MESSAGE = 'A category with that name already exists';
export const CATEGORY_NAME_REQUIRED_MESSAGE = 'Enter a name for the category';
export const CATEGORY_NAME_TOO_LONG_MESSAGE = `Use at most ${CATEGORY_NAME_MAX_LENGTH} characters`;
export const CATEGORY_BASE_LOCKED_MESSAGE = "Built-in categories can't be changed";
export const CATEGORY_NOT_FOUND_MESSAGE = 'This category no longer exists';

/** Client-side check of a category name (mirrors the server); null when OK. */
export function validateCategoryName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return CATEGORY_NAME_REQUIRED_MESSAGE;
  if (trimmed.length > CATEGORY_NAME_MAX_LENGTH) return CATEGORY_NAME_TOO_LONG_MESSAGE;
  return null;
}

/**
 * UI text for a failed category call (ApiError.code = HTTP status): 409 ->
 * name clash, 400 -> the server's validation message, 403 -> built-in, 404 ->
 * gone. Anything without a status (offline) -> `networkFallback`.
 */
export function categoryErrorMessage(err: unknown, networkFallback: string): string {
  const code = err && typeof err === 'object' ? (err as { code?: unknown }).code : undefined;
  const message = err && typeof err === 'object' ? (err as { message?: unknown }).message : undefined;
  switch (code) {
    case 409:
      return CATEGORY_NAME_TAKEN_MESSAGE;
    case 403:
      return CATEGORY_BASE_LOCKED_MESSAGE;
    case 404:
      return CATEGORY_NOT_FOUND_MESSAGE;
    default:
      if (typeof code === 'number' && typeof message === 'string' && message) return message;
      return networkFallback;
  }
}
