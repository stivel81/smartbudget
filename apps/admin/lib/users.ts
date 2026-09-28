import { suspendUser, unsuspendUser, type AdminUserSummary } from './api';

export type UserFilter = 'all' | 'suspended' | 'admins';

/**
 * Suspended = banned until a moment still in the future. Supabase keeps a past
 * `banned_until` around after a ban lapses, so presence alone isn't enough.
 */
export function isSuspended(user: Pick<AdminUserSummary, 'banned_until'>, now: Date): boolean {
  if (!user.banned_until) return false;
  return new Date(user.banned_until).getTime() > now.getTime();
}

/** Apply the Users screen filter pill and search box. */
export function filterUsers(
  users: AdminUserSummary[],
  filter: UserFilter,
  search: string,
  now: Date
): AdminUserSummary[] {
  const q = search.trim().toLowerCase();
  return users.filter((u) => {
    if (filter === 'admins' && !u.is_admin) return false;
    if (filter === 'suspended' && !isSuspended(u, now)) return false;
    if (!q) return true;
    return (u.email || '').toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q);
  });
}

/** Suspend an active user or lift an existing suspension. */
export function toggleSuspension(
  user: Pick<AdminUserSummary, 'id' | 'banned_until'>,
  accessToken: string,
  now: Date
): Promise<void> {
  return isSuspended(user, now) ? unsuspendUser(user.id, accessToken) : suspendUser(user.id, accessToken);
}

/** What an admin must type to confirm a right-to-erasure deletion. */
export function deleteConfirmPhrase(user: Pick<AdminUserSummary, 'id' | 'email'>): string {
  return user.email || user.id;
}
