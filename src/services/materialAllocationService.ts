import { supabase } from "../config/supabase";
import type { MaterialAllocation } from "../types/materialAllocation";

import {
  applyStockMovement,
  reverseStockMovement,
  generateReferenceNumber,
} from "./inventoryTransactionService";

import {
  type BulkImportReportRow,
  type BulkImportRowStatus,
} from "../utils/bulkImportReport";
import { recordAndDownloadBulkImportReport } from "./bulkImportHistoryService";

const UNALLOCATED_LOCATION = "UNALLOCATED";

/**
 * Max number of codes sent in a single .in() lookup. Two separate limits
 * bite once a code list gets large, and chunking avoids both:
 *  1. PostgREST caps every response at 1000 rows by default - a single
 *     .in() with thousands of codes still only returns the first 1000
 *     matches, silently dropping the rest even though Postgres matched
 *     them all.
 *  2. Supabase-js sends .in() as a GET request with the codes in the
 *     query string. Codes containing "/" or spaces (e.g. "CS/HF21 BIN A")
 *     expand a lot once URL-encoded, so even a few hundred codes can push
 *     the URL past the reverse proxy's max length and fail the whole
 *     request - which, left unchecked, looks identical to "nothing
 *     matched" and marks otherwise-valid codes as not found.
 * 300 keeps both request count and URL size comfortably small.
 */
const IN_QUERY_CHUNK_SIZE = 300;

/**
 * Runs an .in() lookup in chunks of `chunkSize` and merges the results,
 * so large code lists never hit the row cap or URL-length failure modes
 * described above. Any chunk that errors throws immediately instead of
 * being swallowed and treated as "no matches" - a failed lookup should
 * never silently turn into false "not found" errors for the user.
 */
async function fetchByCodesInChunks<T>(
  table: string,
  column: string,
  selectColumns: string,
  codes: string[],
  chunkSize: number = IN_QUERY_CHUNK_SIZE
): Promise<T[]> {
  const results: T[] = [];

  for (let i = 0; i < codes.length; i += chunkSize) {
    const chunk = codes.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from(table)
      .select(selectColumns)
      .in(column, chunk);

    if (error) {
      throw new Error(`Failed to look up ${table}.${column}: ${error.message}`);
    }

    results.push(...((data ?? []) as T[]));
  }

  return results;
}

/**
 * Collapses all whitespace (including non-breaking spaces, which JS
 * treats as whitespace but which commonly slip in via copy/paste from
 * PDFs, Word, or OCR'd registers) down to single regular spaces, and
 * trims the ends. Two codes that only differ by "how many/what kind of
 * spaces" are treated as the same code once normalized.
 */
function normalizeCode(code: string): string {
  return code.replace(/\s+/g, " ").trim().toUpperCase();
}

const LOCATION_PAGE_SIZE = 1000;

/**
 * Fetches every active location_code from location_master, paginated via
 * `.range()` so it isn't silently capped at PostgREST's default 1000-row
 * response limit no matter how large the table grows.
 *
 * Requires an explicit `.order()` alongside `.range()`. Without it,
 * Postgres/PostgREST don't guarantee a stable row order across separate
 * paginated requests - once the table has more rows than one page, later
 * pages can come back with rows shuffled, skipped, or duplicated relative
 * to earlier pages. That silently drops real locations from the merged
 * list and makes them look "not found" even though they exist - which is
 * exactly what every other `.range()` call in this codebase (see
 * locationService.ts, materialService.ts) already guards against by
 * ordering on location_code / material_code first.
 *
 * This intentionally does NOT filter by an `.in()` against the codes
 * typed in the Excel file. If a location's code in the database has a
 * stray double space, non-breaking space, or different case than what
 * the user typed (e.g. left over from an earlier bulk import of a
 * scanned/handwritten register), an exact `.in()` match would silently
 * miss that row and report a real, existing location as "not found".
 * Fetching every active code and matching locally by a normalized key
 * (see `normalizeCode`) makes the match whitespace/case-tolerant
 * regardless of how the stored code happens to be formatted.
 */
