-- RFID Tag Management: link physical RFID tags to material codes.
--
-- Each row represents one physical RFID tag (EPC/TID) attached to a
-- specific quantity of a material at a storage location.
-- One material can have many tags; each tag maps to exactly one material.

BEGIN;

CREATE TABLE IF NOT EXISTS public.rfid_tags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rfid_code       TEXT NOT NULL,                          -- EPC/TID on the tag
  material_code   TEXT NOT NULL,                          -- FK to material_master
  quantity         NUMERIC NOT NULL DEFAULT 0,            -- fixed qty per tag (e.g. 50 kg)
  uom             TEXT NOT NULL DEFAULT '',               -- unit of measure
  storage_location TEXT,                                  -- physical location
  status          TEXT NOT NULL DEFAULT 'active'          -- active | damaged | decommissioned
                  CHECK (status IN ('active', 'damaged', 'decommissioned')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Each tag code is unique per user (same EPC can't appear twice for same account)
  CONSTRAINT rfid_tags_user_rfid_unique UNIQUE (user_id, rfid_code)
);

-- Fast lookups
CREATE INDEX IF NOT EXISTS rfid_tags_user_material_idx
  ON public.rfid_tags (user_id, material_code);

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
