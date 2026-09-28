import * as api from '../../lib/api';
import { deleteConfirmPhrase, filterUsers, isSuspended, toggleSuspension } from '../../lib/users';
import { makeUser } from '../testUtils/fixtures';

jest.mock('../../lib/api');
const mocked = jest.mocked(api);

const NOW = new Date('2026-03-04T15:30:00Z');

describe('isSuspended', () => {
  it('is false with no ban', () => {
    expect(isSuspended({ banned_until: null }, NOW)).toBe(false);
  });

  it('is true while the ban is in the future', () => {
    expect(isSuspended({ banned_until: '2126-01-01T00:00:00Z' }, NOW)).toBe(true);
    expect(isSuspended({ banned_until: '2026-03-04T15:30:01Z' }, NOW)).toBe(true);
  });

  it('is false once the ban has lapsed (including exactly now)', () => {
    expect(isSuspended({ banned_until: '2026-03-04T15:30:00Z' }, NOW)).toBe(false);
    expect(isSuspended({ banned_until: '2025-01-01T00:00:00Z' }, NOW)).toBe(false);
  });

  it('is false for an unparseable timestamp', () => {
    expect(isSuspended({ banned_until: 'not-a-date' }, NOW)).toBe(false);
  });
});

describe('filterUsers', () => {
  const users = [
    makeUser({ id: 'admin', name: 'Ada Admin', email: 'ada@example.com', is_admin: true }),
    makeUser({ id: 'banned', name: 'Ben Banned', email: 'ben@example.com', banned_until: '2126-01-01T00:00:00Z' }),
    makeUser({ id: 'lapsed', name: 'Lou Lapsed', email: 'lou@example.com', banned_until: '2025-01-01T00:00:00Z' }),
    makeUser({ id: 'bannedAdmin', name: null, email: null, is_admin: true, banned_until: '2126-01-01T00:00:00Z' }),
  ];
  const ids = (list: api.AdminUserSummary[]) => list.map((u) => u.id);

  it('All returns everyone', () => {
    expect(ids(filterUsers(users, 'all', '', NOW))).toEqual(['admin', 'banned', 'lapsed', 'bannedAdmin']);
  });

  it('Suspended returns only currently-suspended users', () => {
    expect(ids(filterUsers(users, 'suspended', '', NOW))).toEqual(['banned', 'bannedAdmin']);
  });

  it('Admins returns only admins', () => {
    expect(ids(filterUsers(users, 'admins', '', NOW))).toEqual(['admin', 'bannedAdmin']);
  });

  it('searches name and email case-insensitively, trimming whitespace', () => {
    expect(ids(filterUsers(users, 'all', '  BEN ', NOW))).toEqual(['banned']);
    expect(ids(filterUsers(users, 'all', 'lapsed', NOW))).toEqual(['lapsed']);
    expect(ids(filterUsers(users, 'all', 'zzz', NOW))).toEqual([]);
  });

  it('combines filter and search, tolerating null name/email', () => {
    expect(ids(filterUsers(users, 'suspended', 'ben', NOW))).toEqual(['banned']);
    expect(ids(filterUsers(users, 'admins', 'ben', NOW))).toEqual([]);
  });
});

describe('toggleSuspension', () => {
  beforeEach(() => jest.resetAllMocks());

  it('suspends an active user', async () => {
    mocked.suspendUser.mockResolvedValue(undefined);
    await toggleSuspension({ id: 'u1', banned_until: null }, 'tok', NOW);
    expect(mocked.suspendUser).toHaveBeenCalledWith('u1', 'tok');
    expect(mocked.unsuspendUser).not.toHaveBeenCalled();
  });

  it('suspends a user whose ban has lapsed', async () => {
    mocked.suspendUser.mockResolvedValue(undefined);
    await toggleSuspension({ id: 'u1', banned_until: '2025-01-01T00:00:00Z' }, 'tok', NOW);
    expect(mocked.suspendUser).toHaveBeenCalledWith('u1', 'tok');
  });

  it('unsuspends a suspended user', async () => {
    mocked.unsuspendUser.mockResolvedValue(undefined);
    await toggleSuspension({ id: 'u1', banned_until: '2126-01-01T00:00:00Z' }, 'tok', NOW);
    expect(mocked.unsuspendUser).toHaveBeenCalledWith('u1', 'tok');
    expect(mocked.suspendUser).not.toHaveBeenCalled();
  });

  it('propagates API errors', async () => {
    mocked.suspendUser.mockRejectedValue({ message: 'nope' });
    await expect(toggleSuspension({ id: 'u1', banned_until: null }, 'tok', NOW)).rejects.toEqual({ message: 'nope' });
  });
});

describe('deleteConfirmPhrase', () => {
  it('is the email, or the id when there is no email', () => {
    expect(deleteConfirmPhrase({ id: 'u1', email: 'a@b.com' })).toBe('a@b.com');
    expect(deleteConfirmPhrase({ id: 'u1', email: null })).toBe('u1');
    expect(deleteConfirmPhrase({ id: 'u1', email: '' })).toBe('u1');
  });
});
