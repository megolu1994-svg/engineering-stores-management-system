import { supabase } from "../config/supabase";
import type { MaterialAllocation } from "../types/materialAllocation";

import {
  applyStockMovement,
  reverseStockMovement,
} from "./inventoryTransactionService";

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

/**
 * Creates a new allocation row. Routes the actual write through the
 * Inventory Engine (applyStockMovement) so it is logged the same way as
 * every other stock movement. Preserves the original fire-and-forget
 * error handling (log to console, never throw) so existing callers
 * behave exactly as before.
 */
export async function addAllocation(
  allocation: Omit<MaterialAllocation, "id">
): Promise<void> {
  try {
    await applyStockMovement({
      materialCode: allocation.material_code,
      locationCode: allocation.location_code,
      prevQuantity: 0,
      newQuantity: allocation.quantity,
      transactionType: "ALLOCATION",
      referenceType: "ALLOCATION",
    });
  } catch (error) {
    console.error(error);
  }
}

/**
 * Updates an existing allocation's quantity. Routes the actual write
 * through the Inventory Engine (applyStockMovement) so it is logged the
 * same way as every other stock movement. Preserves the original
 * fire-and-forget error handling (log to console, never throw).
 */
export async function updateAllocation(
  id: number,
  quantity: number
): Promise<void> {
  try {
    const { data, error: fetchError } = await supabase
      .from("material_allocation")
      .select("material_code, location_code, quantity")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) throw fetchError;

    await applyStockMovement({
      materialCode: data?.material_code ?? "",
      locationCode: data?.location_code ?? "",
      prevQuantity: data ? Number(data.quantity) : 0,
      newQuantity: quantity,
      allocationId: id,
      transactionType: "ALLOCATION",
      referenceType: "ALLOCATION",
    });
  } catch (error) {
    console.error(error);
  }
}

/**
 * Deletes an allocation row. Routes the removal through the Inventory
 * Engine (reverseStockMovement) so it is logged as an OUT movement down
 * to zero. Preserves the original fire-and-forget error handling.
 */
export async function deleteAllocation(id: number): Promise<void> {
  try {
    const { data, error: fetchError } = await supabase
      .from("material_allocation")
      .select("material_code, location_code, quantity")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) throw fetchError;

    await reverseStockMovement({
      materialCode: data?.material_code ?? "",
      locationCode: data?.location_code ?? "",
      allocationId: id,
      prevQuantity: data ? Number(data.quantity) : 0,
      transactionType: "ALLOCATION",
      referenceType: "ALLOCATION",
    });
  } catch (error) {
    console.error(error);
  }
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
 * Opening Stock
 * ========================================================================= */

/**
 * Applies an opening balance for a material at a location: adds the given
 * quantity to any existing allocation for that material/location, or
 * creates a new allocation if none exists yet. Routed entirely through
 * the Inventory Engine (applyStockMovement), which performs the write and
 * logs an OPENING_STOCK transaction.
 */
export async function applyOpeningStock(
  materialCode: string,
  locationCode: string,
  quantity: number,
  remarks?: string
): Promise<void> {
  const existing = await getAllocations(materialCode);
  const existingRow = existing.find(
    (a) => a.location_code === locationCode
  );

  const prevQuantity = existingRow ? existingRow.quantity : 0;
  const newQuantity = prevQuantity + quantity;

  await applyStockMovement({
    materialCode,
    locationCode,
    prevQuantity,
    newQuantity,
    allocationId: existingRow?.id,
    transactionType: "OPENING_STOCK",
    referenceType: "OPENING_STOCK",
    reason: "Opening Balance",
    remarks,
  });
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
 * stock adjustment), creating the allocation if it doesn't exist yet.
 * Routed entirely through the Inventory Engine (applyStockMovement),
 * which performs the write and logs an ADJUSTMENT transaction capturing
 * the delta, the reason, and any remarks.
 */
export async function applyAdjustment(
  materialCode: string,
  locationCode: string,
  newQuantity: number,
  reason: string,
  remarks?: string
): Promise<void> {
  const existing = await getAllocations(materialCode);
  const existingRow = existing.find(
    (a) => a.location_code === locationCode
  );

  const prevQuantity = existingRow?.quantity ?? 0;

  await applyStockMovement({
    materialCode,
    locationCode,
    prevQuantity,
    newQuantity,
    allocationId: existingRow?.id,
    transactionType: "ADJUSTMENT",
    referenceType: "ADJUSTMENT",
    reason,
    remarks,
  });
}
