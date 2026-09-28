import { Router, Response } from 'express';
import { supabase } from '@smartbudget/shared/lib/supabase';
import { requireAuth, AuthedRequest } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import { logAdminAction } from '../services/auditLog';

const router = Router();

const AUTH_USERS_PAGE_SIZE = 1000; // GoTrue admin API max per page

// Suspension lives on auth.users (banned_until), not public.profiles, so the
// list merges it in from the admin API. Pages through every auth user.
async function fetchBannedUntilById(): Promise<Map<string, string | null>> {
  const bannedUntilById = new Map<string, string | null>();
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: AUTH_USERS_PAGE_SIZE });
    if (error) throw error;
    for (const u of data.users) bannedUntilById.set(u.id, u.banned_until ?? null);
    if (data.users.length < AUTH_USERS_PAGE_SIZE) return bannedUntilById;
  }
}

// GET /api/v1/admin/users — read-only user list for the admin dashboard,
// including each account's suspension state (banned_until).
router.get('/users', requireAuth, requireAdmin, async (_req: AuthedRequest, res: Response) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, name, created_at, is_admin')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch users:', error);
    return res.status(500).json({ error: 'Failed to fetch users', status: 500 });
  }

  let bannedUntilById: Map<string, string | null>;
  try {
    bannedUntilById = await fetchBannedUntilById();
  } catch (authError) {
    console.error('Failed to fetch auth users:', authError);
    return res.status(500).json({ error: 'Failed to fetch users', status: 500 });
  }

  const users = (data ?? []).map((p) => ({ ...p, banned_until: bannedUntilById.get(p.id) ?? null }));

  return res.status(200).json({ users });
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

// Supabase's ban_duration has no explicit "forever" value — a very long
// duration is the documented way to express a permanent-ish suspension.
const PERMANENT_BAN_DURATION = '876000h'; // ~100 years

// POST /api/v1/admin/users/:id/suspend — bans the user at the auth layer
// (they can't get a session at all, not just blocked at our own routes).
router.post('/users/:id/suspend', requireAuth, requireAdmin, async (req: AuthedRequest, res: Response) => {
  const targetId = String(req.params.id);

  if (targetId === req.userId) {
    return res.status(400).json({ error: 'You cannot suspend your own account', status: 400 });
  }

  const { data: target, error: fetchError } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('id', targetId)
    .single();

  if (fetchError || !target) {
    return res.status(404).json({ error: 'User not found', status: 404 });
  }

  const { error } = await supabase.auth.admin.updateUserById(targetId, { ban_duration: PERMANENT_BAN_DURATION });

  if (error) {
    console.error('Failed to suspend user:', error);
    return res.status(500).json({ error: 'Failed to suspend user', status: 500 });
  }

  await logAdminAction(req.userId as string, 'suspend_user', targetId, { email: target.email });

  return res.status(200).json({ message: 'User suspended' });
});

// POST /api/v1/admin/users/:id/unsuspend
router.post('/users/:id/unsuspend', requireAuth, requireAdmin, async (req: AuthedRequest, res: Response) => {
  const targetId = String(req.params.id);

  const { data: target, error: fetchError } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('id', targetId)
    .single();

  if (fetchError || !target) {
    return res.status(404).json({ error: 'User not found', status: 404 });
  }

  const { error } = await supabase.auth.admin.updateUserById(targetId, { ban_duration: 'none' });

  if (error) {
    console.error('Failed to unsuspend user:', error);
    return res.status(500).json({ error: 'Failed to unsuspend user', status: 500 });
  }

  await logAdminAction(req.userId as string, 'unsuspend_user', targetId, { email: target.email });

  return res.status(200).json({ message: 'User unsuspended' });
});

