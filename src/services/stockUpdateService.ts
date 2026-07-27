import { supabase } from "../config/supabase";

import {
  getAllocations,
  applyOpeningStock,
  applyAdjustment,
} from "./materialAllocationService";
import { addMaterial } from "./materialService";
import {
  applyStockMovement,
  generateReferenceNumber,
} from "./inventoryTransactionService";

import {
  type BulkImportReportRow,
  type BulkImportRowStatus,
} from "../utils/bulkImportReport";
import { recordAndDownloadBulkImportReport } from "./bulkImportHistoryService";

const UNALLOCATED_LOCATION = "UNALLOCATED";

/* =========================================================================
 * "Stock Update" - the single entry point for putting stock quantities
 * into the system, superseding the old separate "Opening Stock" feature.
 * An optional Location Code lets a row target a specific location instead
 * of Unallocated (exactly like Opening Stock used to); this reconciles a
 * full physical-stock snapshot against the system's current stock without
 * ever silently overwriting material_allocation:
 *
 *   - Material not in Material Master -> auto-created, quantity applied to
 *     the given Location Code (or UNALLOCATED if none given).
 *   - Material exists, system stock (summed across all locations) is 0 ->
 *     nothing to reconcile against, so the quantity is simply posted to
 *     the given Location Code (or UNALLOCATED), same as Opening Stock.
 *   - Material exists, system stock is non-zero, uploaded qty == system
 *     qty -> no action.
 *   - Material exists, system stock is non-zero, quantities differ ->
 *     flagged in `pending_stock_updates` for manual review/resolution;
 *     the live stock ledger is left untouched here.
 * ========================================================================= */

export interface PendingStockUpdate {
  id: number;
  material_code: string;
  short_description: string | null;
  uom: string | null;
  uploaded_qty: number;
  system_qty_at_upload: number;
  difference: number;
  batch_file_name: string | null;
  uploaded_at: string;
}

const PENDING_COLUMNS =
  "id, material_code, short_description, uom, uploaded_qty, system_qty_at_upload, difference, batch_file_name, uploaded_at";

export async function getPendingStockUpdates(): Promise<
  PendingStockUpdate[]
> {
  const { data, error } = await supabase
    .from("pending_stock_updates")
    .select(PENDING_COLUMNS)
    .order("uploaded_at", { ascending: false });

  if (error) {
    console.error(error);
    return [];
  }

  return (data ?? []) as PendingStockUpdate[];
}

export async function getPendingStockUpdate(
  materialCode: string
): Promise<PendingStockUpdate | null> {
  const { data, error } = await supabase
    .from("pending_stock_updates")
    .select(PENDING_COLUMNS)
    .eq("material_code", materialCode)
    .maybeSingle();

  if (error) throw error;

  return (data as PendingStockUpdate | null) ?? null;
}

export async function dismissPendingStockUpdate(
  materialCode: string
): Promise<void> {
  const { error } = await supabase
    .from("pending_stock_updates")
    .delete()
    .eq("material_code", materialCode);

  if (error) throw error;
}

/**
 * Resolves a pending update where the uploaded quantity was HIGHER than
 * system stock: the extra is unambiguous (extra stock found), so it is
 * simply added to UNALLOCATED, then the pending flag is cleared.
 */
export async function applyPendingIncreaseToUnallocated(
  pending: PendingStockUpdate
): Promise<void> {
  if (pending.difference <= 0) {
    throw new Error("This update is not an increase.");
  }

  await applyOpeningStock(
    pending.material_code,
    UNALLOCATED_LOCATION,
    pending.difference,
    `Bulk Stock Update reconciliation (uploaded ${pending.uploaded_qty})`
  );

  await dismissPendingStockUpdate(pending.material_code);
}

/**
 * Resolves a pending update where the uploaded quantity was LOWER than
 * system stock AND the shortfall fits entirely within the unallocated
 * balance: reduces UNALLOCATED by the shortfall, then clears the flag.
 * Callers must have already confirmed shortfall <= current unallocated
 * balance (the reconciliation panel only offers this action in that case).
 */
