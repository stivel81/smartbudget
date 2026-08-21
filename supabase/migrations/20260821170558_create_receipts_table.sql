-- Create receipts table (scaffolding phase: raw Claude response stored as-is,
-- not yet parsed into a structured transactions schema)
CREATE TABLE public.receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX receipts_user_id_idx ON public.receipts(user_id);

-- Enable RLS on receipts table
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

-- Policy: users can select only their own receipts
CREATE POLICY "Users can select their own receipts"
ON public.receipts
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: users can insert only their own receipts
CREATE POLICY "Users can insert their own receipts"
ON public.receipts
FOR INSERT
WITH CHECK (auth.uid() = user_id);
