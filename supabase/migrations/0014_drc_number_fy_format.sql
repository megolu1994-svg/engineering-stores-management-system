-- Replace the DRC number auto-generation trigger to use financial-year format.
--
-- Old format: DRC/26/000001
-- New format: DRC/26-27/1       (financial year 2026-27, auto-increment)
--
-- Financial year runs 1 April – 31 March:
--   Aug 2026  → FY 2026-27 → prefix DRC/26-27/
--   Feb 2027  → FY 2026-27 → prefix DRC/26-27/
--   Apr 2027  → FY 2027-28 → prefix DRC/27-28/
--
-- The counter finds the highest existing number for the current FY prefix
-- and increments it by 1.  Alphabetic suffixes are stripped on auto-increment
-- (user adds them manually): DRC/26-27/5A → DRC/26-27/6

BEGIN;

CREATE OR REPLACE FUNCTION public.generate_drc_number()
RETURNS TRIGGER AS $$
DECLARE
  current_month  int := EXTRACT(MONTH FROM now());
  current_year   int := EXTRACT(YEAR  FROM now());
  fy_start       int;
  fy_end         int;
  fy_prefix      text;
  last_number    text;
  numeric_part   text;
  next_num       int;
BEGIN
  -- Only auto-generate when drc_number is not already set
  IF NEW.drc_number IS NOT NULL AND NEW.drc_number <> '' THEN
    RETURN NEW;
  END IF;

  -- Determine financial year boundaries
  IF current_month >= 4 THEN
    fy_start := current_year;
    fy_end   := current_year + 1;
  ELSE
    fy_start := current_year - 1;
    fy_end   := current_year;
  END IF;

  fy_prefix := 'DRC/' || substring(fy_start::text, 3, 2) || '-' || substring(fy_end::text, 3, 2) || '/';

  -- Find the highest existing DRC number for this financial year
  SELECT drc_number INTO last_number
  FROM public.receipt_header
  WHERE drc_number LIKE fy_prefix || '%'
  ORDER BY
    -- Extract the leading numeric portion for proper numeric ordering
    (regexp_replace(drc_number, '^' || fy_prefix || '([0-9]*).*$', '\1', 'i'))::bigint NULLS LAST,
    drc_number DESC
  LIMIT 1;

  IF last_number IS NULL THEN
    -- First DRC this financial year
    NEW.drc_number := fy_prefix || '1';
  ELSE
    -- Extract the numeric portion after the prefix, ignoring any trailing alphabetic suffix
    numeric_part := regexp_replace(last_number, '^' || fy_prefix || '([0-9]*).*$', '\1', 'i');

    IF numeric_part = '' OR numeric_part IS NULL THEN
      NEW.drc_number := fy_prefix || '1';
    ELSE
      next_num := numeric_part::int + 1;
      -- Always strip alphabetic suffix on auto-increment (e.g. "5A" → "6", not "6A")
      NEW.drc_number := fy_prefix || next_num;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger (drop + create ensures idempotency)
DROP TRIGGER IF EXISTS trg_generate_drc_number ON public.receipt_header;
CREATE TRIGGER trg_generate_drc_number
  BEFORE INSERT ON public.receipt_header
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_drc_number();

COMMIT;