export async function applyPendingDecreaseFromUnallocated(
  pending: PendingStockUpdate
): Promise<void> {
  if (pending.difference >= 0) {
    throw new Error("This update is not a decrease.");
  }

  const shortfall = Math.abs(pending.difference);
  const allocations = await getAllocations(pending.material_code);
  const unallocatedRow = allocations.find(
    (a) => a.location_code === UNALLOCATED_LOCATION
  );
  const unallocatedQty = unallocatedRow?.quantity ?? 0;

  if (shortfall > unallocatedQty) {
    throw new Error(
      `Shortfall (${shortfall}) exceeds the unallocated balance (${unallocatedQty}) - use Adjust Allocation instead.`
    );
  }

  await applyAdjustment(
    pending.material_code,
    UNALLOCATED_LOCATION,
    unallocatedQty - shortfall,
    "Physical Count Variance",
    `Bulk Stock Update reconciliation (uploaded ${pending.uploaded_qty})`
  );

  await dismissPendingStockUpdate(pending.material_code);
}

/**
 * Resolves a pending update via manual multi-location reconciliation: the
 * caller (Reconcile dialog) supplies the final quantity for every location
 * currently holding this material (including UNALLOCATED), which together
 * must sum to the uploaded quantity - the dialog enforces this before
 * calling in. Applies each changed location through the normal Adjustment
 * path, then clears the pending flag.
 */
export async function applyStockReconciliation(
  materialCode: string,
  locationQuantities: { location_code: string; quantity: number }[],
  reason: string,
  remarks?: string
): Promise<void> {
  for (const { location_code, quantity } of locationQuantities) {
    await applyAdjustment(materialCode, location_code, quantity, reason, remarks);
  }

  await dismissPendingStockUpdate(materialCode);
}

/* -------------------------------------------------------------------------
 * Parsing
 * ---------------------------------------------------------------------- */

export interface StockUpdateImportRow {
  rowNumber: number;
  material_code: string;
  location_code: string;
  short_description: string;
  uom: string;
  hsn_code: string;
  material_group: string;
  quantity: number;
}

export interface StockUpdateInvalidRow {
  rowNumber: number;
  material_code: string;
  quantityRaw: string;
  errors: string[];
}

export interface StockUpdateValidationResult {
  totalRecords: number;
  validRows: StockUpdateImportRow[];
  invalidRows: StockUpdateInvalidRow[];
}

function getFieldValue(row: Record<string, unknown>, aliases: string[]): string {
  const keys = Object.keys(row);

  for (const alias of aliases) {
    const match = keys.find(
      (key) => key.trim().toLowerCase() === alias.toLowerCase()
    );

    if (match !== undefined) {
      const value = row[match];
      return value === null || value === undefined ? "" : String(value).trim();
    }
  }

  return "";
}

function isRowBlank(row: Record<string, unknown>): boolean {
  return Object.values(row).every((value) => {
    if (value === null || value === undefined) return true;
    return String(value).trim() === "";
  });
}

function parseQuantity(raw: string): number {
  const cleaned = raw.replace(/,/g, "").trim();
  if (!cleaned) return NaN;
  return Number(cleaned);
}

/**
 * Parses the Stock Update Excel file. A material can appear on more than
 * one row (e.g. counted across multiple bins) - all rows for the same
 * Material Code are summed into a single quantity. Short Description/UoM/
 * HSN/Material Group are only required for materials that turn out to be
 * new (checked against the database in `bulkApplyStockUpdate`), so they
 * are carried through here but not validated as required. Location Code
 * is optional (defaults to Unallocated) and only takes effect when the
 * row ends up being posted directly rather than reconciled - see
 * `bulkApplyStockUpdate`.
 */
