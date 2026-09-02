-- New approach: generate DRC number via RPC function (no trigger needed).
-- The application calls this function to get the next DRC number,
-- then includes it in the insert payload. The trigger is disabled.

BEGIN;

-- 1. Create the RPC function
CREATE OR REPLACE FUNCTION public.generate_next_drc_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  current_month  int := EXTRACT(MONTH FROM now());
  current_year   int := EXTRACT(YEAR  FROM now());
  fy_start       int;
  fy_end         int;
  fy_prefix      text;
  last_number    text;
  numeric_part   text;
  next_num       int;
  result         text;
BEGIN
  -- Serialize with advisory lock to prevent concurrent races
  PERFORM pg_advisory_xact_lock(999999);

  -- Determine financial year
  IF current_month >= 4 THEN
    fy_start := current_year;
    fy_end   := current_year + 1;
  ELSE
    fy_start := current_year - 1;
    fy_end   := current_year;
  END IF;

  fy_prefix := 'DRC/' || substring(fy_start::text, 3, 2) || '-' || substring(fy_end::text, 3, 2) || '/';

  -- Find the highest existing DRC number for this FY
  SELECT drc_number INTO last_number
  FROM public.receipt_header
  WHERE drc_number LIKE fy_prefix || '%'
  ORDER BY
    (regexp_replace(drc_number, '^' || fy_prefix || '([0-9]*).*$', '\1', 'i'))::bigint NULLS LAST,
    drc_number DESC
  LIMIT 1;

  IF last_number IS NULL THEN
    result := fy_prefix || '1';
  ELSE
    numeric_part := regexp_replace(last_number, '^' || fy_prefix || '([0-9]*).*$', '\1', 'i');

    IF numeric_part = '' OR numeric_part IS NULL THEN
      result := fy_prefix || '1';
    ELSE
      next_num := numeric_part::int + 1;
      result := fy_prefix || next_num;
    END IF;
  END IF;

  RETURN result;
END;
$$;

-- 2. Disable the old trigger (keep the function in case it's referenced elsewhere)
DROP TRIGGER IF EXISTS trg_generate_drc_number ON public.receipt_header;

-- 3. Grant execute permission to authenticated and anon roles
GRANT EXECUTE ON FUNCTION public.generate_next_drc_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_next_drc_number() TO anon;

COMMIT;
