import { supabase } from "../config/supabase";

import { normalizeMaterialCode } from "../utils/materialCode";
import { getMovementTypeDescription } from "../utils/sapMovementTypes";

import { applyAdjustment } from "./materialAllocationService";
import { dismissPendingStockUpdate } from "./stockUpdateService";
import {
  type BulkImportReportRow,
  type BulkImportRowStatus,
} from "../utils/bulkImportReport";
import { recordAndDownloadBulkImportReport } from "./bulkImportHistoryService";

/* =========================================================================
 * SAP import layer (MB51 material history + MB52 current stock)
 *
 * The SAP layer is fully separate from the app's physical stock:
 *
 *   - sap_material_documents   - MB51 movements, stored as history only.
 *   - sap_stock_distribution   - MB52 snapshot: current quantity per
 *                                (material, storage location). This is the
 *                                "distribution of quantities" - SAP storage
 *                                locations (AFCN / REVN / ESRN ...) are
 *                                accounting buckets, never physical bins.
 *   - stock_reconciliation_reviews - material-total differences between
 *                                SAP and the app, for a person to apply
 *                                (one audited ADJUSTMENT) or dismiss.
 *
 * Nothing here ever writes to material_allocation, inventory_transactions
 * or location_master. Reconciliation is at material-total level only;
 * the SAP storage-location split is always read-only reference.
 *
 * All bulk uploads follow the numeric material-code rule
 * (src/utils/materialCode.ts): codes are normalized to their digits and
 * non-numeric codes are rejected in preview. Materials missing from
 * Material Master are auto-created (numeric codes only) with the first
 * non-blank description / UoM the file provides for each code.
 * ========================================================================= */

const BATCH_SIZE = 500;

/* -------------------------------------------------------------------------
 * Shared parsing helpers
 * ---------------------------------------------------------------------- */

/* -------------------------------------------------------------------------
 * Column matching (MB51 / MB52 sheets)
 *
 * SAP exports are inconsistent: header wording varies ("Qty in unit of
 * entry" vs "Quantity in unit of entry", "S.Loc" vs "Storage Location"),
 * and the first sheet row is sometimes a report title instead of the
 * column header. Matching is fuzzy: headers are normalized to
 * alphanumerics-only lowercase, aliases are matched exactly against that
 * normalized form, and the header row itself is auto-detected from the
 * first few rows by which row matches the most known columns.
 * ---------------------------------------------------------------------- */

function normColumn(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const COLUMN_ALIASES: Record<string, string[]> = {
  material: [
    "material",
    "materialnumber",
    "materialcode",
    "materialno",
    "matnr",
    "matno",
    "materialnumberchar",
    "mat",
    "matl",
  ],
  description: [
    "materialdescription",
    "materialdesc",
    "description",
    "materialtext",
    "matdescr",
    "shortdescription",
    "materialdescriptiontext",
    "matdesc",
    "matldesc",
    "materialshorttext",
  ],
  item: ["item", "itemno", "itemnumber"],
  sloc: [
    "storagelocation",
    "storageloc",
    "sloc",
    "storloc",
    "storage",
    "storagecode",
    "slocation",
    "location",
    "storagebin",
  ],
  mvt: [
    "movementtype",
    "mvttype",
    "movement",
    "mvt",
    "bwart",
    "movementtypecode",
    "mvtcode",
  ],
  specialstock: [
    "specialstock",
    "specialstk",
    "sobkar",
    "specialstockindicator",
  ],
  doc: [
    "materialdocument",
    "materialdoc",
    "matdocument",
    "matdoc",
    "documentnumber",
    "mblnr",
    "materialdocnumber",
    "matdocno",
    "materialdocno",
  ],
  docitem: [
    "materialdocitem",
    "matdocitem",
    "materialdocitemno",
    "docitem",
    "zeile",
    "materialdocit",
    "matdocitemno",
  ],
  postingdate: [
    "postingdate",
    "postingdt",
    "postingdateintext",
    "bldat",
    "postgdate",
    "pstngdate",
    "postdate",
    "buchungsdatum",
    "docdate",
    "documentdate",
  ],
  quantity: [
    "qtyinunitofentry",
    "quantityinunitofentry",
    "mvtqtyinunitofentry",
    "mvtqty",
    "quantity",
    "qty",
    "quantityinbaseunitofmeasure",
    "qtyinbaseunitofmeasure",
    "quantityinbaseunit",
    "stockqty",
    // SAP short labels / field names (ERFMG = qty in unit of entry):
    "qtyinunofentry",
    "quantityinunofentry",
    "mvtqtyinunofentry",
    "erfmg",
    "menge",
    // MB52 (current stock) column names:
    "unrestricted",
    "unrestrictedstock",
    "unrestrictedqty",
    "totalstock",
    "totalqty",
    "stock",
  ],
  unit: [
    "unitofentry",
    "unit",
    "uom",
    "baseunitofmeasure",
    "baseunit",
    "entryunit",
    "unofentry",
  ],
  po: [
    "purchaseorder",
    "purchaseordernumber",
    "purchasedocument",
    "ponumber",
    "po",
    "ebeln",
    "pono",
  ],
  user: [
    "username",
    "user",
    "createdby",
    "usnam",
    "postedby",
    "createdbyuser",
  ],
  invoice: [
    "invoicenum",
    "invoicenumber",
    "invoice",
    "rebnr",
    "invoiceno",
    "invoicedoc",
    "invoicedocno",
    "invoicedocument",
  ],
  vendor: [
    "vendor",
    "vendorcode",
    "supplier",
    "lifnr",
    "vendornumber",
    "vendorname",
    "suppliercode",
  ],
  headertext: [
    "documentheadertext",
    "docheadertext",
    "headertext",
    "bktxt",
    "documenttext",
    "itemtext",
    "docheadertext1",
  ],
};

const KNOWN_COLUMNS = new Set<string>(
  Object.values(COLUMN_ALIASES).flat().map(normColumn)
);

/** Picks the row (within the first 15) that matches the most known
 *  column names - handles SAP sheets whose first row is a report title
 *  or a merged label instead of the actual header. Exact header hits are
 *  weighted double and a row with any exact hit beats one with only
 *  fuzzy hits, so a selection-criteria block ("Material: …", "Posting
 *  Date: …") never wins over the real header row. */
function detectHeaderRow(rows: unknown[][]): number {
  let bestRow = 0;
  let bestScore = -1;
  const scanLimit = Math.min(rows.length, 15);
  const known = Array.from(KNOWN_COLUMNS);

  for (let r = 0; r < scanLimit; r++) {
    let score = 0;
    let exactHits = 0;
    for (const cell of rows[r] ?? []) {
      if (cell === null || cell === undefined) continue;
      const normalized = normColumn(String(cell));
      if (normalized === "") continue;
      if (KNOWN_COLUMNS.has(normalized)) {
        score += 2;
        exactHits += 1;
      } else if (known.some((k) => k.length >= 5 && normalized.includes(k))) {
        score += 1;
      }
    }
    const tieBreak = exactHits > 0 ? 1 : 0;
    if (score * 2 + tieBreak > bestScore) {
      bestScore = score * 2 + tieBreak;
      bestRow = r;
    }
  }

  return bestRow;
}

function buildColumnMap(headerRow: unknown[]): Record<string, number> {
  const map: Record<string, number> = {};
  const used = new Set<number>();

  // Pass 1: exact match against every alias.
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const target = normColumn(alias);
      if (!target) continue;
      const idx = headerRow.findIndex((cell, i) => {
        if (used.has(i)) return false;
        if (cell === null || cell === undefined) return false;
        return normColumn(String(cell)) === target;
      });

      if (idx !== -1) {
        map[field] = idx;
        used.add(idx);
        break;
      }
    }
  }

  // Pass 2: fuzzy (substring) matching for fields still unmatched, e.g.
  // "Postg. date" -> postingdate, "Qty in un of entry" -> qtyinunofentry,
  // "Mat. Desc" -> matdesc. Longest alias first so a generic alias never
  // grabs a cell that belongs to a more specific column, and only free
  // cells are considered, so a confident exact match is never overridden.
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (map[field] !== undefined) continue;
    const sorted = [...aliases].sort((a, b) => b.length - a.length);
    for (const alias of sorted) {
      const target = normColumn(alias);
      if (target.length < 3) continue;
      let found = -1;
      for (let i = 0; i < headerRow.length; i++) {
        if (used.has(i)) continue;
        const cell = headerRow[i];
        if (cell === null || cell === undefined) continue;
        if (normColumn(String(cell)).includes(target)) {
          found = i;
          break;
        }
      }
      if (found !== -1) {
        map[field] = found;
        used.add(found);
        break;
      }
    }
  }

  return map;
}

