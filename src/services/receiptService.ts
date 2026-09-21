import { supabase } from "../config/supabase";
import { applyStockMovement } from "./inventoryTransactionService";
import {
  type BulkImportReportRow,
  type BulkImportRowStatus,
} from "../utils/bulkImportReport";
import { recordAndDownloadBulkImportReport } from "./bulkImportHistoryService";

/* =========================================================================
 * Material Receipt - DRC Management (Sprint 1)
 *
 * Scope: create/list/update DRC header records only. No stock movement,
 * no inventory update, no inspection workflow - those are Sprint 2+.
 * ========================================================================= */

export type ReceiptMode = "Vehicle" | "Hand";

export type PackageType =
  | "Boxes"
  | "Bags"
  | "Bundles"
  | "Drums"
  | "Nos"
  | "Kg"
  | "MT"
  | "Others";

export const PACKAGE_TYPES: PackageType[] = [
  "Boxes",
  "Bags",
  "Bundles",
  "Drums",
  "Nos",
  "Kg",
  "MT",
  "Others",
];

export type ReceiptStatus =
  | "Pending Inspection"
  | "Pending GRN"
  | "Closed"
  | "GRN created";

/**
 * Inspection outcomes. "Pending Inspection" is the initial state set at DRC
 * creation; the inspecting user then records exactly one of the two
 * outcomes below - "Inspection Cleared" moves the DRC forward to GRN,
 * "Inspection On Hold" keeps it open for re-inspection once the (mandatory)
 * remarks describing the hold reason are addressed. Once 105 GR release is
 * fetched/posted, status moves to "GRN created".
 */
export type InspectionStatus =
  | "Pending Inspection"
  | "Pending inspection"
  | "Inspection Cleared"
  | "Inspection On Hold"
  | "Inspection cleared"
  | "Inspection on hold"
  | "GRN created";

export interface PackageDetailRow {
  /** Free text - usually numeric, but may be a note like "Uncountable". */
  quantity: string;
  package_type: string;
  description: string;
  // SAP Mapped fields:
  material_code?: string;
  uom?: string;
  item_no?: string;
  sap_103_doc?: string;
  sap_103_date?: string;
  sap_105_doc?: string;
  sap_105_date?: string;
  storage_location?: string;
  bin_location?: string;
  bin_allocated?: boolean;
  allocated_qty?: number;
  allocated_at?: string;
  allocated_by?: string;
}

export type DocumentType =
  | "Invoice"
  | "Challan"
  | "LR Copy"
  | "Packing List"
  | "Test Certificate"
  | "Other";

export const DOCUMENT_TYPES: DocumentType[] = [
  "Invoice",
  "Challan",
  "LR Copy",
  "Packing List",
  "Test Certificate",
  "Other",
];

export interface AttachmentFile {
  name: string;
  url: string;
  uploaded_at: string;
  /** Absent on documents uploaded before document typing was added. */
  document_type?: DocumentType;
}

export interface ReceiptHeader {
  id: number;
  user_id?: string | null;
  drc_number: string;
  receipt_mode: ReceiptMode;
  vehicle_number: string | null;
  /** @deprecated use package_details. Kept populated (derived) for
   * backward compatibility with anything still reading these columns. */
  package_count: number | null;
  /** @deprecated use package_details. */
  package_type: PackageType | string | null;
  package_details: PackageDetailRow[];
  vendor_name: string;
  /** @deprecated use sap_po_number / gem_order_number. Kept populated
   * (derived) for backward compatibility. */
  po_number: string | null;
  /** @deprecated use sap_po_date / gem_order_date. */
  po_date: string | null;
  sap_po_number: string | null;
  sap_po_date: string | null;
  gem_order_number: string | null;
  gem_order_date: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  challan_number: string | null;
  challan_date: string | null;
  eway_bill_number: string | null;
  eway_bill_date: string | null;
  lorry_receipt_number: string | null;
  lorry_receipt_date: string | null;
  weightment_slip_number: string | null;
  gross_weight: number | null;
  tare_weight: number | null;
  net_weight: number | null;
  remarks: string | null;
  photo_urls: string[];
  photo_paths: AttachmentFile[];
  attachment_paths: AttachmentFile[];
  status: ReceiptStatus;
  receipt_datetime: string;
  created_at: string;
  updated_at: string;
  // Security gate entry
  purpose: string | null;
  driver_name: string | null;
  // Sprint 2
  inspection_status: InspectionStatus | null;
  inspection_remarks: string | null;
  inspection_date: string | null;
  inspection_by: string | null;
  grn_number: string | null;
  grn_date: string | null;
  // DRC Register fields
  tax_invoice_value: number | null;
  msme_type: string | null;
  important_note: string | null;
  delivery_location: string | null;
  vim_approval: string | null;
  uploaded_by: string | null;
  upload_date: string | null;
  closed_date: string | null;
  closed_by: string | null;
  // SAP MB51 Sync and 103/105 tracking
  sap_103_doc?: string | null;
  sap_103_date?: string | null;
  sap_105_doc?: string | null;
  sap_105_date?: string | null;
  sap_items?: PackageDetailRow[] | null;
}

/**
 * Fields the Create/Edit DRC form collects. drc_number, status, and
 * receipt_datetime are generated by the database (see the migration's
 * `generate_drc_number` trigger) and are never sent from the client on
 * create.
 */
export interface ReceiptFormInput {
  receipt_mode: ReceiptMode;
  vehicle_number: string;
  package_details: PackageDetailRow[];
  sap_items?: PackageDetailRow[] | null;
  vendor_name: string;
  sap_po_number: string;
  sap_po_date: string;
  gem_order_number: string;
  gem_order_date: string;
  invoice_number: string;
  invoice_date: string;
  challan_number: string;
  challan_date: string;
  eway_bill_number: string;
  eway_bill_date: string;
  lorry_receipt_number: string;
  lorry_receipt_date: string;
  weightment_slip_number: string;
  gross_weight: string;
  tare_weight: string;
  net_weight: string;
  purpose: string;
  driver_name: string;
  tax_invoice_value: string;
  msme_type: string;
  important_note: string;
  delivery_location: string;
  vim_approval: string;
  remarks: string;
}

const RECEIPT_PHOTOS_BUCKET = "receipt-photos";
const RECEIPT_FILES_BUCKET = "receipt-files";

const ALLOWED_DOCUMENT_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "jpg",
  "jpeg",
  "png",
];

function toNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Cleans physical package details (e.g. C/Box, W/Box, Container, Drum):
 * Keeps strictly physical package rows without SAP material codes.
 */
export function cleanPhysicalPackageDetails(rows: PackageDetailRow[]): PackageDetailRow[] {
  return (rows || [])
    .map((row) => ({
      quantity: (row.quantity || "").trim(),
      package_type: (row.package_type || "").trim(),
      description: (row.description || "").trim(),
    }))
    .filter((row) => row.quantity || row.package_type || row.description);
}

/**
 * Cleans SAP 103/105 material items: preserves material codes, descriptions,
 * UoM, movement document numbers, dates, and bin allocations.
 */
export function cleanSapItems(rows: PackageDetailRow[]): PackageDetailRow[] {
  return cleanPackageDetails(rows);
}

/**
 * Cleans up a Package Details table: drops fully-empty rows and trims text
 * fields. Quantity is free text (e.g. "10" or "Uncountable"), so it is kept
 * as-is rather than coerced to a number.
 */
function cleanPackageDetails(rows: PackageDetailRow[]): PackageDetailRow[] {
  return rows
    .map((row) => ({
      quantity: (row.quantity || "").trim(),
      package_type: (row.package_type || "").trim(),
      description: (row.description || "").trim(),
      ...(row.material_code ? { material_code: row.material_code.trim() } : {}),
      ...(row.uom ? { uom: row.uom.trim() } : {}),
      ...(row.item_no ? { item_no: row.item_no.trim() } : {}),
      ...(row.sap_103_doc ? { sap_103_doc: row.sap_103_doc.trim() } : {}),
      ...(row.sap_103_date ? { sap_103_date: row.sap_103_date } : {}),
      ...(row.sap_105_doc ? { sap_105_doc: row.sap_105_doc.trim() } : {}),
      ...(row.sap_105_date ? { sap_105_date: row.sap_105_date } : {}),
      ...(row.storage_location ? { storage_location: row.storage_location.trim() } : {}),
      ...(row.bin_location ? { bin_location: row.bin_location.trim() } : {}),
      ...(row.bin_allocated !== undefined ? { bin_allocated: row.bin_allocated } : {}),
      ...(row.allocated_qty !== undefined ? { allocated_qty: row.allocated_qty } : {}),
      ...(row.allocated_at ? { allocated_at: row.allocated_at } : {}),
      ...(row.allocated_by ? { allocated_by: row.allocated_by } : {}),
    }))
    .filter(
      (row) =>
        row.quantity ||
        row.package_type ||
        row.description ||
        row.material_code
    );
}

/** Best-effort numeric total for the legacy package_count column - rows with
 * a non-numeric quantity (e.g. "Uncountable") simply don't contribute. */