async function fetchAllActiveLocationCodes(): Promise<string[]> {
  const codes: string[] = [];
  let from = 0;

  for (;;) {
    const to = from + LOCATION_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("location_master")
      .select("location_code")
      .eq("is_active", true)
      .order("location_code")
      .range(from, to);

    if (error) {
      throw new Error(`Failed to look up location_master: ${error.message}`);
    }

    const page = (data ?? []) as { location_code: string }[];
    codes.push(...page.map((row) => row.location_code));

    if (page.length < LOCATION_PAGE_SIZE) break;
    from += LOCATION_PAGE_SIZE;
  }

  return codes;
}

/**
 * Same chunking strategy as fetchByCodesInChunks, but for the one lookup
 * that also needs an extra .eq() filter (unallocated balances), which a
 * generic helper can't express cleanly.
 */
async function fetchUnallocatedBalancesInChunks(
  materialCodes: string[],
  chunkSize: number = IN_QUERY_CHUNK_SIZE
): Promise<{ material_code: string; quantity: number }[]> {
  const results: { material_code: string; quantity: number }[] = [];

  for (let i = 0; i < materialCodes.length; i += chunkSize) {
    const chunk = materialCodes.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("material_allocation")
      .select("material_code, quantity")
      .eq("location_code", UNALLOCATED_LOCATION)
      .in("material_code", chunk);

    if (error) {
      throw new Error(`Failed to look up unallocated balances: ${error.message}`);
    }

    results.push(
      ...((data ?? []) as { material_code: string; quantity: number }[])
    );
  }

  return results;
}

interface UnallocatedRow {
  id: number;
  quantity: number;
}

/**
 * Looks up the material's UNALLOCATED row (id + quantity), or null if it
 * doesn't have one. Shared by every allocation write below, since moving
 * stock into/out of/back to a real location always means the mirror
 * image happens to this same row.
 */
async function getUnallocatedRow(
  materialCode: string
): Promise<UnallocatedRow | null> {
  const { data, error } = await supabase
    .from("material_allocation")
    .select("id, quantity")
    .eq("material_code", materialCode)
    .eq("location_code", UNALLOCATED_LOCATION)
    .maybeSingle();

  if (error) throw error;

  return data
    ? { id: data.id as number, quantity: Number(data.quantity) }
    : null;
}

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
 * Allocates stock to a real location by MOVING it out of the material's
 * UNALLOCATED balance - a paired OUT (UNALLOCATED) + IN (target location)
 * movement, exactly like Location Transfer moves stock between two real
 * locations. Total stock for the material is unchanged; only Opening
 * Stock, Adjustment, Material Receipt and Material Issue are allowed to
 * change it. Throws on failure (including insufficient unallocated
 * balance) instead of swallowing errors, so the caller's error handling
 * actually runs instead of silently reporting success.
 */
export async function addAllocation(
  allocation: Omit<MaterialAllocation, "id">
): Promise<void> {
  const unallocatedRow = await getUnallocatedRow(allocation.material_code);
  const unallocatedQty = unallocatedRow?.quantity ?? 0;

  if (allocation.quantity > unallocatedQty) {
    throw new Error(
      `Cannot allocate more than the unallocated balance (${unallocatedQty}).`
    );
  }

  // Shared by both halves of this move, so the Movement report can pair
  // the OUT (UNALLOCATED) and IN (target location) rows back into one.
  const referenceNumber = generateReferenceNumber("ALC");

  // OUT of UNALLOCATED.
  await applyStockMovement({
    materialCode: allocation.material_code,
    locationCode: UNALLOCATED_LOCATION,
    prevQuantity: unallocatedQty,
    newQuantity: unallocatedQty - allocation.quantity,
    allocationId: unallocatedRow?.id,
    transactionType: "ALLOCATION",
    referenceType: "ALLOCATION",
    referenceNumber,
  });

  // IN to the target location.
  await applyStockMovement({
    materialCode: allocation.material_code,
    locationCode: allocation.location_code,
    prevQuantity: 0,
    newQuantity: allocation.quantity,
    transactionType: "ALLOCATION",
    referenceType: "ALLOCATION",
    referenceNumber,
  });
}

/**
 * Changes an existing allocation to a new absolute quantity by moving
 * the difference to/from the material's UNALLOCATED balance: raising the
 * quantity pulls the increase out of UNALLOCATED (failing if there isn't
 * enough spare balance), lowering it returns the decrease back to
 * UNALLOCATED. Total stock for the material is unchanged. Throws on
 * failure instead of swallowing errors.
 */
