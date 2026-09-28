'use client';

import { useEffect, useState } from 'react';
import AdminLayout, { NavItemId } from './components/AdminLayout';
import DashboardView from './views/DashboardView';
import UsersView from './views/UsersView';
import UserDetailView from './views/UserDetailView';
import AIMonitorView from './views/AIMonitorView';
import AuditLogView from './views/AuditLogView';
import RateLimitViolationsView from './views/RateLimitViolationsView';
import { getFailedScans } from '../lib/api';

type View =
  | { name: Exclude<NavItemId, 'settings'> }
  | { name: 'settings' }
  | { name: 'userDetail'; userId: string };

export default function AdminDashboard({
  accessToken,
  userEmail,
  onSignOut,
}: {
  accessToken: string;
  userEmail: string;
  onSignOut: () => void;
}) {
  const [view, setView] = useState<View>({ name: 'dashboard' });
  const [usersSearch, setUsersSearch] = useState('');
  const [hasScanAlerts, setHasScanAlerts] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getFailedScans(accessToken)
      .then((res) => {
        if (!cancelled) setHasScanAlerts(res.failures.length > 0);
      })
      .catch(() => {
        // Non-critical — the bell just stays quiet if this check fails.
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const activeNavId: NavItemId = view.name === 'userDetail' ? 'users' : view.name;

  return (
    <AdminLayout
      active={activeNavId}
      onNavigate={(id) => setView({ name: id } as View)}
      onSearch={(query) => {
        setUsersSearch(query);
        setView({ name: 'users' });
      }}
      onSignOut={onSignOut}
      userEmail={userEmail}
      hasScanAlerts={hasScanAlerts}
    >
      {view.name === 'dashboard' && <DashboardView accessToken={accessToken} />}

      {view.name === 'users' && (
        <UsersView
          accessToken={accessToken}
          initialSearch={usersSearch}
          onSelectUser={(userId) => setView({ name: 'userDetail', userId })}
        />
      )}

      {view.name === 'userDetail' && (
        <UserDetailView
          accessToken={accessToken}
          userId={view.userId}
          onBack={() => setView({ name: 'users' })}
        />
      )}

      {view.name === 'aiMonitor' && <AIMonitorView accessToken={accessToken} />}

      {view.name === 'auditLog' && <AuditLogView accessToken={accessToken} />}

      {view.name === 'rateLimits' && <RateLimitViolationsView accessToken={accessToken} />}

      {view.name === 'settings' && (
        <div>
          <h1 style={{ fontFamily: 'inherit', fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Settings</h1>
          <p style={{ fontSize: 13, color: '#6b7280' }}>Coming soon.</p>
        </div>
      )}
    </AdminLayout>
  );
}