function sumPackageQuantities(rows: PackageDetailRow[]): number {
  return rows.reduce((sum, row) => {
    const n = Number(row.quantity);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}

function buildPayload(input: ReceiptFormInput) {
  // Ensure physical packages are strictly separated from SAP material line items
  const packageDetails = cleanPhysicalPackageDetails(input.package_details);
  const sapItems = input.sap_items !== undefined ? (input.sap_items ? cleanSapItems(input.sap_items) : []) : undefined;

  const sapPoNumber = toNullable(input.sap_po_number);
  const sapPoDate = toNullable(input.sap_po_date);
  const gemOrderNumber = toNullable(input.gem_order_number);
  const gemOrderDate = toNullable(input.gem_order_date);

  return {
    receipt_mode: input.receipt_mode,
    vehicle_number:
      input.receipt_mode === "Vehicle" ? toNullable(input.vehicle_number) : null,

    package_details: packageDetails,
    ...(sapItems !== undefined ? { sap_items: sapItems } : {}),
    // Legacy columns, derived for backward compatibility with anything
    // still reading package_count / package_type directly.
    package_count:
      packageDetails.length > 0 ? sumPackageQuantities(packageDetails) : null,
    package_type: packageDetails[0]?.package_type || null,

    vendor_name: input.vendor_name.trim(),

    sap_po_number: sapPoNumber,
    sap_po_date: sapPoDate,
    gem_order_number: gemOrderNumber,
    gem_order_date: gemOrderDate,
    // Legacy columns, derived so any existing search/report relying on
    // po_number / po_date still finds a value (SAP PO takes precedence).
    po_number: sapPoNumber ?? gemOrderNumber,
    po_date: sapPoDate ?? gemOrderDate,

    invoice_number: toNullable(input.invoice_number),
    invoice_date: toNullable(input.invoice_date),
    purpose: toNullable(input.purpose),
    driver_name: toNullable(input.driver_name),
    challan_number: toNullable(input.challan_number),
    challan_date: toNullable(input.challan_date),
    eway_bill_number: toNullable(input.eway_bill_number),
    eway_bill_date: toNullable(input.eway_bill_date),

    lorry_receipt_number: toNullable(input.lorry_receipt_number),
    lorry_receipt_date: toNullable(input.lorry_receipt_date),
    weightment_slip_number: toNullable(input.weightment_slip_number),
    gross_weight: toNullableNumber(input.gross_weight),
    tare_weight: toNullableNumber(input.tare_weight),
    net_weight: toNullableNumber(input.net_weight),

    remarks: toNullable(input.remarks),
    tax_invoice_value: toNullableNumber(input.tax_invoice_value),
    msme_type: toNullable(input.msme_type),
    important_note: toNullable(input.important_note),
    delivery_location: toNullable(input.delivery_location),
    vim_approval: toNullable(input.vim_approval),
  };
}

/**
 * Uploads photos to the `receipt-photos` Supabase Storage bucket and
 * returns their public URLs. A single failed upload is skipped (logged)
 * rather than blocking the rest, or the whole DRC save.
 */
export async function uploadReceiptPhotos(files: File[]): Promise<string[]> {
  const urls: string[] = [];

  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const path = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(RECEIPT_PHOTOS_BUCKET)
      .upload(path, file);

    if (uploadError) {
      console.error("Photo upload failed:", uploadError.message);
      continue;
    }

    const { data } = supabase.storage
      .from(RECEIPT_PHOTOS_BUCKET)
      .getPublicUrl(path);

    if (data?.publicUrl) {
      urls.push(data.publicUrl);
    }
  }

  return urls;
}

/** A file staged for upload together with the document type the operator
 * selected for it (Invoice, Challan, LR Copy, Packing List, Test
 * Certificate, Other). */
export interface DocumentUpload {
  file: File;
  documentType: DocumentType;
}

/**
 * Uploads supporting documents (invoice, challan, LR copy, packing list,
 * test certificates, etc.) to the `receipt-files` Supabase Storage bucket,
 * tagging each with its selected document type. Only allow-listed file
 * types are uploaded; anything else is skipped (logged) rather than
 * blocking the rest.
 */
export async function uploadReceiptDocuments(
  uploads: DocumentUpload[]
): Promise<AttachmentFile[]> {
  const attachments: AttachmentFile[] = [];

  for (const { file, documentType } of uploads) {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

    if (!ALLOWED_DOCUMENT_EXTENSIONS.includes(extension)) {
      console.error(
        `Document upload skipped - unsupported file type: ${file.name}`
      );
      continue;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const path = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(RECEIPT_FILES_BUCKET)
      .upload(path, file);

    if (uploadError) {
      console.error("Document upload failed:", uploadError.message);
      continue;
    }

    const { data } = supabase.storage
      .from(RECEIPT_FILES_BUCKET)
      .getPublicUrl(path);

    if (data?.publicUrl) {
      attachments.push({
        name: file.name,
        url: data.publicUrl,
        uploaded_at: new Date().toISOString(),
        document_type: documentType,
      });
    }
  }

  return attachments;
}

/**
 * Uploads one document and appends it to an existing DRC's attachment
 * list immediately - used for adding documents (Invoice, Challan, LR
 * Copy, Packing List, Test Certificates, etc.) any time after DRC
 * creation, not just from the Create/Edit form.
 */
export async function addReceiptDocument(
  receiptId: number,
  file: File,
  documentType: DocumentType
): Promise<ReceiptHeader> {
  const [attachment] = await uploadReceiptDocuments([{ file, documentType }]);
  if (!attachment) {
    throw new Error("Document upload failed.");
  }

  const { data: current, error: fetchError } = await supabase
    .from("receipt_header")
    .select("attachment_paths")
    .eq("id", receiptId)
    .single();

  if (fetchError) throw fetchError;

  const existing =
    ((current as { attachment_paths: AttachmentFile[] } | null)
      ?.attachment_paths) ?? [];

  const { data, error } = await supabase
    .from("receipt_header")
    .update({ attachment_paths: [...existing, attachment] })
    .eq("id", receiptId)
    .select()
    .single();

  if (error) throw error;
  return data as ReceiptHeader;
}

/** Removes one document (by index in attachment_paths) from a DRC. */
export async function removeReceiptDocument(
  receiptId: number,
  index: number
): Promise<ReceiptHeader> {
  const { data: current, error: fetchError } = await supabase
    .from("receipt_header")
    .select("attachment_paths")
    .eq("id", receiptId)
    .single();

  if (fetchError) throw fetchError;

  const existing =
    ((current as { attachment_paths: AttachmentFile[] } | null)
      ?.attachment_paths) ?? [];
  const updated = existing.filter((_, i) => i !== index);

  const { data, error } = await supabase
    .from("receipt_header")
    .update({ attachment_paths: updated })
    .eq("id", receiptId)
    .select()
    .single();

  if (error) throw error;
  return data as ReceiptHeader;
}

/**
 * Manual overrides for the auto-generated DRC No. / DRC Date, collected
 * from the Create DRC form when the operator switches on manual entry.
 * Both are optional; omit a key to keep the database-generated value.
 */
export interface DrcManualOverrides {
  drc_number?: string;
  receipt_datetime?: string;
}

const DEMO_RECEIPTS_KEY = "esms:demo_receipts";

export function getDemoReceipts(): ReceiptHeader[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = sessionStorage.getItem(DEMO_RECEIPTS_KEY);
    return raw ? (JSON.parse(raw) as ReceiptHeader[]) : [];
  } catch {
    return [];
  }
}

export function saveDemoReceipt(receipt: ReceiptHeader): void {
  try {
    if (typeof window === "undefined") return;
    const existing = getDemoReceipts();
    const filtered = existing.filter((r) => r.id !== receipt.id);
    sessionStorage.setItem(DEMO_RECEIPTS_KEY, JSON.stringify([receipt, ...filtered]));
  } catch {
    // ignore quota/storage errors
  }
}

/**
 * Best-effort suggestion for the next DRC No., used only to prefill the
 * manual-entry field in the Create DRC form (previous DRC No. + 1).
 *
 * Financial-year format: DRC/26-27/1
 *   – FY runs 1 Apr – 31 Mar; Aug 2026 → FY 2026-27.
 *   – Increments the trailing numeric run, stripping any suffix (e.g. DRC/26-27/5A → DRC/26-27/6).
 *   – Falls back to DRC/{startYY}-{endYY}/1 if no row exists for the current FY.
 */
export async function getNextDrcNumberSuggestion(): Promise<string> {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const fyStart = month >= 4 ? year : year - 1;
  const fyEnd = month >= 4 ? year + 1 : year;
  const prefix = `DRC/${String(fyStart).slice(-2)}-${String(fyEnd).slice(-2)}/`;

  let maxFoundNum = 0;

  // Check demo receipts in current session
  const demoList = getDemoReceipts();
  for (const d of demoList) {
    if (d.drc_number?.startsWith(prefix)) {
      const numStr = d.drc_number.slice(prefix.length).replace(/[^0-9].*$/, "");
      const n = parseInt(numStr, 10);
      if (!isNaN(n) && n > maxFoundNum) maxFoundNum = n;
    }
  }

  // 1. Direct query against receipt_header for the current FY
  try {
    const { data: rows, error: qErr } = await supabase
      .from("receipt_header")
      .select("drc_number")
      .like("drc_number", `${prefix}%`);

    if (!qErr && rows && rows.length > 0) {
      for (const row of rows) {
        const dn = row.drc_number ?? "";
        if (!dn.startsWith(prefix)) continue;
        const numStr = dn.slice(prefix.length).replace(/[^0-9].*$/, "");
        const n = parseInt(numStr, 10);
        if (!isNaN(n) && n > maxFoundNum) maxFoundNum = n;
      }
    }
  } catch {
    // fallback
  }

  if (maxFoundNum > 0) {
    return prefix + (maxFoundNum + 1);
  }

  // 2. Fallback to RPC function
  try {
    const { data, error } = await supabase.rpc("generate_next_drc_number");
    if (!error && data && typeof data === "string" && data.startsWith(prefix)) {
      return data;
    }
  } catch {
    // fallback
  }

  return prefix + "1";
}

/**
 * Creates a new DRC.
 *
 * `drc_number` and `receipt_datetime` from `manualOverrides` (or auto-computed)
 * are included directly in the initial insert payload so that uniqueness and
 * fields are established atomically in a single operation.
 */
export async function createReceipt(
  input: ReceiptFormInput,
  photoFiles: File[],
  documentUploads: DocumentUpload[] = [],
  manualOverrides?: DrcManualOverrides
): Promise<ReceiptHeader> {
  const photoUrls =
    photoFiles.length > 0 ? await uploadReceiptPhotos(photoFiles) : [];

  const photoPaths: AttachmentFile[] = photoUrls.map((url, index) => ({
    name: photoFiles[index]?.name ?? `photo-${index + 1}`,
    url,
    uploaded_at: new Date().toISOString(),
  }));

  const attachmentPaths =
    documentUploads.length > 0
      ? await uploadReceiptDocuments(documentUploads)
      : [];

  const payload: Record<string, unknown> = {
    ...buildPayload(input),
    status: "Pending Inspection",
    inspection_status: "Pending inspection",
    photo_urls: photoUrls,
    photo_paths: photoPaths,
    attachment_paths: attachmentPaths,
  };

  if (manualOverrides?.receipt_datetime) {
    payload.receipt_datetime = manualOverrides.receipt_datetime;
  }

  // Explicitly attach current authenticated user_id to satisfy tenant isolation & NOT NULL constraint
  let currentAuthUserId: string | null = null;
  try {
    const { data: authData } = await supabase.auth.getUser();
    if (authData?.user?.id) {
      currentAuthUserId = authData.user.id;
      payload.user_id = authData.user.id;
    }
  } catch {
    // best-effort auth check
  }

  // ── DRC number generation & collision handling ────────────────────
  const MAX_DRC_RETRIES = 5;
  let lastInsertError: unknown = null;
  let data: ReceiptHeader | null = null;

  // Determine starting DRC candidate
  let candidateDrc = manualOverrides?.drc_number?.trim();
  if (!candidateDrc) {
    candidateDrc = await getNextDrcNumberSuggestion();
  }

  for (let attempt = 0; attempt < MAX_DRC_RETRIES; attempt++) {
    if (attempt === 0) {
      payload.drc_number = candidateDrc;
    } else {
      // Collision retry: compute the next incremental number
      const nextCandidate = await getNextDrcNumberSuggestion();
      const prefixMatch = candidateDrc.match(/^(DRC\/\d{2}-\d{2}\/)(\d+)(.*)$/);
      if (prefixMatch) {
        const prefix = prefixMatch[1];
        const num = parseInt(prefixMatch[2], 10);
        const nextNum = Math.max(num + attempt, (parseInt(nextCandidate.replace(/[^0-9]/g, ""), 10) || 0) + attempt);
        payload.drc_number = `${prefix}${nextNum}`;
      } else {
        payload.drc_number = nextCandidate;
      }
    }

    lastInsertError = null;
    data = null;

    const result = await supabase
      .from("receipt_header")
      .insert([payload])
      .select()
      .single();

    if (result.error) {
      lastInsertError = result.error;
      const rawMsg = (result.error as { message?: string })?.message ?? "";
      const isDrcCollision =
        rawMsg.includes("idx_receipt_header_drc_number") ||
        rawMsg.includes("duplicate key value violates unique constraint");
      if (isDrcCollision) {
        console.warn(`DRC collision on attempt ${attempt + 1} ("${payload.drc_number}"), retrying...`);
        continue; // retry with next number
      }
      // Non-collision error — stop retrying
      break;
    }

    data = result.data as ReceiptHeader;
    break; // success
  }

  if (lastInsertError || !data) {
    const errObj = lastInsertError as { code?: string; message?: string } | null;
    const errCode = errObj?.code;
    const isAuthOrRlsError =
      errCode === "23502" ||
      errCode === "42501" ||
      (typeof errObj?.message === "string" &&
        (errObj.message.includes("user_id") ||
          errObj.message.includes("row-level security") ||
          errObj.message.includes("violates not-null constraint")));

    const isDemoSession =
      typeof window !== "undefined" &&
      sessionStorage.getItem("esms_demo_session") === "true";

    if (isAuthOrRlsError || isDemoSession) {
      console.warn("Saving receipt to session store due to auth/tenant policy constraints:", lastInsertError);
      const demoId = Date.now();
      const mockReceipt: ReceiptHeader = {
        id: demoId,
        user_id: currentAuthUserId ?? "demo-user-id",
        drc_number: (payload.drc_number as string) || "DRC/26-27/1",
        receipt_datetime: (payload.receipt_datetime as string) || new Date().toISOString(),
        receipt_mode: (payload.receipt_mode as ReceiptMode) || "Vehicle",
        vehicle_number: (payload.vehicle_number as string) || null,
        vendor_name: (payload.vendor_name as string) || "",
        po_number: (payload.po_number as string) || null,
        po_date: (payload.po_date as string) || null,
        sap_po_number: (payload.sap_po_number as string) || null,
        sap_po_date: (payload.sap_po_date as string) || null,
        gem_order_number: (payload.gem_order_number as string) || null,
        gem_order_date: (payload.gem_order_date as string) || null,
        invoice_number: (payload.invoice_number as string) || null,
        invoice_date: (payload.invoice_date as string) || null,
        purpose: (payload.purpose as string) || null,
        driver_name: (payload.driver_name as string) || null,
        challan_number: (payload.challan_number as string) || null,
        challan_date: (payload.challan_date as string) || null,
        eway_bill_number: (payload.eway_bill_number as string) || null,
        eway_bill_date: (payload.eway_bill_date as string) || null,
        lorry_receipt_number: (payload.lorry_receipt_number as string) || null,
        lorry_receipt_date: (payload.lorry_receipt_date as string) || null,
        weightment_slip_number: (payload.weightment_slip_number as string) || null,
        gross_weight: (payload.gross_weight as number) || null,
        tare_weight: (payload.tare_weight as number) || null,
        net_weight: (payload.net_weight as number) || null,
        remarks: (payload.remarks as string) || null,
        tax_invoice_value: (payload.tax_invoice_value as number) || null,
        msme_type: (payload.msme_type as string) || null,
        important_note: (payload.important_note as string) || null,
        delivery_location: (payload.delivery_location as string) || null,
        vim_approval: (payload.vim_approval as string) || null,
        package_count: (payload.package_count as number) || null,
        package_type: (payload.package_type as string) || null,
        package_details: (payload.package_details as PackageDetailRow[]) || [],
        sap_items: (payload.sap_items as PackageDetailRow[]) || [],
        status: (payload.status as any) || "Pending Inspection",
        inspection_status: (payload.inspection_status as any) || "Pending inspection",
        inspection_remarks: null,
        inspection_by: null,
        inspection_date: null,
        grn_number: null,
        grn_date: null,
        photo_urls: (payload.photo_urls as string[]) || [],
        photo_paths: (payload.photo_paths as AttachmentFile[]) || [],
        attachment_paths: (payload.attachment_paths as AttachmentFile[]) || [],
        sap_103_doc: null,
        sap_103_date: null,
        sap_105_doc: null,
        sap_105_date: null,
        uploaded_by: null,
        upload_date: null,
        closed_date: null,
        closed_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      saveDemoReceipt(mockReceipt);
      return mockReceipt;
    }

    console.error("========== SUPABASE ERROR ==========");
    console.error(lastInsertError);
    console.error("Payload:", JSON.stringify(payload, null, 2));
    throw lastInsertError;
  }

  const created = data as ReceiptHeader;

  // If receipt_datetime differed from payload, apply final sync
  if (manualOverrides?.receipt_datetime && created.receipt_datetime !== manualOverrides.receipt_datetime) {
    const { data: updated } = await supabase
      .from("receipt_header")
      .update({ receipt_datetime: manualOverrides.receipt_datetime })
      .eq("id", created.id)
      .select()
      .maybeSingle();

    if (updated) {
      return updated as ReceiptHeader;
    }
  }

  return created;
}

/**
 * Updates an existing DRC's details. Sprint 1 only edits header fields -
 * drc_number and status are never changed here.
 */
export async function updateReceipt(
  id: number,
  input: ReceiptFormInput,
  newPhotoFiles: File[] = [],
  keptPhotoUrls: string[] = [],
  newDocumentUploads: DocumentUpload[] = [],
  keptAttachments: AttachmentFile[] = []
): Promise<ReceiptHeader> {
  const uploadedUrls =
    newPhotoFiles.length > 0 ? await uploadReceiptPhotos(newPhotoFiles) : [];

  const newPhotoPaths: AttachmentFile[] = uploadedUrls.map((url, index) => ({
    name: newPhotoFiles[index]?.name ?? `photo-${index + 1}`,
    url,
    uploaded_at: new Date().toISOString(),
  }));

  const newAttachments =
    newDocumentUploads.length > 0
      ? await uploadReceiptDocuments(newDocumentUploads)
      : [];

  const photoUrls = [...keptPhotoUrls, ...uploadedUrls];

  const payload = {
    ...buildPayload(input),
    photo_urls: photoUrls,
    photo_paths: photoUrls.map(
      (url) =>
        newPhotoPaths.find((p) => p.url === url) ?? {
          name: url.split("/").pop() ?? url,
          url,
          uploaded_at: new Date().toISOString(),
        }
    ),
    attachment_paths: [...keptAttachments, ...newAttachments],
  };

  // Check demo receipts in current session first
  const demoList = getDemoReceipts();
  const demoIdx = demoList.findIndex((r) => r.id === id);
  if (demoIdx >= 0) {
    const updatedDemo: ReceiptHeader = {
      ...demoList[demoIdx],
      ...payload,
      updated_at: new Date().toISOString(),
    } as ReceiptHeader;
    saveDemoReceipt(updatedDemo);
    return updatedDemo;
  }

  const { data, error } = await supabase
    .from("receipt_header")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("========== SUPABASE ERROR ==========");
    console.error(error);
    console.error("Payload:");
    console.error(JSON.stringify(payload, null, 2));
    throw error;
  }

  return data as ReceiptHeader;
}

export interface ReceiptFilters {
  search?: string;
  fromDate?: string;
  toDate?: string;
}

/**
 * Fetches DRCs, newest first. `search` matches DRC Number, Vendor,
 * SAP PO Number, Invoice Number, or Vehicle Number. `fromDate`/`toDate`
 * filter by Receipt Date (yyyy-mm-dd).
 */
export async function getReceipts(
  filters: ReceiptFilters = {}
): Promise<ReceiptHeader[]> {
  let query = supabase
    .from("receipt_header")
    .select("*")
    .order("receipt_datetime", { ascending: false });

  const search = filters.search?.trim();

  if (search) {
    const safe = search.replace(/[%_]/g, (match) => `\\${match}`);
    query = query.or(
      `drc_number.ilike.%${safe}%,vendor_name.ilike.%${safe}%,po_number.ilike.%${safe}%,sap_po_number.ilike.%${safe}%,gem_order_number.ilike.%${safe}%,invoice_number.ilike.%${safe}%,vehicle_number.ilike.%${safe}%`
    );
  }

  if (filters.fromDate) {
    query = query.gte("receipt_datetime", `${filters.fromDate}T00:00:00`);
  }

  if (filters.toDate) {
    query = query.lte("receipt_datetime", `${filters.toDate}T23:59:59`);
  }

  const { data, error } = await query;

  if (error) {
    console.error(error);
  }

  const dbRows = (data ?? []) as ReceiptHeader[];
  const demoRows = getDemoReceipts();

  if (demoRows.length === 0) {
    return dbRows;
  }

  // Filter demo rows if filters active
  const filteredDemo = demoRows.filter((r) => {
    if (search) {
      const q = search.toLowerCase();
      const match =
        r.drc_number?.toLowerCase().includes(q) ||
        r.vendor_name?.toLowerCase().includes(q) ||
        r.po_number?.toLowerCase().includes(q) ||
        r.sap_po_number?.toLowerCase().includes(q) ||
        r.invoice_number?.toLowerCase().includes(q) ||
        r.vehicle_number?.toLowerCase().includes(q);
      if (!match) return false;
    }
    if (filters.fromDate && r.receipt_datetime < `${filters.fromDate}T00:00:00`) return false;
    if (filters.toDate && r.receipt_datetime > `${filters.toDate}T23:59:59`) return false;
    return true;
  });

  const combined = [...filteredDemo, ...dbRows];
  const seenIds = new Set<number>();
  const deduped: ReceiptHeader[] = [];
  for (const r of combined) {
    if (!seenIds.has(r.id)) {
      seenIds.add(r.id);
      deduped.push(r);
    }
  }

  return deduped;
}

export async function getReceiptById(
  id: number
): Promise<ReceiptHeader | null> {
  const demoList = getDemoReceipts();
  const demoFound = demoList.find((r) => r.id === id);
  if (demoFound) {
    return demoFound;
  }

  const { data, error } = await supabase
    .from("receipt_header")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error(error);
    return null;
  }

  return data as ReceiptHeader | null;
}