// DELETE /api/v1/admin/users/:id — right-to-erasure: permanently deletes
// the user's receipts (+ stored images), budgets, profile, and auth
// account. Irreversible.
router.delete('/users/:id', requireAuth, requireAdmin, async (req: AuthedRequest, res: Response) => {
  const targetId = String(req.params.id);

  if (targetId === req.userId) {
    return res.status(400).json({ error: 'You cannot delete your own account', status: 400 });
  }

  const { data: target, error: fetchError } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('id', targetId)
    .single();

  if (fetchError || !target) {
    return res.status(404).json({ error: 'User not found', status: 404 });
  }

  const { data: receipts, error: receiptsError } = await supabase
    .from('receipts')
    .select('image_path')
    .eq('user_id', targetId);

  if (receiptsError) {
    console.error('Failed to fetch receipts before deletion:', receiptsError);
    return res.status(500).json({ error: 'Failed to delete user data', status: 500 });
  }

  const imagePaths = (receipts ?? [])
    .map((r: any) => r.image_path as string | null)
    .filter((p): p is string => Boolean(p));

  // Logged before the destructive steps run: target_user_id's ON DELETE
  // SET NULL means this record survives the user being deleted, and if a
  // later step fails partway, an audit trail showing the attempt was made
  // is safer for a right-to-erasure action than silently under-logging it.
  await logAdminAction(req.userId as string, 'delete_user_data', targetId, {
    email: target.email,
    receiptCount: receipts?.length ?? 0,
    imagesDeleted: imagePaths.length,
  });

  if (imagePaths.length > 0) {
    const { error: removeError } = await supabase.storage.from('receipts').remove(imagePaths);
    if (removeError) {
      console.error('Failed to delete receipt images:', removeError);
      return res.status(500).json({ error: 'Failed to delete user data', status: 500 });
    }
  }

  // Deleting the auth user cascades profiles, receipts, and budgets rows
  // (all FK'd with ON DELETE CASCADE) at the database level.
  const { error: deleteError } = await supabase.auth.admin.deleteUser(targetId);

  if (deleteError) {
    console.error('Failed to delete user:', deleteError);
    return res.status(500).json({ error: 'Failed to delete user data', status: 500 });
  }

  return res.status(200).json({ message: 'User data deleted' });
});

// GET /api/v1/admin/users/:id/export — GDPR data portability: a JSON dump
// of everything this user's account holds.
router.get('/users/:id/export', requireAuth, requireAdmin, async (req: AuthedRequest, res: Response) => {
  const targetId = String(req.params.id);

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', targetId)
    .single();

  if (profileError || !profile) {
    return res.status(404).json({ error: 'User not found', status: 404 });
  }

  const [{ data: receipts, error: receiptsError }, { data: budgets, error: budgetsError }] = await Promise.all([
    supabase.from('receipts').select('*').eq('user_id', targetId).order('created_at', { ascending: false }),
    supabase.from('budgets').select('*').eq('user_id', targetId).order('category'),
  ]);

  if (receiptsError || budgetsError) {
    console.error('Failed to export user data:', receiptsError || budgetsError);
    return res.status(500).json({ error: 'Failed to export user data', status: 500 });
  }

  await logAdminAction(req.userId as string, 'export_user_data', targetId, { email: profile.email });

  return res.status(200).json({
    exportedAt: new Date().toISOString(),
    profile,
    receipts: receipts ?? [],
    budgets: budgets ?? [],
  });
});

// Haiku 4.5 pricing: $1/1M input tokens, $5/1M output tokens.
const HAIKU_INPUT_COST_PER_TOKEN = 1 / 1_000_000;
const HAIKU_OUTPUT_COST_PER_TOKEN = 5 / 1_000_000;

interface ClaudeUsageRow {
  input_tokens: number;
  output_tokens: number;
}

// GET /api/v1/admin/usage — Claude API token usage/cost, aggregated from
// the usage persisted on each receipt at scan time (see routes/receipts.ts).
router.get('/usage', requireAuth, requireAdmin, async (_req: AuthedRequest, res: Response) => {
  const { data: receipts, error } = await supabase
    .from('receipts')
    .select('created_at, claude_usage')
    .not('claude_usage', 'is', null)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch usage:', error);
    return res.status(500).json({ error: 'Failed to fetch usage', status: 500 });
  }

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const byDay: Record<string, { scans: number; inputTokens: number; outputTokens: number }> = {};

  for (const r of receipts ?? []) {
    const usage = r.claude_usage as ClaudeUsageRow | null;
    if (!usage) continue;

    totalInputTokens += usage.input_tokens;
    totalOutputTokens += usage.output_tokens;

    const day = String(r.created_at).slice(0, 10); // YYYY-MM-DD
    if (!byDay[day]) byDay[day] = { scans: 0, inputTokens: 0, outputTokens: 0 };
    byDay[day].scans += 1;
    byDay[day].inputTokens += usage.input_tokens;
    byDay[day].outputTokens += usage.output_tokens;
  }

  const estimatedCostUsd =
    totalInputTokens * HAIKU_INPUT_COST_PER_TOKEN + totalOutputTokens * HAIKU_OUTPUT_COST_PER_TOKEN;

  return res.status(200).json({
    totalScans: receipts?.length ?? 0,
    totalInputTokens,
    totalOutputTokens,
    estimatedCostUsd: Math.round(estimatedCostUsd * 10000) / 10000,
    byDay: Object.entries(byDay)
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
  });
});

// GET /api/v1/admin/scan-log — a combined feed of recent scan attempts
// (successful receipts + scan_failures) across all users, newest first, for
// the AI Monitor screen. Same admin_id -> email batch-resolve pattern as
// audit-log, since neither source table carries email directly. Failed
// scans have no token/cost data — scanReceipt() throws before Claude
// returns usage, so nothing was ever captured for those rows.
interface ScanLogEntry {
  id: string;
  userId: string;
  email: string | null;
  createdAt: string;
  status: 'success' | 'failed';
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  error: string | null;
}

