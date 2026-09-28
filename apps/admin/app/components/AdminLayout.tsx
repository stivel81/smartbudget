'use client';

import { ReactNode, useState, KeyboardEvent } from 'react';
import { COLORS, LAYOUT, FONT_FAMILY } from '../../lib/theme';
import { Avatar } from './ui';

function IconDashboard() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" />
      <rect x="13" y="10" width="8" height="11" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20c0-3.6 2.9-6.2 6.5-6.2s6.5 2.6 6.5 6.2" />
      <path d="M16 8.2a3 3 0 1 1 3.2 3M18.5 13.5c2.2.5 3.6 2.4 3.6 5" />
    </svg>
  );
}

function IconRobot() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="8" width="16" height="12" rx="2.5" />
      <path d="M12 4v4M9 3.5h6" />
      <circle cx="9" cy="14" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15" cy="14" r="1.3" fill="currentColor" stroke="none" />
      <path d="M9 17.5h6" />
      <path d="M1.5 12.5h2.5M20 12.5h2.5" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.4-2.3 1a7.7 7.7 0 0 0-1.8-1L15 3.5H9l-.3 2.6a7.7 7.7 0 0 0-1.8 1l-2.3-1-2 3.4L4.6 11a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7.7 7.7 0 0 0 1.8 1l.3 2.6h6l.3-2.6a7.7 7.7 0 0 0 1.8-1l2.3 1 2-3.4-2-1.5Z" />
    </svg>
  );
}

function IconLogout() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

function IconClipboard() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M9 11h6M9 15h6M9 7h6" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2.5 4.5 5.5v6c0 5 3.2 8.3 7.5 10 4.3-1.7 7.5-5 7.5-10v-6L12 2.5Z" />
    </svg>
  );
}

function IconWallet() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2">
      <rect x="2.5" y="6" width="19" height="13" rx="2.5" />
      <path d="M2.5 10h19" />
      <circle cx="16.5" cy="14" r="1.3" fill="#ffffff" stroke="none" />
    </svg>
  );
}

function IconBell({ hasAlert }: { hasAlert: boolean }) {
  return (
    <div style={{ position: 'relative', width: 18, height: 18 }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={COLORS.textSecondary} strokeWidth="1.8">
        <path d="M18 16v-5a6 6 0 1 0-12 0v5l-1.5 2.5h15L18 16Z" />
        <path d="M9.5 20a2.5 2.5 0 0 0 5 0" />
      </svg>
      {hasAlert && (
        <span
          style={{
            position: 'absolute',
            top: -1,
            right: -1,
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: COLORS.danger,
            border: `1.5px solid ${COLORS.surface}`,
          }}
        />
      )}
    </div>
  );
}

export type NavItemId = 'dashboard' | 'users' | 'aiMonitor' | 'auditLog' | 'rateLimits' | 'settings';

const PRIMARY_NAV: { id: NavItemId; label: string; icon: () => ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: IconDashboard },
  { id: 'users', label: 'Users', icon: IconUsers },
  { id: 'aiMonitor', label: 'AI Monitor', icon: IconRobot },
];

const SECONDARY_NAV: { id: NavItemId; label: string; icon: () => ReactNode }[] = [
  { id: 'auditLog', label: 'Audit log', icon: IconClipboard },
  { id: 'rateLimits', label: 'Rate limits', icon: IconShield },
];

function NavLink({
  label,
  icon,
  active,
  alert,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  active: boolean;
  alert?: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        width: 'calc(100% - 16px)',
        margin: '1px 8px',
        padding: '7px 12px',
        borderRadius: 8,
        border: 'none',
        cursor: 'pointer',
        fontFamily: FONT_FAMILY,
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        textAlign: 'left',
        background: active ? COLORS.purpleLight : hover ? COLORS.hover : 'transparent',
        color: active ? COLORS.purple : hover ? COLORS.textPrimary : COLORS.textSecondary,
      }}
    >
      <span style={{ display: 'flex', position: 'relative' }}>
        {icon}
        {alert && (
          <span
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: COLORS.danger,
              border: `1.5px solid ${active ? COLORS.purpleLight : COLORS.surface}`,
            }}
          />
        )}
      </span>
      {label}
    </button>
  );
}

export default function AdminLayout({
  active,
  onNavigate,
  onSearch,
  onSignOut,
  userEmail,
  hasScanAlerts,
  children,
}: {
  active: NavItemId;
  onNavigate: (id: NavItemId) => void;
  onSearch: (query: string) => void;
  onSignOut: () => void;
  userEmail: string;
  hasScanAlerts: boolean;
  children: ReactNode;
}) {
  const [search, setSearch] = useState('');
  const initials = userEmail.slice(0, 2).toUpperCase();

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && search.trim()) {
      onSearch(search.trim());
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: COLORS.background, fontFamily: FONT_FAMILY }}>
      <header
        style={{
          height: LAYOUT.topbarHeight,
          background: COLORS.surface,
          borderBottom: `0.5px solid ${COLORS.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              background: COLORS.purple,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconWallet />
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary }}>SmartBudget</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              padding: '2px 7px',
              borderRadius: 20,
              background: COLORS.purpleLight,
              color: COLORS.purple,
              border: `1px solid ${COLORS.purpleBorder}`,
            }}
          >
            Admin
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search users…"
            style={{
              width: 180,
              height: 28,
              boxSizing: 'border-box',
              padding: '0 10px',
              fontSize: 12,
              fontFamily: FONT_FAMILY,
              borderRadius: 8,
              border: `0.5px solid ${COLORS.border}`,
              background: COLORS.background,
              color: COLORS.textPrimary,
              outline: 'none',
            }}
          />
          <button
            onClick={() => onNavigate('aiMonitor')}
            aria-label="Notifications"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
          >
            <IconBell hasAlert={hasScanAlerts} />
          </button>
          <Avatar label={initials} size={28} />
        </div>
      </header>

      <div style={{ display: 'flex' }}>
        <nav
          style={{
            width: LAYOUT.sidebarWidth,
            minWidth: LAYOUT.sidebarWidth,
            background: COLORS.surface,
            borderRight: `0.5px solid ${COLORS.border}`,
            padding: '14px 0',
            height: `calc(100vh - ${LAYOUT.topbarHeight}px)`,
            position: 'sticky',
            top: LAYOUT.topbarHeight,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {PRIMARY_NAV.map((item) => (
            <NavLink
              key={item.id}
              label={item.label}
              icon={item.icon()}
              active={active === item.id}
              alert={item.id === 'aiMonitor' && hasScanAlerts}
              onClick={() => onNavigate(item.id)}
            />
          ))}

          <p
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: COLORS.textMuted,
              padding: '0 12px',
              margin: '16px 0 6px',
            }}
          >
            More
          </p>
          {SECONDARY_NAV.map((item) => (
            <NavLink
              key={item.id}
              label={item.label}
              icon={item.icon()}
              active={active === item.id}
              onClick={() => onNavigate(item.id)}
            />
          ))}

          <div style={{ flex: 1 }} />

          <NavLink label="Settings" icon={<IconSettings />} active={active === 'settings'} onClick={() => onNavigate('settings')} />
          <NavLink label="Sign out" icon={<IconLogout />} active={false} onClick={onSignOut} />
        </nav>

        <main style={{ flex: 1, padding: LAYOUT.contentPadding, minWidth: 0 }}>{children}</main>
      </div>
    </div>
  );
}