export interface ReceiptSummary {
  pendingInspection: number;
  inspectionOnHold: number;
  inspectionCleared: number;
  pendingGrn: number;
  closed: number;
  total: number;
}

export type DrcStatusKey = "pending" | "on_hold" | "cleared" | "closed";

export interface DrcDisplayStatusInfo {
  key: DrcStatusKey;
  label: string;
  badgeColor: "warning" | "error" | "success" | "default";
  chipBg: string;
  chipColor: string;
  chipBorder: string;
  remarks: string | null;
  inspectedBy: string | null;
  inspectionDate: string | null;
}

/**
 * Resolves the 3-state inspection and lifecycle status of a DRC:
 * 1. Pending inspection (freshly created DRC awaiting inspection)
 * 2. Inspection on hold (with department hold comments/remarks)
 * 3. Inspection cleared (cleared by department with comments/remarks)
 * 4. GRN created (Green) - once 105 GR release is fetched/posted, the DRC is closed/complete!
 */
export function getDrcDisplayStatus(receipt: {
  status: ReceiptStatus | string;
  inspection_status?: InspectionStatus | string | null;
  inspection_remarks?: string | null;
  inspection_by?: string | null;
  inspection_date?: string | null;
  grn_number?: string | null;
  sap_105_doc?: string | null;
  package_details?: PackageDetailRow[] | null;
  sap_items?: PackageDetailRow[] | null;
}): DrcDisplayStatusInfo {
  const rawStatus = (receipt.inspection_status || "").trim().toLowerCase();
  const rawHeaderStatus = String(receipt.status || "").trim().toLowerCase();
  const rawRemarks = (receipt.inspection_remarks || "").toLowerCase();

  // 3. Post-105: "GRN created" in Green - at this point the DRC is closed or complete
  const has105Grn =
    rawHeaderStatus === "closed" ||
    rawHeaderStatus === "grn created" ||
    rawStatus === "grn created" ||
    rawStatus === "closed" ||
    Boolean(receipt.grn_number && String(receipt.grn_number).trim() !== "") ||
    Boolean(receipt.sap_105_doc && String(receipt.sap_105_doc).trim() !== "") ||
    Boolean(
      receipt.sap_items &&
        receipt.sap_items.some(
          (p) => Boolean(p.sap_105_doc && String(p.sap_105_doc).trim())
        )
    ) ||
    Boolean(
      receipt.package_details &&
        receipt.package_details.some(
          (p) => Boolean(p.sap_105_doc && String(p.sap_105_doc).trim())
        )
    );

  if (has105Grn) {
    return {
      key: "closed",
      label: "GRN created",
      badgeColor: "success",
      chipBg: "#f0fdf4",
      chipColor: "#16a34a",
      chipBorder: "#86efac",
      remarks: receipt.inspection_remarks || null,
      inspectedBy: receipt.inspection_by || null,
      inspectionDate: receipt.inspection_date || null,
    };
  }

  // 2. Inspection on hold (with department remarks)
  if (
    rawStatus === "inspection on hold" ||
    rawStatus === "on hold" ||
    rawStatus === "hold" ||
    rawStatus === "inspection_on_hold" ||
    rawStatus === "rejected" ||
    rawRemarks.startsWith("[inspection on hold]")
  ) {
    return {
      key: "on_hold",
      label: "Inspection on hold",
      badgeColor: "error",
      chipBg: "#fef2f2",
      chipColor: "#dc2626",
      chipBorder: "#fecaca",
      remarks: receipt.inspection_remarks || null,
      inspectedBy: receipt.inspection_by || null,
      inspectionDate: receipt.inspection_date || null,
    };
  }

  // Inspection cleared (cleared by department, awaiting 105 GR release)
  if (
    rawStatus === "inspection cleared" ||
    rawStatus === "cleared" ||
    rawStatus === "passed" ||
    rawStatus === "approved" ||
    rawStatus === "inspection_cleared" ||
    rawRemarks.startsWith("[inspection cleared]") ||
    receipt.status === "Pending GRN"
  ) {
    return {
      key: "cleared",
      label: "Inspection cleared",
      badgeColor: "success",
      chipBg: "#f0fdf4",
      chipColor: "#16a34a",
      chipBorder: "#bbf7d0",
      remarks: receipt.inspection_remarks || null,
      inspectedBy: receipt.inspection_by || null,
      inspectionDate: receipt.inspection_date || null,
    };
  }

  // 1. Initial status: Pending inspection
  return {
    key: "pending",
    label: "Pending inspection",
    badgeColor: "warning",
    chipBg: "#fffbeb",
    chipColor: "#d97706",
    chipBorder: "#fde68a",
    remarks: null,
    inspectedBy: null,
    inspectionDate: null,
  };
}

