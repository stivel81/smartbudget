jest.mock('@smartbudget/shared/lib/supabase', () => ({
  supabase: require('../testUtils/supabaseMock').supabase,
}));

import { supabase } from '@smartbudget/shared/lib/supabase';
import { queueResult, resetQueue } from '../testUtils/supabaseMock';
import { logAdminAction } from '../services/auditLog';

beforeEach(() => {
  resetQueue();
  jest.clearAllMocks();
});

describe('logAdminAction', () => {
  it('inserts an audit row with the given fields', async () => {
    queueResult({ error: null });

    await logAdminAction('admin-1', 'grant_admin', 'user-2', { email: 'user2@example.com' });

    expect(supabase.from).toHaveBeenCalledWith('admin_audit_log');
    const builder = (supabase.from as jest.Mock).mock.results[0].value;
    expect(builder.insert).toHaveBeenCalledWith({
      admin_id: 'admin-1',
      action: 'grant_admin',
      target_user_id: 'user-2',
      details: { email: 'user2@example.com' },
    });
  });

  it('defaults target_user_id and details to null when omitted', async () => {
    queueResult({ error: null });

    await logAdminAction('admin-1', 'suspend_user');

    const builder = (supabase.from as jest.Mock).mock.results[0].value;
    expect(builder.insert).toHaveBeenCalledWith({
      admin_id: 'admin-1',
      action: 'suspend_user',
      target_user_id: null,
      details: null,
    });
  });

  it('does not throw when the insert fails', async () => {
    queueResult({ error: { message: 'insert failed' } });

    await expect(logAdminAction('admin-1', 'delete_user_data', 'user-2')).resolves.toBeUndefined();
  });
});
