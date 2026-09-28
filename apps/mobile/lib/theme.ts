// Apple-style (iOS HIG) design tokens — see docs/DESIGN_REFERENCE_V2.md.
// Shared across all screens so the palette/type scale stays consistent.
import { Platform } from 'react-native';

export const COLORS = {
  background: '#f2f2f7',
  surface: '#ffffff',
  textPrimary: '#000000',
  textSecondary: '#8e8e93',
  placeholder: '#c7c7cc',
  border: '#e5e5ea',
  hero: '#000000',
  button: '#000000',
  buttonText: '#ffffff',
  success: '#30d158',
  warning: '#ff9f0a',
  danger: '#ff3b30',
  alertBg: '#fff3cd',
  alertBorder: '#ffd60a',
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
