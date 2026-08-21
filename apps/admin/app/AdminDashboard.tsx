'use client';

import { useState } from 'react';
import UsersView from './views/UsersView';
import UserDetailView from './views/UserDetailView';
import UsageView from './views/UsageView';

type View = { name: 'users' } | { name: 'userDetail'; userId: string } | { name: 'usage' };

const NAV_ITEMS: { name: View['name']; label: string }[] = [
  { name: 'users', label: 'Users' },
  { name: 'usage', label: 'Usage' },
];

export default function AdminDashboard({ accessToken }: { accessToken: string }) {
  const [view, setView] = useState<View>({ name: 'users' });

  return (
    <div style={{ maxWidth: 1000, margin: '40px auto', padding: 24 }}>
      <h1 style={{ marginBottom: 16 }}>SmartBudget Admin</h1>

      <nav style={{ display: 'flex', gap: 16, marginBottom: 24, borderBottom: '1px solid #e5e5e5', paddingBottom: 8 }}>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.name}
            onClick={() => setView({ name: item.name } as View)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontWeight: view.name === item.name || (item.name === 'users' && view.name === 'userDetail') ? 700 : 400,
              padding: 0,
              fontSize: 15,
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {view.name === 'users' && (
        <UsersView accessToken={accessToken} onSelectUser={(userId) => setView({ name: 'userDetail', userId })} />
      )}

      {view.name === 'userDetail' && (
        <UserDetailView
          accessToken={accessToken}
          userId={view.userId}
          onBack={() => setView({ name: 'users' })}
        />
      )}

      {view.name === 'usage' && <UsageView accessToken={accessToken} />}
    </div>
  );
}
