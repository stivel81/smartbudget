'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getUsers, AdminUserSummary } from '../../lib/api';
import { COLORS, FONT_FAMILY, RADIUS } from '../../lib/theme';
import { filterUsers, isSuspended, toggleSuspension, UserFilter } from '../../lib/users';
import DeleteUserConfirm from '../components/DeleteUserConfirm';
import {
  Avatar,
  Badge,
  Card,
  FilterPill,
  Td,
  Th,
  tableStyle,
  tableWrapStyle,
  pageSubtitleStyle,
  pageTitleStyle,
} from '../components/ui';

const FILTERS: { id: UserFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'suspended', label: 'Suspended' },
  { id: 'admins', label: 'Admins' },
];

function userLabel(u: AdminUserSummary) {
  return u.email || u.id;
}

const menuItemStyle = {
  display: 'block',
  width: '100%',
  textAlign: 'left' as const,
  padding: '7px 12px',
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontFamily: FONT_FAMILY,
  fontSize: 12,
  color: COLORS.textPrimary,
};

function RowActionMenu({
  user,
  suspended,
  busy,
  onView,
  onToggleSuspend,
  onDelete,
  onClose,
}: {
  user: AdminUserSummary;
  suspended: boolean;
  busy: boolean;
  onView: () => void;
  onToggleSuspend: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // The parent wraps both the ⋮ toggle and this menu; clicks on the toggle
    // are left to its own onClick so it can close the menu instead of
    // close-then-reopen.
    const onMouseDown = (e: MouseEvent) => {
      const anchor = ref.current?.parentElement;
      if (anchor && !anchor.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`Actions for ${userLabel(user)}`}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        right: 14,
        top: '100%',
        zIndex: 5,
        minWidth: 140,
        background: COLORS.surface,
        border: `0.5px solid ${COLORS.border}`,
        borderRadius: 8,
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        padding: '4px 0',
        textAlign: 'left',
      }}
    >
      <button role="menuitem" style={menuItemStyle} onClick={onView}>
        View
      </button>
      <button role="menuitem" style={menuItemStyle} onClick={onToggleSuspend} disabled={busy}>
        {suspended ? 'Unsuspend' : 'Suspend'}
      </button>
      <button role="menuitem" style={{ ...menuItemStyle, color: COLORS.dangerText }} onClick={onDelete} disabled={busy}>
        Delete
      </button>
    </div>
  );
}

