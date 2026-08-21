# AI Budget Manager — Claude Code Guide

## What This Project Is
A mobile app where users photograph receipts. Claude AI extracts and categorizes
spending data, then shows a dashboard with budget limits, alerts, and savings plans.

## Monorepo Structure
```
ai-budget-manager/
├── apps/
│   ├── mobile/        # React Native + Expo (iOS & Android)
│   ├── backend/       # Node.js + TypeScript (API + business logic)
│   └── admin/         # Next.js (user management dashboard)
└── packages/
    └── shared/        # Types and utilities shared across apps
```

## Tech Stack
- **Mobile**: React Native, Expo, TypeScript
- **AI**: Claude Haiku 4.5 API (receipt OCR + financial insights)
- **Database**: Supabase (PostgreSQL) — hosted project (ref `nuhfxmjytgeyarpkhsav`)
- **Auth**: Supabase Auth (email, Google, Apple)
- **Backend**: Node.js + TypeScript + Express
- **Admin**: Next.js deployed on Vercel
- **CI/CD**: GitHub Actions + Expo EAS

## Database Tables
- `profiles` — extends Supabase auth.users
- `receipts` — raw scan data + Claude OCR output
- `transactions` — extracted line items from receipts
- `categories` — spending categories per user
- `budgets` — monthly limits + alert thresholds per category

## Environment Variables
Secrets live in .env files (never committed). See .env.example for required keys.

Mobile (apps/mobile/.env.local):
- EXPO_PUBLIC_SUPABASE_URL
- EXPO_PUBLIC_SUPABASE_ANON_KEY

Backend (apps/backend/.env):
- SUPABASE_URL
- SUPABASE_SERVICE_KEY
- ANTHROPIC_API_KEY
- PORT

## Dev Setup
Requires: Node.js 20+, Supabase CLI

Uses the hosted Supabase project (no local Docker DB). `SUPABASE_URL` /
`EXPO_PUBLIC_SUPABASE_URL` in .env files must point at the hosted project's
API URL, not localhost.

```bash
cd apps/backend && npx ts-node src/index.ts   # Terminal 1
cd apps/mobile && npx expo start              # Terminal 2
```

Supabase Studio (visual DB admin): https://supabase.com/dashboard/project/nuhfxmjytgeyarpkhsav

Repo isn't linked to the hosted project yet — run `supabase link --project-ref nuhfxmjytgeyarpkhsav`
before using `supabase db push` / `db pull` / `migration up`.

## Key Conventions
- All code in TypeScript — no plain .js files
- Use `supabase` client from `packages/shared/lib/supabase.ts`
- Row Level Security (RLS) enabled on all tables — users only access their own data
- API routes prefix: `/api/v1/`
- Branch strategy: dev → staging → main (never commit directly to main)

## Current Phase
MVP — Phase 1 of 4. Focus: core receipt scanning, basic dashboard, auth.

## Claude AI Integration
Receipt scanning flow:
1. User captures photo in mobile app
2. Backend sends image to Claude Haiku 4.5 as base64
3. Claude returns structured JSON: merchant, total, line items, category
4. Backend saves to `receipts` + `transactions` tables
5. Mobile app refreshes dashboard

Prompt pattern (in apps/backend/src/services/claude.ts):
```
Analyze this receipt image and return JSON only:
{
  "merchant": string,
  "total": number,
  "date": string,
  "items": [{ "name": string, "amount": number, "category": string }]
}
```

## What NOT to Do
- Never put API keys in this file or any committed file
- Never bypass RLS policies for convenience
- Never call Claude API directly from the mobile app (always via backend)
- Never commit directly to main branch