function cellAt(
  row: unknown[],
  colMap: Record<string, number>,
  field: string
): string {
  const idx = colMap[field];
  if (idx === undefined) return "";
  const value = row[idx];
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function rowIsBlank(row: unknown[]): boolean {
  return row.every((value) => {
    if (value === null || value === undefined) return true;
    return String(value).trim() === "";
  });
}

function parseSapQuantity(raw: string): number {
  let cleaned = String(raw).replace(/\s/g, "").trim();
  if (!cleaned) return NaN;

  // SAP prints negative quantities with a trailing minus ("40.000-") and
  // Excel can hand us parentheses ("(40)").
  let negative = false;
  if (cleaned.endsWith("-")) {
    negative = true;
    cleaned = cleaned.slice(0, -1);
  } else if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
    negative = true;
    cleaned = cleaned.slice(1, -1);
  }
  if (cleaned === "") return NaN;

  const hasDot = cleaned.includes(".");
  const hasComma = cleaned.includes(",");

  if (hasDot && hasComma) {
    // Both separators: the LAST one is the decimal separator.
    // "1.234,56" -> 1234.56, "1,234.56" -> 1234.56. Remove the
    // thousands separator entirely, then normalize the remaining
    // decimal separator to ".".
    const lastDot = cleaned.lastIndexOf(".");
    const lastComma = cleaned.lastIndexOf(",");
    if (lastDot > lastComma) {
      cleaned = cleaned.replace(/,/g, "");
    } else {
      cleaned = cleaned.replace(/\./g, "").replace(/,/g, ".");
    }
  } else if (hasComma) {
    // A lone comma is a decimal separator: "1,000" -> 1, "1,5" -> 1.5.
    cleaned = cleaned.replace(/,/g, ".");
  }
  // A lone dot is kept as-is: English SAP displays quantities with a
  // decimal point ("40.000" = 40).

  const value = Number(cleaned);
  if (Number.isNaN(value)) return NaN;
  return negative ? -value : value;
}

function normalizeSapLocation(raw: string): string {
  return raw.trim().toUpperCase();
}

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

/** Parses a SAP date cell (Excel serial, Date, dd-mm-yyyy, yyyymmdd ...)
 *  to ISO (yyyy-mm-dd). */
