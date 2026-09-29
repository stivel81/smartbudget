// Spending categories: 6 shared BASE categories (user_id NULL, fixed ids
// seeded by migration 20260929100000_create_categories.sql) plus per-user
// CUSTOM categories.
//
// Uses the backend's service-role client like the rest of the routes, so
// ownership is always enforced with an explicit user_id filter.

import { supabase } from '@smartbudget/shared/lib/supabase';

/** Fixed ids of the base categories — must match the seed migration. */
export const BASE_CATEGORY_IDS = {
  Groceries: '00000000-0000-4000-8000-000000000001',
  Dining: '00000000-0000-4000-8000-000000000002',
  Transport: '00000000-0000-4000-8000-000000000003',
  Entertainment: '00000000-0000-4000-8000-000000000004',
  Health: '00000000-0000-4000-8000-000000000005',
  Other: '00000000-0000-4000-8000-000000000006',
} as const;

export type BaseCategoryName = keyof typeof BASE_CATEGORY_IDS;

export const OTHER_CATEGORY_ID = BASE_CATEGORY_IDS.Other;

export const CATEGORY_NAME_MAX_LENGTH = 30;

export interface CategoryRow {
  id: string;
  user_id: string | null;
  name: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Strips leading/trailing ASCII spaces only — the same thing Postgres
 * btrim(x) does, so the API, the sync service and the SQL backfill all
 * compare names identically.
 */
export function trimSpaces(value: string): string {
  return value.replace(/^ +| +$/g, '');
}

/** Comparison key for category names: space-trimmed, lower-cased. */
export function categoryKey(name: string): string {
  return trimSpaces(name).toLowerCase();
}

/** Base category by name (case-insensitive), or null. Pure — no DB call. */
export function findBaseCategory(name: string): { id: string; name: BaseCategoryName } | null {
  const key = categoryKey(name);
  for (const baseName of Object.keys(BASE_CATEGORY_IDS) as BaseCategoryName[]) {
    if (baseName.toLowerCase() === key) return { id: BASE_CATEGORY_IDS[baseName], name: baseName };
  }
  return null;
}

/** Base category by id, or null. Pure — no DB call. */
export function findBaseCategoryById(id: string): { id: string; name: BaseCategoryName } | null {
  for (const baseName of Object.keys(BASE_CATEGORY_IDS) as BaseCategoryName[]) {
    if (BASE_CATEGORY_IDS[baseName] === id.toLowerCase()) return { id: BASE_CATEGORY_IDS[baseName], name: baseName };
  }
  return null;
}

/**
 * Validates a custom category name: string, trimmed, 1-30 characters. The
 * DB's CHECK uses Postgres char_length (code points), so length is counted
 * in code points here too.
 */
export function validateCategoryName(input: unknown): { name: string } | { error: string } {
  if (typeof input !== 'string') return { error: 'name must be a string' };
  const name = input.trim();
  const length = [...name].length;
  if (length < 1 || length > CATEGORY_NAME_MAX_LENGTH) {
    return { error: `name must be 1-${CATEGORY_NAME_MAX_LENGTH} characters` };
  }
  return { name };
}

/** Base categories plus the user's own custom ones (id, user_id, name). */
export async function fetchUserCategories(userId: string): Promise<{ data: CategoryRow[] | null; error: unknown }> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, user_id, name')
    .or(`user_id.is.null,user_id.eq.${userId}`);
  return { data: (data as CategoryRow[] | null) ?? null, error };
}

/**
 * Maps an item category name to a category id for `userId`: a base
 * category first, then the user's own custom category (both trimmed and
 * case-insensitive), otherwise base "Other". Categories belonging to any
 * other user are ignored even if present in `categories`.
 */
export function resolveCategoryId(name: unknown, userId: string, categories: readonly CategoryRow[]): string {
  if (typeof name !== 'string') return OTHER_CATEGORY_ID;
  const key = categoryKey(name);
  if (!key) return OTHER_CATEGORY_ID;
  const base = categories.find((c) => c.user_id === null && c.name.toLowerCase() === key);
  if (base) return base.id;
  const custom = categories.find((c) => c.user_id === userId && c.name.toLowerCase() === key);
  if (custom) return custom.id;
  return OTHER_CATEGORY_ID;
}