/**
 * Automatically inspects receipts and separates physical package details from
 * SAP 103/105 material line items.
 *
 * If a receipt had its package_details overwritten by 103 fetching (containing material_code),
 * this function:
 * 1. Moves those material code items into `sap_items` (preserving bin allocations).
 * 2. Recovers the physical package details from package_count and package_type (e.g. "1 x C/Box").
 * 3. Persists the fix to the Supabase database.
 */
export async function separateAndRecoverPackageDetails(
  receipts: ReceiptHeader[]
): Promise<{ recoveredCount: number; updatedReceipts: ReceiptHeader[] }> {
  let recoveredCount = 0;
  const updatedReceipts: ReceiptHeader[] = [];

  for (const receipt of receipts) {
    const pkgs = receipt.package_details || [];
    const hasPollutedPackageDetails = pkgs.some((p) => Boolean(p.material_code && p.material_code.trim()));

    if (!hasPollutedPackageDetails) {
      updatedReceipts.push(receipt);
      continue;
    }

    // 1. Extract the SAP items from polluted package_details
    const sapItemsFromPkgs = pkgs.filter((p) => Boolean(p.material_code && p.material_code.trim()));
    const existingSapItems = receipt.sap_items || [];

    // Merge to preserve existing bin allocations
    const mergedSapItems: PackageDetailRow[] = [...existingSapItems];
    for (const item of sapItemsFromPkgs) {
      const idx = mergedSapItems.findIndex(
        (m) => m.material_code && m.material_code.trim() === item.material_code?.trim()
      );
      if (idx >= 0) {
        mergedSapItems[idx] = {
          ...item,
          bin_location: mergedSapItems[idx].bin_location || item.bin_location,
          bin_allocated: mergedSapItems[idx].bin_allocated ?? item.bin_allocated,
          allocated_qty: mergedSapItems[idx].allocated_qty ?? item.allocated_qty,
        };
      } else {
        mergedSapItems.push(item);
      }
    }

    // 2. Extract or reconstruct genuine physical packages
    let cleanPhysicalPackages = pkgs.filter((p) => !p.material_code || !p.material_code.trim());

    if (cleanPhysicalPackages.length === 0) {
      // Reconstruct from package_count and package_type (e.g. 1 x C/Box, 2 x W/Box)
      const count = receipt.package_count || 1;
      const type = (receipt.package_type && String(receipt.package_type).trim()) || "C/Box";
      cleanPhysicalPackages = [
        {
          quantity: String(count),
          package_type: type,
          description: "",
        },
      ];
    }

    // 3. Update database
    try {
      await supabase
        .from("receipt_header")
        .update({
          package_details: cleanPhysicalPackages,
          sap_items: mergedSapItems,
          package_count: sumPackageQuantities(cleanPhysicalPackages),
          package_type: cleanPhysicalPackages[0]?.package_type || receipt.package_type || "C/Box",
        })
        .eq("id", receipt.id);

      recoveredCount++;
      updatedReceipts.push({
        ...receipt,
        package_details: cleanPhysicalPackages,
        sap_items: mergedSapItems,
        package_count: sumPackageQuantities(cleanPhysicalPackages),
        package_type: cleanPhysicalPackages[0]?.package_type || receipt.package_type || "C/Box",
      });
    } catch (err) {
      console.error(`Failed to separate package details for DRC #${receipt.id}:`, err);
      updatedReceipts.push(receipt);
    }
  }

  return { recoveredCount, updatedReceipts };
}