export async function updateAllocation(
  id: number,
  quantity: number
): Promise<void> {
  const { data, error: fetchError } = await supabase
    .from("material_allocation")
    .select("material_code, location_code, quantity")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!data) throw new Error("Allocation not found.");
  if (data.location_code === UNALLOCATED_LOCATION) {
    throw new Error("Cannot directly edit the unallocated balance.");
  }

  const materialCode = data.material_code as string;
  const prevQuantity = Number(data.quantity);
  const delta = quantity - prevQuantity;

  // Shared by both halves of this move, so the Movement report can pair
  // the UNALLOCATED and target-location rows back into one.
  const referenceNumber = generateReferenceNumber("ALC");

  if (delta !== 0) {
    const unallocatedRow = await getUnallocatedRow(materialCode);
    const unallocatedQty = unallocatedRow?.quantity ?? 0;

    if (delta > unallocatedQty) {
      throw new Error(
        `Cannot allocate more than the unallocated balance (${unallocatedQty}).`
      );
    }

    await applyStockMovement({
      materialCode,
      locationCode: UNALLOCATED_LOCATION,
      prevQuantity: unallocatedQty,
      newQuantity: unallocatedQty - delta,
      allocationId: unallocatedRow?.id,
      transactionType: "ALLOCATION",
      referenceType: "ALLOCATION",
      referenceNumber,
    });
  }

  await applyStockMovement({
    materialCode,
    locationCode: data.location_code,
    prevQuantity,
    newQuantity: quantity,
    allocationId: id,
    transactionType: "ALLOCATION",
    referenceType: "ALLOCATION",
    referenceNumber,
  });
}

/**
 * Deletes an allocation row and returns its quantity to the material's
 * UNALLOCATED balance - removing an allocation un-assigns that stock
 * from the location, it does not destroy it. Total stock for the
 * material is unchanged. Throws on failure instead of swallowing errors.
 */