export function parseStockUpdateExcelRows(
  rawRows: Record<string, unknown>[]
): StockUpdateValidationResult {
  const invalidRows: StockUpdateInvalidRow[] = [];
  const grouped = new Map<
    string,
    {
      rowNumber: number;
      location_code: string;
      short_description: string;
      uom: string;
      hsn_code: string;
      material_group: string;
      quantity: number;
    }
  >();
  const groupOrder: string[] = [];

  let totalRecords = 0;

  rawRows.forEach((row, index) => {
    if (isRowBlank(row)) return;

    totalRecords += 1;
    const rowNumber = index + 2;

    const materialCode = getFieldValue(row, [
      "Material Code",
      "material_code",
      "Material",
    ]);
    const locationCode = getFieldValue(row, [
      "Location Code",
      "location_code",
      "Location",
    ]);
    const shortDescription = getFieldValue(row, [
      "Short Description",
      "Description",
      "short_description",
      "Material Description",
    ]);
    const uom = getFieldValue(row, ["UoM", "UOM", "Unit", "uom"]);
    const hsnCode = getFieldValue(row, ["HSN Code", "HSN", "hsn_code"]);
    const materialGroup = getFieldValue(row, [
      "Material Group",
      "material_group",
    ]);
    const quantityRaw = getFieldValue(row, [
      "Quantity",
      "Qty",
      "Current Quantity",
      "Current Stock",
      "Physical Quantity",
    ]);

    const errors: string[] = [];

    if (!materialCode) {
      errors.push("Material Code is required.");
    }

    const quantity = parseQuantity(quantityRaw);

    if (!quantityRaw) {
      errors.push("Quantity is required.");
    } else if (Number.isNaN(quantity)) {
      errors.push("Quantity must be a number.");
    } else if (quantity < 0) {
      errors.push("Quantity cannot be negative.");
    }

    if (errors.length > 0) {
      invalidRows.push({
        rowNumber,
        material_code: materialCode,
        quantityRaw,
        errors,
      });
      return;
    }

    const key = materialCode.toUpperCase();

    if (!grouped.has(key)) {
      grouped.set(key, {
        rowNumber,
        location_code: locationCode,
        short_description: shortDescription,
        uom,
        hsn_code: hsnCode,
        material_group: materialGroup,
        quantity: 0,
      });
      groupOrder.push(key);
    }

    const entry = grouped.get(key)!;
    entry.quantity += quantity;
    // Fill in master-data/location fields from whichever row provides
    // them first, in case only some rows for a material carry them.
    if (!entry.location_code && locationCode) {
      entry.location_code = locationCode;
    }
    if (!entry.short_description && shortDescription) {
      entry.short_description = shortDescription;
    }
    if (!entry.uom && uom) entry.uom = uom;
    if (!entry.hsn_code && hsnCode) entry.hsn_code = hsnCode;
    if (!entry.material_group && materialGroup) {
      entry.material_group = materialGroup;
    }
  });

  const validRows: StockUpdateImportRow[] = groupOrder.map((key) => {
    const entry = grouped.get(key)!;
    return {
      rowNumber: entry.rowNumber,
      material_code: key,
      location_code: entry.location_code,
      short_description: entry.short_description,
      uom: entry.uom,
      hsn_code: entry.hsn_code,
      material_group: entry.material_group,
      quantity: entry.quantity,
    };
  });

  return { totalRecords, validRows, invalidRows };
}

/* -------------------------------------------------------------------------
 * Apply
 * ---------------------------------------------------------------------- */

export type StockUpdateOutcomeStatus =
  | "new_material"
  | "posted"
  | "matched"
  | "flagged"
  | "failed";

export interface StockUpdateOutcome {
  rowNumber: number;
  material_code: string;
  uploaded_qty: number;
  system_qty: number | null;
  status: StockUpdateOutcomeStatus;
  message?: string;
}

export interface StockUpdateImportSummary {
  totalRows: number;
  newMaterials: number;
  posted: number;
  matched: number;
  flagged: number;
  failed: number;
  outcomes: StockUpdateOutcome[];
}

function deriveMaterialGroup(materialCode: string, materialGroup: string): string {
  return materialGroup || materialCode.substring(0, 2);
}

/** Splits an array into chunks of at most `size` items, in order. */
function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// Matches IMPORT_BATCH_SIZE used elsewhere (e.g. Material Master bulk
// import) - large enough to cut round trips drastically, small enough to
// stay well under PostgREST/URL payload limits for `.in()` filters.
const BATCH_SIZE = 500;

/**
 * Runs `fn` once per chunk of `items` (sequentially, so writes to the same
 * table never race each other) and reports progress by linearly mapping
 * "chunks completed" onto the `[startFraction, endFraction]` slice of the
 * overall progress bar.
 */
async function runChunked<T>(
  items: T[],
  startFraction: number,
  endFraction: number,
  reportProgress: (fraction: number) => void,
  fn: (batch: T[]) => Promise<void>
): Promise<void> {
  const chunks = chunk(items, BATCH_SIZE);

  if (chunks.length === 0) {
    reportProgress(endFraction);
    return;
  }

  for (let i = 0; i < chunks.length; i++) {
    await fn(chunks[i]);
    reportProgress(
      startFraction + ((i + 1) / chunks.length) * (endFraction - startFraction)
    );
  }
}

