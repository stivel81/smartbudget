import { Router, Response } from 'express';
import { supabase } from '@smartbudget/shared/lib/supabase';
import { requireAuth, AuthedRequest } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import { logAdminAction } from '../services/auditLog';

const router = Router();

// GET /api/v1/admin/users — read-only user list for the admin dashboard.
router.get('/users', requireAuth, requireAdmin, async (_req: AuthedRequest, res: Response) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, name, created_at, is_admin')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch users:', error);
    return res.status(500).json({ error: 'Failed to fetch users', status: 500 });
  }

  return res.status(200).json({ users: data });
});

// GET /api/v1/admin/users/:id — profile + auth status + spend/budget summary.
router.get('/users/:id', requireAuth, requireAdmin, async (req: AuthedRequest, res: Response) => {
  const targetId = String(req.params.id);

  const [{ data: profile, error: profileError }, { data: authUser, error: authError }] = await Promise.all([
    supabase.from('profiles').select('id, email, name, created_at, is_admin').eq('id', targetId).single(),
    supabase.auth.admin.getUserById(targetId),
  ]);

  if (profileError || !profile || authError || !authUser?.user) {
    return res.status(404).json({ error: 'User not found', status: 404 });
  }

  const [{ data: receipts, error: receiptsError }, { data: budgets, error: budgetsError }] = await Promise.all([
    supabase.from('receipts').select('raw_response').eq('user_id', targetId),
    supabase.from('budgets').select('*').eq('user_id', targetId).order('category'),
  ]);

  if (receiptsError || budgetsError) {
    console.error('Failed to fetch user detail:', receiptsError || budgetsError);
    return res.status(500).json({ error: 'Failed to fetch user detail', status: 500 });
  }

  const totalSpent = (receipts ?? []).reduce((sum, r: any) => sum + (r.raw_response?.total ?? 0), 0);

  return res.status(200).json({
    user: {
      ...profile,
      email_confirmed_at: authUser.user.email_confirmed_at ?? null,
      banned_until: authUser.user.banned_until ?? null,
    },
    stats: {
      receiptCount: receipts?.length ?? 0,
      totalSpent,
      budgetCount: budgets?.length ?? 0,
    },
    budgets: budgets ?? [],
  });
});

// GET /api/v1/admin/users/:id/receipts — a user's receipts, for support/debugging.
router.get('/users/:id/receipts', requireAuth, requireAdmin, async (req: AuthedRequest, res: Response) => {
  const targetId = String(req.params.id);

  const { data, error } = await supabase
    .from('receipts')
    .select('*')
    .eq('user_id', targetId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch user receipts:', error);
    return res.status(500).json({ error: 'Failed to fetch user receipts', status: 500 });
  }

  return res.status(200).json({ receipts: data });
});

// POST /api/v1/admin/users/:id/admin — grant admin access.
router.post('/users/:id/admin', requireAuth, requireAdmin, async (req: AuthedRequest, res: Response) => {
  const targetId = String(req.params.id);

  const { data: target, error: fetchError } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('id', targetId)
    .single();

  if (fetchError || !target) {
    return res.status(404).json({ error: 'User not found', status: 404 });
  }

  const { error } = await supabase.from('profiles').update({ is_admin: true }).eq('id', targetId);

  if (error) {
    console.error('Failed to grant admin:', error);
    return res.status(500).json({ error: 'Failed to grant admin access', status: 500 });
  }

  await logAdminAction(req.userId as string, 'grant_admin', targetId, { email: target.email });

  return res.status(200).json({ message: 'Admin access granted' });
});

// DELETE /api/v1/admin/users/:id/admin — revoke admin access.
router.delete('/users/:id/admin', requireAuth, requireAdmin, async (req: AuthedRequest, res: Response) => {
  const targetId = String(req.params.id);

  if (targetId === req.userId) {
    return res.status(400).json({ error: 'You cannot revoke your own admin access', status: 400 });
  }

  const { data: target, error: fetchError } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('id', targetId)
    .single();

  if (fetchError || !target) {
    return res.status(404).json({ error: 'User not found', status: 404 });
  }

  const { error } = await supabase.from('profiles').update({ is_admin: false }).eq('id', targetId);

  if (error) {
    console.error('Failed to revoke admin:', error);
    return res.status(500).json({ error: 'Failed to revoke admin access', status: 500 });
  }

  await logAdminAction(req.userId as string, 'revoke_admin', targetId, { email: target.email });

  return res.status(200).json({ message: 'Admin access revoked' });
});

export default router;
