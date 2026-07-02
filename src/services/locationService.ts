import { supabase } from "../config/supabase";
import type { Location } from "../types/location";

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

export async function updateLocation(
  location: Location
): Promise<void> {

  const { error } = await supabase
    .from("location_master")
    .update({
      location_description: location.location_description,
    })
    .eq("location_code", location.location_code);

  if (error) throw error;
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
  error: string;
}

export interface LocationImportSummary {
  imported: number;
  updated: number;
  failed: number;
  failures: LocationImportFailure[];
}

export async function bulkImportLocations(
  rows: LocationImportRow[],
  batchSize: number,
  onProgress?: (processed: number, total: number) => void
): Promise<LocationImportSummary> {
  const summary: LocationImportSummary = {
    imported: 0,
    updated: 0,
    failed: 0,
    failures: [],
  };

  const total = rows.length;
  let processed = 0;

  for (let i = 0; i < total; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const codes = batch.map((row) => row.location_code);

    try {
      const { data: existing, error: fetchError } = await supabase
        .from("location_master")
        .select("location_code")
        .in("location_code", codes);

      if (fetchError) throw fetchError;

      const existingSet = new Set(
        (existing ?? []).map(
          (item: { location_code: string }) => item.location_code
        )
      );

      const payload = batch.map((row) => ({
        location_code: row.location_code,
        location_description: row.location_description,
        is_active: true,
      }));

      const { error: upsertError } = await supabase
        .from("location_master")
        .upsert(payload, { onConflict: "location_code" });

      if (upsertError) throw upsertError;

      batch.forEach((row) => {
        if (existingSet.has(row.location_code)) {
          summary.updated += 1;
        } else {
          summary.imported += 1;
        }
      });
    } catch (err) {
      summary.failed += batch.length;

      const message =
        err instanceof Error
          ? err.message
          : "Unknown error during import.";

      batch.forEach((row) => {
        summary.failures.push({
          location_code: row.location_code,
          error: message,
        });
      });
    }

    processed += batch.length;

    if (onProgress) {
      onProgress(processed, total);
    }
  }

  return summary;
}
