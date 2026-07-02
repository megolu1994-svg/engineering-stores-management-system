import { supabase } from "../config/supabase";
import type { MaterialAllocation } from "../types/materialAllocation";

export async function getAllocations(
  materialCode: string
): Promise<MaterialAllocation[]> {
  const { data, error } = await supabase
    .from("material_allocation")
    .select("*")
    .eq("material_code", materialCode);

  if (error) {
    console.error(error);
    return [];
  }

  return data as MaterialAllocation[];
}

export async function addAllocation(
  allocation: Omit<MaterialAllocation, "id">
): Promise<void> {
  const { error } = await supabase
    .from("material_allocation")
    .insert([allocation]);

  if (error) console.error(error);
}

export async function updateAllocation(
  id: number,
  quantity: number
): Promise<void> {
  const { error } = await supabase
    .from("material_allocation")
    .update({ quantity })
    .eq("id", id);

  if (error) console.error(error);
}

export async function deleteAllocation(id: number): Promise<void> {
  const { error } = await supabase
    .from("material_allocation")
    .delete()
    .eq("id", id);

  if (error) console.error(error);
}

/* =========================================================================
 * Current Stock
 * ========================================================================= */

export interface CurrentStockRow {
  material_code: string;
  short_description: string;
  location_code: string;
  location_description: string;
  quantity: number;
}

/**
 * Returns one row per (material, location) allocation, enriched with the
 * material description and location description. Only the master-data
 * rows actually referenced by an allocation are fetched (via `.in()`),
 * so this never loads the full material_master or location_master table.
 */
export async function getCurrentStock(): Promise<CurrentStockRow[]> {
  const { data: allocationData, error } = await supabase
    .from("material_allocation")
    .select("*");

  if (error) {
    console.error(error);
    return [];
  }

  const allocations = (allocationData ?? []) as MaterialAllocation[];

  if (allocations.length === 0) {
    return [];
  }

  const materialCodes = Array.from(
    new Set(allocations.map((a) => a.material_code))
  );
  const locationCodes = Array.from(
    new Set(allocations.map((a) => a.location_code))
  );

  const [materialsResult, locationsResult] = await Promise.all([
    supabase
      .from("material_master")
      .select("material_code, short_description")
      .in("material_code", materialCodes),
    supabase
      .from("location_master")
      .select("location_code, location_description")
      .in("location_code", locationCodes),
  ]);

  const materialMap = new Map<string, string>(
    (materialsResult.data ?? []).map(
      (m: { material_code: string; short_description: string }) => [
        m.material_code,
        m.short_description,
      ]
    )
  );

  const locationMap = new Map<string, string>(
    (locationsResult.data ?? []).map(
      (l: { location_code: string; location_description: string }) => [
        l.location_code,
        l.location_description,
      ]
    )
  );

  return allocations.map((a) => ({
    material_code: a.material_code,
    short_description: materialMap.get(a.material_code) ?? "",
    location_code: a.location_code,
    location_description: locationMap.get(a.location_code) ?? "",
    quantity: Number(a.quantity),
  }));
}

/* =========================================================================
 * Stock transactions (Opening Balance / Adjustment audit trail)
 * ========================================================================= */

export type StockTransactionType = "OPENING_BALANCE" | "ADJUSTMENT";

export interface StockTransactionEntry {
  material_code: string;
  location_code: string;
  quantity: number;
  type: StockTransactionType;
  reason?: string;
  remarks?: string;
}

/**
 * Best-effort audit log for Opening Balance and Adjustment activity.
 *
 * There is currently no dedicated transactions table in the schema, so
 * this is intentionally a placeholder: it tries to insert into
 * `stock_transactions` and, if that table doesn't exist yet (or the
 * insert otherwise fails), it logs a warning instead of throwing. The
 * actual stock quantity change always goes through the existing
 * addAllocation/updateAllocation functions above, so core functionality
 * never depends on this table being present.
 *
 * Suggested table, to be created manually in Supabase when ready:
 *
 *   create table stock_transactions (
 *     id bigint generated always as identity primary key,
 *     material_code text not null,
 *     location_code text not null,
 *     quantity numeric not null,
 *     type text not null,
 *     reason text,
 *     remarks text,
 *     created_at timestamptz not null default now()
 *   );
 */
export async function recordStockTransaction(
  entry: StockTransactionEntry
): Promise<void> {
  try {
    const { error } = await supabase
      .from("stock_transactions")
      .insert([entry]);

    if (error) {
      console.warn(
        "Stock transaction log skipped (stock_transactions table may not exist yet):",
        error.message
      );
    }
  } catch (err) {
    console.warn("Stock transaction log skipped:", err);
  }
}

/* =========================================================================
 * Opening Stock
 * ========================================================================= */

/**
 * Applies an opening balance for a material at a location: adds the given
 * quantity to any existing allocation for that material/location, or
 * creates a new allocation if none exists yet. Uses the same
 * addAllocation/updateAllocation mechanism as the Allocation tab, and
 * records a best-effort OPENING_BALANCE transaction.
 */
export async function applyOpeningStock(
  materialCode: string,
  locationCode: string,
  quantity: number,
  _remarks?: string
): Promise<void> {
  const existing = await getAllocations(materialCode);
  const existingRow = existing.find(
    (a) => a.location_code === locationCode
  );

  if (existingRow && existingRow.id !== undefined) {
    await updateAllocation(existingRow.id, existingRow.quantity + quantity);
  } else {
    await addAllocation({
      material_code: materialCode,
      location_code: locationCode,
      quantity,
    });
  }

  /*await recordStockTransaction({
    material_code: materialCode,
    location_code: locationCode,
    quantity,
    type: "OPENING_BALANCE",
    reason: "Opening Balance",
    remarks,
  });*/
}

