import { Router, Response } from 'express';
import { supabase } from '@smartbudget/shared/lib/supabase';
import { requireAuth, AuthedRequest } from '../middleware/requireAuth';
import { RECEIPT_CATEGORIES } from '../services/claude';

const router = Router();

interface UpsertBudgetRequest {
  category?: string;
  monthlyLimit?: number;
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

// POST /api/v1/budgets — create or update the limit for a category
router.post('/', requireAuth, async (req: AuthedRequest, res: Response) => {
  const { category, monthlyLimit } = req.body as UpsertBudgetRequest;

  if (!category || !(RECEIPT_CATEGORIES as readonly string[]).includes(category)) {
    return res.status(400).json({
      error: `Missing or invalid category. Must be one of: ${RECEIPT_CATEGORIES.join(', ')}`,
      status: 400,
    });
  }

  if (typeof monthlyLimit !== 'number' || !(monthlyLimit > 0)) {
    return res.status(400).json({ error: 'monthlyLimit must be a positive number', status: 400 });
  }

  const { data, error } = await supabase
    .from('budgets')
    .upsert(
      { user_id: req.userId, category, monthly_limit: monthlyLimit, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,category' }
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
