import { Router, Response } from 'express';
import { supabase } from '@smartbudget/shared/lib/supabase';
import { requireAuth, AuthedRequest } from '../middleware/requireAuth';
import {
  BASE_CATEGORY_ROWS,
  CategoryRow,
  fetchOwnCustomCategories,
  findCategoryForUser,
  isUuid,
} from '../services/categories';

const router = Router();

interface UpsertBudgetRequest {
  category?: unknown;
  category_id?: unknown;
  monthlyLimit?: unknown;
}

type ResolvedCategory = { id: string; name: string };

/**
 * Resolves the budget's category from a name (case-insensitive, via the
 * shared findCategoryForUser) and/or an id: base categories without a DB
 * call, otherwise the caller's own custom categories. Another user's
 * category is never found. When both are given they must name the same
 * category.
 */
async function resolveBudgetCategory(
  userId: string,
  name: string | undefined,
  id: string | undefined
): Promise<{ category: ResolvedCategory } | { error: string; status: number }> {
  const findById = (categories: readonly CategoryRow[], wanted: string) =>
    categories.find((c) => (c.user_id === null || c.user_id === userId) && c.id.toLowerCase() === wanted.toLowerCase()) ?? null;

  let categories: readonly CategoryRow[] = BASE_CATEGORY_ROWS;
  const needsCustom =
    (name !== undefined && !findCategoryForUser(name, userId, categories)) || (id !== undefined && !findById(categories, id));
  if (needsCustom) {
    const { data, error } = await fetchOwnCustomCategories(userId);
    if (error || !data) {
      console.error('Failed to load categories for budget:', error);
      return { error: 'Failed to save budget', status: 500 };
    }
    categories = [...BASE_CATEGORY_ROWS, ...data];
  }

  const fromName = name !== undefined ? findCategoryForUser(name, userId, categories) : null;
  const fromId = id !== undefined ? findById(categories, id) : null;

  if ((name !== undefined && !fromName) || (id !== undefined && !fromId)) {
    return { error: 'Unknown category', status: 400 };
  }
  if (fromName && fromId && fromName.id !== fromId.id) {
    return { error: 'category and category_id refer to different categories', status: 400 };
  }
  const chosen = (fromId ?? fromName)!;
  return { category: { id: chosen.id, name: chosen.name } };
}

// GET /api/v1/budgets
router.get('/', requireAuth, async (req: AuthedRequest, res: Response) => {
  const { data, error } = await supabase
    .from('budgets')
    .select('*')
    .eq('user_id', req.userId)
    .order('category', { ascending: true });

  if (error) {
    console.error('Failed to fetch budgets:', error);
    return res.status(500).json({ error: 'Failed to fetch budgets', status: 500 });
  }

  return res.status(200).json({ budgets: data });
});

// POST /api/v1/budgets — create or update the limit for a category.
// Body: { category (name) and/or category_id, monthlyLimit }. Both columns
// are always written (the DB also derives `category` from category_id).
router.post('/', requireAuth, async (req: AuthedRequest, res: Response) => {
  const { category, category_id: categoryId, monthlyLimit } = (req.body ?? {}) as UpsertBudgetRequest;

  if (category === undefined && categoryId === undefined) {
    return res.status(400).json({ error: 'Provide category (name) or category_id', status: 400 });
  }
  if (category !== undefined && (typeof category !== 'string' || !category.trim())) {
    return res.status(400).json({ error: 'category must be a non-empty string', status: 400 });
  }
  if (categoryId !== undefined && !isUuid(categoryId)) {
    return res.status(400).json({ error: 'category_id must be a UUID', status: 400 });
  }
  if (typeof monthlyLimit !== 'number' || !(monthlyLimit > 0) || !Number.isFinite(monthlyLimit)) {
    return res.status(400).json({ error: 'monthlyLimit must be a positive number', status: 400 });
  }

  const resolved = await resolveBudgetCategory(
    req.userId!,
    category as string | undefined,
    categoryId as string | undefined
  );
  if ('error' in resolved) return res.status(resolved.status).json({ error: resolved.error, status: resolved.status });

  const { data, error } = await supabase
    .from('budgets')
    .upsert(
      {
        user_id: req.userId,
        category: resolved.category.name,
        category_id: resolved.category.id,
        monthly_limit: monthlyLimit,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,category_id' }
    )
    .select()
    .single();

  if (error) {
    console.error('Failed to save budget:', error);
    return res.status(500).json({ error: 'Failed to save budget', status: 500 });
  }

  return res.status(200).json({ budget: data });
});

// DELETE /api/v1/budgets/:id
router.delete('/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  const { error, count } = await supabase
    .from('budgets')
    .delete({ count: 'exact' })
    .eq('id', req.params.id)
    .eq('user_id', req.userId);

  if (error) {
    console.error('Failed to delete budget:', error);
    return res.status(500).json({ error: 'Failed to delete budget', status: 500 });
  }

  if (!count) {
    return res.status(404).json({ error: 'Budget not found', status: 404 });
  }

  return res.status(204).send();
});

export default router;
