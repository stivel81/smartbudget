'use client';

import { useEffect, useMemo, useState } from 'react';
import { getUsers, AdminUserSummary } from '../../lib/api';
import { COLORS, FONT_FAMILY } from '../../lib/theme';
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

type Filter = 'all' | 'admins';

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
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState(initialSearch);

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (filter === 'admins' && !u.is_admin) return false;
      if (!q) return true;
      return (u.email || '').toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q);
    });
  }, [users, filter, search]);

  if (loading) return <p style={{ fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.textSecondary }}>Loading…</p>;
  if (error) return <p style={{ fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.dangerText }}>{error}</p>;

  return (
    <div>
      <h1 style={pageTitleStyle}>Users</h1>
      <p style={pageSubtitleStyle}>{users.length} account{users.length === 1 ? '' : 's'} total.</p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <FilterPill label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
          <FilterPill label="Admins" active={filter === 'admins'} onClick={() => setFilter('admins')} />
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
            borderRadius: 8,
            border: `0.5px solid ${COLORS.border}`,
            background: COLORS.surface,
            outline: 'none',
          }}
        />
      </div>

      <Card>
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Role</Th>
                <Th align="right">Joined</Th>
                <Th align="right">{''}</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => {
                const last = i === filtered.length - 1;
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
                    <Td align="right" last={last}>
                      {new Date(u.created_at).toLocaleDateString()}
                    </Td>
                    <Td align="right" last={last}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectUser(u.id);
                        }}
                        aria-label={`View ${u.email}`}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 6,
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          color: COLORS.textSecondary,
                          fontSize: 14,
                        }}
                      >
                        ⋯
                      </button>
                    </Td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <Td last>No users match.</Td>
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
