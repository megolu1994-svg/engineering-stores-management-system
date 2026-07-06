import { supabase } from "../config/supabase";
import type { Material } from "../types/material";
import { type BulkImportReportRow } from "../utils/bulkImportReport";
import { recordAndDownloadBulkImportReport } from "./bulkImportHistoryService";

export async function getMaterials(): Promise<Material[]> {
  const PAGE_SIZE = 1000;

  const allMaterials: Material[] = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from("material_master")
      .select("*")
      .eq("is_active", true)
      .order("material_code")
      .range(from, to);

    if (error) throw error;

    const page = (data ?? []) as Material[];

    allMaterials.push(...page);

    if (page.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return allMaterials;
}

const MATERIAL_SEARCH_COLUMNS =
  "material_code, short_description, uom, hsn_code, material_group, is_active";

/**
 * Escapes PostgREST `ilike` wildcard characters (% and _) in user-provided
 * search text so they are treated as literal characters rather than
 * wildcards.
 */
function escapeIlikeValue(value: string): string {
  return value.replace(/[%_]/g, (match) => `\\${match}`);
}

/**
 * Single, reusable server-side material search used by both Material
 * Master and Material Allocation (via MaterialSearch). Searches
 * material_code, short_description, and material_group directly in
 * Supabase, returns only the columns the UI needs, and is paginated via
 * `.range()` so it stays fast even with 100,000+ materials.
 *
 * - `query` empty -> returns the first page of active materials
 *   (ordered by material_code), useful for an initial/browse view.
 * - `query` non-empty -> returns up to `pageSize` active materials whose
 *   material_code, short_description, or material_group contains the
 *   query (case insensitive).
 */
export async function searchMaterials(
  query: string,
  page: number = 0,
  pageSize: number = 20
): Promise<Material[]> {
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let request = supabase
    .from("material_master")
    .select(MATERIAL_SEARCH_COLUMNS)
    .eq("is_active", true)
    .order("material_code")
    .range(from, to);

  const trimmed = query.trim();

  if (trimmed) {
    const safe = escapeIlikeValue(trimmed);
    request = request.or(
      `material_code.ilike.%${safe}%,short_description.ilike.%${safe}%,material_group.ilike.%${safe}%`
    );
  }

  const { data, error } = await request;

  if (error) throw error;

  return (data ?? []) as Material[];
}

/**
 * Total count of active materials matching the same filter `searchMaterials`
 * applies, for driving pagination controls without loading every row.
 */
export async function getMaterialsCount(query: string): Promise<number> {
  let request = supabase
    .from("material_master")
    .select("material_code", { count: "exact", head: true })
    .eq("is_active", true);

  const trimmed = query.trim();

  if (trimmed) {
    const safe = escapeIlikeValue(trimmed);
    request = request.or(
      `material_code.ilike.%${safe}%,short_description.ilike.%${safe}%,material_group.ilike.%${safe}%`
    );
  }

  const { count, error } = await request;

  if (error) throw error;

  return count ?? 0;
}

/**
 * Most recent update timestamp across active materials, for a "Last
 * Updated" summary stat. Falls back to `created_at` when `updated_at`
 * isn't populated for any row.
 */
export async function getLastMaterialUpdate(): Promise<string | null> {
  const { data, error } = await supabase
    .from("material_master")
    .select("updated_at")
    .eq("is_active", true)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (data?.updated_at) return data.updated_at as string;

  const { data: fallback, error: fallbackError } = await supabase
    .from("material_master")
    .select("created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fallbackError) throw fallbackError;

  return (fallback?.created_at as string | undefined) ?? null;
}

export async function materialExists(
  materialCode: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("material_master")
    .select("material_code")
    .eq("material_code", materialCode)
    .maybeSingle();

  if (error) throw error;

  return !!data;
}

export async function addMaterial(
  material: Material
): Promise<void> {

  const exists = await materialExists(
    material.material_code
  );

  if (exists) {
    throw new Error("Material Code already exists.");
  }

  const { error } = await supabase
    .from("material_master")
    .insert({
      material_code: material.material_code,
      short_description: material.short_description,
      uom: material.uom,
      hsn_code: material.hsn_code,
      material_group: material.material_group,
      is_active: true,
    });

  if (error) throw error;
}

export async function updateMaterial(
  material: Material
): Promise<void> {

  const { error } = await supabase
    .from("material_master")
    .update({
      short_description: material.short_description,
      uom: material.uom,
      hsn_code: material.hsn_code,
      material_group: material.material_group,
    })
    .eq("material_code", material.material_code);

  if (error) throw error;
}

export async function deleteMaterial(
  materialCode: string
): Promise<void> {

  const { error } = await supabase
    .from("material_master")
    .update({
      is_active: false,
    })
    .eq("material_code", materialCode);

  if (error) throw error;
}

export interface MaterialPreviewFields {
  material_code: string;
  short_description: string;
  uom: string;
  hsn_code: string;
  material_group: string;
}

export interface MaterialImportRow {
  rowNumber: number;
  material_code: string;
  short_description: string;
  uom: string;
  hsn_code: string;
  material_group: string;
}

export interface MaterialInvalidRow {
  rowNumber: number;
  fields: MaterialPreviewFields;
  errors: string[];
}

export interface MaterialValidationResult {
  totalRecords: number;
  validRows: MaterialImportRow[];
  invalidRows: MaterialInvalidRow[];
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

export function extractMaterialFields(
  row: Record<string, unknown>
): MaterialPreviewFields {
  return {
    material_code: getFieldValue(row, [
      "Material Code",
      "material_code",
      "MaterialCode",
      "Material",
    ]),
    short_description: getFieldValue(row, [
      "Short Description",
      "Description",
      "short_description",
      "Material Description",
    ]),
    uom: getFieldValue(row, ["UoM", "UOM", "Unit", "uom", "EUn"]),
    hsn_code: getFieldValue(row, ["HSN Code", "HSN", "hsn_code"]),
    material_group: getFieldValue(row, [
      "Material Group",
      "material_group",
    ]),
  };
}

/**
 * Returns the Material Group to use for a row. If a Material Group is
 * already provided it is kept as-is. If it is blank, it is automatically
 * derived from the first two characters of the Material Code.
 */
function deriveMaterialGroup(
  materialCode: string,
  materialGroup: string
): string {
  if (materialGroup) {
    return materialGroup;
  }

  return materialCode.substring(0, 2);
}

interface StagedRow {
  rowNumber: number;
  fields: MaterialPreviewFields;
}

/**
 * Returns true if the given field (read via `getter`) has more than one
 * distinct non-blank value across the group of staged rows. Blank values
 * are ignored, since a duplicate row that simply omits a field is not
 * considered a conflict.
 */
function hasFieldConflict(
  rows: StagedRow[],
  getter: (row: StagedRow) => string
): boolean {
  const values = new Set(
    rows
      .map(getter)
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
  );

  return values.size > 1;
}

export function parseMaterialExcelRows(
  rawRows: Record<string, unknown>[]
): MaterialValidationResult {
  const invalidRows: MaterialInvalidRow[] = [];

  let totalRecords = 0;

  // ---- Pass 1: per-row validation (required fields + quantity format) ----
  const staged: StagedRow[] = [];

  rawRows.forEach((row, index) => {
    if (isRowBlank(row)) {
      return;
    }

    totalRecords += 1;

    const rowNumber = index + 2;
    const fields = extractMaterialFields(row);

    const errors: string[] = [];

    if (!fields.material_code) {
      errors.push("Material Code is required.");
    }

    if (!fields.short_description) {
      errors.push("Short Description is required.");
    }

    if (!fields.uom) {
      errors.push("UoM is required.");
    }

    if (errors.length > 0) {
      invalidRows.push({ rowNumber, fields, errors });
      return;
    }

    staged.push({
      rowNumber,
      fields,
    });
  });

  // ---- Pass 2: group by Material Code (duplicates are valid and merged) ----
  const groups = new Map<string, StagedRow[]>();
  const groupOrder: string[] = [];

  staged.forEach((stagedRow) => {
    const key = stagedRow.fields.material_code.toUpperCase();

    if (!groups.has(key)) {
      groups.set(key, []);
      groupOrder.push(key);
    }

    groups.get(key)!.push(stagedRow);
  });

  const validRows: MaterialImportRow[] = [];

  groupOrder.forEach((key) => {
    const groupRows = groups.get(key)!;
    const first = groupRows[0];

    const hasConflict =
      hasFieldConflict(groupRows, (r) => r.fields.short_description) ||
      hasFieldConflict(groupRows, (r) => r.fields.uom) ||
      hasFieldConflict(groupRows, (r) => r.fields.hsn_code) ||
      hasFieldConflict(groupRows, (r) => r.fields.material_group);

    if (hasConflict) {
      invalidRows.push({
        rowNumber: first.rowNumber,
        fields: first.fields,
        errors: [
          `Conflicting master data found for Material Code ${first.fields.material_code}.`,
        ],
      });
      return;
    }

    const materialGroup = deriveMaterialGroup(
      first.fields.material_code,
      first.fields.material_group
    );

    validRows.push({
      rowNumber: first.rowNumber,
      material_code: first.fields.material_code,
      short_description: first.fields.short_description,
      uom: first.fields.uom,
      hsn_code: first.fields.hsn_code,
      material_group: materialGroup,
    });
  });

  return { totalRecords, validRows, invalidRows };
}

export type MaterialImportErrorCategory =
  | "Duplicate Key"
  | "Data Too Long"
  | "Invalid Value"
  | "Database Constraint"
  | "Unknown Error";

export interface MaterialImportFailure {
  material_code: string;
  rowNumber: number;
  short_description: string;
  uom: string;
  hsn_code: string;
  material_group: string;
  error: string;
  errorCategory: MaterialImportErrorCategory;
}

export interface MaterialImportSuccess {
  material_code: string;
  rowNumber: number;
  short_description: string;
  uom: string;
  hsn_code: string;
  material_group: string;
  status: "Imported" | "Updated";
}

export interface MaterialImportSummary {
  totalRows: number;
  imported: number;
  updated: number;
  failed: number;
  timeTakenMs: number;
  successes: MaterialImportSuccess[];
  failures: MaterialImportFailure[];
}

interface SupabaseLikeError {
  code?: string;
  message?: string;
}

/**
 * Classifies a database error into a human-readable category so failed
 * import records can be triaged quickly instead of showing a raw
 * Postgres/Supabase error string.
 */
function categorizeError(err: unknown): MaterialImportErrorCategory {
  const supabaseError = err as SupabaseLikeError;
  const code = supabaseError?.code ?? "";
  const message = (supabaseError?.message ?? "").toLowerCase();

  if (code === "23505" || message.includes("duplicate key")) {
    return "Duplicate Key";
  }

  if (
    code === "22001" ||
    message.includes("too long") ||
    message.includes("value too long")
  ) {
    return "Data Too Long";
  }

  if (
    code === "22P02" ||
    code === "22003" ||
    message.includes("invalid input") ||
    message.includes("invalid value") ||
    message.includes("invalid text representation")
  ) {
    return "Invalid Value";
  }

  if (
    code === "23502" ||
    code === "23503" ||
    code === "23514" ||
    message.includes("constraint") ||
    message.includes("violates")
  ) {
    return "Database Constraint";
  }

  return "Unknown Error";
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }

  if (
    typeof err === "object" &&
    err !== null &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  ) {
    return (err as { message: string }).message;
  }

  return "Unknown error during import.";
}

/**
 * Imports materials in an enterprise-safe way:
 *
 * - Excel rows are still read/chunked in batches of `batchSize` for memory
 *   efficiency.
 * - Within each batch, every material is upserted INDIVIDUALLY. A single
 *   failing row is caught, categorized, and recorded as a failure - it
 *   never aborts the batch or causes any other row to be skipped.
 * - Every row passed in is guaranteed to end up as imported, updated, or
 *   failed. Nothing is silently dropped:
 *     imported + updated + failed === rows.length
 */
export async function bulkImportMaterials(
  rows: MaterialImportRow[],
  batchSize: number,
  onProgress?: (processed: number, total: number) => void
): Promise<MaterialImportSummary> {
  const startedAt = Date.now();

  const summary: MaterialImportSummary = {
    totalRows: rows.length,
    imported: 0,
    updated: 0,
    failed: 0,
    timeTakenMs: 0,
    successes: [],
    failures: [],
  };

  const total = rows.length;
  let processed = 0;

  for (let i = 0; i < total; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const codes = batch.map((row) => row.material_code);

    let existingSet = new Set<string>();

    try {
      const { data: existing, error: fetchError } = await supabase
        .from("material_master")
        .select("material_code")
        .in("material_code", codes);

      if (fetchError) throw fetchError;

      existingSet = new Set(
        (existing ?? []).map(
          (item: { material_code: string }) => item.material_code
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
          .from("material_master")
          .upsert(
            {
              material_code: row.material_code,
              short_description: row.short_description,
              uom: row.uom,
              hsn_code: row.hsn_code,
              material_group: row.material_group,
              is_active: true,
            },
            { onConflict: "material_code" }
          );

        if (upsertError) throw upsertError;

        const status = existingSet.has(row.material_code) ? "Updated" : "Imported";

        if (status === "Updated") {
          summary.updated += 1;
        } else {
          summary.imported += 1;
        }

        summary.successes.push({
          material_code: row.material_code,
          rowNumber: row.rowNumber,
          short_description: row.short_description,
          uom: row.uom,
          hsn_code: row.hsn_code,
          material_group: row.material_group,
          status,
        });
      } catch (err) {
        summary.failed += 1;

        summary.failures.push({
          material_code: row.material_code,
          rowNumber: row.rowNumber,
          short_description: row.short_description,
          uom: row.uom,
          hsn_code: row.hsn_code,
          material_group: row.material_group,
          error: extractErrorMessage(err),
          errorCategory: categorizeError(err),
        });
      }

      processed += 1;

      if (onProgress) {
        onProgress(processed, total);
      }
    }
  }

  summary.timeTakenMs = Date.now() - startedAt;

  return summary;
}

const MATERIAL_REPORT_COLUMNS = [
  { header: "Material Code", key: "material_code" },
  { header: "Description", key: "short_description" },
  { header: "UoM", key: "uom" },
  { header: "HSN Code", key: "hsn_code" },
  { header: "Material Group", key: "material_group" },
];

/**
 * Builds a combined Excel report for a Material Master bulk import,
 * covering every row submitted: rows rejected by validation before the
 * import ran, rows that imported/updated successfully, and rows that
 * failed during the import itself - along with the reason for anything
 * other than a clean success. Saves the report to Reports > Import
 * Reports history and then downloads it immediately.
 */
export async function downloadMaterialImportReport(
  validation: MaterialValidationResult,
  summary: MaterialImportSummary,
  fileName?: string | null
): Promise<void> {
  const rejected: BulkImportReportRow[] = validation.invalidRows.map((row) => ({
    rowNumber: row.rowNumber,
    status: "Rejected",
    reason: row.errors.join("; "),
    data: { ...row.fields },
  }));

  const succeeded: BulkImportReportRow[] = summary.successes.map((row) => ({
    rowNumber: row.rowNumber,
    status: row.status,
    data: {
      material_code: row.material_code,
      short_description: row.short_description,
      uom: row.uom,
      hsn_code: row.hsn_code,
      material_group: row.material_group,
    },
  }));

  const failed: BulkImportReportRow[] = summary.failures.map((row) => ({
    rowNumber: row.rowNumber,
    status: "Failed",
    reason: `${row.errorCategory}: ${row.error}`,
    data: {
      material_code: row.material_code,
      short_description: row.short_description,
      uom: row.uom,
      hsn_code: row.hsn_code,
      material_group: row.material_group,
    },
  }));

  await recordAndDownloadBulkImportReport({
    importType: "Material Master",
    fileName,
    totalRows: validation.totalRecords,
    successCount: summary.imported + summary.updated,
    rejectedCount: validation.invalidRows.length,
    failedCount: summary.failed,
    fileNamePrefix: "Material_Import",
    columns: MATERIAL_REPORT_COLUMNS,
    rows: [...rejected, ...succeeded, ...failed],
    summary: [
      { label: "Total Excel Rows", value: validation.totalRecords },
      { label: "Sent for Import", value: summary.totalRows },
      { label: "Rejected (validation)", value: validation.invalidRows.length },
      { label: "Imported", value: summary.imported },
      { label: "Updated", value: summary.updated },
      { label: "Failed", value: summary.failed },
      { label: "Time Taken (s)", value: (summary.timeTakenMs / 1000).toFixed(1) },
    ],
  });
}
