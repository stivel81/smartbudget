-- Private bucket for receipt photos. Objects are keyed {user_id}/{receipt_id}.jpg
-- so ownership can be enforced via path-prefix RLS policies. Defense in depth:
-- the backend always uploads/deletes via the service-role client, which bypasses
-- these policies, but they keep the bucket safe if ever accessed with a user token.
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "Users can select their own receipt images"
on storage.objects for select
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can insert their own receipt images"
on storage.objects for insert
with check (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete their own receipt images"
on storage.objects for delete
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);
