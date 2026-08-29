-- RFID Tag Master: physical RFID tags (EPC/TID) that can be linked
-- to material codes with quantities. Scanning a tag with an RFID
-- reader instantly reveals what material it's linked to and where.
--
-- Workflow:
--   1. Register tags in RFID Master (tag code + basic details)
--   2. Link a tag to a material code + quantity + location
--   3. Scan tag with RFID reader → see material + location instantly

BEGIN;

CREATE TABLE IF NOT EXISTS public.rfid_tags (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Tag identity (master data)
  rfid_code        TEXT NOT NULL,                          -- EPC/TID on the tag
  tag_type         TEXT NOT NULL DEFAULT 'paper',          -- paper | adhesive | metal | ceramic
  tag_description  TEXT,                                   -- optional label/description

  -- Material linkage (filled when tag is linked to material)
  material_code    TEXT,                                   -- FK to material_master (nullable until linked)
  quantity          NUMERIC,                               -- fixed qty per tag (e.g. 50 kg)
  uom              TEXT,                                   -- unit of measure
  storage_location TEXT,                                   -- physical location / bin

  -- Status
  status           TEXT NOT NULL DEFAULT 'unlinked'        -- unlinked | active | damaged | decommissioned
                   CHECK (status IN ('unlinked', 'active', 'damaged', 'decommissioned')),
  notes            TEXT,

  -- Timestamps
  linked_at        TIMESTAMPTZ,                            -- when tag was linked to material
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Each tag code is unique per user
  CONSTRAINT rfid_tags_user_rfid_unique UNIQUE (user_id, rfid_code)
);

-- Fast lookups for locate-by-scan and material grouping
CREATE INDEX IF NOT EXISTS rfid_tags_user_rfid_idx
  ON public.rfid_tags (user_id, rfid_code);

CREATE INDEX IF NOT EXISTS rfid_tags_user_material_idx
  ON public.rfid_tags (user_id, material_code)
  WHERE material_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS rfid_tags_user_status_idx
  ON public.rfid_tags (user_id, status);

-- Multi-tenant row-level security
ALTER TABLE public.rfid_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY rfid_tags_tenant_isolation ON public.rfid_tags
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION public.update_rfid_tags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rfid_tags_updated_at ON public.rfid_tags;
CREATE TRIGGER trg_rfid_tags_updated_at
  BEFORE UPDATE ON public.rfid_tags
  FOR EACH ROW
  EXECUTE FUNCTION public.update_rfid_tags_updated_at();

COMMIT;