/**
 * Creates a batch of brand-new materials in as few round trips as
 * possible: one bulk insert into `material_master`, one bulk insert into
 * `material_allocation` (at each row's Location Code, or UNALLOCATED if
 * none given, since these materials have no prior allocation to merge
 * with), and one best-effort bulk insert into `inventory_transactions`
 * for the audit log. If the bulk insert fails (e.g. one bad row in the
 * batch), falls back to the original one-row-at-a-time path for just this
 * batch, so a single bad row never sinks the rest of the import.
 */
async function insertNewMaterialsBatch(
  batch: StockUpdateImportRow[],
  fileName: string | undefined,
  summary: StockUpdateImportSummary
): Promise<void> {
  const { error: masterError } = await supabase.from("material_master").insert(
    batch.map((row) => ({
      material_code: row.material_code,
      short_description: row.short_description,
      uom: row.uom,
      hsn_code: row.hsn_code,
      material_group: deriveMaterialGroup(row.material_code, row.material_group),
      is_active: true,
    }))
  );

  if (masterError) {
    // Bulk insert failed - fall back to the original per-row path so one
    // bad row (e.g. a duplicate created elsewhere in the meantime) can't
    // block the rest of this batch.
    for (const row of batch) {
      const locationCode = row.location_code || UNALLOCATED_LOCATION;

      try {
        await addMaterial({
          material_code: row.material_code,
          short_description: row.short_description,
          uom: row.uom,
          hsn_code: row.hsn_code,
          material_group: deriveMaterialGroup(row.material_code, row.material_group),
          current_quantity: 0,
          is_active: true,
        });

        await applyStockMovement({
          materialCode: row.material_code,
          locationCode,
          prevQuantity: 0,
          newQuantity: row.quantity,
          transactionType: "OPENING_STOCK",
          referenceType: "STOCK_UPDATE",
          reason: "New Material - Bulk Stock Update",
          remarks: fileName ? `From ${fileName}` : undefined,
        });

        summary.newMaterials += 1;
        summary.outcomes.push({
          rowNumber: row.rowNumber,
          material_code: row.material_code,
          uploaded_qty: row.quantity,
          system_qty: 0,
          status: "new_material",
        });
      } catch (err) {
        summary.failed += 1;
        summary.outcomes.push({
          rowNumber: row.rowNumber,
          material_code: row.material_code,
          uploaded_qty: row.quantity,
          system_qty: null,
          status: "failed",
          message: err instanceof Error ? err.message : "Unknown error.",
        });
      }
    }
    return;
  }

  const { error: allocationError } = await supabase
    .from("material_allocation")
    .insert(
      batch.map((row) => ({
        material_code: row.material_code,
        location_code: row.location_code || UNALLOCATED_LOCATION,
        quantity: row.quantity,
      }))
    );

  if (allocationError) {
    // The Material Master rows are in, but stock couldn't be applied -
    // report every row in this batch as failed rather than silently
    // leaving them at a zero balance.
    for (const row of batch) {
      summary.failed += 1;
      summary.outcomes.push({
        rowNumber: row.rowNumber,
        material_code: row.material_code,
        uploaded_qty: row.quantity,
        system_qty: null,
        status: "failed",
        message: allocationError.message,
      });
    }
    return;
  }

  // Best-effort audit log, same guarantee as recordInventoryTransaction:
  // never blocks or fails the import if it errors out.
  const { error: txError } = await supabase.from("inventory_transactions").insert(
    batch.map((row) => ({
      transaction_no: generateReferenceNumber("OB"),
      transaction_type: "OPENING_STOCK",
      material_code: row.material_code,
      location_code: row.location_code || UNALLOCATED_LOCATION,
      quantity: row.quantity,
      movement: "IN",
      balance_after: row.quantity,
      reference_type: "STOCK_UPDATE",
      reason: "New Material - Bulk Stock Update",
      remarks: fileName ? `From ${fileName}` : undefined,
    }))
  );

  if (txError) {
    console.warn(
      "Inventory transaction log skipped for a batch:",
      txError.message
    );
  }

  for (const row of batch) {
    summary.newMaterials += 1;
    summary.outcomes.push({
      rowNumber: row.rowNumber,
      material_code: row.material_code,
      uploaded_qty: row.quantity,
      system_qty: 0,
      status: "new_material",
    });
  }
}

