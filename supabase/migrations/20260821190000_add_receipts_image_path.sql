-- Path to the receipt photo in the 'receipts' storage bucket
-- (bucket created in the next migration). Nullable: scans can exist
-- without a stored image if the upload step fails.
ALTER TABLE public.receipts ADD COLUMN image_path TEXT;
