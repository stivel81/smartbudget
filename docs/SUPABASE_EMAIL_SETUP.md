# Supabase email setup (signup confirmation + password reset)

The app never uses email links or deep links. Both auth emails carry a
**6-digit code** that the user types into the app:

| Flow | Email template | Backend routes |
| --- | --- | --- |
| Confirm a new account | **Confirm sign up** | `POST /api/v1/auth/signup` → Supabase sends the code; `POST /api/v1/auth/verify-signup` → `verifyOtp({ type: 'signup' })`; `POST /api/v1/auth/resend-signup` → `auth.resend({ type: 'signup' })` |
| Reset a forgotten password | **Reset Password** | `POST /api/v1/auth/forgot-password` → `resetPasswordForEmail(email)`; `POST /api/v1/auth/reset-password` → `verifyOtp({ type: 'recovery' })` + `updateUser({ password })` |

Both redeem routes return a session in the same shape as `/login`, so the app
signs the user straight in. `resend-signup` and `forgot-password` always answer
the same generic 200 (no account enumeration), and all four routes are rate
limited to 5 requests / 15 min per IP.

## Manual step: email templates (hosted project dashboard)

Supabase's default templates only contain a link
(`{{ .ConfirmationURL }}`) that redirects to the Site URL — for this project
that is `http://localhost:3000`, which answers "Cannot GET /". Change both
templates once:

**Supabase Dashboard → Authentication → Email Templates**
(project `nuhfxmjytgeyarpkhsav`)

Each body **must include `{{ .Token }}`** — that renders the 6-digit code.
**Don't include `{{ .ConfirmationURL }}`**: the app doesn't handle links, and a
clicked link would land on the "Cannot GET /" page.

### "Confirm sign up"

Subject:

```
Confirm your SmartBudget account
```

Body:

```html
<h2>Welcome to SmartBudget</h2>
<p>Enter this code in the SmartBudget app to confirm your email address:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px;">{{ .Token }}</p>
<p>This code expires in 1 hour and can only be used once.</p>
<p>If you didn't create a SmartBudget account, you can ignore this email.</p>
```

### "Reset Password"

Subject:

```
Your SmartBudget password reset code
```

Body:

```html
<h2>Reset your SmartBudget password</h2>
<p>Enter this code in the SmartBudget app to choose a new password:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px;">{{ .Token }}</p>
<p>This code expires in 1 hour and can only be used once.</p>
<p>If you didn't ask to reset your password, you can ignore this email — your password won't change.</p>
```

## Settings to check (defaults are fine)

- **Authentication → Sign In / Providers → Email → Confirm email**: must be
  **on** (signup then requires the code before the first sign-in).
- **Email OTP Length**: must be **6** (the app and backend both require exactly
  6 digits).
- **Email OTP Expiration**: default 3600 s matches the "expires in 1 hour" text
  above.
- Supabase sends at most one auth email per user every 60 s; the app's
  "Resend code" buttons (Verify email and Forgot password) have a matching
  60 s cooldown. A faster resend would look successful (generic 200) but send
  nothing.

## Email delivery (SMTP)

**Custom SMTP is configured** (Authentication → SMTP Settings) to send through
**Gmail** as `smartbudget.app.support@gmail.com`, so emails no longer come from
Supabase's built-in development sender.

Gmail is fine for development and a small beta, but it has hard limits:

- A personal Gmail account can send to roughly **500 recipients per day**
  (Google Workspace: about 2,000/day). Over the limit, Gmail blocks sending for
  up to 24 hours — every signup code and reset code fails during that time
  (the app still shows its generic "code sent" message, because the backend
  deliberately hides delivery errors).
- Gmail SMTP needs an **app password** (2-Step Verification on the account);
  changing the Google password revokes it and silently stops all auth email.
- Mail from a consumer `@gmail.com` address sent via a third party is more
  likely to land in spam, and SPF/DKIM/DMARC can't be set up for a domain you
  don't own.
- Supabase applies its own **email rate limit** for custom SMTP
  (Authentication → Rate Limits → "Rate limit for sending emails", default
  30/hour). Raise it deliberately, keeping it under Gmail's daily cap.

**Before launch, move to a real transactional email provider** (e.g. Resend,
Postmark, Amazon SES or SendGrid) with a sending domain you own and
SPF/DKIM/DMARC configured, then update the SMTP settings. No code changes are
needed — only the SMTP credentials and sender address.

## Verifying

- **Signup:** Sign up in the app → you land on "Check your email" → enter the
  6-digit code from the inbox → you're signed in on the Dashboard, greeted by
  first name.
- **Unverified sign-in:** Sign in with an account that was never confirmed →
  the app opens "Check your email" and sends a fresh code.
- **Password reset:** Login → "Forgot password?" → enter your email → enter the
  6-digit code with a new password → you're signed in on the Dashboard.