/**
 * Posts a Stock Update row for an existing material that currently has no
 * stock anywhere - there is nothing to reconcile against, so it's applied
 * directly to its Location Code (or UNALLOCATED) exactly like the old
 * Opening Stock feature, rather than being flagged for review.
 */
async function postStockUpdateRow(
  row: StockUpdateImportRow,
  fileName: string | undefined,
  summary: StockUpdateImportSummary
): Promise<void> {
  try {
    await applyOpeningStock(
      row.material_code,
      row.location_code || UNALLOCATED_LOCATION,
      row.quantity,
      fileName ? `Bulk Stock Update (from ${fileName})` : "Bulk Stock Update"
    );

    summary.posted += 1;
    summary.outcomes.push({
      rowNumber: row.rowNumber,
      material_code: row.material_code,
      uploaded_qty: row.quantity,
      system_qty: 0,
      status: "posted",
    });
  } catch (err) {
    summary.failed += 1;
    summary.outcomes.push({
      rowNumber: row.rowNumber,
      material_code: row.material_code,
      uploaded_qty: row.quantity,
      system_qty: 0,
      status: "failed",
      message: err instanceof Error ? err.message : "Unknown error.",
    });
  }
}

/**
 * Applies a batch of Stock Update rows against the database. For each
 * material:
 *   - not in Material Master -> create it (requires Short Description and
 *     UoM to be present on at least one of its rows) and apply the full
 *     uploaded quantity to its Location Code (or UNALLOCATED if none
 *     given).
 *   - in Material Master, system stock is 0 -> nothing to reconcile
 *     against, so post the quantity straight to its Location Code (or
 *     UNALLOCATED), same as the old Opening Stock feature.
 *   - in Material Master, system stock is non-zero, quantities match ->
 *     no action (and any stale pending flag for it is cleared, since the
 *     count now agrees).
 *   - in Material Master, system stock is non-zero, quantities differ ->
 *     upsert a row into `pending_stock_updates` for manual review;
 *     material_allocation is left untouched.
 *
 * A non-blank Location Code is validated against Location Master up
 * front; a row naming an unknown location always fails, regardless of
 * which branch above it would otherwise take.
 *
 * Unlike the original row-by-row implementation (which issued 2-5
 * sequential network round trips per row - a 5+ hour run for an 11,000
 * row file), every phase below batches its database work into `.in()`
 * lookups and bulk insert/upsert/delete calls of up to `BATCH_SIZE` rows,
 * so the whole import costs on the order of dozens of round trips rather
 * than tens of thousands.
 */
