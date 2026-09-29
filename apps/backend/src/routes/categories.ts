import { Router, Response } from 'express';
import { supabase } from '@smartbudget/shared/lib/supabase';
import { requireAuth, AuthedRequest } from '../middleware/requireAuth';
import { categoryKey, findBaseCategory, isUuid, validateCategoryName } from '../services/categories';

// Categories: 6 shared base categories (read-only) + the user's own custom
// ones. Every write is limited to the caller's own custom rows via an
// explicit user_id filter (service-role client), mirroring the RLS policies.
//
// Name uniqueness is case-insensitive: per user, and a custom name may not
// equal a base name. Checked here first for a clean 409, and enforced again
// by the DB (unique indexes + trigger, SQLSTATE 23505 -> also 409).

const router = Router();

const CATEGORY_COLUMNS = 'id, user_id, name, icon, color, is_base, created_at, updated_at';
const WRITE_FIELDS = new Set(['name', 'icon', 'color']);
const ICON_MAX_LENGTH = 64;
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pgCode(error: unknown): string | undefined {
  return isPlainObject(error) && typeof error.code === 'string' ? error.code : undefined;
}

interface CategoryFields {
  name?: string;
  icon?: string | null;
  color?: string | null;
}

/** Validates name/icon/color; `requireName` for create. */
function parseCategoryBody(body: unknown, requireName: boolean): { fields: CategoryFields } | { error: string } {
  if (!isPlainObject(body)) return { error: 'Body must be a JSON object' };
  const unknown = Object.keys(body).filter((key) => !WRITE_FIELDS.has(key));
  if (unknown.length > 0) return { error: `Unknown field(s): ${unknown.join(', ')}` };

  const fields: CategoryFields = {};
  if (body.name !== undefined || requireName) {
    const result = validateCategoryName(body.name);
    if ('error' in result) return result;
    fields.name = result.name;
  }
  if (body.icon !== undefined) {
    if (body.icon === null) fields.icon = null;
    else if (typeof body.icon === 'string' && body.icon.trim().length >= 1 && body.icon.trim().length <= ICON_MAX_LENGTH) {
      fields.icon = body.icon.trim();
    } else return { error: `icon must be null or a string of 1-${ICON_MAX_LENGTH} characters` };
  }
  if (body.color !== undefined) {
    if (body.color === null) fields.color = null;
    else if (typeof body.color === 'string' && COLOR_RE.test(body.color)) fields.color = body.color;
    else return { error: 'color must be null or a hex color like #1A2B3C' };
  }
  if (Object.keys(fields).length === 0) return { error: 'Provide at least one of: name, icon, color' };
  return { fields };
}

/**
 * 409 message when `name` clashes (case-insensitive) with a base category or
 * another of the user's custom categories (excluding `exceptId`), else null.
 */
async function nameClash(userId: string, name: string, exceptId?: string): Promise<string | null | Error> {
  const base = findBaseCategory(name);
  if (base) return `"${base.name}" is a built-in category`;

  const { data, error } = await supabase.from('categories').select('id, name').eq('user_id', userId);
  if (error) return new Error(String((error as { message?: unknown }).message ?? error));
  const key = categoryKey(name);
  const clash = (data ?? []).find((c: { id: string; name: string }) => c.id !== exceptId && c.name.toLowerCase() === key);
  return clash ? `You already have a category named "${clash.name}"` : null;
}

/**
 * Loads a category the caller may modify. 404 when it doesn't exist or
 * belongs to someone else (never reveals other users' ids), 403 for base.
 */
async function loadOwnCustom(
  req: AuthedRequest,
  res: Response
): Promise<{ id: string; name: string } | null> {
  const id = req.params.id;
  if (!isUuid(id)) {
    res.status(404).json({ error: 'Category not found', status: 404 });
    return null;
  }
  const { data, error } = await supabase.from('categories').select('id, user_id, name').eq('id', id).maybeSingle();
  if (error) {
    console.error('Failed to fetch category:', error);
    res.status(500).json({ error: 'Failed to fetch category', status: 500 });
    return null;
  }
  if (!data || (data.user_id !== null && data.user_id !== req.userId)) {
    res.status(404).json({ error: 'Category not found', status: 404 });
    return null;
  }
  if (data.user_id === null) {
    res.status(403).json({ error: 'Built-in categories cannot be changed', status: 403 });
    return null;
  }
  return { id: data.id, name: data.name };
}

