-- Simplified DRC number trigger: no letter-suffix fallback.
-- If the next number collides, the application-level retry will handle it.
-- The advisory lock prevents concurrent triggers from generating the same number.

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

  -- Serialize concurrent trigger executions
  PERFORM pg_advisory_xact_lock(1234567);

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
    NEW.drc_number := fy_prefix || '1';
  ELSE
    numeric_part := regexp_replace(last_number, '^' || fy_prefix || '([0-9]*).*$', '\1', 'i');

    IF numeric_part = '' OR numeric_part IS NULL THEN
      NEW.drc_number := fy_prefix || '1';
    ELSE
      next_num := numeric_part::int + 1;
      NEW.drc_number := fy_prefix || next_num;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
DROP TRIGGER IF EXISTS trg_generate_drc_number ON public.receipt_header;
CREATE TRIGGER trg_generate_drc_number
  BEFORE INSERT ON public.receipt_header
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_drc_number();

COMMIT;
