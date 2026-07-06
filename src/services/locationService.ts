import { supabase } from "../config/supabase";
import type { Location } from "../types/location";
import { type BulkImportReportRow } from "../utils/bulkImportReport";
import { recordAndDownloadBulkImportReport } from "./bulkImportHistoryService";

export async function getLocations(): Promise<Location[]> {
  const { data, error } = await supabase
    .from("location_master")
    .select("*")
    .eq("is_active", true)
    .order("location_code");

  if (error) throw error;

  return data as Location[];
}

const LOCATION_SEARCH_COLUMNS = "location_code, location_description, is_active";

/**
 * Escapes PostgREST `ilike` wildcard characters (% and _) in user-provided
 * search text so they are treated as literal characters rather than
 * wildcards.
 */
function escapeIlikeValue(value: string): string {
  return value.replace(/[%_]/g, (match) => `\\${match}`);
}

/**
 * Single, reusable server-side location search. Searches location_code
 * and location_description directly in Supabase, returns only the columns
 * the UI needs, and is paginated via `.range()` so it stays fast even
 * with very large location tables.
 *
 * - `query` empty -> returns the first page of active locations (ordered
 *   by location_code), useful for an initial/browse view.
 * - `query` non-empty -> returns up to `pageSize` active locations whose
 *   location_code or location_description contains the query (case
 *   insensitive).
 */
export async function searchLocations(
  query: string,
  page: number = 0,
  pageSize: number = 20
): Promise<Location[]> {
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let request = supabase
    .from("location_master")
    .select(LOCATION_SEARCH_COLUMNS)
    .eq("is_active", true)
    .order("location_code")
    .range(from, to);

  const trimmed = query.trim();

  if (trimmed) {
    const safe = escapeIlikeValue(trimmed);
    request = request.or(
      `location_code.ilike.%${safe}%,location_description.ilike.%${safe}%`
    );
  }

  const { data, error } = await request;

  if (error) throw error;

  return (data ?? []) as Location[];
}

export async function locationExists(
  locationCode: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("location_master")
    .select("location_code")
    .eq("location_code", locationCode)
    .maybeSingle();

  if (error) throw error;

  return !!data;
}

export async function addLocation(
  location: Location
): Promise<void> {

  const exists = await locationExists(
    location.location_code
  );

  if (exists) {
    throw new Error("Location Code already exists.");
  }

  const { error } = await supabase
    .from("location_master")
    .insert({
      location_code: location.location_code,
      location_description: location.location_description,
      is_active: true,
    });

  if (error) throw error;
}

/**
 * Tables (and columns) that store a location's code directly, outside of
 * `location_master` itself. When a location's code is renamed, every one of
 * these needs to be updated too so existing allocations, stock movements
 * and transaction history keep pointing at the right location instead of
 * being silently orphaned under the old code.
 */
const LOCATION_CODE_DEPENDENTS: Array<{ table: string; column: string }> = [
  { table: "material_allocation", column: "location_code" },
  { table: "inventory_transactions", column: "location_code" },
  { table: "transfer_item_locations", column: "from_location_code" },
  { table: "transfer_item_locations", column: "to_location_code" },
  { table: "issue_item_locations", column: "location_code" },
];

export async function updateLocation(
  originalLocationCode: string,
  location: Location
): Promise<void> {

  const newLocationCode = location.location_code.trim().toUpperCase();
  const codeChanged = newLocationCode !== originalLocationCode;

  if (codeChanged) {
    const exists = await locationExists(newLocationCode);

    if (exists) {
      throw new Error("Location Code already exists.");
    }
  }

  const { error } = await supabase
    .from("location_master")
    .update({
      location_code: newLocationCode,
      location_description: location.location_description,
    })
    .eq("location_code", originalLocationCode);

  if (error) throw error;

  if (!codeChanged) return;

  // Cascade the rename so materials/stock already allocated to the old
  // code follow the location to its new code.
  for (const { table, column } of LOCATION_CODE_DEPENDENTS) {
    const { error: cascadeError } = await supabase
      .from(table)
      .update({ [column]: newLocationCode })
      .eq(column, originalLocationCode);

    if (cascadeError) throw cascadeError;
  }
}

