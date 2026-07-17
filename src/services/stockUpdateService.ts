import { supabase } from "../config/supabase";

import {
  getAllocations,
  applyOpeningStock,
  applyAdjustment,
} from "./materialAllocationService";
import { materialExists, addMaterial } from "./materialService";
import { applyStockMovement } from "./inventoryTransactionService";

import {
  type BulkImportReportRow,
  type BulkImportRowStatus,
} from "../utils/bulkImportReport";
import { recordAndDownloadBulkImportReport } from "./bulkImportHistoryService";

const UNALLOCATED_LOCATION = "UNALLOCATED";

/* =========================================================================
 * Periodic "Stock Update (Bulk)" import
 *
 * Unlike Opening Stock (which adds to existing balances) and Bulk Allocate
 * (which moves stock between locations), this feature reconciles a full
 * physical-stock snapshot against the system's current stock without ever
 * silently overwriting material_allocation:
 *
 *   - Material not in Material Master  -> auto-created, quantity applied
 *     straight to UNALLOCATED (same as today's "new material" behavior).
 *   - Material exists, uploaded qty == system qty -> no action.
 *   - Material exists, quantities differ -> flagged in
 *     `pending_stock_updates` for manual review/resolution; the live
 *     stock ledger is left untouched here.
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
 * are carried through here but not validated as required.
 */
export function parseStockUpdateExcelRows(
  rawRows: Record<string, unknown>[]
): StockUpdateValidationResult {
  const invalidRows: StockUpdateInvalidRow[] = [];
  const grouped = new Map<
    string,
    {
      rowNumber: number;
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
    // Fill in master-data fields from whichever row provides them first,
    // in case only some rows for a new material carry them.
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
  matched: number;
  flagged: number;
  failed: number;
  outcomes: StockUpdateOutcome[];
}

function deriveMaterialGroup(materialCode: string, materialGroup: string): string {
  return materialGroup || materialCode.substring(0, 2);
}

/**
 * Applies a batch of Stock Update rows one at a time. For each material:
 *   - not in Material Master -> create it (requires Short Description and
 *     UoM to be present on at least one of its rows) and apply the full
 *     uploaded quantity to UNALLOCATED.
 *   - in Material Master, quantities match -> no action (and any stale
 *     pending flag for it is cleared, since the count now agrees).
 *   - in Material Master, quantities differ -> upsert a row into
 *     `pending_stock_updates` for manual review; material_allocation is
 *     left untouched.
 */
export async function bulkApplyStockUpdate(
  rows: StockUpdateImportRow[],
  fileName: string | undefined,
  onProgress?: (processed: number, total: number) => void
): Promise<StockUpdateImportSummary> {
  const summary: StockUpdateImportSummary = {
    totalRows: rows.length,
    newMaterials: 0,
    matched: 0,
    flagged: 0,
    failed: 0,
    outcomes: [],
  };

  let processed = 0;

  for (const row of rows) {
    try {
      const exists = await materialExists(row.material_code);

      if (!exists) {
        if (!row.short_description || !row.uom) {
          throw new Error(
            "New material - Short Description and UoM are required."
          );
        }

        await addMaterial({
          material_code: row.material_code,
          short_description: row.short_description,
          uom: row.uom,
          hsn_code: row.hsn_code,
          material_group: deriveMaterialGroup(
            row.material_code,
            row.material_group
          ),
          current_quantity: 0,
          is_active: true,
        });

        await applyStockMovement({
          materialCode: row.material_code,
          locationCode: UNALLOCATED_LOCATION,
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
      } else {
        const allocations = await getAllocations(row.material_code);
        const systemQty = allocations.reduce(
          (sum, a) => sum + Number(a.quantity),
          0
        );

        if (systemQty === row.quantity) {
          // Counts agree - nothing to do. Clear any earlier flag for this
          // material since it's no longer in question.
          await dismissPendingStockUpdate(row.material_code).catch(() => {});

          summary.matched += 1;
          summary.outcomes.push({
            rowNumber: row.rowNumber,
            material_code: row.material_code,
            uploaded_qty: row.quantity,
            system_qty: systemQty,
            status: "matched",
          });
        } else {
          const { error } = await supabase
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
                uploaded_at: new Date().toISOString(),
              },
              { onConflict: "material_code" }
            );

          if (error) throw error;

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

    processed += 1;
    if (onProgress) onProgress(processed, rows.length);
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
    successCount: summary.newMaterials + summary.matched + summary.flagged,
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
      { label: "Matched", value: summary.matched },
      { label: "Flagged for Review", value: summary.flagged },
      { label: "Failed", value: summary.failed },
    ],
  });
}
