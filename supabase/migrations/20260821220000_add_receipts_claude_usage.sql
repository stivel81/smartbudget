-- Persist Claude's token usage per scan, so admin cost/usage tracking
-- (apps/backend/src/routes/admin.ts GET /usage) has real data instead of
-- an approximation. Nullable: older receipts scanned before this column
-- existed have no usage recorded.
ALTER TABLE public.receipts ADD COLUMN claude_usage JSONB;