export async function deleteLocation(
  locationCode: string
): Promise<void> {

  const { error } = await supabase
    .from("location_master")
    .update({
      is_active: false,
    })
    .eq("location_code", locationCode);

  if (error) throw error;
}

export interface LocationPreviewFields {
  location_code: string;
  location_description: string;
  location_type: string;
}

export interface LocationImportRow {
  rowNumber: number;
  location_code: string;
  location_description: string;
  location_type: string;
}

export interface LocationInvalidRow {
  rowNumber: number;
  fields: LocationPreviewFields;
  errors: string[];
}

export interface LocationValidationResult {
  totalRecords: number;
  validRows: LocationImportRow[];
  invalidRows: LocationInvalidRow[];
}

function getFieldValue(
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

function isRowBlank(row: Record<string, unknown>): boolean {
  return Object.values(row).every((value) => {
    if (value === null || value === undefined) return true;
    return String(value).trim() === "";
  });
}

export function extractLocationFields(
  row: Record<string, unknown>
): LocationPreviewFields {
  return {
    location_code: getFieldValue(row, [
      "Location Code",
      "location_code",
      "LocationCode",
    ]),
    location_description: getFieldValue(row, [
      "Location Description",
      "Description",
      "location_description",
    ]),
    location_type: getFieldValue(row, [
      "Location Type",
      "Type",
      "location_type",
    ]),
  };
}

export function parseLocationExcelRows(
  rawRows: Record<string, unknown>[]
): LocationValidationResult {
  const validRows: LocationImportRow[] = [];
  const invalidRows: LocationInvalidRow[] = [];
  const seenCodes = new Set<string>();

  let totalRecords = 0;

  rawRows.forEach((row, index) => {
    if (isRowBlank(row)) {
      return;
    }

    totalRecords += 1;

    const rowNumber = index + 2;
    const fields = extractLocationFields(row);

    const errors: string[] = [];

    if (!fields.location_code) {
      errors.push("Location Code is required.");
    }

    if (!fields.location_description) {
      errors.push("Location Description is required.");
    }

    if (fields.location_code) {
      const key = fields.location_code.toUpperCase();

      if (seenCodes.has(key)) {
        errors.push("Duplicate Location Code within file.");
      } else {
        seenCodes.add(key);
      }
    }

    if (errors.length > 0) {
      invalidRows.push({ rowNumber, fields, errors });
      return;
    }

    validRows.push({
      rowNumber,
      location_code: fields.location_code,
      location_description: fields.location_description,
      location_type: fields.location_type,
    });
  });

  return { totalRecords, validRows, invalidRows };
}

export interface LocationImportFailure {
  location_code: string;
  rowNumber: number;
  location_description: string;
  error: string;
}

export interface LocationImportSuccess {
  location_code: string;
  rowNumber: number;
  location_description: string;
  status: "Imported" | "Updated";
}

export interface LocationImportSummary {
  totalRows: number;
  imported: number;
  updated: number;
  failed: number;
  successes: LocationImportSuccess[];
  failures: LocationImportFailure[];
}

/**
 * Imports locations in an enterprise-safe way, mirroring
 * `bulkImportMaterials`: rows are still read/chunked in batches of
 * `batchSize` for memory efficiency, but within each batch every location
 * is upserted INDIVIDUALLY. A single failing row is caught and recorded as
 * a failure - it never aborts the batch or causes any other row to be
 * skipped. Every row passed in ends up as imported, updated, or failed:
 *   imported + updated + failed === rows.length
 */
export async function bulkImportLocations(
  rows: LocationImportRow[],
  batchSize: number,
  onProgress?: (processed: number, total: number) => void
): Promise<LocationImportSummary> {
  const summary: LocationImportSummary = {
    totalRows: rows.length,
    imported: 0,
    updated: 0,
    failed: 0,
    successes: [],
    failures: [],
  };

  const total = rows.length;
  let processed = 0;

  for (let i = 0; i < total; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const codes = batch.map((row) => row.location_code);

    let existingSet = new Set<string>();

    try {
      const { data: existing, error: fetchError } = await supabase
        .from("location_master")
        .select("location_code")
        .in("location_code", codes);

      if (fetchError) throw fetchError;

      existingSet = new Set(
        (existing ?? []).map(
          (item: { location_code: string }) => item.location_code
        )
      );
    } catch {
      // If the existence check itself fails, every row in this batch is
      // still attempted individually below. Worst case, imported/updated
      // counts may be swapped for this batch, but no row is lost.
      existingSet = new Set();
    }

    for (const row of batch) {
      try {
        const { error: upsertError } = await supabase
          .from("location_master")
          .upsert(
            {
              location_code: row.location_code,
              location_description: row.location_description,
              is_active: true,
            },
            { onConflict: "location_code" }
          );

        if (upsertError) throw upsertError;

        const status = existingSet.has(row.location_code) ? "Updated" : "Imported";

        if (status === "Updated") {
          summary.updated += 1;
        } else {
          summary.imported += 1;
        }

        summary.successes.push({
          location_code: row.location_code,
          rowNumber: row.rowNumber,
          location_description: row.location_description,
          status,
        });
      } catch (err) {
        summary.failed += 1;

        summary.failures.push({
          location_code: row.location_code,
          rowNumber: row.rowNumber,
          location_description: row.location_description,
          error:
            err instanceof Error ? err.message : "Unknown error during import.",
        });
      }

      processed += 1;

      if (onProgress) {
        onProgress(processed, total);
      }
    }
  }

  return summary;
}

const LOCATION_REPORT_COLUMNS = [
  { header: "Location Code", key: "location_code" },
  { header: "Description", key: "location_description" },
];

/**
 * Builds a combined Excel report for a Location Master bulk import,
 * covering every row submitted: rows rejected by validation before the
 * import ran, rows that imported/updated successfully, and rows that
 * failed during the import itself - along with the reason for anything
 * other than a clean success. Saves the report to Reports > Import
 * Reports history and then downloads it immediately.
 */
export async function downloadLocationImportReport(
  validation: LocationValidationResult,
  summary: LocationImportSummary,
  fileName?: string | null
): Promise<void> {
  const rejected: BulkImportReportRow[] = validation.invalidRows.map((row) => ({
    rowNumber: row.rowNumber,
    status: "Rejected",
    reason: row.errors.join("; "),
    data: {
      location_code: row.fields.location_code,
      location_description: row.fields.location_description,
    },
  }));

  const succeeded: BulkImportReportRow[] = summary.successes.map((row) => ({
    rowNumber: row.rowNumber,
    status: row.status,
    data: {
      location_code: row.location_code,
      location_description: row.location_description,
    },
  }));

  const failed: BulkImportReportRow[] = summary.failures.map((row) => ({
    rowNumber: row.rowNumber,
    status: "Failed",
    reason: row.error,
    data: {
      location_code: row.location_code,
      location_description: row.location_description,
    },
  }));

  await recordAndDownloadBulkImportReport({
    importType: "Location Master",
    fileName,
    totalRows: validation.totalRecords,
    successCount: summary.imported + summary.updated,
    rejectedCount: validation.invalidRows.length,
    failedCount: summary.failed,
    fileNamePrefix: "Location_Import",
    columns: LOCATION_REPORT_COLUMNS,
    rows: [...rejected, ...succeeded, ...failed],
    summary: [
      { label: "Total Excel Rows", value: validation.totalRecords },
      { label: "Sent for Import", value: summary.totalRows },
      { label: "Rejected (validation)", value: validation.invalidRows.length },
      { label: "Imported", value: summary.imported },
      { label: "Updated", value: summary.updated },
      { label: "Failed", value: summary.failed },
    ],
  });
}