export async function bulkApplyStockUpdate(
  rows: StockUpdateImportRow[],
  fileName: string | undefined,
  onProgress?: (processed: number, total: number) => void
): Promise<StockUpdateImportSummary> {
  const summary: StockUpdateImportSummary = {
    totalRows: rows.length,
    newMaterials: 0,
    posted: 0,
    matched: 0,
    flagged: 0,
    failed: 0,
    outcomes: [],
  };

  const total = rows.length;

  if (total === 0) {
    return summary;
  }

  function reportProgress(fraction: number) {
    if (!onProgress) return;
    onProgress(Math.min(total, Math.max(0, Math.round(fraction * total))), total);
  }

  // ---- Phase 0: which explicitly-given Location Codes actually exist? ----
  const locationCodesToCheck = Array.from(
    new Set(
      rows
        .map((row) => row.location_code)
        .filter((code): code is string => !!code)
    )
  );
  const knownLocations = new Set<string>();

  await runChunked(locationCodesToCheck, 0, 0.05, reportProgress, async (codes) => {
    const { data, error } = await supabase
      .from("location_master")
      .select("location_code")
      .in("location_code", codes);

    if (error) throw error;

    (data ?? []).forEach((l: { location_code: string }) =>
      knownLocations.add(l.location_code)
    );
  });

  const allCodes = rows.map((row) => row.material_code);

  // ---- Phase 1: which of these material codes already exist? ----
  const existingCodes = new Set<string>();
  await runChunked(allCodes, 0.05, 0.2, reportProgress, async (codes) => {
    const { data, error } = await supabase
      .from("material_master")
      .select("material_code")
      .in("material_code", codes);

    if (error) throw error;

    (data ?? []).forEach((m: { material_code: string }) =>
      existingCodes.add(m.material_code)
    );
  });

  // ---- Phase 2: current system quantity (summed across all locations)
  // for every material that already exists ----
  const existingCodeList = allCodes.filter((code) => existingCodes.has(code));
  const systemQtyMap = new Map<string, number>();

  await runChunked(existingCodeList, 0.2, 0.35, reportProgress, async (codes) => {
    const { data, error } = await supabase
      .from("material_allocation")
      .select("material_code, quantity")
      .in("material_code", codes);

    if (error) throw error;

    (data ?? []).forEach((a: { material_code: string; quantity: number }) => {
      systemQtyMap.set(
        a.material_code,
        (systemQtyMap.get(a.material_code) ?? 0) + Number(a.quantity)
      );
    });
  });

  // ---- Phase 3: classify every row in memory - no network calls, so
  // this is effectively instantaneous even for 10,000+ rows ----
  const newMaterialRows: StockUpdateImportRow[] = [];
  const postRows: StockUpdateImportRow[] = [];
  const matchedCodes: string[] = [];
  const flaggedRows: { row: StockUpdateImportRow; systemQty: number }[] = [];

  for (const row of rows) {
    if (row.location_code && !knownLocations.has(row.location_code)) {
      summary.failed += 1;
      summary.outcomes.push({
        rowNumber: row.rowNumber,
        material_code: row.material_code,
        uploaded_qty: row.quantity,
        system_qty: null,
        status: "failed",
        message: `Location Code "${row.location_code}" was not found in Location Master.`,
      });
      continue;
    }

    if (!existingCodes.has(row.material_code)) {
      if (!row.short_description || !row.uom) {
        summary.failed += 1;
        summary.outcomes.push({
          rowNumber: row.rowNumber,
          material_code: row.material_code,
          uploaded_qty: row.quantity,
          system_qty: null,
          status: "failed",
          message: "New material - Short Description and UoM are required.",
        });
        continue;
      }

      newMaterialRows.push(row);
      continue;
    }

    const systemQty = systemQtyMap.get(row.material_code) ?? 0;

    if (systemQty === row.quantity) {
      matchedCodes.push(row.material_code);
      summary.matched += 1;
      summary.outcomes.push({
        rowNumber: row.rowNumber,
        material_code: row.material_code,
        uploaded_qty: row.quantity,
        system_qty: systemQty,
        status: "matched",
      });
    } else if (systemQty === 0) {
      // No existing stock anywhere for this material - nothing to
      // reconcile against, so treat it like an opening balance and post
      // it directly instead of flagging it for review.
      postRows.push(row);
    } else {
      flaggedRows.push({ row, systemQty });
      summary.flagged += 1;
      summary.outcomes.push({
        rowNumber: row.rowNumber,
        material_code: row.material_code,
        uploaded_qty: row.quantity,
        system_qty: systemQty,
        status: "flagged",
        message: `Difference of ${row.quantity - systemQty} flagged for review.`,
      });
    }
  }

  reportProgress(0.4);

  // ---- Phase 4: counts agree -> clear any stale pending flag. A single
  // `DELETE ... WHERE material_code IN (...)` per batch, best-effort
  // (matches the original per-row dismiss, which also ignored errors) ----
  await runChunked(matchedCodes, 0.4, 0.5, reportProgress, async (codes) => {
    const { error } = await supabase
      .from("pending_stock_updates")
      .delete()
      .in("material_code", codes);

    if (error) {
      console.warn("Failed to clear pending stock updates for a batch:", error);
    }
  });

  // ---- Phase 5: counts differ -> bulk-upsert into pending_stock_updates.
  // Falls back to per-row upserts within a batch if the batch upsert
  // itself fails, so one bad row can't drop every other flag in it. ----
  const uploadedAt = new Date().toISOString();

  await runChunked(flaggedRows, 0.5, 0.6, reportProgress, async (batch) => {
    const payload = batch.map(({ row, systemQty }) => ({
      material_code: row.material_code,
      short_description: row.short_description || null,
      uom: row.uom || null,
      uploaded_qty: row.quantity,
      system_qty_at_upload: systemQty,
      difference: row.quantity - systemQty,
      batch_file_name: fileName ?? null,
      uploaded_at: uploadedAt,
    }));

    const { error } = await supabase
      .from("pending_stock_updates")
      .upsert(payload, { onConflict: "user_id,material_code" });

    if (!error) return;

    // Fall back to per-row so a single bad row in the batch doesn't
    // silently drop every other row's flag.
    for (const { row, systemQty } of batch) {
      const outcome = summary.outcomes.find(
        (o) => o.material_code === row.material_code && o.status === "flagged"
      );

      try {
        const { error: rowError } = await supabase
          .from("pending_stock_updates")
          .upsert(
            {
              material_code: row.material_code,
              short_description: row.short_description || null,
              uom: row.uom || null,
              uploaded_qty: row.quantity,
              system_qty_at_upload: systemQty,
              difference: row.quantity - systemQty,
              batch_file_name: fileName ?? null,
              uploaded_at: uploadedAt,
            },
            { onConflict: "user_id,material_code" }
          );

        if (rowError) throw rowError;
      } catch (rowErr) {
        summary.flagged -= 1;
        summary.failed += 1;

        if (outcome) {
          outcome.status = "failed";
          outcome.message =
            rowErr instanceof Error ? rowErr.message : "Unknown error.";
        }
      }
    }
  });

  // ---- Phase 6: genuinely new materials ----
  await runChunked(newMaterialRows, 0.6, 0.8, reportProgress, (batch) =>
    insertNewMaterialsBatch(batch, fileName, summary)
  );

  // ---- Phase 7: existing materials with no stock anywhere yet - post
  // straight to the given location (or UNALLOCATED), one at a time since
  // each is a read-then-write against material_allocation. ----
  for (let i = 0; i < postRows.length; i++) {
    await postStockUpdateRow(postRows[i], fileName, summary);
    reportProgress(0.8 + ((i + 1) / Math.max(postRows.length, 1)) * 0.2);
  }

  if (postRows.length === 0) {
    reportProgress(1);
  }

  return summary;
}

