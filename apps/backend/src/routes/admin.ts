import { Router, Response } from 'express';
import { supabase } from '@smartbudget/shared/lib/supabase';
import { requireAuth, AuthedRequest } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';

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

export default router;
