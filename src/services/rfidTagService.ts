import { supabase } from "../config/supabase";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface RfidTag {
  id: string;
  user_id: string;
  rfid_code: string;
  material_code: string;
  quantity: number;
  uom: string;
  storage_location: string | null;
  status: "active" | "damaged" | "decommissioned";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RfidTagInput {
  rfid_code: string;
  material_code: string;
  quantity: number;
  uom: string;
  storage_location?: string | null;
  status?: RfidTag["status"];
  notes?: string | null;
}

/** Aggregated view per material for the stock summary tab. */
export interface RfidStockRow {
  material_code: string;
  short_description: string;
  uom: string;
  total_tags: number;
  total_quantity: number;
  tags: RfidTag[];
}

/* ------------------------------------------------------------------ */
/*  CRUD                                                              */
/* ------------------------------------------------------------------ */

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
      `rfid_code.ilike.%${safe}%,material_code.ilike.%${safe}%,storage_location.ilike.%${safe}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as RfidTag[];
}

export async function addRfidTag(input: RfidTagInput): Promise<RfidTag> {
  const { data, error } = await supabase
    .from("rfid_tags")
    .insert({
      rfid_code: input.rfid_code.trim(),
      material_code: input.material_code.trim(),
      quantity: input.quantity,
      uom: input.uom,
      storage_location: input.storage_location?.trim() || null,
      status: input.status ?? "active",
      notes: input.notes?.trim() || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as RfidTag;
}

export async function updateRfidTag(
  id: string,
  input: Partial<RfidTagInput>
): Promise<RfidTag> {
  const payload: Record<string, unknown> = {};
  if (input.rfid_code !== undefined) payload.rfid_code = input.rfid_code.trim();
  if (input.material_code !== undefined)
    payload.material_code = input.material_code.trim();
  if (input.quantity !== undefined) payload.quantity = input.quantity;
  if (input.uom !== undefined) payload.uom = input.uom;
  if (input.storage_location !== undefined)
    payload.storage_location = input.storage_location?.trim() || null;
  if (input.status !== undefined) payload.status = input.status;
  if (input.notes !== undefined) payload.notes = input.notes?.trim() || null;

  const { data, error } = await supabase
    .from("rfid_tags")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as RfidTag;
}

export async function deleteRfidTag(id: string): Promise<void> {
  const { error } = await supabase.from("rfid_tags").delete().eq("id", id);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/*  Bulk import (Excel / CSV rows)                                    */
/* ------------------------------------------------------------------ */

export interface BulkRfidRow {
  rfid_code: string;
  material_code: string;
  quantity: number;
  uom: string;
  storage_location?: string;
  notes?: string;
}

export interface BulkImportResult {
  imported: number;
  errors: Array<{ row: number; message: string }>;
}

export async function bulkImportRfidTags(
  rows: BulkRfidRow[]
): Promise<BulkImportResult> {
  const errors: Array<{ row: number; message: string }> = [];
  const valid: BulkRfidRow[] = [];

  rows.forEach((row, i) => {
    if (!row.rfid_code?.trim()) {
      errors.push({ row: i + 1, message: "Missing RFID code" });
      return;
    }
    if (!row.material_code?.trim()) {
      errors.push({ row: i + 1, message: "Missing material code" });
      return;
    }
    if (!row.quantity || row.quantity <= 0) {
      errors.push({ row: i + 1, message: "Invalid quantity" });
      return;
    }
    valid.push(row);
  });

  if (valid.length === 0) {
    return { imported: 0, errors };
  }

  const { data, error } = await supabase.from("rfid_tags").upsert(
    valid.map((row) => ({
      rfid_code: row.rfid_code.trim(),
      material_code: row.material_code.trim(),
      quantity: row.quantity,
      uom: row.uom || "NOS",
      storage_location: row.storage_location?.trim() || null,
      notes: row.notes?.trim() || null,
    })),
    { onConflict: "user_id,rfid_code", ignoreDuplicates: false }
  );

  if (error) {
    // If the whole batch fails, report it for each row
    valid.forEach((_, i) => {
      errors.push({ row: i + 1, message: error.message });
    });
    return { imported: 0, errors };
  }

  return { imported: (data ?? []).length || valid.length, errors };
}

/* ------------------------------------------------------------------ */
/*  Stock summary (grouped by material)                               */
/* ------------------------------------------------------------------ */

export async function getRfidStockSummary(): Promise<RfidStockRow[]> {
  const { data: tags, error } = await supabase
    .from("rfid_tags")
    .select("*")
    .eq("status", "active")
    .order("material_code");

  if (error) throw error;

  const allTags = (tags ?? []) as RfidTag[];

  // Fetch material descriptions for all unique codes
  const codes = [...new Set(allTags.map((t) => t.material_code))];
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
    if (!grouped[tag.material_code]) {
      const mat = materialMap[tag.material_code];
      grouped[tag.material_code] = {
        material_code: tag.material_code,
        short_description: mat?.short_description ?? "",
        uom: tag.uom || (mat?.uom ?? ""),
        total_tags: 0,
        total_quantity: 0,
        tags: [],
      };
    }
    grouped[tag.material_code].total_tags++;
    grouped[tag.material_code].total_quantity += tag.quantity;
    grouped[tag.material_code].tags.push(tag);
  }

  return Object.values(grouped).sort((a, b) =>
    a.material_code.localeCompare(b.material_code)
  );
}
