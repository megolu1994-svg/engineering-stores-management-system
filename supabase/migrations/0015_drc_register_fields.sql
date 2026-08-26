-- Add 5 columns to receipt_header to complete the 24-column DRC Register.
--
-- DRC creation fields (entered at time of DRC):
--   tax_invoice_value  – numeric invoice amount
--   msme_type          – 'MSME' or 'General'
--
-- Post-workflow fields (entered after inspection / GRN / VIM):
--   important_note     – free-text note
--   delivery_location  – where material was delivered (e.g. Ware House, Drum Filling Yard)
--   vim_approval       – VIM portal approval reference or date

BEGIN;

ALTER TABLE public.receipt_header
  ADD COLUMN IF NOT EXISTS tax_invoice_value NUMERIC,
  ADD COLUMN IF NOT EXISTS msme_type TEXT,
  ADD COLUMN IF NOT EXISTS important_note TEXT,
  ADD COLUMN IF NOT EXISTS delivery_location TEXT,
  ADD COLUMN IF NOT EXISTS vim_approval TEXT;

COMMIT;
