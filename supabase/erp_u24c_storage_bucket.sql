-- erp_u24c_storage_bucket.sql
-- Creates the chat-attachments Storage bucket for Connect file uploads.
-- Run this in Supabase SQL Editor (safe to re-run — ON CONFLICT DO NOTHING).
--
-- What this does:
--   1. Creates the bucket (public = true so image previews work without a signed URL)
--   2. Sets 25 MB file size limit
--   3. Restricts MIME types to images, PDFs, Word/Excel docs, plain text
--   4. Adds RLS storage policies: authenticated users can upload/view/delete their own files

-- ─── 1. Bucket ────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-attachments',
  'chat-attachments',
  true,
  26214400,   -- 25 MB in bytes
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- ─── 2. Storage RLS policies ──────────────────────────────────────────────────
-- DROP first so this script is safe to re-run
DROP POLICY IF EXISTS "Authenticated users can upload chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Public read chat attachments"                     ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own chat attachments"            ON storage.objects;

-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload chat attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments');

-- Allow anyone to view/download files (bucket is public)
CREATE POLICY "Public read chat attachments"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'chat-attachments');

-- Allow users to delete only their own uploads
CREATE POLICY "Users can delete own chat attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chat-attachments' AND owner = auth.uid()::text);
