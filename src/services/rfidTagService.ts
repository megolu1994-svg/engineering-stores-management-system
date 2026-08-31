import { supabase } from "../config/supabase";

/** Get the current authenticated user's ID. */
async function getCurrentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error("Not authenticated. Please log in again.");
  }
  return data.user.id;
}

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface RfidTag {
  id: string;
  user_id: string;
  rfid_code: string;
  tag_type: string;
  tag_description: string | null;
  material_code: string | null;
  quantity: number | null;
  uom: string | null;
  storage_location: string | null;
  status: "unlinked" | "active" | "damaged" | "decommissioned";
  notes: string | null;
  linked_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Master data fields (no material linkage). */
export interface RfidTagMasterInput {
  rfid_code: string;
  tag_type?: string;
  tag_description?: string;
  notes?: string;
}

/** Link a tag to a material + quantity + location. */
export interface RfidLinkInput {
  material_code: string;
  quantity: number;
  uom: string;
  storage_location?: string;
}

export interface RfidTagInput extends RfidTagMasterInput {
  material_code?: string;
  quantity?: number;
  uom?: string;
  storage_location?: string;
  status?: RfidTag["status"];
}

/** Result of scanning a tag — enriched with material master data. */
export interface RfidScanResult {
  tag: RfidTag;
  material_description: string;
  material_uom: string;
  found: boolean;
}

/** Aggregated view per material for stock summary. */
export interface RfidStockRow {
  material_code: string;
  short_description: string;
  uom: string;
  total_tags: number;
  total_quantity: number;
  tags: RfidTag[];
}

/* ------------------------------------------------------------------ */
/*  RFID Master CRUD                                                  */
/* ------------------------------------------------------------------ */

/** List all tags with optional search and status filter. */
export async function getRfidTags(
  search?: string,
  status?: string
): Promise<RfidTag[]> {
  let query = supabase
    .from("rfid_tags")
    .select("*")
    .order("created_at", { ascending: false });

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  if (search?.trim()) {
    const safe = search.trim().replace(/[%_]/g, (m) => `\\${m}`);
    query = query.or(
      `rfid_code.ilike.%${safe}%,tag_description.ilike.%${safe}%,material_code.ilike.%${safe}%,storage_location.ilike.%${safe}%`
    );
  }

  const { data, error } = await query;
  if (error) throw friendlyError(error);
  return (data ?? []) as RfidTag[];
}

function friendlyError(err: { message: string; code?: string }): Error {
  if (err.code === "42P01" || err.message?.includes("does not exist") || err.message?.includes("relation \"rfid_tags\" does not exist")) {
    return new Error(
      "The rfid_tags table does not exist yet. Please run the database migration in Supabase SQL Editor first."
    );
  }
  if (err.code === "23505" || err.message?.includes("duplicate") || err.message?.includes("unique")) {
    return new Error("This RFID code is already registered.");
  }
  if (err.code === "42501" || err.message?.includes("permission denied") || err.message?.includes("RLS")) {
    return new Error("Permission denied. Check that RLS policies are set up on the rfid_tags table.");
  }
  return new Error(err.message || "Database error.");
}

/** Register a new RFID tag (master data only, not yet linked). */
export async function addRfidTag(input: RfidTagMasterInput): Promise<RfidTag> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("rfid_tags")
    .insert({
      user_id: userId,
      rfid_code: input.rfid_code.trim(),
      tag_type: input.tag_type ?? "paper",
      tag_description: input.tag_description?.trim() || null,
      notes: input.notes?.trim() || null,
      status: "unlinked",
    })
    .select()
    .single();

  if (error) throw friendlyError(error);
  return data as RfidTag;
}

/** Update master data fields of a tag. */
export async function updateRfidTag(
  id: string,
  input: Partial<RfidTagMasterInput & { status: string }>
): Promise<RfidTag> {
  const payload: Record<string, unknown> = {};
  if (input.rfid_code !== undefined) payload.rfid_code = input.rfid_code.trim();
  if (input.tag_type !== undefined) payload.tag_type = input.tag_type;
  if (input.tag_description !== undefined)
    payload.tag_description = input.tag_description?.trim() || null;
  if (input.notes !== undefined) payload.notes = input.notes?.trim() || null;
  if (input.status !== undefined) payload.status = input.status;

  const { data, error } = await supabase
    .from("rfid_tags")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as RfidTag;
}

