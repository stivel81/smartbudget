import { Response, NextFunction } from 'express';
import { supabase } from '@smartbudget/shared/lib/supabase';
import { AuthedRequest } from './requireAuth';

// Mount after requireAuth — needs req.userId. No self-service way to become
// admin; grant via SQL: update public.profiles set is_admin = true where ...
export async function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const { data, error } = await supabase.from('profiles').select('is_admin').eq('id', req.userId).single();

  if (error || !data?.is_admin) {
    return res.status(403).json({ error: 'Admin access required', status: 403 });
  }

  next();
}