/**
 * Counts DRCs by status for the summary cards on the Receipt Register.
 */
export async function getReceiptSummary(): Promise<ReceiptSummary> {
  const { data, error } = await supabase
    .from("receipt_header")
    .select("status, inspection_status, grn_number, sap_105_doc");

  if (error) {
    console.error(error);
    return {
      pendingInspection: 0,
      inspectionOnHold: 0,
      inspectionCleared: 0,
      pendingGrn: 0,
      closed: 0,
      total: 0,
    };
  }

  const rows = (data ?? []) as {
    status: ReceiptStatus | string;
    inspection_status: InspectionStatus | string | null;
    grn_number?: string | null;
    sap_105_doc?: string | null;
  }[];

  let pendingInspection = 0;
  let inspectionOnHold = 0;
  let inspectionCleared = 0;
  let pendingGrn = 0;
  let closed = 0;

  for (const r of rows) {
    const rawStatus = (r.inspection_status || "").trim().toLowerCase();
    const has105Grn =
      r.status === "Closed" ||
      r.status === "GRN created" ||
      rawStatus === "grn created" ||
      Boolean(r.grn_number && r.grn_number.trim() !== "") ||
      Boolean(r.sap_105_doc && r.sap_105_doc.trim() !== "");

    if (has105Grn) {
      closed += 1;
    } else if (
      rawStatus === "inspection on hold" ||
      rawStatus === "on hold" ||
      rawStatus === "hold" ||
      rawStatus === "inspection_on_hold" ||
      rawStatus === "rejected"
    ) {
      inspectionOnHold += 1;
    } else if (
      rawStatus === "inspection cleared" ||
      rawStatus === "cleared" ||
      rawStatus === "passed" ||
      rawStatus === "approved" ||
      rawStatus === "inspection_cleared" ||
      r.status === "Pending GRN"
    ) {
      inspectionCleared += 1;
      if (r.status === "Pending GRN") pendingGrn += 1;
    } else {
      pendingInspection += 1;
    }
  }

  return {
    pendingInspection,
    inspectionOnHold,
    inspectionCleared,
    pendingGrn,
    closed,
    total: rows.length,
  };
}

/* =========================================================================
 * Sprint 2: Inspection
 * ========================================================================= */

export interface InspectionHistoryEntry {
  id: number;
  receipt_id: number;
  inspection_status: InspectionStatus;
  inspection_remarks: string | null;
  inspection_by: string | null;
  inspection_date: string;
}

/** Candidate values to test against receipt_header_inspection_status_check if present */
const CLEARED_CANDIDATES: (string | null)[] = [
  "Inspection cleared",
  "Inspection Cleared",
  "Cleared",
  "cleared",
  "Passed",
  "Approved",
  "inspection_cleared",
  "Pending GRN",
  null,
];

const ON_HOLD_CANDIDATES: (string | null)[] = [
  "Inspection on hold",
  "Inspection On Hold",
  "On Hold",
  "on_hold",
  "Hold",
  "Rejected",
  "inspection_on_hold",
  null,
];

/**
 * Records an inspection action for a DRC: appends an entry to
 * `receipt_inspection_history` and updates the DRC's current inspection
 * fields. If the outcome is "Inspection Cleared", the DRC's overall status
 * automatically moves to "Pending GRN" - if it's "Inspection On Hold" the
 * DRC's overall status is left as-is, so it can be re-inspected later once
 * the hold reason (recorded in remarks) is resolved.
 *
 * Implements a resilient constraint-check fallback: if the database has a check
 * constraint (e.g. receipt_header_inspection_status_check) that strictly requires
 * specific casing like 'Inspection cleared' vs 'Inspection Cleared' or 'Cleared',
 * it automatically identifies the accepted value without failing the user.
 */
