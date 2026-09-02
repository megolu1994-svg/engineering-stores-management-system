-- Fix DRC number generation race condition.
--
-- The original trigger (0014) used a plain SELECT to find the max DRC
-- number. Two concurrent inserts could both read the same "last number"
-- and generate the same DRC number, causing a unique-constraint violation.
--
-- Fix: Use pg_advisory_xact_lock to serialize trigger execution within
-- each transaction, plus a fallback that appends a letter suffix (A, B, …)
-- if the next number still collides (e.g. manual override edge case).

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
  candidate      text;
  suffix         char;
BEGIN
  -- Only auto-generate when drc_number is not already set
  IF NEW.drc_number IS NOT NULL AND NEW.drc_number <> '' THEN
    RETURN NEW;
  END IF;

  -- Serialize concurrent trigger executions with an advisory lock.
  -- Lock ID is derived from the table OID so different tables don't block.
  PERFORM pg_advisory_xact_lock('receipt_header'::regclass::oid);

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
    (regexp_replace(drc_number, '^' || fy_prefix || '([0-9]*).*$', '\1', 'i'))::bigint NULLS LAST,
    drc_number DESC
  LIMIT 1;

  IF last_number IS NULL THEN
    candidate := fy_prefix || '1';
  ELSE
    numeric_part := regexp_replace(last_number, '^' || fy_prefix || '([0-9]*).*$', '\1', 'i');

    IF numeric_part = '' OR numeric_part IS NULL THEN
      candidate := fy_prefix || '1';
    ELSE
      next_num := numeric_part::int + 1;
      candidate := fy_prefix || next_num;
    END IF;
  END IF;

  -- Safety check: if the candidate already exists (manual override or
  -- other edge case), append letter suffixes until we find a free slot.
  IF EXISTS (SELECT 1 FROM public.receipt_header WHERE drc_number = candidate) THEN
    FOR suffix IN SELECT chr(g) FROM generate_series(65, 90) g LOOP
      IF NOT EXISTS (SELECT 1 FROM public.receipt_header WHERE drc_number = candidate || suffix) THEN
        candidate := candidate || suffix;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  NEW.drc_number := candidate;
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
