# Password reset — Supabase setup

The app resets passwords with an emailed **6-digit code** (no deep links):

1. `POST /api/v1/auth/forgot-password` → `supabase.auth.resetPasswordForEmail(email)` sends the email.
2. The user types the code in the app → `POST /api/v1/auth/reset-password` → `verifyOtp({ type: 'recovery' })` + `updateUser({ password })`.

## One manual step (hosted project dashboard)

Supabase's default "Reset Password" email only contains a magic link, so the
user would never see a code. Change the template once:

**Supabase Dashboard → Authentication → Email Templates → "Reset Password"**
(project `nuhfxmjytgeyarpkhsav`)

The body **must include `{{ .Token }}`** — that renders the 6-digit code.
Don't include `{{ .ConfirmationURL }}`: the app doesn't handle deep links.

Suggested subject: `Your SmartBudget password reset code`

Suggested body:

```html
<h2>Reset your SmartBudget password</h2>
<p>Enter this code in the SmartBudget app to choose a new password:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px;">{{ .Token }}</p>
<p>This code expires in 1 hour and can only be used once.</p>
<p>If you didn't ask to reset your password, you can ignore this email — your password won't change.</p>
```

## Settings to check (defaults are fine)

- **Authentication → Providers → Email → Email OTP Length**: must be **6**
  (the app and backend both require exactly 6 digits).
- **Email OTP Expiration**: default 3600 s matches the "expires in 1 hour" text above.
- Supabase allows one recovery email per user every 60 s; the app's
  "Resend code" button has a matching 60 s cooldown.
- The built-in Supabase SMTP sender is heavily rate limited and meant for
  development. Configure custom SMTP (Authentication → SMTP Settings) before
  real users rely on password reset.

## Verifying

Run the app → Login → "Forgot password?" → enter your email → check the
inbox for a 6-digit code → enter it with a new password. You should land
signed in on the Dashboard.
