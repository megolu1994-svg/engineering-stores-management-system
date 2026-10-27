-- Migration 0025: Add reservation fields and reservation photo to issue_header
-- Supports capturing SAP reservation photographer and creator for offline reconciliation.

BEGIN;

ALTER TABLE public.issue_header
  ADD COLUMN IF NOT EXISTS reservation_created_by TEXT,
  ADD COLUMN IF NOT EXISTS reservation_photo_url TEXT;

-- Grant permissions to authenticated and anon roles
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'issue_header'
  ) THEN
    GRANT ALL ON public.issue_header TO authenticated;
    GRANT ALL ON public.issue_header TO anon;
  END IF;
END $$;

COMMIT;