/** Delete a tag permanently. */
export async function deleteRfidTag(id: string): Promise<void> {
  const { error } = await supabase.from("rfid_tags").delete().eq("id", id);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/*  Link / Unlink tag to material                                     */
/* ------------------------------------------------------------------ */

/** Link (or re-link) a tag to a material code + quantity + location. */
export async function linkTagToMaterial(
  tagId: string,
  input: RfidLinkInput
): Promise<RfidTag> {
  const { data, error } = await supabase
    .from("rfid_tags")
    .update({
      material_code: input.material_code.trim(),
      quantity: input.quantity,
      uom: input.uom,
      storage_location: input.storage_location?.trim() || null,
      status: "active",
      linked_at: new Date().toISOString(),
    })
    .eq("id", tagId)
    .select()
    .single();

  if (error) throw error;
  return data as RfidTag;
}

/** Unlink a tag from its material (reset to unlinked state). */
export async function unlinkTag(tagId: string): Promise<RfidTag> {
  const { data, error } = await supabase
    .from("rfid_tags")
    .update({
      material_code: null,
      quantity: null,
      uom: null,
      storage_location: null,
      status: "unlinked",
      linked_at: null,
    })
    .eq("id", tagId)
    .select()
    .single();

  if (error) throw error;
  return data as RfidTag;
}

/* ------------------------------------------------------------------ */
/*  Locate Material by Scanning                                       */
/* ------------------------------------------------------------------ */

/**
 * Scan an RFID tag code → return the tag record enriched with
 * material master data (description, UOM). This is the core "locate"
 * function: point RFID reader at a tag, get instant material info.
 */
export async function locateByScan(rfidCode: string): Promise<RfidScanResult> {
  const code = rfidCode.trim();
  if (!code) {
    throw new Error("RFID code is required.");
  }

  // Look up the tag by its EPC/TID code
  const { data: tag, error } = await supabase
    .from("rfid_tags")
    .select("*")
    .eq("rfid_code", code)
    .single();

  if (error || !tag) {
    return {
      tag: null as unknown as RfidTag,
      material_description: "",
      material_uom: "",
      found: false,
    };
  }

  // Fetch material master details if linked
  let materialDescription = "";
  let materialUom = "";

  if (tag.material_code) {
    const { data: mat } = await supabase
      .from("material_master")
      .select("short_description, uom")
      .eq("material_code", tag.material_code)
      .single();

    if (mat) {
      materialDescription = mat.short_description ?? "";
      materialUom = mat.uom ?? "";
    }
  }

  return {
    tag: tag as RfidTag,
    material_description: materialDescription,
    material_uom: materialUom,
    found: true,
  };
}

/* ------------------------------------------------------------------ */
/*  Bulk Import                                                       */
/* ------------------------------------------------------------------ */

export interface BulkRfidRow {
  rfid_code: string;
  tag_type?: string;
  tag_description?: string;
  material_code?: string;
  quantity?: number;
  uom?: string;
  storage_location?: string;
  notes?: string;
}

export interface BulkImportResult {
  imported: number;
  linked: number;
  errors: Array<{ row: number; message: string }>;
}

export async function bulkImportRfidTags(
  rows: BulkRfidRow[]
): Promise<BulkImportResult> {
  const userId = await getCurrentUserId();
  const errors: Array<{ row: number; message: string }> = [];
  const valid: BulkRfidRow[] = [];

  rows.forEach((row, i) => {
    if (!row.rfid_code?.trim()) {
      errors.push({ row: i + 1, message: "Missing RFID code" });
      return;
    }
    valid.push(row);
  });

  if (valid.length === 0) {
    return { imported: 0, linked: 0, errors };
  }

  const records = valid.map((row) => {
    const hasMaterial = !!row.material_code?.trim();
    return {
      user_id: userId,
      rfid_code: row.rfid_code.trim(),
      tag_type: row.tag_type?.trim() || "paper",
      tag_description: row.tag_description?.trim() || null,
      material_code: hasMaterial ? row.material_code!.trim() : null,
      quantity: hasMaterial ? (row.quantity ?? 0) : null,
      uom: hasMaterial ? (row.uom?.trim() || null) : null,
      storage_location: hasMaterial ? (row.storage_location?.trim() || null) : null,
      status: hasMaterial ? "active" : "unlinked",
      linked_at: hasMaterial ? new Date().toISOString() : null,
      notes: row.notes?.trim() || null,
    };
  });

  const { data, error } = await supabase.from("rfid_tags").upsert(records, {
    onConflict: "user_id,rfid_code",
    ignoreDuplicates: false,
  });

  if (error) {
    valid.forEach((_, i) => {
      errors.push({ row: i + 1, message: error.message });
    });
    return { imported: 0, linked: 0, errors };
  }

  const imported = (data ?? []).length || valid.length;
  const linked = records.filter((r) => r.status === "active").length;

  return { imported, linked, errors };
}

/* ------------------------------------------------------------------ */
/*  RFID Stock Summary (grouped by material)                          */
/* ------------------------------------------------------------------ */

export async function getRfidStockSummary(): Promise<RfidStockRow[]> {
  const { data: tags, error } = await supabase
    .from("rfid_tags")
    .select("*")
    .eq("status", "active")
    .not("material_code", "is", null)
    .order("material_code");

  if (error) throw error;

  const allTags = (tags ?? []) as RfidTag[];

  // Fetch material descriptions
  const codes = [...new Set(allTags.map((t) => t.material_code!))];
  let materialMap: Record<string, { short_description: string; uom: string }> =
    {};

  if (codes.length > 0) {
    const { data: mats } = await supabase
      .from("material_master")
      .select("material_code, short_description, uom")
      .in("material_code", codes);

    (mats ?? []).forEach(
      (m: { material_code: string; short_description: string; uom: string }) => {
        materialMap[m.material_code] = {
          short_description: m.short_description,
          uom: m.uom,
        };
      }
    );
  }

  // Group by material_code
  const grouped: Record<string, RfidStockRow> = {};
  for (const tag of allTags) {
    const mc = tag.material_code!;
    if (!grouped[mc]) {
      const mat = materialMap[mc];
      grouped[mc] = {
        material_code: mc,
        short_description: mat?.short_description ?? "",
        uom: tag.uom ?? mat?.uom ?? "",
        total_tags: 0,
        total_quantity: 0,
        tags: [],
      };
    }
    grouped[mc].total_tags++;
    grouped[mc].total_quantity += tag.quantity ?? 0;
    grouped[mc].tags.push(tag);
  }

  return Object.values(grouped).sort((a, b) =>
    a.material_code.localeCompare(b.material_code)
  );
}
