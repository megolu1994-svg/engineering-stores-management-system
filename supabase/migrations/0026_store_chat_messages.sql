-- Migration 0026: Create store_chat_messages table for store operations logbook and chat
-- Allows store personnel to post comments, log daily activities, and upload photographs
-- of materials, locations, physical paper slips, and documents.

BEGIN;

CREATE TABLE IF NOT EXISTS public.store_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  author_name TEXT NOT NULL DEFAULT 'Store Staff',
  message TEXT NOT NULL,
  photo_url TEXT,
  category TEXT NOT NULL DEFAULT 'General'
    CHECK (category IN ('General', 'Material', 'Location', 'Document', 'Urgent')),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Index for chronological feed query
CREATE INDEX IF NOT EXISTS idx_store_chat_created_at
  ON public.store_chat_messages (created_at DESC);

-- Index for category filtering
CREATE INDEX IF NOT EXISTS idx_store_chat_category
  ON public.store_chat_messages (category);

-- Enable RLS
ALTER TABLE public.store_chat_messages ENABLE ROW LEVEL SECURITY;

-- Allow read for everyone (anon and authenticated) so all store staff can see updates
DROP POLICY IF EXISTS store_chat_read_policy ON public.store_chat_messages;
CREATE POLICY store_chat_read_policy ON public.store_chat_messages
  FOR SELECT
  USING (true);

-- Allow insert for authenticated and anon roles
DROP POLICY IF EXISTS store_chat_insert_policy ON public.store_chat_messages;
CREATE POLICY store_chat_insert_policy ON public.store_chat_messages
  FOR INSERT
  WITH CHECK (true);

-- Allow delete for all store staff to manage logbook
DROP POLICY IF EXISTS store_chat_delete_policy ON public.store_chat_messages;
CREATE POLICY store_chat_delete_policy ON public.store_chat_messages
  FOR DELETE
  USING (true);

-- Explicit grants to authenticated and anon
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'store_chat_messages'
  ) THEN
    GRANT ALL ON public.store_chat_messages TO authenticated;
    GRANT ALL ON public.store_chat_messages TO anon;
  END IF;
END $$;

COMMIT;