export default function UsersView({
  accessToken,
  onSelectUser,
  initialSearch = '',
}: {
  accessToken: string;
  onSelectUser: (userId: string) => void;
  initialSearch?: string;
}) {
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<UserFilter>('all');
  const [search, setSearch] = useState(initialSearch);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AdminUserSummary | null>(null);

  useEffect(() => {
    setSearch(initialSearch);
  }, [initialSearch]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getUsers(accessToken)
      .then((res) => {
        if (!cancelled) setUsers(res.users);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err.message || 'Failed to load users');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const now = new Date();
  const filtered = useMemo(
    () => filterUsers(users, filter, search, new Date()),
    [users, filter, search]
  );

  const reloadUsers = async () => {
    const res = await getUsers(accessToken);
    setUsers(res.users);
  };

  const handleToggleSuspend = async (user: AdminUserSummary) => {
    const wasSuspended = isSuspended(user, new Date());
    setOpenMenuId(null);
    setActionError('');
    setNotice('');
    setBusyUserId(user.id);
    try {
      await toggleSuspension(user, accessToken, new Date());
      await reloadUsers();
      setNotice(`${wasSuspended ? 'Unsuspended' : 'Suspended'} ${userLabel(user)}.`);
    } catch (err: any) {
      setActionError(err.message || 'Action failed');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleDeleted = async (user: AdminUserSummary) => {
    setDeleteTarget(null);
    setNotice(`Deleted all data for ${userLabel(user)}.`);
    try {
      await reloadUsers();
    } catch (err: any) {
      setActionError(err.message || 'Failed to reload users');
    }
  };

  if (loading) return <p style={{ fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.textSecondary }}>Loading…</p>;
  if (error) return <p style={{ fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.dangerText }}>{error}</p>;

  return (
    <div>
      <h1 style={pageTitleStyle}>Users</h1>
      <p style={pageSubtitleStyle}>{users.length} account{users.length === 1 ? '' : 's'} total.</p>

      {notice && (
        <p role="status" style={{ fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.successText, margin: '0 0 12px' }}>
          {notice}
        </p>
      )}
      {actionError && (
        <p role="alert" style={{ fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.dangerText, margin: '0 0 12px' }}>
          {actionError}
        </p>
      )}

      {deleteTarget && (
        <Card style={{ border: `1px solid #fca5a5`, padding: 14, marginBottom: 12 }}>
          <div role="region" aria-label="Confirm deletion" style={{ fontFamily: FONT_FAMILY }}>
            <h2 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600, color: COLORS.dangerText }}>
              Delete all data for {userLabel(deleteTarget)}?
            </h2>
            <p style={{ fontSize: 12, color: COLORS.textSecondary, margin: 0 }}>
              Permanently deletes this user&apos;s receipts (and stored photos), budgets, profile, and account. This
              cannot be undone.
            </p>
            <DeleteUserConfirm
              key={deleteTarget.id}
              user={deleteTarget}
              accessToken={accessToken}
              onDeleted={() => handleDeleted(deleteTarget)}
              onCancel={() => setDeleteTarget(null)}
            />
          </div>
        </Card>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {FILTERS.map((f) => (
            <FilterPill key={f.id} label={f.label} active={filter === f.id} onClick={() => setFilter(f.id)} />
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          style={{
            width: 220,
            height: 30,
            boxSizing: 'border-box',
            padding: '0 10px',
            fontSize: 12,
            fontFamily: FONT_FAMILY,
            borderRadius: RADIUS.input,
            border: `0.5px solid ${COLORS.border}`,
            background: COLORS.surface,
            outline: 'none',
          }}
        />
      </div>

      {/* overflow visible so the row action dropdown isn't clipped */}
      <Card style={{ overflow: 'visible' }}>
        <div style={{ ...tableWrapStyle, overflow: 'visible' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th align="right">Joined</Th>
                <Th align="right">{''}</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => {
                const last = i === filtered.length - 1;
                const suspended = isSuspended(u, now);
                const menuOpen = openMenuId === u.id;
                return (
                  <tr
                    key={u.id}
                    onClick={() => onSelectUser(u.id)}
                    data-testid={`user-row-${u.id}`}
                    style={{ cursor: 'pointer' }}
                  >
                    <Td last={last}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Avatar label={(u.name || u.email || '?').slice(0, 2).toUpperCase()} />
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 500, color: COLORS.textPrimary }}>{u.name || '—'}</div>
                          <div style={{ fontSize: 10, color: COLORS.textMuted }}>{u.email}</div>
                        </div>
                      </div>
                    </Td>
                    <Td last={last}>
                      <Badge label={u.is_admin ? 'Admin' : 'User'} tone={u.is_admin ? 'purple' : 'grey'} />
                    </Td>
                    <Td last={last}>
                      {suspended ? (
                        <Badge label="Suspended" tone="warning" />
                      ) : (
                        <span style={{ fontSize: 12, color: COLORS.textSecondary }}>Active</span>
                      )}
                    </Td>
                    <Td align="right" last={last}>
                      {new Date(u.created_at).toLocaleDateString()}
                    </Td>
                    <Td align="right" last={last}>
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(menuOpen ? null : u.id);
                          }}
                          aria-label={`Actions for ${userLabel(u)}`}
                          aria-haspopup="menu"
                          aria-expanded={menuOpen}
                          disabled={busyUserId === u.id}
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: RADIUS.actionButton,
                            border: 'none',
                            background: menuOpen ? COLORS.dividerLight : 'transparent',
                            cursor: 'pointer',
                            color: COLORS.textSecondary,
                            fontSize: 13,
                          }}
                        >
                          {busyUserId === u.id ? '…' : '⋮'}
                        </button>
                        {menuOpen && (
                          <RowActionMenu
                            user={u}
                            suspended={suspended}
                            busy={busyUserId !== null}
                            onView={() => {
                              setOpenMenuId(null);
                              onSelectUser(u.id);
                            }}
                            onToggleSuspend={() => handleToggleSuspend(u)}
                            onDelete={() => {
                              setOpenMenuId(null);
                              setNotice('');
                              setActionError('');
                              setDeleteTarget(u);
                            }}
                            onClose={() => setOpenMenuId(null)}
                          />
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <Td last>No users match.</Td>
                  <Td last>{''}</Td>
                  <Td last>{''}</Td>
                  <Td last align="right">{''}</Td>
                  <Td last align="right">{''}</Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