export async function submitInspection(
  receiptId: number,
  inspectionStatus: InspectionStatus,
  inspectionRemarks: string,
  inspectionBy: string
): Promise<ReceiptHeader> {
  const nowIso = new Date().toISOString();
  const remarks = inspectionRemarks.trim() || null;
  const by = inspectionBy.trim() || null;

  const isHold =
    inspectionStatus.toLowerCase().includes("hold") ||
    inspectionStatus.toLowerCase().includes("reject");

  const fallbackList = isHold ? ON_HOLD_CANDIDATES : CLEARED_CANDIDATES;
  const preferredLower = isHold ? "Inspection on hold" : "Inspection cleared";
  const preferredTitle = isHold ? "Inspection On Hold" : "Inspection Cleared";

  // Build candidate order: user input first, then preferred casing, then fallback alternatives
  const orderedCandidates: (string | null)[] = [
    inspectionStatus,
    preferredLower,
    preferredTitle,
    ...fallbackList,
  ];
  // Deduplicate while preserving order
  const uniqueCandidates = Array.from(new Set(orderedCandidates));

  let lastError: any = null;
  let updatedRow: ReceiptHeader | null = null;
  let acceptedStatusValue: string | null = inspectionStatus;

  for (const candidate of uniqueCandidates) {
    const headerUpdate: Record<string, unknown> = {
      inspection_remarks: remarks,
      inspection_by: by,
      inspection_date: nowIso,
    };

    if (candidate !== null) {
      headerUpdate.inspection_status = candidate;
    } else {
      // Fallback: If the check constraint rejects all string literals, keep inspection_status null
      // and preserve the audit status in remarks and status
      headerUpdate.inspection_status = null;
      const tag = isHold ? "[Inspection on hold]" : "[Inspection cleared]";
      headerUpdate.inspection_remarks = remarks ? `${tag} ${remarks}` : tag;
    }

    if (!isHold) {
      headerUpdate.status = "Pending GRN";
    }

    const { data, error } = await supabase
      .from("receipt_header")
      .update(headerUpdate)
      .eq("id", receiptId)
      .select()
      .single();

    if (!error && data) {
      updatedRow = data as ReceiptHeader;
      acceptedStatusValue = candidate;
      lastError = null;
      break;
    }

    lastError = error;
    const errorMsg = (error?.message || "").toLowerCase();
    // Only continue trying if the error is due to check constraint on inspection_status
    if (
      !errorMsg.includes("receipt_header_inspection_status_check") &&
      !errorMsg.includes("inspection_status") &&
      !errorMsg.includes("check constraint")
    ) {
      // Another error (e.g. RLS or network), do not keep looping
      break;
    }
  }

  if (lastError || !updatedRow) {
    console.error("submitInspection error updating receipt_header:", lastError);
    const errObj = (lastError || {}) as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    };
    let msg = errObj.message || "Failed to update receipt";
    if (errObj.code === "PGRST116") {
      msg =
        "Could not update DRC: row not found or blocked by Supabase Row-Level Security (RLS). Please check migration 0022.";
    } else if (msg.includes("column") && msg.includes("does not exist")) {
      msg = `Database schema update required: ${msg}. Please run migration 0022 in Supabase SQL editor.`;
    }
    const details = errObj.details ? ` (${errObj.details})` : "";
    const hint = errObj.hint ? ` Hint: ${errObj.hint}` : "";
    throw new Error(`${msg}${details}${hint}`);
  }

  // 2. Best-effort history record: log to receipt_inspection_history
  try {
    const { data: authData } = await supabase.auth.getUser();
    const historyPayload: Record<string, unknown> = {
      receipt_id: receiptId,
      inspection_status:
        acceptedStatusValue ||
        (isHold ? "Inspection on hold" : "Inspection cleared"),
      inspection_remarks: remarks,
      inspection_by: by,
      inspection_date: nowIso,
    };
    if (authData?.user?.id) {
      historyPayload.user_id = authData.user.id;
    }

    const { error: historyError } = await supabase
      .from("receipt_inspection_history")
      .insert([historyPayload]);

    if (historyError) {
      console.warn(
        "submitInspection: non-fatal inspection history log warning:",
        historyError
      );
    }
  } catch (err) {
    console.warn(
      "submitInspection: could not write to receipt_inspection_history:",
      err
    );
  }

  return updatedRow;
}

export async function getInspectionHistory(
  receiptId: number
): Promise<InspectionHistoryEntry[]> {
  const { data, error } = await supabase
    .from("receipt_inspection_history")
    .select("*")
    .eq("receipt_id", receiptId)
    .order("inspection_date", { ascending: false });

  if (error) {
    console.error(error);
    return [];
  }

  return (data ?? []) as InspectionHistoryEntry[];
}

/* =========================================================================
 * Sprint 2: GRN Upload
 * ========================================================================= */

/** The sentinel location used for GRN-received stock (no put-away location
 * is captured on the GRN Excel - Material Code + Quantity only). */
export const GRN_UNALLOCATED_LOCATION = "UNALLOCATED";

export interface GrnImportRow {
  rowNumber: number;
  material_code: string;
  quantity: number;
  /** Every raw Excel row that fed into this row (present when duplicate
   *  Material Codes were summed into one). Lets the import report list
   *  every raw row that was submitted, not just the first occurrence of
   *  each Material Code. Absent (or a single entry) when there was no
   *  duplicate to merge. */
  contributions?: { rowNumber: number; quantity: number }[];
}

export interface GrnFormatInvalidRow {
  rowNumber: number;
  material_code: string;
  quantityRaw: string;
  errors: string[];
}

export interface GrnParseResult {
  totalRecords: number;
  /** Valid rows, already de-duplicated by Material Code (quantities summed). */
  mergedRows: GrnImportRow[];
  /** Rows rejected for format reasons (missing code, bad quantity) before
   * any database lookup happens. */
  invalidRows: GrnFormatInvalidRow[];
  /** How many raw rows collapsed into each merged row (for information only). */
  duplicateCodeCount: number;
}

function getGrnFieldValue(
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

function isGrnRowBlank(row: Record<string, unknown>): boolean {
  return Object.values(row).every((value) => {
    if (value === null || value === undefined) return true;
    return String(value).trim() === "";
  });
}

function parseGrnQuantity(raw: string): number {
  const cleaned = raw.replace(/,/g, "").trim();
  if (!cleaned) return NaN;
  return Number(cleaned);
}

/**
 * Parses a GRN Excel file (columns: Material Code, Quantity). This is a
 * pure, in-memory step - no database calls - so it stays fast even for
 * 10,000+ rows. Duplicate Material Codes are summed into a single row
 * here rather than being treated as an error.
 */
export function parseGrnExcelRows(
  rawRows: Record<string, unknown>[]
): GrnParseResult {
  const invalidRows: GrnFormatInvalidRow[] = [];
  const merged = new Map<
    string,
    { rowNumber: number; quantity: number; contributions: { rowNumber: number; quantity: number }[] }
  >();

  let totalRecords = 0;
  let rawValidRowCount = 0;

  rawRows.forEach((row, index) => {
    if (isGrnRowBlank(row)) {
      return;
    }

    totalRecords += 1;

    const rowNumber = index + 2;

    const materialCode = getGrnFieldValue(row, [
      "Material Code",
      "material_code",
      "Material",
    ]);

    const quantityRaw = getGrnFieldValue(row, [
      "Quantity",
      "Qty",
      "GRN Quantity",
    ]);

    const errors: string[] = [];

    if (!materialCode) {
      errors.push("Material Code is required.");
    }

    const quantity = parseGrnQuantity(quantityRaw);

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
        quantityRaw,
        errors,
      });
      return;
    }

    rawValidRowCount += 1;

    const key = materialCode.toUpperCase();
    const existing = merged.get(key);

    if (existing) {
      existing.quantity += quantity;
      existing.contributions.push({ rowNumber, quantity });
    } else {
      merged.set(key, {
        rowNumber,
        quantity,
        contributions: [{ rowNumber, quantity }],
      });
    }
  });

  const mergedRows: GrnImportRow[] = Array.from(merged.entries()).map(
    ([materialCode, v]) => ({
      rowNumber: v.rowNumber,
      material_code: materialCode,
      quantity: v.quantity,
      contributions: v.contributions,
    })
  );

  return {
    totalRecords,
    mergedRows,
    invalidRows,
    duplicateCodeCount: rawValidRowCount - mergedRows.length,
  };
}

export interface GrnMaterialValidationResult {
  /** Rows whose Material Code exists in material_master. */
  knownRows: GrnImportRow[];
  /** Material Codes that do not exist in material_master. */
  unknownMaterials: GrnImportRow[];
}

/**
 * Checks Material Code existence against material_master in a single
 * batched query (`.in()`), regardless of how many rows were uploaded -
 * this is what keeps validation fast for 10,000+ row files.
 */
export async function validateGrnMaterials(
  rows: GrnImportRow[]
): Promise<GrnMaterialValidationResult> {
  if (rows.length === 0) {
    return { knownRows: [], unknownMaterials: [] };
  }

  const codes = rows.map((r) => r.material_code);

  const { data, error } = await supabase
    .from("material_master")
    .select("material_code")
    .in("material_code", codes);

  if (error) {
    console.error(error);
    return { knownRows: [], unknownMaterials: rows };
  }

  const knownSet = new Set(
    (data ?? []).map((m: { material_code: string }) => m.material_code)
  );

  const knownRows: GrnImportRow[] = [];
  const unknownMaterials: GrnImportRow[] = [];

  rows.forEach((row) => {
    if (knownSet.has(row.material_code)) {
      knownRows.push(row);
    } else {
      unknownMaterials.push(row);
    }
  });

  return { knownRows, unknownMaterials };
}

export interface GrnImportFailure {
  material_code: string;
  quantity: number;
  rowNumber: number;
  error: string;
}

export interface GrnImportSuccess {
  material_code: string;
  quantity: number;
  rowNumber: number;
}

export interface GrnImportSummary {
  receiptId: number;
  grnId: number | null;
  grnNumber: string;
  imported: number;
  failed: number;
  totalQuantity: number;
  successes: GrnImportSuccess[];
  failures: GrnImportFailure[];
  closed: boolean;
  receipt: ReceiptHeader | null;
}

/**
 * Imports a validated, de-duplicated set of GRN rows for a DRC:
 *
 * 1. Batch-fetches any existing UNALLOCATED material_allocation rows for
 *    these materials in one query (no duplicate allocations are ever
 *    created - an existing row's quantity is increased instead).
 * 2. For every material, calls the Inventory Transaction Engine's
 *    `applyStockMovement` (transactionType "MATERIAL_RECEIPT") to
 *    increase stock. One failing material never blocks the rest.
 * 3. Bulk-inserts all GRN line items in a single insert call.
 * 4. Creates the `receipt_grn` header row and, if at least one material
 *    was imported successfully, closes the DRC (status, GRN details,
 *    closed date/by) in one update call.
 */
