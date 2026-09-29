// Receipt categories and their display metadata. Kept out of lib/api so
// screens can use them even where tests mock the API module.
import { CATEGORY_META } from './theme';

// Must stay in sync with RECEIPT_CATEGORIES in apps/backend/src/services/claude.ts
// (the backend rejects any other value when a category is changed).
export const RECEIPT_CATEGORIES = [
  'Groceries',
  'Dining',
  'Transport',
  'Entertainment',
  'Health',
  'Other',
] as const;

export type CategoryMeta = (typeof CATEGORY_META)[string];

/** Icon/colors for a category; unknown categories use the "Other" look. */
export function categoryMeta(category: string): CategoryMeta {
  return CATEGORY_META[category] ?? CATEGORY_META.Other;
}
