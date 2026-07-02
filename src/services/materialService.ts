import { supabase } from "../config/supabase";
import type { Material } from "../types/material";

export async function getMaterials(): Promise<Material[]> {
  const { data, error } = await supabase
    .from("material_master")
    .select("*")
    .eq("is_active", true)
    .order("material_code");

  if (error) throw error;

  return data as Material[];
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
      current_quantity: material.current_quantity,
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
      current_quantity: material.current_quantity,
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
  current_quantity: string;
  hsn_code: string;
  material_group: string;
}

export interface MaterialImportRow {
  rowNumber: number;
  material_code: string;
  short_description: string;
  uom: string;
  current_quantity: number;
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
    ]),
    short_description: getFieldValue(row, [
      "Short Description",
      "Description",
      "short_description",
    ]),
    uom: getFieldValue(row, ["UoM", "UOM", "Unit", "uom"]),
    current_quantity: getFieldValue(row, [
      "Current Quantity",
      "Current Stock",
      "current_quantity",
      "Stock",
    ]),
    hsn_code: getFieldValue(row, ["HSN Code", "HSN", "hsn_code"]),
    material_group: getFieldValue(row, [
      "Material Group",
      "material_group",
    ]),
  };
}

export function parseMaterialExcelRows(
  rawRows: Record<string, unknown>[]
): MaterialValidationResult {
  const validRows: MaterialImportRow[] = [];
  const invalidRows: MaterialInvalidRow[] = [];
  const seenCodes = new Set<string>();

  let totalRecords = 0;

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

    if (fields.material_code) {
      const key = fields.material_code.toUpperCase();

      if (seenCodes.has(key)) {
        errors.push("Duplicate Material Code within file.");
      } else {
        seenCodes.add(key);
      }
    }

    const currentQuantity = Number(fields.current_quantity);

    if (fields.current_quantity && Number.isNaN(currentQuantity)) {
      errors.push("Current Quantity must be a number.");
    }

    if (errors.length > 0) {
      invalidRows.push({ rowNumber, fields, errors });
      return;
    }

    validRows.push({
      rowNumber,
      material_code: fields.material_code,
      short_description: fields.short_description,
      uom: fields.uom,
      current_quantity: fields.current_quantity ? currentQuantity : 0,
      hsn_code: fields.hsn_code,
      material_group: fields.material_group,
    });
  });

  return { totalRecords, validRows, invalidRows };
}

export interface MaterialImportFailure {
  material_code: string;
  error: string;
}

export interface MaterialImportSummary {
  imported: number;
  updated: number;
  failed: number;
  failures: MaterialImportFailure[];
}

export async function bulkImportMaterials(
  rows: MaterialImportRow[],
  batchSize: number,
  onProgress?: (processed: number, total: number) => void
): Promise<MaterialImportSummary> {
  const summary: MaterialImportSummary = {
    imported: 0,
    updated: 0,
    failed: 0,
    failures: [],
  };

  const total = rows.length;
  let processed = 0;

  for (let i = 0; i < total; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const codes = batch.map((row) => row.material_code);

    try {
      const { data: existing, error: fetchError } = await supabase
        .from("material_master")
        .select("material_code")
        .in("material_code", codes);

      if (fetchError) throw fetchError;

      const existingSet = new Set(
        (existing ?? []).map(
          (item: { material_code: string }) => item.material_code
        )
      );

      const payload = batch.map((row) => ({
        material_code: row.material_code,
        short_description: row.short_description,
        uom: row.uom,
        current_quantity: row.current_quantity,
        hsn_code: row.hsn_code,
        material_group: row.material_group,
        is_active: true,
      }));

      const { error: upsertError } = await supabase
        .from("material_master")
        .upsert(payload, { onConflict: "material_code" });

      if (upsertError) throw upsertError;

      batch.forEach((row) => {
        if (existingSet.has(row.material_code)) {
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
          material_code: row.material_code,
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
