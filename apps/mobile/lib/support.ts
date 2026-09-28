// Support contact helpers (Help & Support, Privacy Policy).
import { isValidEmail } from './validation';

export const SUPPORT_EMAIL_SUBJECT = 'SmartBudget support';

/**
 * The configured support address, or null when it is missing or malformed.
 * Must read `process.env.EXPO_PUBLIC_SUPPORT_EMAIL` literally — Expo inlines
 * EXPO_PUBLIC_* variables into the bundle at build time by that exact name.
 * `raw` is injectable for tests.
 */
export function getSupportEmail(raw: string | undefined = process.env.EXPO_PUBLIC_SUPPORT_EMAIL): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed && isValidEmail(trimmed) ? trimmed : null;
}

/** mailto: URL for the support address, with a pre-filled subject. */
export function supportMailtoUrl(email: string, subject: string = SUPPORT_EMAIL_SUBJECT): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}