export async function deleteAllocation(id: number): Promise<void> {
  const { data, error: fetchError } = await supabase
    .from("material_allocation")
    .select("material_code, location_code, quantity")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!data) throw new Error("Allocation not found.");
  if (data.location_code === UNALLOCATED_LOCATION) {
    throw new Error("Cannot directly delete the unallocated balance.");
  }

  const materialCode = data.material_code as string;
  const prevQuantity = Number(data.quantity);

  // Shared by both halves of this move, so the Movement report can pair
  // the target-location and UNALLOCATED rows back into one.
  const referenceNumber = generateReferenceNumber("ALC");

  await reverseStockMovement({
    materialCode,
    locationCode: data.location_code,
    allocationId: id,
    prevQuantity,
    transactionType: "ALLOCATION",
    referenceType: "ALLOCATION",
    referenceNumber,
  });

  if (prevQuantity > 0) {
    const unallocatedRow = await getUnallocatedRow(materialCode);
    const unallocatedQty = unallocatedRow?.quantity ?? 0;

    await applyStockMovement({
      materialCode,
      locationCode: UNALLOCATED_LOCATION,
      prevQuantity: unallocatedQty,
      newQuantity: unallocatedQty + prevQuantity,
      allocationId: unallocatedRow?.id,
      transactionType: "ALLOCATION",
      referenceType: "ALLOCATION",
      referenceNumber,
    });
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

  const [materialRows, locationRows] = await Promise.all([
    fetchByCodesInChunks<{ material_code: string; short_description: string }>(
      "material_master",
      "material_code",
      "material_code, short_description",
      materialCodes
    ),
    fetchByCodesInChunks<{
      location_code: string;
      location_description: string;
    }>(
      "location_master",
      "location_code",
      "location_code, location_description",
      locationCodes
    ),
  ]);

  const materialMap = new Map<string, string>(
    materialRows.map((m) => [m.material_code, m.short_description])
  );

  const locationMap = new Map<string, string>(
    locationRows.map((l) => [l.location_code, l.location_description])
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

/* =========================================================================
 * Bulk Allocation
 * ========================================================================= */

export interface AllocationImportRow {
  rowNumber: number;
  material_code: string;
  location_code: string;
  quantity: number;
  /** Set at preview time when the requested quantity is expected to
   *  exceed the material's unallocated balance (estimated against a
   *  running total across the file) - informational only, the row is
   *  still importable and the actual cap is re-checked live on import. */
  warning?: string;
}

export interface AllocationInvalidRow {
  rowNumber: number;
  material_code: string;
  location_code: string;
  quantityRaw: string;
  errors: string[];
}

export interface AllocationValidationResult {
  totalRecords: number;
  validRows: AllocationImportRow[];
  invalidRows: AllocationInvalidRow[];
}

function getAllocationFieldValue(
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

function isAllocationRowBlank(row: Record<string, unknown>): boolean {
  return Object.values(row).every((value) => {
    if (value === null || value === undefined) return true;
    return String(value).trim() === "";
  });
}

function parseAllocationQuantity(raw: string): number {
  const cleaned = raw.replace(/,/g, "").trim();

  if (!cleaned) {
    return NaN;
  }

  return Number(cleaned);
}

/**
 * Parses and validates a bulk Allocate Excel file against the database:
 * required fields, numeric quantity, that the material/location actually
 * exist, and (best-effort, since the file may allocate the same material
 * more than once) that a running total of each material's current
 * unallocated balance can cover every row referencing it. Rows that would
 * exceed the balance are NOT rejected - they're kept in `validRows` with
 * a `warning`, since the user may still choose to import them and have
 * only the available balance applied (see `bulkApplyAllocation`).
 */
export async function validateAllocationExcelRows(
  rawRows: Record<string, unknown>[]
): Promise<AllocationValidationResult> {
  const invalidRows: AllocationInvalidRow[] = [];

  const candidates: {
    rowNumber: number;
    material_code: string;
    location_code: string;
    quantity: number;
  }[] = [];

  let totalRecords = 0;

  rawRows.forEach((row, index) => {
    if (isAllocationRowBlank(row)) {
      return;
    }

    totalRecords += 1;

    const rowNumber = index + 2;

    const materialCode = getAllocationFieldValue(row, [
      "Material Code",
      "material_code",
      "Material",
    ]);

    const locationCode = getAllocationFieldValue(row, [
      "Location Code",
      "location_code",
      "Location",
    ]);

    const quantityRaw = getAllocationFieldValue(row, [
      "Quantity",
      "Qty",
      "Allocate Quantity",
      "Allocation Quantity",
    ]);

    const errors: string[] = [];

    if (!materialCode) {
      errors.push("Material Code is required.");
    }

    if (!locationCode) {
      errors.push("Location Code is required.");
    } else if (locationCode.toUpperCase() === UNALLOCATED_LOCATION) {
      errors.push("Location Code cannot be UNALLOCATED.");
    }

    const quantity = parseAllocationQuantity(quantityRaw);

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

    candidates.push({
      rowNumber,
      material_code: materialCode,
      location_code: locationCode,
      quantity,
    });
  });

  if (candidates.length === 0) {
    return { totalRecords, validRows: [], invalidRows };
  }

  const materialCodes = Array.from(
    new Set(candidates.map((c) => c.material_code))
  );

  const [materialRows, allLocationCodes, unallocatedRows] = await Promise.all([
    fetchByCodesInChunks<{ material_code: string }>(
      "material_master",
      "material_code",
      "material_code",
      materialCodes
    ),
    fetchAllActiveLocationCodes(),
    fetchUnallocatedBalancesInChunks(materialCodes),
  ]);

  const knownMaterials = new Set(materialRows.map((m) => m.material_code));

  // Normalized (whitespace/case-collapsed) code -> the actual code as
  // stored in location_master, so a match can still resolve to the exact
  // existing row even if the Excel file's spacing/case differs slightly.
  const locationByNormalizedCode = new Map<string, string>();
  for (const code of allLocationCodes) {
    locationByNormalizedCode.set(normalizeCode(code), code);
  }

  const runningBalance = new Map<string, number>();
  for (const row of unallocatedRows) {
    runningBalance.set(row.material_code, Number(row.quantity));
  }

  const validRows: AllocationImportRow[] = [];

  for (const candidate of candidates) {
    const errors: string[] = [];

    if (!knownMaterials.has(candidate.material_code)) {
      errors.push(`Material Code "${candidate.material_code}" was not found.`);
    }

    const resolvedLocationCode = locationByNormalizedCode.get(
      normalizeCode(candidate.location_code)
    );

    if (!resolvedLocationCode) {
      errors.push(`Location Code "${candidate.location_code}" was not found.`);
    }

    if (errors.length > 0) {
      invalidRows.push({
        rowNumber: candidate.rowNumber,
        material_code: candidate.material_code,
        location_code: candidate.location_code,
        quantityRaw: String(candidate.quantity),
        errors,
      });
      continue;
    }

    // Use the location code exactly as stored in location_master (not
    // necessarily byte-identical to what was typed in the Excel file) so
    // the allocation is written against the real existing row instead of
    // risking a near-duplicate location code.
    candidate.location_code = resolvedLocationCode as string;

    const available = runningBalance.get(candidate.material_code) ?? 0;
    let warning: string | undefined;

    if (candidate.quantity > available) {
      warning =
        available > 0
          ? `Only ${available} unallocated for ${candidate.material_code} - the rest of this request will be skipped.`
          : `No unallocated balance left for ${candidate.material_code} - this row will be skipped.`;
    }

    runningBalance.set(
      candidate.material_code,
      Math.max(0, available - candidate.quantity)
    );

    validRows.push({
      rowNumber: candidate.rowNumber,
      material_code: candidate.material_code,
      location_code: candidate.location_code,
      quantity: candidate.quantity,
      warning,
    });
  }

  return { totalRecords, validRows, invalidRows };
}

/**
 * Applies a single bulk-allocate row: moves stock out of the material's
 * UNALLOCATED balance into the target location, ADDING to any existing
 * allocation already at that location rather than overwriting it (so a
 * material allocated there before is never disturbed). Never allocates
 * more than is currently unallocated - if the requested quantity exceeds
 * it, only the available balance is moved and the rest is simply not
 * applied; other locations' allocations for this material are untouched.
 * Returns the quantity actually applied.
 */
async function applyBulkAllocationRow(
  materialCode: string,
  locationCode: string,
  requestedQuantity: number
): Promise<number> {
  const existing = await getAllocations(materialCode);

  const unallocatedRow = existing.find(
    (a) => a.location_code === UNALLOCATED_LOCATION
  );
  const unallocatedQty = unallocatedRow?.quantity ?? 0;

  const appliedQuantity = Math.min(requestedQuantity, unallocatedQty);

  if (appliedQuantity <= 0) {
    throw new Error(`No unallocated balance available for ${materialCode}.`);
  }

  const targetRow = existing.find((a) => a.location_code === locationCode);

  // Shared by both halves of this move, so the Movement report can pair
  // the OUT (UNALLOCATED) and IN (target location) rows back into one.
  const referenceNumber = generateReferenceNumber("ALC");

  await applyStockMovement({
    materialCode,
    locationCode: UNALLOCATED_LOCATION,
    prevQuantity: unallocatedQty,
    newQuantity: unallocatedQty - appliedQuantity,
    allocationId: unallocatedRow?.id,
    transactionType: "ALLOCATION",
    referenceType: "ALLOCATION",
    referenceNumber,
    remarks: "Bulk Excel import",
  });

  const prevTargetQuantity = targetRow?.quantity ?? 0;

  await applyStockMovement({
    materialCode,
    locationCode,
    prevQuantity: prevTargetQuantity,
    newQuantity: prevTargetQuantity + appliedQuantity,
    allocationId: targetRow?.id,
    transactionType: "ALLOCATION",
    referenceType: "ALLOCATION",
    referenceNumber,
    remarks: "Bulk Excel import",
  });

  return appliedQuantity;
}

export interface AllocationImportOutcome {
  rowNumber: number;
  material_code: string;
  location_code: string;
  requestedQuantity: number;
  appliedQuantity: number;
  status: "applied" | "partial" | "failed";
  message?: string;
}

export interface AllocationImportSummary {
  totalRows: number;
  applied: number;
  partial: number;
  failed: number;
  outcomes: AllocationImportOutcome[];
}

/**
 * Applies a batch of Bulk Allocate rows one at a time (never in parallel),
 * so that when the same material appears on more than one row, each row
 * sees the balance left behind by the one before it. A single failing or
 * balance-short row never blocks the rest.
 */
export async function bulkApplyAllocation(
  rows: AllocationImportRow[],
  onProgress?: (processed: number, total: number) => void
): Promise<AllocationImportSummary> {
  const summary: AllocationImportSummary = {
    totalRows: rows.length,
    applied: 0,
    partial: 0,
    failed: 0,
    outcomes: [],
  };

  let processed = 0;

  for (const row of rows) {
    try {
      const appliedQuantity = await applyBulkAllocationRow(
        row.material_code,
        row.location_code,
        row.quantity
      );

      if (appliedQuantity < row.quantity) {
        summary.partial += 1;
        summary.outcomes.push({
          rowNumber: row.rowNumber,
          material_code: row.material_code,
          location_code: row.location_code,
          requestedQuantity: row.quantity,
          appliedQuantity,
          status: "partial",
          message: `Only ${appliedQuantity} of ${row.quantity} requested was allocated - the unallocated balance ran out.`,
        });
      } else {
        summary.applied += 1;
        summary.outcomes.push({
          rowNumber: row.rowNumber,
          material_code: row.material_code,
          location_code: row.location_code,
          requestedQuantity: row.quantity,
          appliedQuantity,
          status: "applied",
        });
      }
    } catch (err) {
      summary.failed += 1;
      summary.outcomes.push({
        rowNumber: row.rowNumber,
        material_code: row.material_code,
        location_code: row.location_code,
        requestedQuantity: row.quantity,
        appliedQuantity: 0,
        status: "failed",
        message: err instanceof Error ? err.message : "Unknown error.",
      });
    }

    processed += 1;

    if (onProgress) {
      onProgress(processed, rows.length);
    }
  }

  return summary;
}

const ALLOCATION_REPORT_COLUMNS = [
  { header: "Material Code", key: "material_code" },
  { header: "Location Code", key: "location_code" },
  { header: "Requested Quantity", key: "requestedQuantity" },
  { header: "Applied Quantity", key: "appliedQuantity" },
];

const ALLOCATION_OUTCOME_STATUS: Record<
  AllocationImportOutcome["status"],
  BulkImportRowStatus
> = {
  applied: "Applied",
  partial: "Partial",
  failed: "Failed",
};

/**
 * Builds a combined Excel report for a Bulk Allocate import, covering
 * every row submitted: rows rejected by validation before the import ran,
 * and every outcome (applied, partial, or failed) recorded while applying
 * the rest - along with the reason for anything other than a clean, full
 * allocation. Saves the report to Reports > Import Reports history and
 * then downloads it immediately.
 */
export async function downloadAllocationImportReport(
  validation: AllocationValidationResult,
  summary: AllocationImportSummary,
  fileName?: string | null
): Promise<void> {
  const rejected: BulkImportReportRow[] = validation.invalidRows.map((row) => ({
    rowNumber: row.rowNumber,
    status: "Rejected",
    reason: row.errors.join("; "),
    data: {
      material_code: row.material_code,
      location_code: row.location_code,
      requestedQuantity: row.quantityRaw,
      appliedQuantity: "",
    },
  }));

  const outcomes: BulkImportReportRow[] = summary.outcomes.map((row) => ({
    rowNumber: row.rowNumber,
    status: ALLOCATION_OUTCOME_STATUS[row.status],
    reason: row.message,
    data: {
      material_code: row.material_code,
      location_code: row.location_code,
      requestedQuantity: row.requestedQuantity,
      appliedQuantity: row.appliedQuantity,
    },
  }));

  await recordAndDownloadBulkImportReport({
    importType: "Bulk Allocate",
    fileName,
    totalRows: validation.totalRecords,
    successCount: summary.applied + summary.partial,
    rejectedCount: validation.invalidRows.length,
    failedCount: summary.failed,
    fileNamePrefix: "Bulk_Allocate_Import",
    columns: ALLOCATION_REPORT_COLUMNS,
    rows: [...rejected, ...outcomes],
    summary: [
      { label: "Total Excel Rows", value: validation.totalRecords },
      { label: "Sent for Import", value: summary.totalRows },
      { label: "Rejected (validation)", value: validation.invalidRows.length },
      { label: "Applied", value: summary.applied },
      { label: "Partial", value: summary.partial },
      { label: "Failed", value: summary.failed },
    ],
  });
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
