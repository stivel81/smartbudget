// Apple-style (iOS HIG) design tokens — see docs/DESIGN_REFERENCE_V2.md.
// Shared across all screens so the palette/type scale stays consistent.
import { Platform } from 'react-native';

export const COLORS = {
  // Core semantic colors per DESIGN_REFERENCE_V2.md
  background: '#f2f2f7',
  surface: '#ffffff',
  textPrimary: '#000000',
  textSecondary: '#8e8e93',
  placeholder: '#c7c7cc',
  border: '#e5e5ea',
  hero: '#000000',
  button: '#000000',
  buttonText: '#ffffff',
  // Status indicators
  success: '#30d158',
  warning: '#ff9f0a',
  danger: '#ff3b30',
  // Alert banner
  alertBg: '#fff3cd',
  alertBorder: '#ffd60a',
  // Dark surfaces (camera, etc)
  darkBg: '#1a1a1a',
  // Receipt scanner (Screen 4) — dark theme
  scannerBg: '#000000',
  scannerCorner: '#ffffff',
  scannerScanLine: 'rgba(255, 255, 255, 0.4)',
  scannerHint: 'rgba(255, 255, 255, 0.4)',
  scannerCancel: 'rgba(255, 255, 255, 0.6)',
  scannerControlBg: 'rgba(255, 255, 255, 0.08)',
  // Additional colors for UI elements
  chipBg: '#fafafa',
  errorBg: '#fee2e2',
  // Additional UI element colors
  alertTextColor: '#92400e',
  // Opacity/overlay colors
  overlay: 'rgba(0, 0, 0, 0.4)',
  heroSubtextOpacity: 'rgba(255, 255, 255, 0.4)',
  heroLabelOpacity: 'rgba(255, 255, 255, 0.8)',
  modalOverlay: 'rgba(0, 0, 0, 0.6)',
  heroStatsRowBg: 'rgba(255, 255, 255, 0.08)',
  heroStatsDivider: 'rgba(255, 255, 255, 0.2)',
  heroStatsLabel: 'rgba(255, 255, 255, 0.6)',
  // Loading placeholder bars on the dark hero card (Dashboard first load).
  heroSkeleton: 'rgba(255, 255, 255, 0.16)',
};

export const RADIUS = {
  card: 14,
  input: 10,
  button: 12,
  categoryIcon: 9,
};

export const SPACING = {
  screenPadding: 16,
  cardGap: 8,
  sectionMargin: 12,
};

// Alert threshold constants per DESIGN_REFERENCE_V2.md
export const ALERT_THRESHOLD_PCT = 90;
export const DANGER_THRESHOLD_PCT = 100;

// RN's 'System' font family maps to San Francisco on iOS / Roboto on
// Android natively, but react-native-web doesn't resolve 'System' to the
// Apple stack — set it explicitly there so web (used for dev screenshots)
// still reads as SF Pro / -apple-system.
export const FONT_FAMILY = Platform.select({
  web: '-apple-system, BlinkMacSystemFont, "SF Pro Display", Helvetica, Arial, sans-serif',
  default: 'System',
});

// Category metadata for receipt categorization
// Must stay in sync with RECEIPT_CATEGORIES in apps/backend/src/services/claude.ts
export const CATEGORY_META: Record<string, { icon: string; backgroundColor: string; color: string }> = {
  Groceries: { icon: 'cart', backgroundColor: '#E1F5EE', color: '#0F6E56' },
  Dining: { icon: 'silverware-fork-knife', backgroundColor: '#FEF3C7', color: '#D97706' },
  Transport: { icon: 'bus', backgroundColor: '#EEF2FF', color: '#4F46E5' },
  Entertainment: { icon: 'television', backgroundColor: '#FEE2E2', color: '#DC2626' },
  Health: { icon: 'heart', backgroundColor: '#F0FDF4', color: '#16A34A' },
  Other: { icon: 'dots-horizontal', backgroundColor: '#F3F4F6', color: '#6B7280' },
};

// Budget bar threshold logic per DESIGN_REFERENCE_V2.md Alert Thresholds:
// Under 70% → green (success)
// 70–89% → amber (warning)
// 90%+ → red (danger)
export function budgetBarColor(percentage: number): string {
  if (Number.isNaN(percentage) || percentage < 0) {
    return COLORS.success; // Default to safe state for invalid input
  }
  if (percentage >= 90) {
    return COLORS.danger;
  }
  if (percentage >= 70) {
    return COLORS.warning;
  }
  return COLORS.success;
}

// Password strength meter: Weak = red, Fair = amber, Good/Strong = green.
// Keyed by lib/validation's PasswordStrengthTone (kept as a string union
// here so theme stays free of validation imports). 'none' (empty password)
// uses the empty-bar color.
export const PASSWORD_STRENGTH_COLORS: Record<'danger' | 'warning' | 'success' | 'none', string> = {
  danger: COLORS.danger,
  warning: COLORS.warning,
  success: COLORS.success,
  none: COLORS.border,
};