// GET /api/v1/categories — base categories first, then the user's own, by name.
router.get('/', requireAuth, async (req: AuthedRequest, res: Response) => {
  const { data, error } = await supabase
    .from('categories')
    .select(CATEGORY_COLUMNS)
    .or(`user_id.is.null,user_id.eq.${req.userId}`)
    .order('is_base', { ascending: false })
    .order('name', { ascending: true });

  if (error) {
    console.error('Failed to fetch categories:', error);
    return res.status(500).json({ error: 'Failed to fetch categories', status: 500 });
  }

  return res.status(200).json({ categories: data });
});

// POST /api/v1/categories — create a custom category. Body: { name, icon?, color? }
router.post('/', requireAuth, async (req: AuthedRequest, res: Response) => {
  const parsed = parseCategoryBody(req.body, true);
  if ('error' in parsed) return res.status(400).json({ error: parsed.error, status: 400 });
  const { name, icon, color } = parsed.fields;

  const clash = await nameClash(req.userId!, name!);
  if (clash instanceof Error) {
    console.error('Failed to check category names:', clash);
    return res.status(500).json({ error: 'Failed to create category', status: 500 });
  }
  if (clash) return res.status(409).json({ error: clash, status: 409 });

  const { data, error } = await supabase
    .from('categories')
    .insert({ user_id: req.userId, name, icon: icon ?? null, color: color ?? null })
    .select(CATEGORY_COLUMNS)
    .single();

  if (error) {
    if (pgCode(error) === '23505') {
      return res.status(409).json({ error: `A category named "${name}" already exists`, status: 409 });
    }
    console.error('Failed to create category:', error);
    return res.status(500).json({ error: 'Failed to create category', status: 500 });
  }

  return res.status(201).json({ category: data });
});

// PATCH /api/v1/categories/:id — rename / change icon or color of an OWN
// custom category. A rename also rewrites the name in the user's receipt
// items and budget (DB trigger, same statement).
router.patch('/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  const parsed = parseCategoryBody(req.body, false);
  if ('error' in parsed) return res.status(400).json({ error: parsed.error, status: 400 });
  const { fields } = parsed;

  const category = await loadOwnCustom(req, res);
  if (!category) return;

  if (fields.name !== undefined) {
    const clash = await nameClash(req.userId!, fields.name, category.id);
    if (clash instanceof Error) {
      console.error('Failed to check category names:', clash);
      return res.status(500).json({ error: 'Failed to update category', status: 500 });
    }
    if (clash) return res.status(409).json({ error: clash, status: 409 });
  }

  const { data, error } = await supabase
    .from('categories')
    .update(fields)
    .eq('id', category.id)
    .eq('user_id', req.userId)
    .select(CATEGORY_COLUMNS)
    .maybeSingle();

  if (error) {
    if (pgCode(error) === '23505') {
      return res.status(409).json({ error: `A category named "${fields.name}" already exists`, status: 409 });
    }
    console.error('Failed to update category:', error);
    return res.status(500).json({ error: 'Failed to update category', status: 500 });
  }
  if (!data) return res.status(404).json({ error: 'Category not found', status: 404 });

  return res.status(200).json({ category: data });
});

// DELETE /api/v1/categories/:id — delete an OWN custom category. In one DB
// transaction (delete_custom_category): the user's items in it move to base
// "Other" (transactions.category_id and the name inside raw_response items),
// and the user's budget for it is deleted.
router.delete('/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  const category = await loadOwnCustom(req, res);
  if (!category) return;

  const { data, error } = await supabase.rpc('delete_custom_category', {
    p_user_id: req.userId,
    p_category_id: category.id,
  });

  if (error) {
    console.error('Failed to delete category:', error);
    return res.status(500).json({ error: 'Failed to delete category', status: 500 });
  }
  if (data !== true) return res.status(404).json({ error: 'Category not found', status: 404 });

  return res.status(204).send();
});

export default router;
