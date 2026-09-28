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
  // Additional colors for UI elements
  scanLineGreen: '#22c55e',
  scanLineGlow: 'rgba(34, 197, 94, 0.8)',
  chipBg: '#fafafa',
  signOutBg: '#fee2e2',
  signOutBorder: '#fca5a5',
  // Aliases for backward compatibility
  card: '#ffffff',
  primary: '#000000',
  // Additional UI element colors
  alertTextColor: '#92400e',
  successBg: '#f0fdf4',
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