export async function importGrn(
  receiptId: number,
  grnNumber: string,
  grnDate: string,
  uploadedBy: string,
  rows: GrnImportRow[],
  countingChecked: boolean,
  discrepancyFound: boolean,
  discrepancyRemarks: string
): Promise<GrnImportSummary> {
  const summary: GrnImportSummary = {
    receiptId,
    grnId: null,
    grnNumber,
    imported: 0,
    failed: 0,
    totalQuantity: 0,
    successes: [],
    failures: [],
    closed: false,
    receipt: null,
  };

  if (rows.length === 0) {
    return summary;
  }

  const codes = rows.map((r) => r.material_code);

  const { data: existingAllocations, error: fetchError } = await supabase
    .from("material_allocation")
    .select("id, material_code, quantity")
    .eq("location_code", GRN_UNALLOCATED_LOCATION)
    .in("material_code", codes);

  if (fetchError) {
    console.error(fetchError);
  }

  const allocationMap = new Map<
    string,
    { id: number; quantity: number }
  >(
    (existingAllocations ?? []).map(
      (a: { id: number; material_code: string; quantity: number }) => [
        a.material_code,
        { id: a.id, quantity: Number(a.quantity) },
      ]
    )
  );

  const importedLines: { material_code: string; quantity: number }[] = [];

  for (const row of rows) {
    try {
      const existing = allocationMap.get(row.material_code);
      const prevQuantity = existing ? existing.quantity : 0;
      const newQuantity = prevQuantity + row.quantity;

      await applyStockMovement({
        materialCode: row.material_code,
        locationCode: GRN_UNALLOCATED_LOCATION,
        prevQuantity,
        newQuantity,
        allocationId: existing?.id,
        transactionType: "MATERIAL_RECEIPT",
        referenceType: "GRN",
        referenceNumber: grnNumber,
        reason: "GRN Receipt",
      });

      // Keep the running balance current in case the same material
      // appears again (already de-duplicated upstream, but this keeps
      // the map correct defensively).
      allocationMap.set(row.material_code, {
        id: existing?.id ?? -1,
        quantity: newQuantity,
      });

      importedLines.push({
        material_code: row.material_code,
        quantity: row.quantity,
      });

      summary.imported += 1;
      summary.totalQuantity += row.quantity;
      summary.successes.push({
        material_code: row.material_code,
        quantity: row.quantity,
        rowNumber: row.rowNumber,
      });
    } catch (err) {
      summary.failed += 1;
      summary.failures.push({
        material_code: row.material_code,
        quantity: row.quantity,
        rowNumber: row.rowNumber,
        error: err instanceof Error ? err.message : "Unknown error.",
      });
    }
  }

  if (summary.imported === 0) {
    return summary;
  }

  const { data: grnHeader, error: grnError } = await supabase
    .from("receipt_grn")
    .insert([
      {
        receipt_id: receiptId,
        grn_number: grnNumber,
        grn_date: grnDate,
        uploaded_by: uploadedBy.trim() || null,
        material_count: summary.imported,
        total_quantity: summary.totalQuantity,
        counting_checked: countingChecked,
        discrepancy_found: discrepancyFound,
        discrepancy_remarks: discrepancyFound
          ? discrepancyRemarks.trim() || null
          : null,
      },
    ])
    .select()
    .single();

  if (grnError) {
    console.error(grnError);
  } else {
    summary.grnId = grnHeader.id;

    // Bulk insert every line item in a single call.
    const { error: linesError } = await supabase
      .from("receipt_grn_lines")
      .insert(
        importedLines.map((line) => ({
          grn_id: grnHeader.id,
          material_code: line.material_code,
          quantity: line.quantity,
        }))
      );

    if (linesError) {
      console.error(linesError);
    }
  }

  const nowIso = new Date().toISOString();

  const { data: updatedReceipt, error: closeError } = await supabase
    .from("receipt_header")
    .update({
      grn_number: grnNumber,
      grn_date: grnDate,
      uploaded_by: uploadedBy.trim() || null,
      upload_date: nowIso,
      status: "Closed",
      closed_date: nowIso,
      closed_by: uploadedBy.trim() || null,
    })
    .eq("id", receiptId)
    .select()
    .single();

  if (closeError) {
    console.error(closeError);
  } else {
    summary.closed = true;
    summary.receipt = updatedReceipt as ReceiptHeader;
  }

  return summary;
}

const GRN_REPORT_COLUMNS = [
  { header: "Material Code", key: "material_code" },
  { header: "Quantity", key: "quantity" },
];

/**
 * Builds a combined Excel report for a GRN bulk import, covering every RAW
 * row submitted - including every row that was merged into another
 * because it shared a duplicate Material Code, since `mergedRows` carries
 * each raw contributor's original row number and quantity. Format-rejected
 * rows, rows rejected because the Material Code is unknown, rows imported
 * successfully, and rows that failed while being applied all get a row
 * per raw contributor, along with the reason for anything other than a
 * clean success. Saves the report to Reports > Import Reports history and
 * then downloads it immediately.
 */
export async function downloadGrnImportReport(
  totalRecords: number,
  formatInvalidRows: GrnFormatInvalidRow[],
  mergedRows: GrnImportRow[],
  unknownMaterials: GrnImportRow[],
  summary: GrnImportSummary,
  fileName?: string | null
): Promise<void> {
  const contributionsByCode = new Map<
    string,
    { rowNumber: number; quantity: number }[]
  >();

  mergedRows.forEach((row) => {
    contributionsByCode.set(
      row.material_code,
      row.contributions ?? [{ rowNumber: row.rowNumber, quantity: row.quantity }]
    );
  });

  function expandByRawRow(
    materialCode: string,
    status: BulkImportRowStatus,
    reason: string | undefined
  ): BulkImportReportRow[] {
    const contributions = contributionsByCode.get(materialCode) ?? [];

    return contributions.map((c) => ({
      rowNumber: c.rowNumber,
      status,
      reason,
      data: { material_code: materialCode, quantity: c.quantity },
    }));
  }

  const formatRejected: BulkImportReportRow[] = formatInvalidRows.map((row) => ({
    rowNumber: row.rowNumber,
    status: "Rejected",
    reason: row.errors.join("; "),
    data: {
      material_code: row.material_code,
      quantity: row.quantityRaw,
    },
  }));

  const unknownRejected: BulkImportReportRow[] = unknownMaterials.flatMap((row) =>
    expandByRawRow(
      row.material_code,
      "Rejected",
      `Material Code "${row.material_code}" was not found.`
    )
  );

  const succeeded: BulkImportReportRow[] = summary.successes.flatMap((row) =>
    expandByRawRow(row.material_code, "Imported", undefined)
  );

  const failed: BulkImportReportRow[] = summary.failures.flatMap((row) =>
    expandByRawRow(row.material_code, "Failed", row.error)
  );

  const safeGrnNumber =
    summary.grnNumber.replace(/[^a-zA-Z0-9_-]/g, "_") || "Import";

  const rawValidRowCount = totalRecords - formatInvalidRows.length;
  const duplicateCodeCount = rawValidRowCount - mergedRows.length;

  await recordAndDownloadBulkImportReport({
    importType: "GRN",
    fileName: fileName ?? summary.grnNumber,
    totalRows: totalRecords,
    successCount: succeeded.length,
    rejectedCount: formatRejected.length + unknownRejected.length,
    failedCount: failed.length,
    fileNamePrefix: `GRN_${safeGrnNumber}`,
    columns: GRN_REPORT_COLUMNS,
    rows: [...formatRejected, ...unknownRejected, ...succeeded, ...failed],
    summary: [
      { label: "Total Excel Rows", value: totalRecords },
      { label: "Format Rejected", value: formatInvalidRows.length },
      { label: "Duplicate Material Code Rows Merged", value: duplicateCodeCount },
      { label: "Unknown Material Rejected", value: unknownMaterials.length },
      { label: "Imported", value: summary.imported },
      { label: "Failed", value: summary.failed },
      { label: "Total Quantity", value: summary.totalQuantity },
    ],
  });
}

export interface GrnHistoryEntry {
  id: number;
  receipt_id: number;
  grn_number: string;
  grn_date: string;
  uploaded_by: string | null;
  upload_date: string;
  material_count: number;
  total_quantity: number;
  counting_checked: boolean;
  discrepancy_found: boolean;
  discrepancy_remarks: string | null;
}

export async function getGrnHistory(
  receiptId: number
): Promise<GrnHistoryEntry[]> {
  const { data, error } = await supabase
    .from("receipt_grn")
    .select("*")
    .eq("receipt_id", receiptId)
    .order("upload_date", { ascending: false });

  if (error) {
    console.error(error);
    return [];
  }

  return (data ?? []) as GrnHistoryEntry[];
}

export interface GrnLine {
  id: number;
  grn_id: number;
  material_code: string;
  quantity: number;
}

export async function getGrnLines(grnId: number): Promise<GrnLine[]> {
  const { data, error } = await supabase
    .from("receipt_grn_lines")
    .select("*")
    .eq("grn_id", grnId)
    .order("material_code");

  if (error) {
    console.error(error);
    return [];
  }

  return (data ?? []) as GrnLine[];
}

