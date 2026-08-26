-- Add purpose and driver_name columns to receipt_header.
--
-- Purpose replaces the remarks field semantically (remarks is repurposed
-- to hold the material unloading purpose for the security gate mail).
-- Driver name captures the person delivering the material (by vehicle or
-- by hand) and is used in the Security Gate Entry mail template.

begin;

ALTER TABLE public.receipt_header
  ADD COLUMN IF NOT EXISTS purpose TEXT,
  ADD COLUMN IF NOT EXISTS driver_name TEXT;

commit;
