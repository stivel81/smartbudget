import { Router, Request, Response } from 'express';
import { supabaseAuth, createIsolatedAuthClient } from '@smartbudget/shared/lib/supabaseAuth';
import { supabase } from '@smartbudget/shared/lib/supabase';
import { requireAuth, AuthedRequest } from '../middleware/requireAuth';

const router = Router();

// Validation helpers
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const MIN_PASSWORD_LENGTH = 8;

// Single source of truth for password rules — used by both /signup and
// /reset-password so the two can never drift apart. Returns the
// user-facing error message, or null when the password is acceptable.
export const passwordRuleError = (password: string): string | null => {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`;
  }
  return null;
};

// Emailed one-time codes (password reset, signup confirmation) are 6 digits.
const isValidOtpCode = (code: string): boolean => /^\d{6}$/.test(code);

const FORGOT_PASSWORD_MESSAGE =
  'If an account exists for that email, a 6-digit reset code has been sent.';
export const RESEND_SIGNUP_MESSAGE =
  'If that email is waiting to be verified, a new 6-digit code has been sent.';
const INVALID_CODE_MESSAGE = 'Invalid or expired code';

// Machine-readable error code the app keys off (never the message text) to
// send an unconfirmed user to the verify-email screen. Only returned after
// Supabase has accepted the password, so it reveals nothing to someone who
// doesn't already know the account's credentials.
export const EMAIL_NOT_CONFIRMED_CODE = 'email_not_confirmed';

interface SessionLike {
  access_token: string;
  refresh_token: string;
  /** Access-token lifetime in seconds (Supabase: 3600 by default). */
  expires_in?: number;
  /** Access-token expiry, unix seconds. */
  expires_at?: number;
}

interface UserLike {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown> | null;
}

/**
 * The display name stored at signup (user_metadata.name, the same value the
 * profiles.name trigger copies). Trimmed; null when absent or not a string.
 */
export const displayNameOf = (user: UserLike): string | null => {
  const name = user.user_metadata?.name;
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  return trimmed ? trimmed : null;
};

const positiveNumberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

/**
 * When the access token expires, unix seconds: Supabase's expires_at, else
 * derived from expires_in; null when Supabase reported neither.
 */
export const sessionExpiresAt = (session: SessionLike, nowMs: number = Date.now()): number | null => {
  const expiresAt = positiveNumberOrNull(session.expires_at);
  if (expiresAt !== null) return expiresAt;
  const expiresIn = positiveNumberOrNull(session.expires_in);
  return expiresIn !== null ? Math.floor(nowMs / 1000) + expiresIn : null;
};

// The one session shape every sign-in route returns (/login, /refresh,
// /reset-password, /verify-signup), so the app can treat them identically.
// expires_at (unix seconds) / expires_in (seconds) let the app renew the
// access token shortly before it expires; the app prefers expires_in, which
// doesn't depend on the phone's clock agreeing with the server's.
export const sessionPayload = (session: SessionLike, user: UserLike) => ({
  session: {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: sessionExpiresAt(session),
    expires_in: positiveNumberOrNull(session.expires_in),
    user: {
      id: user.id,
      email: user.email,
      name: displayNameOf(user),
    },
  },
});

interface SignupRequest {
  email?: string;
  password?: string;
  name?: string;
}

interface LoginRequest {
  email?: string;
  password?: string;
}

interface ForgotPasswordRequest {
  email?: unknown;
}

interface ResetPasswordRequest {
  email?: unknown;
  code?: unknown;
  newPassword?: unknown;
}

interface VerifySignupRequest {
  email?: unknown;
  code?: unknown;
}

interface ResendSignupRequest {
  email?: unknown;
}

interface ChangePasswordRequest {
  currentPassword?: unknown;
  newPassword?: unknown;
}

export const WRONG_CURRENT_PASSWORD_MESSAGE = 'Current password is incorrect';
export const SAME_PASSWORD_MESSAGE = 'New password must be different from your current password';

interface RefreshRequest {
  refresh_token?: string;
}

// POST /api/v1/auth/signup
router.post('/signup', async (req: Request, res: Response) => {
  const { email, password, name } = req.body as SignupRequest;

  // Validate input
  if (!email || !password || !name) {
    return res.status(400).json({
      error: 'Missing required fields: email, password, name',
      status: 400,
    });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({
      error: 'Invalid email format',
      status: 400,
    });
  }

  const passwordError = passwordRuleError(password);
  if (passwordError) {
    return res.status(400).json({
      error: passwordError,
      status: 400,
    });
  }

  try {
    // Real signup: Supabase sends a confirmation email and the account
    // can't log in until it's verified (Auth setting "Confirm email",
    // on by default) — replaces the previous admin.createUser(email_confirm:
    // true) auto-confirm shortcut.
    const { data, error } = await supabaseAuth.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });

    if (error) {
      // Map Supabase errors to appropriate HTTP status codes
      if (error.message.includes('already registered') || error.message.includes('User already exists')) {
        return res.status(400).json({
          error: 'Email already registered',
          status: 400,
        });
      }
      return res.status(400).json({
        error: error.message,
        status: 400,
      });
    }

    // Anti-enumeration behavior: signing up with an email that's already
    // registered and confirmed returns 200 with a user that has no
    // identities, rather than an error.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      return res.status(400).json({
        error: 'Email already registered',
        status: 400,
      });
    }

    // Return user info (don't leak tokens)
    if (data.user) {
      return res.status(201).json({
        user: {
          id: data.user.id,
          email: data.user.email,
        },
      });
    }

    return res.status(400).json({
      error: 'Failed to create user',
      status: 400,
    });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      status: 500,
    });
  }
});

// POST /api/v1/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as LoginRequest;

  // Validate input
  if (!email || !password) {
    return res.status(400).json({
      error: 'Missing required fields: email, password',
      status: 400,
    });
  }

  try {
    // Authenticate user
    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      if (
        (error as { code?: string }).code === EMAIL_NOT_CONFIRMED_CODE ||
        error.message.includes('Email not confirmed')
      ) {
        return res.status(401).json({
          error: 'Please verify your email before signing in — enter the 6-digit code we emailed you.',
          status: 401,
          code: EMAIL_NOT_CONFIRMED_CODE,
        });
      }
      if ((error as { code?: string }).code === 'user_banned') {
        return res.status(403).json({
          error: 'This account has been suspended.',
          status: 403,
        });
      }
      // Invalid credentials should return 401, not 400
      if (error.message.includes('Invalid login credentials') || error.status === 400) {
        return res.status(401).json({
          error: 'Invalid email or password',
          status: 401,
        });
      }
      return res.status(401).json({
        error: 'Authentication failed',
        status: 401,
      });
    }

    if (!data.session) {
      return res.status(401).json({
        error: 'Failed to create session',
        status: 401,
      });
    }

    return res.status(200).json(sessionPayload(data.session, data.user));
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      status: 500,
    });
  }
});

// POST /api/v1/auth/refresh — exchange a refresh token for a new session,
// so the mobile app can silently renew an expired access token instead of
// forcing a full re-login. Mobile never talks to Supabase directly, so this
// wraps supabaseAuth.auth.refreshSession() the same way /login wraps
// signInWithPassword().
router.post('/refresh', async (req: Request, res: Response) => {
  const { refresh_token } = req.body as RefreshRequest;

  if (!refresh_token) {
    return res.status(400).json({
      error: 'Missing required field: refresh_token',
      status: 400,
    });
  }

  try {
    const { data, error } = await supabaseAuth.auth.refreshSession({ refresh_token });

    if (error || !data.session || !data.user) {
      return res.status(401).json({
        error: 'Invalid or expired refresh token',
        status: 401,
      });
    }

    return res.status(200).json(sessionPayload(data.session, data.user));
  } catch (err) {
    console.error('Refresh error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      status: 500,
    });
  }
});

// POST /api/v1/auth/forgot-password — email the user a 6-digit recovery
// code (the "Reset Password" email template must render {{ .Token }}, see
// docs/SUPABASE_EMAIL_SETUP.md). No deep links: the code is typed into the
// app and redeemed via /reset-password.
//
// Anti-enumeration: every well-formed request gets the same 200 + generic
// message whether or not the account exists, and whatever Supabase says
// (unknown user, its own email rate limit, outage). Failures are logged
// server-side only. Rate limited per IP in index.ts.
router.post('/forgot-password', async (req: Request, res: Response) => {
  const { email } = req.body as ForgotPasswordRequest;

  if (typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({
      error: 'Missing required field: email',
      status: 400,
    });
  }

  const normalizedEmail = email.trim();
  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({
      error: 'Invalid email format',
      status: 400,
    });
  }

  try {
    const { error } = await supabaseAuth.auth.resetPasswordForEmail(normalizedEmail);
    if (error) {
      console.error('Forgot password: Supabase error (hidden from client):', error);
    }
  } catch (err) {
    console.error('Forgot password: unexpected error (hidden from client):', err);
  }

  return res.status(200).json({ message: FORGOT_PASSWORD_MESSAGE });
});

// POST /api/v1/auth/reset-password — redeem the emailed 6-digit code and set
// a new password, then return a session (same shape as /login) so the app
// can sign straight in.
//
// verifyOtp() stores the recovery session *on the client instance* and
// updateUser() acts on whatever session that instance holds. Both run on a
// fresh per-request client (createIsolatedAuthClient) — never the shared
// supabaseAuth — so concurrent resets can't see each other's session (the
// same class of bug fixed in 9062cae for getUser/signInWithPassword).
router.post('/reset-password', async (req: Request, res: Response) => {
  const { email, code, newPassword } = req.body as ResetPasswordRequest;

  if (
    typeof email !== 'string' || !email.trim() ||
    typeof code !== 'string' || !code.trim() ||
    typeof newPassword !== 'string' || !newPassword
  ) {
    return res.status(400).json({
      error: 'Missing required fields: email, code, newPassword',
      status: 400,
    });
  }

  const normalizedEmail = email.trim();
  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({
      error: 'Invalid email format',
      status: 400,
    });
  }

  const normalizedCode = code.trim();
  if (!isValidOtpCode(normalizedCode)) {
    return res.status(400).json({
      error: 'Code must be 6 digits',
      status: 400,
    });
  }

  const passwordError = passwordRuleError(newPassword);
  if (passwordError) {
    return res.status(400).json({
      error: passwordError,
      status: 400,
    });
  }

  try {
    const client = createIsolatedAuthClient();

    const { data: otpData, error: otpError } = await client.auth.verifyOtp({
      email: normalizedEmail,
      token: normalizedCode,
      type: 'recovery',
    });

    if (otpError || !otpData.session || !otpData.user) {
      if (otpError) console.warn('Reset password: OTP verification failed:', otpError.message);
      return res.status(400).json({
        error: INVALID_CODE_MESSAGE,
        status: 400,
      });
    }

    const { error: updateError } = await client.auth.updateUser({ password: newPassword });

    if (updateError) {
      const code = (updateError as { code?: string }).code;
      // User-correctable rejections from Supabase's own password policy.
      if (code === 'same_password' || code === 'weak_password') {
        return res.status(400).json({
          error: updateError.message,
          status: 400,
        });
      }
      console.error('Reset password: updateUser failed:', updateError);
      return res.status(500).json({
        error: 'Failed to update password',
        status: 500,
      });
    }

    return res.status(200).json(sessionPayload(otpData.session, otpData.user));
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      status: 500,
    });
  }
});

// POST /api/v1/auth/verify-signup — confirm a new account with the 6-digit
// code from the "Confirm sign up" email (the template must render
// {{ .Token }}, see docs/SUPABASE_EMAIL_SETUP.md), then return a session
// in the same shape as /login so the app signs straight in.
//
// verifyOtp() stores the resulting session on the client instance, so it
// runs on a fresh per-request client (createIsolatedAuthClient) — never the
// shared supabaseAuth (the bug class fixed in 9062cae). Any Supabase
// rejection (wrong, expired, already used, unknown email) collapses into one
// generic 400. Rate limited per IP in index.ts (5/15min) to cap code guessing.
router.post('/verify-signup', async (req: Request, res: Response) => {
  const { email, code } = req.body as VerifySignupRequest;

  if (
    typeof email !== 'string' || !email.trim() ||
    typeof code !== 'string' || !code.trim()
  ) {
    return res.status(400).json({
      error: 'Missing required fields: email, code',
      status: 400,
    });
  }

  const normalizedEmail = email.trim();
  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({
      error: 'Invalid email format',
      status: 400,
    });
  }

  const normalizedCode = code.trim();
  if (!isValidOtpCode(normalizedCode)) {
    return res.status(400).json({
      error: 'Code must be 6 digits',
      status: 400,
    });
  }

  try {
    const client = createIsolatedAuthClient();
    const { data, error } = await client.auth.verifyOtp({
      email: normalizedEmail,
      token: normalizedCode,
      type: 'signup',
    });

    if (error || !data.session || !data.user) {
      if (error) console.warn('Verify signup: OTP verification failed:', error.message);
      return res.status(400).json({
        error: INVALID_CODE_MESSAGE,
        status: 400,
      });
    }

    return res.status(200).json(sessionPayload(data.session, data.user));
  } catch (err) {
    console.error('Verify signup error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      status: 500,
    });
  }
});

// POST /api/v1/auth/resend-signup — email a fresh signup confirmation code.
//
// Anti-enumeration: every well-formed request gets the same 200 + generic
// message whether the email is unknown, pending, or already confirmed, and
// whatever Supabase says (its own 60s per-user limit, outage). Failures are
// logged server-side only. Rate limited per IP in index.ts (5/15min).
router.post('/resend-signup', async (req: Request, res: Response) => {
  const { email } = req.body as ResendSignupRequest;

  if (typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({
      error: 'Missing required field: email',
      status: 400,
    });
  }

  const normalizedEmail = email.trim();
  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({
      error: 'Invalid email format',
      status: 400,
    });
  }

  try {
    const { error } = await supabaseAuth.auth.resend({ type: 'signup', email: normalizedEmail });
    if (error) {
      console.error('Resend signup: Supabase error (hidden from client):', error);
    }
  } catch (err) {
    console.error('Resend signup: unexpected error (hidden from client):', err);
  }

  return res.status(200).json({ message: RESEND_SIGNUP_MESSAGE });
});

// POST /api/v1/auth/change-password — signed-in user changes their password.
//
// 1. The current password is verified by signing in with the caller's email
//    (taken from their verified access token, never from the body) on a
//    fresh per-request client (createIsolatedAuthClient). signInWithPassword
//    stores the resulting session on the client instance, so doing it on the
//    shared supabaseAuth would leak sessions across concurrent requests (the
//    bug class fixed in 9062cae). The throwaway session it creates is then
//    revoked (scope 'local' — only that session, not the user's app session).
// 2. The new password is set via the admin API for the token's user id.
//
// A wrong current password gets one generic 400; nothing else about the
// Supabase response is exposed. Rate limited per IP in index.ts (5/15min),
// which also caps current-password guessing with a stolen access token.
router.post('/change-password', requireAuth, async (req: AuthedRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body as ChangePasswordRequest;

  if (
    typeof currentPassword !== 'string' || !currentPassword ||
    typeof newPassword !== 'string' || !newPassword
  ) {
    return res.status(400).json({
      error: 'Missing required fields: currentPassword, newPassword',
      status: 400,
    });
  }

  const passwordError = passwordRuleError(newPassword);
  if (passwordError) {
    return res.status(400).json({
      error: passwordError,
      status: 400,
    });
  }

  if (newPassword === currentPassword) {
    return res.status(400).json({
      error: SAME_PASSWORD_MESSAGE,
      status: 400,
    });
  }

  const userId = req.userId!;
  const email = req.userEmail;
  if (!email) {
    // Not reachable for email/password accounts (the only kind Phase 1 has).
    console.error('Change password: authenticated user has no email:', userId);
    return res.status(500).json({
      error: 'Failed to change password',
      status: 500,
    });
  }

  try {
    const client = createIsolatedAuthClient();
    const { data: signInData, error: signInError } = await client.auth.signInWithPassword({
      email,
      password: currentPassword,
    });

    if (signInError) {
      const code = (signInError as { code?: string }).code;
      if (code === 'invalid_credentials' || signInError.message?.includes('Invalid login credentials')) {
        return res.status(400).json({
          error: WRONG_CURRENT_PASSWORD_MESSAGE,
          status: 400,
        });
      }
      console.error('Change password: verifying current password failed:', signInError);
      return res.status(500).json({
        error: 'Failed to change password',
        status: 500,
      });
    }

    if (!signInData.user || signInData.user.id !== userId) {
      // Should be impossible (the email came from this user's token) — refuse
      // rather than change a password we can't tie to the caller.
      console.error('Change password: verified user does not match token user:', userId);
      return res.status(500).json({
        error: 'Failed to change password',
        status: 500,
      });
    }

    if (signInData.session) {
      // Best-effort: drop the throwaway session the verification created.
      const { error: signOutError } = await client.auth.admin.signOut(
        signInData.session.access_token,
        'local'
      );
      if (signOutError) {
        console.warn('Change password: could not revoke verification session:', signOutError.message);
      }
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (updateError) {
      const code = (updateError as { code?: string }).code;
      // User-correctable rejections from Supabase's own password policy.
      if (code === 'same_password' || code === 'weak_password') {
        return res.status(400).json({
          error: updateError.message,
          status: 400,
        });
      }
      console.error('Change password: updateUserById failed:', updateError);
      return res.status(500).json({
        error: 'Failed to change password',
        status: 500,
      });
    }

    return res.status(200).json({ message: 'Password updated' });
  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      status: 500,
    });
  }
});

interface LogoutRequest {
  refresh_token?: unknown;
}

/**
 * Revoke the session behind these tokens. Returns whether anything was
 * revoked; never throws. Failures are logged here, never shown to the user.
 *
 * 1. The access token, when it is still valid: admin.signOut(jwt) revokes
 *    its session (scope 'global', unchanged from before).
 * 2. Otherwise (typically: the access token already expired — admin.signOut
 *    then fails with "invalid JWT ... token is expired"), the refresh token:
 *    exchange it for a fresh session and sign *that* out. The exchange also
 *    consumes the refresh token (Supabase rotates them), and the sign-out
 *    revokes the session it belongs to, so neither the old nor the new
 *    refresh token can be used again. It runs on a fresh per-request client
 *    (createIsolatedAuthClient): refreshSession() stores the session on the
 *    client instance, which must never be the shared one (see 9062cae).
 */
async function revokeSession(accessToken: string, refreshToken: string): Promise<boolean> {
  if (accessToken) {
    try {
      const { error } = await supabaseAuth.auth.admin.signOut(accessToken);
      if (!error) return true;
      console.warn(
        `Logout: access token rejected (${error.message})${refreshToken ? ', revoking via the refresh token' : ''}`
      );
    } catch (err) {
      console.warn('Logout: signing out the access token threw:', err);
    }
  }

  if (refreshToken) {
    try {
      const client = createIsolatedAuthClient();
      const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
      if (error || !data.session) {
        console.warn(`Logout: refresh token rejected (${error?.message ?? 'no session'})`);
        return false;
      }
      const { error: signOutError } = await client.auth.admin.signOut(data.session.access_token);
      if (!signOutError) return true;
      console.error('Logout: signing out the refreshed session failed:', signOutError);
    } catch (err) {
      console.error('Logout: revoking via the refresh token threw:', err);
    }
  }

  return false;
}

// POST /api/v1/auth/logout — revoke the app's session server-side.
//
// Accepts the access token (Authorization: Bearer) and/or the refresh token
// (body.refresh_token); the app sends both, so a session whose access token
// already expired is still revoked (see revokeSession). Idempotent: once the
// request names a session it always answers 200, whether or not anything
// was left to revoke (already signed out, tokens expired/revoked) — the app
// clears its local session regardless, and failures are only logged.
router.post('/logout', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const accessToken =
    authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';
  const { refresh_token } = (req.body ?? {}) as LogoutRequest;
  const refreshToken = typeof refresh_token === 'string' ? refresh_token.trim() : '';

  if (!accessToken && !refreshToken) {
    return res.status(400).json({
      error: 'Missing session: send the access token (Authorization header) and/or refresh_token',
      status: 400,
    });
  }

  const revoked = await revokeSession(accessToken, refreshToken);
  if (!revoked) {
    console.error('Logout error: session not revoked (tokens invalid, expired or already revoked)');
  }

  return res.status(200).json({
    message: 'Signed out successfully',
  });
});

export default router;