export function parseSapDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 1000000 && Number.isInteger(value)) {
      // SAP exports posting dates as yyyymmdd numbers (e.g. 20260811).
      const s = String(Math.round(value));
      const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
      if (iso.length === 10 && !Number.isNaN(Date.parse(`${iso}T00:00:00Z`))) {
        return iso;
      }
      return null;
    }
    if (value > 20000) {
      const date = new Date(EXCEL_EPOCH_UTC + Math.round(value) * 86400000);
      if (!Number.isNaN(date.getTime())) {
        return date.toISOString().slice(0, 10);
      }
      return null;
    }
  }

  const text = String(value).trim();
  if (!text) return null;

  // xlsx hands date cells back as numeric serials (e.g. 46234) and cellAt
  // has already stringified them by now - route pure-numeric text through
  // the numeric branches again. Only values that could be a plausible
  // date serial / yyyymmdd are recursed, so quantity-like text
  // ("84.758") still falls through to the text formats and returns null.
  if (/^[+-]?\d+(?:\.\d+)?$/.test(text)) {
    const numeric = Number(text);
    if (Number.isFinite(numeric) && numeric > 20000) {
      return parseSapDate(numeric);
    }
  }

  let match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (match) {
    const [, y, m, d] = match;
    const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    return Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) ? null : iso;
  }

  match = text.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/);
  if (match) {
    const [, d, m, y] = match;
    const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    return Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) ? null : iso;
  }

  // yyyymmdd (8 digits, e.g. "20260811").
  if (/^\d{8}$/.test(text)) {
    const iso = `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
    return Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) ? null : iso;
  }

  return null;
}

/** Splits an array into chunks of at most `size` items, in order. */
function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function runChunked<T>(
  items: T[],
  fn: (batch: T[]) => Promise<void>
): Promise<void> {
  const chunks = chunk(items, BATCH_SIZE);
  for (const batch of chunks) {
    await fn(batch);
  }
}

/* -------------------------------------------------------------------------
 * Types
 * ---------------------------------------------------------------------- */

export interface SapDocumentRow {
  rowNumber: number;
  material_code: string;
  material_description: string;
  item: string;
  storage_location: string;
  movement_type: string;
  special_stock: string;
  material_document: string;
  material_doc_item: string;
  posting_date: string | null;
  quantity: number;
  unit_of_entry: string;
  purchase_order: string;
  user_name: string;
  invoice_number: string;
  vendor: string;
  document_header_text: string;
}

export interface SapDistributionRow {
  rowNumber: number;
  material_code: string;
  material_description: string;
  uom: string;
  storage_location: string;
  quantity: number;
}

export interface SapInvalidRow {
  rowNumber: number;
  material_code: string;
  errors: string[];
}

export interface SapParseResult {
  /** Non-empty cells of the detected header row, for the UI to show so a
   *  wrong header detection is immediately visible. */
  detectedHeader: string[];
}

/** Non-empty header-cell values (first 14) for display/diagnostics. */
function detectHeaderValues(
  rows2d: unknown[][],
  headerRowIndex: number
): string[] {
  const values: string[] = [];
  for (const cell of rows2d[headerRowIndex] ?? []) {
    if (cell === null || cell === undefined) continue;
    const text = String(cell).replace(/\s+/g, " ").trim();
    if (!text) continue;
    values.push(text);
    if (values.length >= 14) break;
  }
  return values;
}

/* -------------------------------------------------------------------------
 * MB51 parser (material document list / material history)
 * ---------------------------------------------------------------------- */

export function parseMb51ExcelRows(
  rows2d: unknown[][]
): {
  totalRecords: number;
  validRows: SapDocumentRow[];
  invalidRows: SapInvalidRow[];
  detectedHeader: string[];
} {
  const invalidRows: SapInvalidRow[] = [];
  const validRows: SapDocumentRow[] = [];

  const headerRowIndex = detectHeaderRow(rows2d);
  const colMap = buildColumnMap(rows2d[headerRowIndex] ?? []);
  const detectedHeader = detectHeaderValues(rows2d, headerRowIndex);

  let totalRecords = 0;
  // SAP MB51 exports merge the material cell across consecutive rows of
  // the same material; remember the last code so blank cells inherit it.
  let lastMaterialCode: string | null = null;

  rows2d.forEach((row, index) => {
    if (index <= headerRowIndex) return;
    if (rowIsBlank(row)) return;

    totalRecords += 1;
    // Excel row numbers are 1-based; rows2d index 0 is Excel row 1.
    const rowNumber = index + 1;

    const rawMaterialCell = cellAt(row, colMap, "material");
    let rawMaterialCode = rawMaterialCell;
    let materialCode = normalizeMaterialCode(rawMaterialCode);
    if (!materialCode && lastMaterialCode) {
      rawMaterialCode = lastMaterialCode;
      materialCode = lastMaterialCode;
    }
    if (materialCode) lastMaterialCode = materialCode;
    const materialDescription = cellAt(row, colMap, "description");
    const item = cellAt(row, colMap, "item");
    const storageLocation = normalizeSapLocation(cellAt(row, colMap, "sloc"));
    const movementType = cellAt(row, colMap, "mvt");
    const specialStock = cellAt(row, colMap, "specialstock");
    const materialDocument = cellAt(row, colMap, "doc");
    const materialDocItem = cellAt(row, colMap, "docitem");
    const quantityRaw = cellAt(row, colMap, "quantity");
    const unitOfEntry = cellAt(row, colMap, "unit");
    const purchaseOrder = cellAt(row, colMap, "po");
    const userName = cellAt(row, colMap, "user");
    const invoiceNumber = cellAt(row, colMap, "invoice");
    const vendor = cellAt(row, colMap, "vendor");
    const documentHeaderText = cellAt(row, colMap, "headertext");

    const errors: string[] = [];

    if (!rawMaterialCode) {
      errors.push("Material is required.");
    } else if (!materialCode) {
      errors.push(`Material code "${rawMaterialCode}" is not numeric.`);
    }

    if (!quantityRaw) {
      errors.push("Quantity is required.");
    } else if (Number.isNaN(parseSapQuantity(quantityRaw))) {
      errors.push("Quantity must be a number.");
    }

    const postingDate = parseSapDate(cellAt(row, colMap, "postingdate"));
    if (!postingDate) {
      errors.push("Posting Date is required (dd-mm-yyyy).");
    }

    if (errors.length > 0) {
      invalidRows.push({
        rowNumber,
        material_code: rawMaterialCode,
        errors,
      });
      return;
    }

    validRows.push({
      rowNumber,
      material_code: materialCode as string,
      material_description: materialDescription,
      item,
      storage_location: storageLocation,
      movement_type: movementType,
      special_stock: specialStock,
      material_document: materialDocument,
      material_doc_item: materialDocItem,
      posting_date: postingDate,
      quantity: parseSapQuantity(quantityRaw),
      unit_of_entry: unitOfEntry,
      purchase_order: purchaseOrder,
      user_name: userName,
      invoice_number: invoiceNumber,
      vendor,
      document_header_text: documentHeaderText,
    });
  });

  return { totalRecords, validRows, invalidRows, detectedHeader };
}

/* -------------------------------------------------------------------------
 * MB52 parser (current stock overview)
 * ---------------------------------------------------------------------- */

export function parseMb52ExcelRows(
  rows2d: unknown[][]
): {
  totalRecords: number;
  validRows: SapDistributionRow[];
  invalidRows: SapInvalidRow[];
  detectedHeader: string[];
} {
  const invalidRows: SapInvalidRow[] = [];
  const validRows: SapDistributionRow[] = [];

  const headerRowIndex = detectHeaderRow(rows2d);
  const colMap = buildColumnMap(rows2d[headerRowIndex] ?? []);
  const detectedHeader = detectHeaderValues(rows2d, headerRowIndex);

  let totalRecords = 0;
  // MB52 exports also merge the material cell across consecutive rows.
  let lastMaterialCode: string | null = null;

  rows2d.forEach((row, index) => {
    if (index <= headerRowIndex) return;
    if (rowIsBlank(row)) return;

    totalRecords += 1;
    const rowNumber = index + 1;

    const rawMaterialCell = cellAt(row, colMap, "material");
    let rawMaterialCode = rawMaterialCell;
    let materialCode = normalizeMaterialCode(rawMaterialCode);
    if (!materialCode && lastMaterialCode) {
      rawMaterialCode = lastMaterialCode;
      materialCode = lastMaterialCode;
    }
    if (materialCode) lastMaterialCode = materialCode;
    const materialDescription = cellAt(row, colMap, "description");
    const uom = cellAt(row, colMap, "unit");
    const storageLocation = normalizeSapLocation(cellAt(row, colMap, "sloc"));
    const quantityRaw = cellAt(row, colMap, "quantity");

    const errors: string[] = [];

    if (!rawMaterialCode) {
      errors.push("Material is required.");
    } else if (!materialCode) {
      errors.push(`Material code "${rawMaterialCode}" is not numeric.`);
    }

    if (!storageLocation) {
      errors.push("Storage Location is required.");
    }

    const quantity = parseSapQuantity(quantityRaw);

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
        material_code: rawMaterialCode,
        errors,
      });
      return;
    }

    validRows.push({
      rowNumber,
      material_code: materialCode as string,
      material_description: materialDescription,
      uom,
      storage_location: storageLocation,
      quantity,
    });
  });

  return { totalRecords, validRows, invalidRows, detectedHeader };
}

/* -------------------------------------------------------------------------
 * Master-data lookups (shared by both imports)
 * ---------------------------------------------------------------------- */

interface MaterialMasterInfo {
  short_description: string;
  uom: string;
}

async function fetchMaterialMasterInfo(
  codes: string[]
): Promise<Map<string, MaterialMasterInfo>> {
  const map = new Map<string, MaterialMasterInfo>();

  await runChunked(codes, async (batch) => {
    const { data, error } = await supabase
      .from("material_master")
      .select("material_code, short_description, uom")
      .in("material_code", batch);

    if (error) throw error;

    (data ?? []).forEach(
      (m: { material_code: string; short_description: string; uom: string }) =>
        map.set(m.material_code, {
          short_description: m.short_description,
          uom: m.uom,
        })
    );
  });

  return map;
}

/* -------------------------------------------------------------------------
 * MB51 import - history only
 * ---------------------------------------------------------------------- */

export type Mb51RowStatus = "imported" | "updated" | "failed";

export interface Mb51Outcome {
  rowNumber: number;
  material_code: string;
  storage_location: string;
  movement_type: string;
  posting_date: string | null;
  quantity: number;
  status: Mb51RowStatus;
  message?: string;
}

export interface Mb51ImportSummary {
  totalRows: number;
  inserted: number;
  updated: number;
  materialsCreated: number;
  failed: number;
  outcomes: Mb51Outcome[];
}

/**
 * Creates Material Master rows for codes the file references but that
 * don't exist yet (numeric codes only - never alphanumeric junk). Uses
 * the first non-blank description / UoM the file provides for each code.
 * Bulk-inserts in chunks with a per-row fallback so one bad row can't
 * block the rest. Returns how many materials were created.
 */
async function createMissingMaterials(
  missingCodes: string[],
  meta: Map<string, { description: string; uom: string }>
): Promise<number> {
  let created = 0;

  await runChunked(missingCodes, async (batch) => {
    const payload = batch.map((code) => ({
      material_code: code,
      short_description: meta.get(code)?.description || code,
      uom: meta.get(code)?.uom || "NOS",
      hsn_code: "",
      material_group: code.substring(0, 2),
      is_active: true,
    }));

    const { error } = await supabase.from("material_master").insert(payload);

    if (error) {
      for (const item of payload) {
        const { error: rowError } = await supabase
          .from("material_master")
          .insert([item]);
        if (rowError) throw rowError;
        created += 1;
      }
      return;
    }

    created += batch.length;
  });

  return created;
}

/**
 * Imports parsed MB51 rows into sap_material_documents. Rows are upserted
 * by (user, material document, doc item) so re-uploading the same file
 * updates the same lines instead of duplicating them, and a corrected
 * document (same number, changed quantity) is refreshed in place. Rows
 * without a material document are plain inserts. Materials are never
 * auto-created - codes missing from Material Master are counted/reported.
 */
export async function bulkImportMb51(
  rows: SapDocumentRow[],
  fileName: string | undefined,
  onProgress?: (processed: number, total: number) => void
): Promise<Mb51ImportSummary> {
  const summary: Mb51ImportSummary = {
    totalRows: rows.length,
    inserted: 0,
    updated: 0,
    materialsCreated: 0,
    failed: 0,
    outcomes: [],
  };

  const total = rows.length;
  if (total === 0) return summary;

  function reportProgress(fraction: number) {
    if (!onProgress) return;
    onProgress(Math.min(total, Math.max(0, Math.round(fraction * total))), total);
  }

  // Which material documents already exist, so imported/updated can be
  // counted accurately (upsert alone can't tell us).
  const existingKeys = new Set<string>();
  const docs = Array.from(
    new Set(rows.map((r) => r.material_document).filter((d) => !!d))
  );

  await runChunked(docs, async (batch) => {
    const { data, error } = await supabase
      .from("sap_material_documents")
      .select("material_document, material_doc_item")
      .in("material_document", batch);

    if (error) {
      // Migration not run yet - don't fail the import, just skip the
      // count (upsert will still create rows once the table exists).
      console.warn("sap_material_documents lookup failed (migration 0009 not run?):", error.message);
      return;
    }

    (data ?? []).forEach(
      (d: { material_document: string; material_doc_item: string | null }) =>
        existingKeys.add(`${d.material_document}\u0000${d.material_doc_item ?? ""}`)
    );
  });

  // Auto-create materials missing from Material Master (numeric codes
  // only), using the first non-blank description / UoM in the file.
  const masterCodes = Array.from(new Set(rows.map((r) => r.material_code)));
  const masterInfo = await fetchMaterialMasterInfo(masterCodes).catch(
    () => new Map<string, MaterialMasterInfo>()
  );
  const missingCodes = masterCodes.filter((code) => !masterInfo.has(code));

  if (missingCodes.length > 0) {
    const meta = new Map<string, { description: string; uom: string }>();
    for (const row of rows) {
      const entry = meta.get(row.material_code);
      if (!entry) {
        meta.set(row.material_code, {
          description: row.material_description,
          uom: row.unit_of_entry,
        });
      } else {
        if (!entry.description && row.material_description) {
          entry.description = row.material_description;
        }
        if (!entry.uom && row.unit_of_entry) {
          entry.uom = row.unit_of_entry;
        }
      }
    }
    summary.materialsCreated = await createMissingMaterials(missingCodes, meta);
  }

  reportProgress(0.3);

  await runChunked(rows, async (batch) => {
    const payload = batch.map((row) => ({
      material_code: row.material_code,
      material_description: row.material_description || null,
      item: row.item || null,
      storage_location: row.storage_location,
      movement_type: row.movement_type || null,
      special_stock: row.special_stock || null,
      material_document: row.material_document || null,
      material_doc_item: row.material_doc_item || null,
      posting_date: row.posting_date,
      quantity: row.quantity,
      unit_of_entry: row.unit_of_entry || null,
      purchase_order: row.purchase_order || null,
      user_name: row.user_name || null,
      invoice_number: row.invoice_number || null,
      vendor: row.vendor || null,
      document_header_text: row.document_header_text || null,
    }));

    const { error } = await supabase.from("sap_material_documents").upsert(
      payload,
      { onConflict: "user_id,material_document,material_doc_item" }
    );

    if (error) {
      // Bulk upsert failed - fall back to per-row so one bad row can't
      // drop the rest of the batch.
      for (const row of batch) {
        try {
          const { error: rowError } = await supabase
            .from("sap_material_documents")
            .upsert(
              [
                {
                  material_code: row.material_code,
                  material_description: row.material_description || null,
                  item: row.item || null,
                  storage_location: row.storage_location,
                  movement_type: row.movement_type || null,
                  special_stock: row.special_stock || null,
                  material_document: row.material_document || null,
                  material_doc_item: row.material_doc_item || null,
                  posting_date: row.posting_date,
                  quantity: row.quantity,
                  unit_of_entry: row.unit_of_entry || null,
                  purchase_order: row.purchase_order || null,
                  user_name: row.user_name || null,
                  invoice_number: row.invoice_number || null,
                  vendor: row.vendor || null,
                  document_header_text: row.document_header_text || null,
                },
              ],
              { onConflict: "user_id,material_document,material_doc_item" }
            );

          if (rowError) throw rowError;

          const key = `${row.material_document}\u0000${row.material_doc_item ?? ""}`;
          const updated = !!row.material_document && existingKeys.has(key);
          summary[updated ? "updated" : "inserted"] += 1;
          summary.outcomes.push({
            rowNumber: row.rowNumber,
            material_code: row.material_code,
            storage_location: row.storage_location,
            movement_type: row.movement_type,
            posting_date: row.posting_date,
            quantity: row.quantity,
            status: updated ? "updated" : "imported",
            message: updated ? `Material document ${row.material_document} updated.` : undefined,
          });
        } catch (err) {
          summary.failed += 1;
          summary.outcomes.push({
            rowNumber: row.rowNumber,
            material_code: row.material_code,
            storage_location: row.storage_location,
            movement_type: row.movement_type,
            posting_date: row.posting_date,
            quantity: row.quantity,
            status: "failed",
            message: err instanceof Error ? err.message : "Unknown error.",
          });
        }
      }
      return;
    }

    for (const row of batch) {
      const key = `${row.material_document}\u0000${row.material_doc_item ?? ""}`;
      const updated = !!row.material_document && existingKeys.has(key);
      summary[updated ? "updated" : "inserted"] += 1;
      summary.outcomes.push({
        rowNumber: row.rowNumber,
        material_code: row.material_code,
        storage_location: row.storage_location,
        movement_type: row.movement_type,
        posting_date: row.posting_date,
        quantity: row.quantity,
        status: updated ? "updated" : "imported",
        message: updated ? `Material document ${row.material_document} updated.` : undefined,
      });
    }
  });

  reportProgress(0.9);

  // Provenance: record which documents this file brought in (best-effort).
  const importedDocs = Array.from(
    new Set(
      rows
        .map((r) => r.material_document)
        .filter((d): d is string => !!d)
    )
  );

  await runChunked(importedDocs, async (batch) => {
    const { error } = await supabase.from("sap_imports").insert(
      batch.map((document) => ({
        material_document: document,
        file_name: fileName ?? null,
        row_count: rows.filter((r) => r.material_document === document).length,
      }))
    );

    if (error) {
      console.warn("Failed to record imported SAP documents:", error.message);
    }
  });

  reportProgress(1);
  return summary;
}

/* -------------------------------------------------------------------------
 * MB52 import - snapshot + reconciliation reviews
 * ---------------------------------------------------------------------- */

export type Mb52RowStatus = "imported" | "failed";

export interface Mb52Outcome {
  rowNumber: number;
  material_code: string;
  storage_location: string;
  quantity: number;
  status: Mb52RowStatus;
  message?: string;
}

export interface Mb52ImportSummary {
  totalRows: number;
  distributionRowsWritten: number;
  materialsProcessed: number;
  matched: number;
  reviewsCreated: number;
  materialsCreated: number;
  failed: number;
  outcomes: Mb52Outcome[];
}

/**
 * Imports a parsed MB52 snapshot. The distribution table is replaced by
 * the file (it is a point-in-time snapshot), open reconciliation reviews
 * are recreated from the file's totals, and applied/dismissed reviews are
 * preserved as history. Reconciliation compares SAP total per material
 * against the app's physical total; differences become open reviews,
 * matches clear them. Never writes to material_allocation.
 */
export async function bulkImportMb52(
  rows: SapDistributionRow[],
  fileName: string | undefined,
  onProgress?: (processed: number, total: number) => void
): Promise<Mb52ImportSummary> {
  const summary: Mb52ImportSummary = {
    totalRows: rows.length,
    distributionRowsWritten: 0,
    materialsProcessed: 0,
    matched: 0,
    reviewsCreated: 0,
    materialsCreated: 0,
    failed: 0,
    outcomes: [],
  };

  const total = rows.length;
  if (total === 0) return summary;

  function reportProgress(fraction: number) {
    if (!onProgress) return;
    onProgress(Math.min(total, Math.max(0, Math.round(fraction * total))), total);
  }

  // Aggregate the file: per material the SLoc split, per (material, SLoc)
  // the summed quantity (MB52 can repeat a material across rows).
  const byMaterial = new Map<string, Map<string, number>>();
  for (const row of rows) {
    let slocs = byMaterial.get(row.material_code);
    if (!slocs) {
      slocs = new Map();
      byMaterial.set(row.material_code, slocs);
    }
    slocs.set(row.storage_location, (slocs.get(row.storage_location) ?? 0) + row.quantity);
  }

  const materialCodes = Array.from(byMaterial.keys());
  summary.materialsProcessed = materialCodes.length;

  const masterInfo = await fetchMaterialMasterInfo(materialCodes).catch(
    () => new Map<string, MaterialMasterInfo>()
  );
  const missingCodes = materialCodes.filter((code) => !masterInfo.has(code));

  if (missingCodes.length > 0) {
    const meta = new Map<string, { description: string; uom: string }>();
    for (const row of rows) {
      const entry = meta.get(row.material_code);
      if (!entry) {
        meta.set(row.material_code, {
          description: row.material_description,
          uom: row.uom,
        });
      } else {
        if (!entry.description && row.material_description) {
          entry.description = row.material_description;
        }
        if (!entry.uom && row.uom) {
          entry.uom = row.uom;
        }
      }
    }
    summary.materialsCreated = await createMissingMaterials(missingCodes, meta);
  }

  reportProgress(0.25);

  // 1. Replace the snapshot: delete this account's distribution rows, then
  //    bulk-insert the file's (material, SLoc, qty) rows.
  const { error: deleteError } = await supabase
    .from("sap_stock_distribution")
    .delete()
    .neq("id", 0);

  if (deleteError) throw deleteError;

  const distributionPayload: {
    material_code: string;
    storage_location: string;
    quantity: number;
    source_file: string | null;
  }[] = [];

  for (const [materialCode, slocs] of byMaterial) {
    for (const [sloc, quantity] of slocs) {
      distributionPayload.push({
        material_code: materialCode,
        storage_location: sloc,
        quantity,
        source_file: fileName ?? null,
      });
    }
  }

  await runChunked(distributionPayload, async (batch) => {
    const { error } = await supabase
      .from("sap_stock_distribution")
      .insert(batch);

    if (error) throw error;
  });

  summary.distributionRowsWritten = distributionPayload.length;

  reportProgress(0.5);

  // 2. App physical totals per material (sum over all bins).
  const appTotalMap = new Map<string, number>();
  await runChunked(materialCodes, async (batch) => {
    const { data, error } = await supabase
      .from("material_allocation")
      .select("material_code, quantity")
      .in("material_code", batch);

    if (error) throw error;

    (data ?? []).forEach(
      (a: { material_code: string; quantity: number }) => {
        appTotalMap.set(
          a.material_code,
          (appTotalMap.get(a.material_code) ?? 0) + Number(a.quantity)
        );
      }
    );
  });

  reportProgress(0.7);

  // 3. Recreate the open reviews from the file's totals. Applied/dismissed
  //    reviews are kept as history.
  const { error: clearError } = await supabase
    .from("stock_reconciliation_reviews")
    .delete()
    .eq("status", "open");

  if (clearError) throw clearError;

  const reviewPayload: {
    material_code: string;
    short_description: string | null;
    uom: string | null;
    sap_total: number;
    app_total: number;
    difference: number;
    sloc_breakdown: unknown;
    source_file: string | null;
  }[] = [];

  for (const [materialCode, slocs] of byMaterial) {
    const sapTotal = Array.from(slocs.values()).reduce((sum, q) => sum + q, 0);
    const appTotal = appTotalMap.get(materialCode) ?? 0;

    if (sapTotal === appTotal) {
      summary.matched += 1;
      continue;
    }

    reviewPayload.push({
      material_code: materialCode,
      short_description: masterInfo.get(materialCode)?.short_description ?? null,
      uom: masterInfo.get(materialCode)?.uom ?? null,
      sap_total: sapTotal,
      app_total: appTotal,
      difference: sapTotal - appTotal,
      sloc_breakdown: Array.from(slocs.entries()).map(([sloc, qty]) => ({
        storage_location: sloc,
        quantity: qty,
      })),
      source_file: fileName ?? null,
    });
  }

  await runChunked(reviewPayload, async (batch) => {
    const { error } = await supabase
      .from("stock_reconciliation_reviews")
      .insert(batch);

    if (error) {
      // Fall back per-row so one bad row can't drop every review.
      for (const payload of batch) {
        const { error: rowError } = await supabase
          .from("stock_reconciliation_reviews")
          .insert([payload]);
        if (rowError) throw rowError;
      }
    }
  });

  summary.reviewsCreated = reviewPayload.length;

  reportProgress(0.9);

  // 4. Per-row outcomes for the report.
  for (const row of rows) {
    summary.outcomes.push({
      rowNumber: row.rowNumber,
      material_code: row.material_code,
      storage_location: row.storage_location,
      quantity: row.quantity,
      status: "imported",
    });
  }

  reportProgress(1);
  return summary;
}

/* -------------------------------------------------------------------------
 * Reads - distribution, history, reviews
 * ---------------------------------------------------------------------- */

export interface SapStockReview {
  id: number;
  material_code: string;
  short_description: string | null;
  sap_total: number;
  app_total: number;
  difference: number;
  sloc_breakdown: { storage_location: string; quantity: number }[];
  status: "open" | "applied" | "dismissed";
  source_file: string | null;
  created_at: string;
  applied_at: string | null;
  applied_remarks: string | null;
}

export interface SapStockRow {
  material_code: string;
  short_description: string;
  uom: string;
  locations: { storage_location: string; quantity: number }[];
  total: number;
  /** Open review when the totals disagree, null otherwise. */
  review: SapStockReview | null;
  hasSapData: boolean;
}

const REVIEW_COLUMNS =
  "id, material_code, short_description, uom, sap_total, app_total, difference, sloc_breakdown, status, source_file, created_at, applied_at, applied_remarks";

function toSapStockReview(row: Record<string, unknown>): SapStockReview {
  return {
    id: row.id as number,
    material_code: row.material_code as string,
    short_description: (row.short_description as string | null) ?? null,
    sap_total: Number(row.sap_total),
    app_total: Number(row.app_total),
    difference: Number(row.difference),
    sloc_breakdown: (row.sloc_breakdown ?? []) as SapStockReview["sloc_breakdown"],
    status: row.status as SapStockReview["status"],
    source_file: (row.source_file as string | null) ?? null,
    created_at: row.created_at as string,
    applied_at: (row.applied_at as string | null) ?? null,
    applied_remarks: (row.applied_remarks as string | null) ?? null,
  };
}

export async function getSapReconciliationReviews(): Promise<SapStockReview[]> {
  const { data, error } = await supabase
    .from("stock_reconciliation_reviews")
    .select(REVIEW_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return [];
  }

  return ((data ?? []) as Record<string, unknown>[]).map(toSapStockReview);
}

export interface SapStockPageResult {
  rows: SapStockRow[];
  total: number;
  error: string | null;
}

/**
 * Paginated SAP stock overview from v_sap_stock (server-side aggregation
 * of the distribution + open review + Material Master description). page
 * is 0-based. The search term matches material code and description across
 * ALL materials on the database - not just the current page.
 */
export async function getSapStockPage(params: {
  query?: string;
  storageLocation?: string;
  status?: "all" | "diff" | "match";
  page: number;
  pageSize: number;
}): Promise<SapStockPageResult> {
  let query = supabase
    .from("v_sap_stock")
    .select("material_code, short_description, uom, locations, total, review", {
      count: "exact",
    });

  const search = params.query?.trim();
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    query = query.or(
      `material_code.ilike.${pattern},short_description.ilike.${pattern}`
    );
  }
  if (params.storageLocation) {
    query = query.contains("locations", [
      { storage_location: params.storageLocation },
    ]);
  }
  if (params.status === "diff") query = query.not("review", "is", null);
  if (params.status === "match") query = query.is("review", null);

  const from = params.page * params.pageSize;
  const { data, error, count } = await query
    .order("material_code")
    .range(from, from + params.pageSize - 1);

  if (error) {
    console.error(error);
    return { rows: [], total: 0, error: error.message };
  }

  const rows: SapStockRow[] = ((data ?? []) as Record<string, unknown>[]).map(
    (row) => {
      const reviewRow = row.review as Record<string, unknown> | null;
      const locations = (
        (row.locations ?? []) as { storage_location: string; quantity: number }[]
      ).map((l) => ({
        storage_location: l.storage_location,
        quantity: Number(l.quantity),
      }));
      const code = row.material_code as string;
      const review = reviewRow ? toSapStockReview(reviewRow) : null;

      return {
        material_code: code,
        short_description: (row.short_description as string) ?? "",
        uom: (row.uom as string) ?? "",
        locations,
        total: Number(row.total),
        review: review ? { ...review, material_code: code } : null,
        hasSapData: locations.length > 0,
      };
    }
  );

  return { rows, total: count ?? 0, error: null };
}

/** All distinct storage locations for the filter dropdown. */
export async function getSapStorageLocations(): Promise<string[]> {
  const { data, error } = await supabase
    .from("sap_stock_distribution")
    .select("storage_location");

  if (error) {
    console.error(error);
    return [];
  }

  return Array.from(
    new Set((data ?? []).map((row) => row.storage_location as string))
  ).sort();
}

/** Count of open reconciliation reviews (for the banner). */
export async function getOpenSapReviewCount(): Promise<number> {
  const { count, error } = await supabase
    .from("stock_reconciliation_reviews")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");

  if (error) {
    console.error(error);
    return 0;
  }

  return count ?? 0;
}

/**
 * SAP status for ONE material (total across its storage locations, the
 * per-SLoc split, and the open reconciliation review, if any). Scoped
 * query - it never scans the whole
 * distribution table, so the material details box opens instantly even
 * with a large MB52 snapshot imported. Returns null when the material
 * has no SAP data at all (no distribution rows and no review).
 */
export async function getSapStockForMaterial(
  materialCode: string
): Promise<{
  total: number;
  locations: { storage_location: string; quantity: number }[];
  review: SapStockReview | null;
} | null> {
  const [distribution, review] = await Promise.all([
    supabase
      .from("sap_stock_distribution")
      .select("storage_location, quantity")
      .eq("material_code", materialCode),
    supabase
      .from("stock_reconciliation_reviews")
      .select(REVIEW_COLUMNS)
      .eq("material_code", materialCode)
      .eq("status", "open")
      .maybeSingle(),
  ]);

  if (distribution.error || review.error) {
    if (distribution.error) console.error(distribution.error);
    if (review.error) console.error(review.error);
    return null;
  }

  const rows = (distribution.data ?? []) as {
    storage_location: string;
    quantity: number;
  }[];
  const reviewRow = review.data as Record<string, unknown> | null;

  // No distribution rows and no open review - the material simply has no
  // SAP data, so the caller hides the SAP strip entirely.
  if (rows.length === 0 && !reviewRow) return null;

  // Defensive aggregation: collapse duplicate (SLoc) rows so each bucket
  // and its quantity appear exactly once, whatever the table contains.
  const bySloc = new Map<string, number>();
  for (const row of rows) {
    const sloc = row.storage_location.trim().toUpperCase();
    if (!sloc) continue;
    bySloc.set(sloc, (bySloc.get(sloc) ?? 0) + Number(row.quantity));
  }

  const locations = Array.from(bySloc.entries())
    .map(([storage_location, quantity]) => ({ storage_location, quantity }))
    .sort((a, b) => a.storage_location.localeCompare(b.storage_location));
  const total = locations.reduce((sum, l) => sum + l.quantity, 0);
  const parsed = reviewRow ? toSapStockReview(reviewRow) : null;

  return {
    total,
    locations,
    review: parsed ? { ...parsed, material_code: materialCode } : null,
  };
}

export interface SapHistoryFilters {
  from?: string | null;
  to?: string | null;
  movementType?: string | null;
  storageLocation?: string | null;
}

const DOCUMENT_COLUMNS =
  "id, material_code, material_description, item, storage_location, movement_type, special_stock, material_document, material_doc_item, posting_date, quantity, unit_of_entry, purchase_order, user_name, invoice_number, vendor, document_header_text, imported_at";

export interface SapDocument {
  id: number;
  material_code: string;
  material_description: string | null;
  item: string | null;
  storage_location: string;
  movement_type: string | null;
  special_stock: string | null;
  material_document: string | null;
  material_doc_item: string | null;
  posting_date: string | null;
  quantity: number;
  unit_of_entry: string | null;
  purchase_order: string | null;
  user_name: string | null;
  invoice_number: string | null;
  vendor: string | null;
  document_header_text: string | null;
  imported_at: string;
  /** Per-SLoc running balance at this row (computed by v_sap_history). */
  running_balance: number;
}

function toSapDocument(row: Record<string, unknown>): SapDocument {
  return {
    id: row.id as number,
    material_code: row.material_code as string,
    material_description: (row.material_description as string | null) ?? null,
    item: (row.item as string | null) ?? null,
    storage_location: row.storage_location as string,
    movement_type: (row.movement_type as string | null) ?? null,
    special_stock: (row.special_stock as string | null) ?? null,
    material_document: (row.material_document as string | null) ?? null,
    material_doc_item: (row.material_doc_item as string | null) ?? null,
    posting_date: (row.posting_date as string | null) ?? null,
    quantity: Number(row.quantity),
    unit_of_entry: (row.unit_of_entry as string | null) ?? null,
    purchase_order: (row.purchase_order as string | null) ?? null,
    user_name: (row.user_name as string | null) ?? null,
    invoice_number: (row.invoice_number as string | null) ?? null,
    vendor: (row.vendor as string | null) ?? null,
    document_header_text: (row.document_header_text as string | null) ?? null,
    imported_at: row.imported_at as string,
    running_balance: Number(row.running_balance ?? 0),
  };
}

/**
 * Escapes LIKE/ILIKE wildcards in a user-provided search term so a literal
 * % or _ in the query never acts as a wildcard.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export interface SapHistoryPageResult {
  docs: SapDocument[];
  total: number;
  error: string | null;
}

/**
 * Paginated MB51 history from v_sap_history (server-side aggregation +
 * running balance). page is 0-based. `search` matches against the
 * material code, description, document, header text, PO, vendor, invoice,
 * user and storage location - the whole dataset is searched on the
 * database, not just the current page.
 */
export async function getSapHistoryPage(params: {
  materialCode?: string | null;
  filters?: SapHistoryFilters;
  search?: string;
  page: number;
  pageSize: number;
}): Promise<SapHistoryPageResult> {
  let query = supabase
    .from("v_sap_history")
    .select(`${DOCUMENT_COLUMNS}, running_balance`, { count: "exact" });

  if (params.materialCode) {
    query = query.eq("material_code", params.materialCode);
  }

  const filters = params.filters;
  if (filters?.from) query = query.gte("posting_date", filters.from);
  if (filters?.to) query = query.lte("posting_date", filters.to);
  if (filters?.movementType) query = query.eq("movement_type", filters.movementType);
  if (filters?.storageLocation) query = query.eq("storage_location", filters.storageLocation);

  const search = params.search?.trim();
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    query = query.or(
      `material_code.ilike.${pattern},material_description.ilike.${pattern},` +
        `material_document.ilike.${pattern},document_header_text.ilike.${pattern},` +
        `purchase_order.ilike.${pattern},vendor.ilike.${pattern},invoice_number.ilike.${pattern},` +
        `user_name.ilike.${pattern},movement_type.ilike.${pattern},storage_location.ilike.${pattern}`
    );
  }

  const from = params.page * params.pageSize;
  const { data, error, count } = await query
    .order("posting_date", { ascending: false, nullsFirst: false })
    .order("imported_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + params.pageSize - 1);

  if (error) {
    console.error(error);
    return { docs: [], total: 0, error: error.message };
  }

  return {
    docs: ((data ?? []) as Record<string, unknown>[]).map(toSapDocument),
    total: count ?? 0,
    error: null,
  };
}

/** Distinct movement types / storage locations for the filter dropdowns. */
export async function getSapDistinctValues(
  column: "movement_type" | "storage_location",
  materialCode: string | null
): Promise<string[]> {
  let query = supabase
    .from("sap_material_documents")
    .select(column)
    .not(column, "is", null);

  if (materialCode) query = query.eq("material_code", materialCode);

  const { data, error } = await query;
  if (error) {
    console.error(error);
    return [];
  }

  return Array.from(
    new Set(
      ((data ?? []) as Record<string, string>[]).map((row) => row[column])
    )
  ).sort();
}

/* -------------------------------------------------------------------------
 * Reconciliation reviews - apply / dismiss
 * ---------------------------------------------------------------------- */

/**
 * Applies an open reconciliation review: brings the app's physical stock
 * to the SAP total by setting each supplied location to its final
 * quantity through the normal Adjustment path (one audited ADJUSTMENT
 * per changed location, reason "SAP Reconciliation", remarks referencing
 * the review). Marks the review applied and clears any count-based
 * pending flag for the material so the two review mechanisms don't
 * double-flag it.
 */
export async function applySapReconciliation(
  reviewId: number,
  materialCode: string,
  locationQuantities: { location_code: string; quantity: number }[],
  remarks?: string
): Promise<void> {
  const reason = "SAP Reconciliation";

  for (const { location_code, quantity } of locationQuantities) {
    await applyAdjustment(materialCode, location_code, quantity, reason, remarks);
  }

  const { error } = await supabase
    .from("stock_reconciliation_reviews")
    .update({
      status: "applied",
      applied_at: new Date().toISOString(),
      applied_remarks: remarks ?? null,
    })
    .eq("id", reviewId);

  if (error) throw error;

  // Best-effort: clear any count-based pending flag for this material.
  try {
    await dismissPendingStockUpdate(materialCode);
  } catch {
    // Non-fatal - the review is applied either way.
  }
}

export async function dismissSapReconciliation(
  reviewId: number,
  note?: string
): Promise<void> {
  const { error } = await supabase
    .from("stock_reconciliation_reviews")
    .update({
      status: "dismissed",
      applied_at: new Date().toISOString(),
      applied_remarks: note ?? "Dismissed by user.",
    })
    .eq("id", reviewId);

  if (error) throw error;
}

/* -------------------------------------------------------------------------
 * Import reports
 * ---------------------------------------------------------------------- */

const MB51_REPORT_COLUMNS = [
  { header: "Material", key: "material_code" },
  { header: "Storage Location", key: "storage_location" },
  { header: "Movement Type", key: "movement_type" },
  { header: "Posting Date", key: "posting_date" },
  { header: "Quantity", key: "quantity" },
  { header: "Material Document", key: "material_document" },
];

const MB51_ROW_STATUS: Record<Mb51RowStatus, BulkImportRowStatus> = {
  imported: "Imported",
  updated: "Imported",
  failed: "Failed",
};

export async function downloadMb51ImportReport(
  validation: {
    totalRecords: number;
    validRows: SapDocumentRow[];
    invalidRows: SapInvalidRow[];
  },
  summary: Mb51ImportSummary,
  fileName?: string | null
): Promise<void> {
  const rejected: BulkImportReportRow[] = validation.invalidRows.map((row) => ({
    rowNumber: row.rowNumber,
    status: "Rejected",
    reason: row.errors.join("; "),
    data: {
      material_code: row.material_code,
      storage_location: "",
      movement_type: "",
      posting_date: "",
      quantity: "",
      material_document: "",
    },
  }));

  const outcomes: BulkImportReportRow[] = summary.outcomes.map((row) => ({
    rowNumber: row.rowNumber,
    status: MB51_ROW_STATUS[row.status],
    reason: row.message,
    data: {
      material_code: row.material_code,
      storage_location: row.storage_location,
      movement_type: getMovementTypeDescription(row.movement_type),
      posting_date: row.posting_date ?? "",
      quantity: row.quantity,
      material_document: "",
    },
  }));

  await recordAndDownloadBulkImportReport({
    importType: "SAP MB51 Material History",
    fileName,
    totalRows: validation.totalRecords,
    successCount: summary.inserted + summary.updated,
    rejectedCount: validation.invalidRows.length,
    failedCount: summary.failed,
    fileNamePrefix: "SAP_MB51_Import",
    columns: MB51_REPORT_COLUMNS,
    rows: [...rejected, ...outcomes],
    summary: [
      { label: "Total Excel Rows", value: validation.totalRecords },
      { label: "Movements Imported", value: summary.inserted },
      { label: "Updated (re-import)", value: summary.updated },
      { label: "Materials Created", value: summary.materialsCreated },
      { label: "Failed", value: summary.failed },
    ],
  });
}

const MB52_REPORT_COLUMNS = [
  { header: "Material", key: "material_code" },
  { header: "Storage Location", key: "storage_location" },
  { header: "Quantity", key: "quantity" },
];

const MB52_ROW_STATUS: Record<Mb52RowStatus, BulkImportRowStatus> = {
  imported: "Imported",
  failed: "Failed",
};

export async function downloadMb52ImportReport(
  validation: {
    totalRecords: number;
    validRows: SapDistributionRow[];
    invalidRows: SapInvalidRow[];
  },
  summary: Mb52ImportSummary,
  fileName?: string | null
): Promise<void> {
  const rejected: BulkImportReportRow[] = validation.invalidRows.map((row) => ({
    rowNumber: row.rowNumber,
    status: "Rejected",
    reason: row.errors.join("; "),
    data: {
      material_code: row.material_code,
      storage_location: "",
      quantity: "",
    },
  }));

  const outcomes: BulkImportReportRow[] = summary.outcomes.map((row) => ({
    rowNumber: row.rowNumber,
    status: MB52_ROW_STATUS[row.status],
    reason: row.message,
    data: {
      material_code: row.material_code,
      storage_location: row.storage_location,
      quantity: row.quantity,
    },
  }));

  await recordAndDownloadBulkImportReport({
    importType: "SAP MB52 Current Stock",
    fileName,
    totalRows: validation.totalRecords,
    successCount: summary.distributionRowsWritten,
    rejectedCount: validation.invalidRows.length,
    failedCount: summary.failed,
    fileNamePrefix: "SAP_MB52_Import",
    columns: MB52_REPORT_COLUMNS,
    rows: [...rejected, ...outcomes],
    summary: [
      { label: "Total Excel Rows", value: validation.totalRecords },
      { label: "Distribution Rows Written", value: summary.distributionRowsWritten },
      { label: "Materials Processed", value: summary.materialsProcessed },
      { label: "Matched (SAP = App)", value: summary.matched },
      { label: "Reviews Created (difference)", value: summary.reviewsCreated },
      { label: "Materials Created", value: summary.materialsCreated },
      { label: "Failed", value: summary.failed },
    ],
  });
}