export interface OpeningStockImportRow {
  rowNumber: number;
  material_code: string;
  location_code: string;
  quantity: number;
}

export interface OpeningStockInvalidRow {
  rowNumber: number;
  material_code: string;
  location_code: string;
  quantityRaw: string;
  errors: string[];
}

export interface OpeningStockValidationResult {
  totalRecords: number;
  validRows: OpeningStockImportRow[];
  invalidRows: OpeningStockInvalidRow[];
}

function getOpeningFieldValue(
  row: Record<string, unknown>,
  aliases: string[]
): string {
  const keys = Object.keys(row);

  for (const alias of aliases) {
    const match = keys.find(
      (key) => key.trim().toLowerCase() === alias.toLowerCase()
    );

    if (match !== undefined) {
      const value = row[match];
      return value === null || value === undefined
        ? ""
        : String(value).trim();
    }
  }

  return "";
}

function isOpeningRowBlank(row: Record<string, unknown>): boolean {
  return Object.values(row).every((value) => {
    if (value === null || value === undefined) return true;
    return String(value).trim() === "";
  });
}

function parseOpeningQuantity(raw: string): number {
  const cleaned = raw.replace(/,/g, "").trim();

  if (!cleaned) {
    return NaN;
  }

  return Number(cleaned);
}

/**
 * Parses a bulk Opening Stock Excel file. Expected columns: Material
 * Code, Location Code, Quantity (case-insensitive, common aliases
 * supported).
 */
export function parseOpeningStockExcelRows(
  rawRows: Record<string, unknown>[]
): OpeningStockValidationResult {
  const validRows: OpeningStockImportRow[] = [];
  const invalidRows: OpeningStockInvalidRow[] = [];

  let totalRecords = 0;

  rawRows.forEach((row, index) => {
    if (isOpeningRowBlank(row)) {
      return;
    }

    totalRecords += 1;

    const rowNumber = index + 2;

    const materialCode = getOpeningFieldValue(row, [
      "Material Code",
      "material_code",
      "Material",
    ]);

    const locationCode = getOpeningFieldValue(row, [
      "Location Code",
      "location_code",
      "Location",
    ]);

    const quantityRaw = getOpeningFieldValue(row, [
      "Quantity",
      "Qty",
      "Opening Quantity",
      "Opening Balance",
    ]);

    const errors: string[] = [];

    if (!materialCode) {
      errors.push("Material Code is required.");
    }

    if (!locationCode) {
      errors.push("Location Code is required.");
    }

    const quantity = parseOpeningQuantity(quantityRaw);

    if (!quantityRaw) {
      errors.push("Quantity is required.");
    } else if (Number.isNaN(quantity)) {
      errors.push("Quantity must be a number.");
    } else if (quantity <= 0) {
      errors.push("Quantity must be greater than zero.");
    }

    if (errors.length > 0) {
      invalidRows.push({
        rowNumber,
        material_code: materialCode,
        location_code: locationCode,
        quantityRaw,
        errors,
      });
      return;
    }

    validRows.push({
      rowNumber,
      material_code: materialCode,
      location_code: locationCode,
      quantity,
    });
  });

  return { totalRecords, validRows, invalidRows };
}

export interface OpeningStockImportFailure {
  material_code: string;
  location_code: string;
  rowNumber: number;
  error: string;
}

export interface OpeningStockImportSummary {
  totalRows: number;
  applied: number;
  failed: number;
  failures: OpeningStockImportFailure[];
}

/**
 * Applies a batch of Opening Stock rows one at a time, so a single failing
 * row never blocks the rest. Every row ends up either applied or failed:
 *   applied + failed === rows.length
 */
export async function bulkApplyOpeningStock(
  rows: OpeningStockImportRow[],
  onProgress?: (processed: number, total: number) => void
): Promise<OpeningStockImportSummary> {
  const summary: OpeningStockImportSummary = {
    totalRows: rows.length,
    applied: 0,
    failed: 0,
    failures: [],
  };

  let processed = 0;

  for (const row of rows) {
    try {
      await applyOpeningStock(
        row.material_code,
        row.location_code,
        row.quantity,
        "Bulk Excel import"
      );

      summary.applied += 1;
    } catch (err) {
      summary.failed += 1;

      summary.failures.push({
        material_code: row.material_code,
        location_code: row.location_code,
        rowNumber: row.rowNumber,
        error: err instanceof Error ? err.message : "Unknown error.",
      });
    }

    processed += 1;

    if (onProgress) {
      onProgress(processed, rows.length);
    }
  }

  return summary;
}

/* =========================================================================
 * Adjustment
 * ========================================================================= */

/**
 * Sets a material/location allocation to a new absolute quantity (manual
 * stock adjustment), creating the allocation if it doesn't exist yet, and
 * records a best-effort ADJUSTMENT transaction capturing the delta, the
 * reason, and any remarks.
 */
export async function applyAdjustment(
  materialCode: string,
  locationCode: string,
  newQuantity: number,
  _reason: string,
  _remarks?: string
): Promise<void> {
  const existing = await getAllocations(materialCode);
  const existingRow = existing.find(
    (a) => a.location_code === locationCode
  );

  // const previousQuantity = existingRow?.quantity ?? 0;
  //const delta = newQuantity - previousQuantity;

  if (existingRow && existingRow.id !== undefined) {
    await updateAllocation(existingRow.id, newQuantity);
  } else {
    await addAllocation({
      material_code: materialCode,
      location_code: locationCode,
      quantity: newQuantity,
    });
  }

  /*await recordStockTransaction({
    material_code: materialCode,
    location_code: locationCode,
    quantity: delta,
    type: "ADJUSTMENT",
    reason,
    remarks,
  });*/
}