router.get('/scan-log', requireAuth, requireAdmin, async (_req: AuthedRequest, res: Response) => {
  const [
    { data: receipts, error: receiptsError },
    { data: failures, error: failuresError },
  ] = await Promise.all([
    supabase
      .from('receipts')
      .select('id, user_id, created_at, claude_usage')
      .not('claude_usage', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('scan_failures')
      .select('id, user_id, created_at, error_message')
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  if (receiptsError || failuresError) {
    console.error('Failed to fetch scan log:', receiptsError || failuresError);
    return res.status(500).json({ error: 'Failed to fetch scan log', status: 500 });
  }

  const userIds = [
    ...new Set([...(receipts ?? []).map((r: any) => r.user_id), ...(failures ?? []).map((f: any) => f.user_id)]),
  ];
  const { data: profiles, error: profilesError } =
    userIds.length > 0
      ? await supabase.from('profiles').select('id, email').in('id', userIds)
      : { data: [] as { id: string; email: string | null }[], error: null };

  if (profilesError) {
    console.error('Failed to fetch user emails for scan log:', profilesError);
    return res.status(500).json({ error: 'Failed to fetch scan log', status: 500 });
  }

  const emailById = new Map((profiles ?? []).map((p) => [p.id, p.email]));

  const successEntries: ScanLogEntry[] = (receipts ?? []).map((r: any) => {
    const usage = r.claude_usage as ClaudeUsageRow;
    const costUsd = usage.input_tokens * HAIKU_INPUT_COST_PER_TOKEN + usage.output_tokens * HAIKU_OUTPUT_COST_PER_TOKEN;
    return {
      id: r.id,
      userId: r.user_id,
      email: emailById.get(r.user_id) ?? null,
      createdAt: r.created_at,
      status: 'success',
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      costUsd: Math.round(costUsd * 10000) / 10000,
      error: null,
    };
  });

  const failureEntries: ScanLogEntry[] = (failures ?? []).map((f: any) => ({
    id: f.id,
    userId: f.user_id,
    email: emailById.get(f.user_id) ?? null,
    createdAt: f.created_at,
    status: 'failed',
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
    error: f.error_message,
  }));

  const log = [...successEntries, ...failureEntries]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 100);

  return res.status(200).json({ log });
});

// GET /api/v1/admin/rate-limit-violations — recent 429s, newest first.
router.get('/rate-limit-violations', requireAuth, requireAdmin, async (_req: AuthedRequest, res: Response) => {
  const { data, error } = await supabase
    .from('rate_limit_violations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('Failed to fetch rate limit violations:', error);
    return res.status(500).json({ error: 'Failed to fetch rate limit violations', status: 500 });
  }

  return res.status(200).json({ violations: data });
});

// GET /api/v1/admin/failed-scans — recent Claude scan failures, newest first.
router.get('/failed-scans', requireAuth, requireAdmin, async (_req: AuthedRequest, res: Response) => {
  const { data, error } = await supabase
    .from('scan_failures')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('Failed to fetch scan failures:', error);
    return res.status(500).json({ error: 'Failed to fetch scan failures', status: 500 });
  }

  return res.status(200).json({ failures: data });
});

// GET /api/v1/admin/audit-log — every logged admin action, newest first.
// admin_id/target_user_id are auth.users FKs (not public.profiles), so
// PostgREST can't embed them directly — batch-fetch admin emails and merge.
// Target emails are usually already in `details.email` (captured by each
// action at the time it ran), which also survives target_user_id going
// null if the target was later deleted.
router.get('/audit-log', requireAuth, requireAdmin, async (_req: AuthedRequest, res: Response) => {
  const { data: logs, error } = await supabase
    .from('admin_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('Failed to fetch audit log:', error);
    return res.status(500).json({ error: 'Failed to fetch audit log', status: 500 });
  }

  const adminIds = [...new Set((logs ?? []).map((l: any) => l.admin_id))];
  const { data: admins, error: adminsError } =
    adminIds.length > 0
      ? await supabase.from('profiles').select('id, email').in('id', adminIds)
      : { data: [] as { id: string; email: string | null }[], error: null };

  if (adminsError) {
    console.error('Failed to fetch admin emails for audit log:', adminsError);
    return res.status(500).json({ error: 'Failed to fetch audit log', status: 500 });
  }

  const adminEmailById = new Map((admins ?? []).map((a) => [a.id, a.email]));
  const auditLog = (logs ?? []).map((l: any) => ({
    ...l,
    admin_email: adminEmailById.get(l.admin_id) ?? null,
  }));

  return res.status(200).json({ auditLog });
});

export default router;
