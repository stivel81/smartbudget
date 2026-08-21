'use client';

import { useState } from 'react';
import UsersView from './views/UsersView';
import UserDetailView from './views/UserDetailView';

type View = { name: 'users' } | { name: 'userDetail'; userId: string };

export default function AdminDashboard({ accessToken }: { accessToken: string }) {
  const [view, setView] = useState<View>({ name: 'users' });

  return (
    <div style={{ maxWidth: 1000, margin: '40px auto', padding: 24 }}>
      <h1 style={{ marginBottom: 24 }}>SmartBudget Admin</h1>

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
    </div>
  );
}
