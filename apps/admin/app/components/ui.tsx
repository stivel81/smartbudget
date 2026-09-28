'use client';

import { CSSProperties, ReactNode } from 'react';
import { COLORS, RADIUS, FONT_FAMILY } from '../../lib/theme';

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: COLORS.surface,
        border: `0.5px solid ${COLORS.border}`,
        borderRadius: RADIUS.card,
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, link }: { title: string; link?: { label: string; onClick: () => void } }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        borderBottom: `0.5px solid ${COLORS.dividerLight}`,
      }}
    >
      <h3 style={{ margin: 0, fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 600, color: COLORS.textPrimary }}>
        {title}
      </h3>
      {link && (
        <button
          onClick={link.onClick}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            fontFamily: FONT_FAMILY,
            fontSize: 11,
            fontWeight: 500,
            color: COLORS.purple,
          }}
        >
          {link.label}
        </button>
      )}
    </div>
  );
}

type BadgeTone = 'purple' | 'grey' | 'warning';

const BADGE_TONES: Record<BadgeTone, { bg: string; color: string; border: string }> = {
  purple: { bg: COLORS.purpleLight, color: COLORS.purple, border: COLORS.purpleBorder },
  grey: { bg: COLORS.hover, color: COLORS.textSecondary, border: COLORS.border },
  warning: { bg: COLORS.warningBg, color: COLORS.warningText, border: COLORS.warningBorder },
};

export function Badge({ label, tone }: { label: string; tone: BadgeTone }) {
  const t = BADGE_TONES[tone];
  return (
    <span
      style={{
        display: 'inline-block',
        fontFamily: FONT_FAMILY,
        fontSize: 10,
        fontWeight: 500,
        padding: '2px 7px',
        borderRadius: RADIUS.badge,
        background: t.bg,
        color: t.color,
        border: `1px solid ${t.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

export function Avatar({ label, size = 26 }: { label: string; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        minWidth: size,
        borderRadius: '50%',
        background: COLORS.purpleLight,
        color: COLORS.purple,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: FONT_FAMILY,
        fontSize: size <= 26 ? 9 : 12,
        fontWeight: 600,
      }}
    >
      {label}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  change,
  accent,
}: {
  label: string;
  value: string;
  change?: { label: string; positive: boolean };
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: accent ? `linear-gradient(135deg, ${COLORS.purple}, ${COLORS.purpleDark})` : COLORS.surface,
        border: accent ? 'none' : `0.5px solid ${COLORS.border}`,
        borderRadius: RADIUS.card,
        padding: 14,
      }}
    >
      <p
        style={{
          margin: 0,
          fontFamily: FONT_FAMILY,
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: accent ? 'rgba(255,255,255,0.7)' : COLORS.textSecondary,
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: '4px 0 0',
          fontFamily: FONT_FAMILY,
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: '-0.4px',
          color: accent ? '#ffffff' : COLORS.textPrimary,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </p>
      {change && (
        <p
          style={{
            margin: '6px 0 0',
            fontFamily: FONT_FAMILY,
            fontSize: 10,
            color: accent ? '#a7f3d0' : change.positive ? COLORS.successText : COLORS.dangerText,
          }}
        >
          {change.label}
        </p>
      )}
    </div>
  );
}

export function StatusDot({ status }: { status: 'success' | 'failed' }) {
  const color = status === 'success' ? COLORS.successText : COLORS.dangerText;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
      <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, color }}>
        {status === 'success' ? 'Success' : 'Failed'}
      </span>
    </span>
  );
}

export function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: FONT_FAMILY,
        fontSize: 11,
        fontWeight: 500,
        padding: '4px 12px',
        borderRadius: RADIUS.badge,
        border: `0.5px solid ${active ? COLORS.purple : COLORS.border}`,
        background: active ? COLORS.purple : COLORS.surface,
        color: active ? '#ffffff' : COLORS.textSecondary,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

export const tableWrapStyle: CSSProperties = { width: '100%', overflowX: 'auto' };

export const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontFamily: FONT_FAMILY,
};

export function Th({ children, align }: { children: ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      style={{
        textAlign: align || 'left',
        padding: '7px 14px',
        background: COLORS.hover,
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: COLORS.textMuted,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align,
  last,
}: {
  children: ReactNode;
  align?: 'left' | 'right';
  last?: boolean;
}) {
  return (
    <td
      style={{
        textAlign: align || 'left',
        padding: '9px 14px',
        borderBottom: last ? 'none' : `0.5px solid ${COLORS.dividerLight}`,
        fontSize: 12,
        color: '#374151',
      }}
    >
      {children}
    </td>
  );
}

export const pageTitleStyle: CSSProperties = {
  fontFamily: FONT_FAMILY,
  fontSize: 20,
  fontWeight: 700,
  letterSpacing: '-0.4px',
  color: COLORS.textPrimary,
  margin: '0 0 4px',
};

export const pageSubtitleStyle: CSSProperties = {
  fontFamily: FONT_FAMILY,
  fontSize: 12,
  color: COLORS.textSecondary,
  margin: '0 0 18px',
};