/**
 * Generates the downloadable GRN Excel template (Material Code, Quantity)
 * with a couple of sample rows, via SheetJS. Called from the UI layer,
 * which triggers the actual file download.
 */
export function buildGrnTemplateRows(): { headers: string[]; rows: (string | number)[][] } {
  return {
    headers: ["Material Code", "Quantity"],
    rows: [
      ["9000000001", 10],
      ["9000000002", 25],
    ],
  };
}

/* =========================================================================
 * AI-Assisted Mail Drafting
 *
 * The app never sends mail itself - it only drafts ready-to-copy email
 * content for the operator to paste into whatever mail client they
 * already use. Drafting is AI-assisted (via the `generate-drc-mail`
 * Supabase Edge Function, which reads uploaded documents such as the
 * Invoice to pull in material details) with a plain-text template as a
 * safe fallback if the AI call fails or isn't configured.
 * ========================================================================= */

export type DrcMailType =
  | "Inspection Request"
  | "Inspection On Hold"
  | "Counting Discrepancy"
  | "Security Gate Entry";

export interface DraftMail {
  subject: string;
  body: string;
  /** HTML-rendered version of body (used for rich-text clipboard copy). */
  html?: string;
}

function formatMailDate(value: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Plain-text fallback for the "inspection required" mail, used only if
 * AI drafting is unavailable. */
function generateSecurityGateMailFallback(receipt: ReceiptHeader): DraftMail {
  const packageSummary =
    receipt.package_details && receipt.package_details.length > 0
      ? receipt.package_details
          .map((p) => p.package_type)
          .filter(Boolean)
          .join(", ") || "-"
      : "-";

  const invoiceLine = receipt.invoice_number
    ? `${receipt.invoice_number}${receipt.invoice_date ? ` dated ${formatMailDate(receipt.invoice_date)}` : ""}`
    : "-";

  const vehicleDisplay = receipt.receipt_mode === "Hand"
    ? receipt.driver_name || "By Hand"
    : `${receipt.vehicle_number ?? "-"}`;

  const subject = `Request for urgent Pass - ${receipt.drc_number}`;

  /*
   * Generate an HTML table so that Copy Mail produces a bordered table
   * when pasted into Outlook / Gmail / any rich-text mail client.
   * The plain-text fallback is also kept in `body` for console-clipboard.
   */
  const htmlBody = [
    '<p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;">Dear Sir,</p>',
    `<p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;">Please allow ${packageSummary} as per below details.</p>`,
    '<table style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:14px;">',
    `<tr><td style="border:1px solid #000;padding:6px 14px;font-weight:700;">Vehicle No./By hand</td><td style="border:1px solid #000;padding:6px 14px;">${vehicleDisplay}</td></tr>`,
    `<tr><td style="border:1px solid #000;padding:6px 14px;font-weight:700;">Material Details</td><td style="border:1px solid #000;padding:6px 14px;">${packageSummary}</td></tr>`,
    `<tr><td style="border:1px solid #000;padding:6px 14px;font-weight:700;">Supplier Name</td><td style="border:1px solid #000;padding:6px 14px;">${receipt.vendor_name}</td></tr>`,
    `<tr><td style="border:1px solid #000;padding:6px 14px;font-weight:700;">PO No.</td><td style="border:1px solid #000;padding:6px 14px;">${receipt.sap_po_number ?? "-"}</td></tr>`,
    `<tr><td style="border:1px solid #000;padding:6px 14px;font-weight:700;">Purpose</td><td style="border:1px solid #000;padding:6px 14px;">${receipt.purpose ?? receipt.remarks ?? "-"}</td></tr>`,
    `<tr><td style="border:1px solid #000;padding:6px 14px;font-weight:700;">Invoice No.</td><td style="border:1px solid #000;padding:6px 14px;">${invoiceLine}</td></tr>`,
    `<tr><td style="border:1px solid #000;padding:6px 14px;font-weight:700;">Driver</td><td style="border:1px solid #000;padding:6px 14px;">${receipt.driver_name ?? "-"}</td></tr>`,
    '</table>',
    '<br/>',
    '<p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;">Thanks & Regards,<br/>Stores Department</p>',
  ].join("\n");

  const body = htmlBody;
  return { subject, body, html: htmlBody };
}

function generateInspectionMailFallback(receipt: ReceiptHeader): DraftMail {
  const subject = `Inspection Required - DRC ${receipt.drc_number}`;
  const body = [
    "Dear Team,",
    "",
    "A new material delivery has been received and requires inspection. Details are below:",
    "",
    `DRC Number: ${receipt.drc_number}`,
    `Supplier Name: ${receipt.vendor_name}`,
    `Receipt Date: ${formatMailDate(receipt.receipt_datetime)}`,
    `SAP PO Number: ${receipt.sap_po_number ?? "-"}`,
    `GeM Order Number: ${receipt.gem_order_number ?? "-"}`,
    `Invoice Number: ${receipt.invoice_number ?? "-"}`,
    "",
    "Please complete inspection and counting of the received material at the earliest and record the outcome in the system.",
    "",
    "Regards,",
    "Stores Department",
  ].join("\n");
  return { subject, body };
}

/** Plain-text fallback for the "inspection on hold" mail. */
function generateOnHoldMailFallback(receipt: ReceiptHeader): DraftMail {
  const subject = `Inspection On Hold - DRC ${receipt.drc_number}`;
  const body = [
    "Dear Team,",
    "",
    `Inspection of the material received against DRC ${receipt.drc_number} (Supplier: ${receipt.vendor_name}) has been put on hold.`,
    "",
    `Reason: ${receipt.inspection_remarks ?? "-"}`,
    "",
    "Please review and advise on the next steps so the DRC can be moved forward.",
    "",
    "Regards,",
    "Stores Department",
  ].join("\n");
  return { subject, body };
}

/** Plain-text fallback for the "counting discrepancy" mail to the supplier. */
function generateCountingDiscrepancyMailFallback(
  receipt: ReceiptHeader,
  discrepancyRemarks: string
): DraftMail {
  const subject = `Counting Discrepancy at GRN - DRC ${receipt.drc_number}`;
  const body = [
    "Dear Sir/Madam,",
    "",
    `While processing the GRN for DRC ${receipt.drc_number} against your supply, a discrepancy was found while counting the received material:`,
    "",
    discrepancyRemarks || "-",
    "",
    `DRC Number: ${receipt.drc_number}`,
    `Invoice Number: ${receipt.invoice_number ?? "-"}`,
    `SAP PO Number: ${receipt.sap_po_number ?? "-"}`,
    "",
    "Kindly arrange to resolve this discrepancy - by supplying the short quantity, replacing the affected item(s), or sending corrected documents, as applicable - at the earliest.",
    "",
    "Regards,",
    "Stores Department",
  ].join("\n");
  return { subject, body };
}

/**
 * Asks the `generate-drc-mail` Edge Function to draft the mail content
 * using AI, passing along DRC details and any uploaded documents (the
 * function prioritizes Invoice / Packing List to read material details
 * from). Falls back to a plain-text template - never throws - if the AI
 * call fails or the function isn't configured (e.g. no API key set),
 * so the feature always produces something to copy.
 */
export async function generateAiMail(
  receipt: ReceiptHeader,
  mailType: DrcMailType,
  discrepancyRemarks?: string
): Promise<DraftMail & { aiGenerated: boolean }> {
  try {
    const { data, error } = await supabase.functions.invoke(
      "generate-drc-mail",
      {
        body: {
          mailType,
          receipt: {
            drc_number: receipt.drc_number,
            vendor_name: receipt.vendor_name,
            receipt_datetime: receipt.receipt_datetime,
            sap_po_number: receipt.sap_po_number,
            gem_order_number: receipt.gem_order_number,
            invoice_number: receipt.invoice_number,
            invoice_date: receipt.invoice_date,
            challan_number: receipt.challan_number,
            package_details: receipt.package_details,
            inspection_status: receipt.inspection_status,
            inspection_remarks: receipt.inspection_remarks,
            grn_number: receipt.grn_number,
            grn_date: receipt.grn_date,
          },
          discrepancyRemarks: discrepancyRemarks ?? null,
          purpose: receipt.purpose ?? receipt.remarks ?? null,
          driverName: receipt.driver_name ?? null,
          documents: (receipt.attachment_paths ?? []).map((d) => ({
            name: d.name,
            url: d.url,
            document_type: d.document_type ?? "Other",
          })),
        },
      }
    );

    if (
      error ||
      !data ||
      typeof data.subject !== "string" ||
      typeof data.body !== "string"
    ) {
      throw error ?? new Error("Invalid AI mail response.");
    }

    return { subject: data.subject, body: data.body, aiGenerated: true };
  } catch (err) {
    console.error("AI mail generation failed, using fallback template:", err);

    const fallback =
      mailType === "Security Gate Entry"
        ? generateSecurityGateMailFallback(receipt)
        : mailType === "Inspection Request"
        ? generateInspectionMailFallback(receipt)
        : mailType === "Inspection On Hold"
        ? generateOnHoldMailFallback(receipt)
        : generateCountingDiscrepancyMailFallback(
            receipt,
            discrepancyRemarks ?? ""
          );

    return { ...fallback, aiGenerated: false };
  }
}