const STOCK_UPDATE_REPORT_COLUMNS = [
  { header: "Material Code", key: "material_code" },
  { header: "Uploaded Quantity", key: "uploaded_qty" },
  { header: "System Quantity", key: "system_qty" },
];

const OUTCOME_STATUS: Record<StockUpdateOutcomeStatus, BulkImportRowStatus> = {
  new_material: "Imported",
  posted: "Applied",
  matched: "Applied",
  flagged: "Partial",
  failed: "Failed",
};

export async function downloadStockUpdateImportReport(
  validation: StockUpdateValidationResult,
  summary: StockUpdateImportSummary,
  fileName?: string | null
): Promise<void> {
  const rejected: BulkImportReportRow[] = validation.invalidRows.map((row) => ({
    rowNumber: row.rowNumber,
    status: "Rejected",
    reason: row.errors.join("; "),
    data: {
      material_code: row.material_code,
      uploaded_qty: row.quantityRaw,
      system_qty: "",
    },
  }));

  const outcomes: BulkImportReportRow[] = summary.outcomes.map((row) => ({
    rowNumber: row.rowNumber,
    status: OUTCOME_STATUS[row.status],
    reason: row.message,
    data: {
      material_code: row.material_code,
      uploaded_qty: row.uploaded_qty,
      system_qty: row.system_qty ?? "",
    },
  }));

  await recordAndDownloadBulkImportReport({
    importType: "Stock Update",
    fileName,
    totalRows: validation.totalRecords,
    successCount:
      summary.newMaterials + summary.posted + summary.matched + summary.flagged,
    rejectedCount: validation.invalidRows.length,
    failedCount: summary.failed,
    fileNamePrefix: "Stock_Update_Import",
    columns: STOCK_UPDATE_REPORT_COLUMNS,
    rows: [...rejected, ...outcomes],
    summary: [
      { label: "Total Excel Rows", value: validation.totalRecords },
      { label: "Sent for Import", value: summary.totalRows },
      { label: "Rejected (validation)", value: validation.invalidRows.length },
      { label: "New Materials", value: summary.newMaterials },
      { label: "Posted (no prior stock)", value: summary.posted },
      { label: "Matched", value: summary.matched },
      { label: "Flagged for Review", value: summary.flagged },
      { label: "Failed", value: summary.failed },
    ],
  });
}
