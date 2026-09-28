// Pure auth-form validation shared by Login, Signup, ForgotPassword and Settings.
// Each validate* returns the user-facing error message, or null when valid.
// Rules mirror the backend (apps/backend/src/routes/auth.ts), which remains
// the source of truth — these exist to fail fast with a friendly message.

export const MIN_PASSWORD_LENGTH = 8;
export const RESET_CODE_LENGTH = 6;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return 'Email is required';
  if (!isValidEmail(trimmed)) return 'Please enter a valid email';
  return null;
}

/** Rules for choosing a new password (signup and password reset). */
export function validateNewPassword(password: string): string | null {
  if (!password.trim()) return 'Password is required';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

export const SAME_PASSWORD_MESSAGE = 'New password must be different from your current password';

/**
 * Settings → Change password. Checks, in order: current password present,
 * new password meets the signup/reset rules, and differs from the current
 * one (the backend enforces all three too).
 */
export function validatePasswordChange(currentPassword: string, newPassword: string): string | null {
  if (!currentPassword) return 'Current password is required';
  const ruleError = validateNewPassword(newPassword);
  if (ruleError) return ruleError;
  if (newPassword === currentPassword) return SAME_PASSWORD_MESSAGE;
  return null;
}

/** Keep only digits, capped at the code length — for the code input's onChangeText. */
export function sanitizeResetCode(text: string): string {
  return text.replace(/\D/g, '').slice(0, RESET_CODE_LENGTH);
}

export function validateResetCode(code: string): string | null {
  if (!code) return 'Code is required';
  if (!new RegExp(`^\\d{${RESET_CODE_LENGTH}}$`).test(code)) {
    return `Enter the ${RESET_CODE_LENGTH}-digit code from your email`;
  }
  return null;
}

export interface PasswordStrength {
  /** 0 (empty) to 4 — the number of filled strength bars. */
  strength: number;
  label: '' | 'Weak' | 'Fair' | 'Good' | 'Strong';
}

export function calculatePasswordStrength(password: string): PasswordStrength {
  if (!password) return { strength: 0, label: '' };

  let score = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score <= 1) return { strength: 1, label: 'Weak' };
  if (score <= 2) return { strength: 2, label: 'Fair' };
  if (score <= 3) return { strength: 3, label: 'Good' };
  return { strength: 4, label: 'Strong' };
}
