import { supabase } from "../config/supabase";
import {
  applyStockMovement,
  assertMaterialNotBlocked,
} from "./inventoryTransactionService";
import { getAllocations } from "./materialAllocationService";

/* =========================================================================
 * Material Issue
 *
 * Stock is decreased and every movement is logged exclusively through the
 * Inventory Transaction Engine's `applyStockMovement` (transactionType
 * "MATERIAL_ISSUE") - this file never writes to material_allocation or
 * inventory_transactions directly, so there is no duplicate stock logic.
 *
 * If Materials section is left empty, the Material Issue record is saved
 * against the SAP reservation number & photograph without direct stock
 * adjustments (stock reconciliation can be performed later).
 * ========================================================================= */

export type IssueType = "Normal" | "Emergency" | "Returnable" | "Sample";

export const ISSUE_TYPES: IssueType[] = [
  "Normal",
  "Emergency",
  "Returnable",
  "Sample",
];

export const DEPARTMENTS = [
  "Mechanical Maintenance MM",
  "Electrical Maintenance EM",
  "Instrument Maintenance IM",
  "Production PN",
  "Power & Utilities P&U",
  "Human Resource HR",
  "Fire & Safety F&S",
] as const;

export type DepartmentType = (typeof DEPARTMENTS)[number];

const RECEIPT_PHOTOS_BUCKET = "receipt-photos";

export interface IssueHeader {
  id: number;
  issue_number: string;
  issue_datetime: string;
  issue_type: IssueType;
  department: string;
  user_section: string | null;
  sap_reservation_number: string | null;
  reservation_created_by?: string | null;
  reservation_photo_url?: string | null;
  work_order_number: string | null;
  cost_center: string | null;
  issued_by: string;
  received_by: string;
  remarks: string | null;
  total_materials: number;
  total_locations: number;
  total_quantity: number;
  created_at: string;
}

export interface IssueItem {
  id: number;
  issue_id: number;
  material_code: string;
  short_description: string | null;
  uom: string | null;
  total_issue_qty: number;
}

export interface IssueItemLocation {
  id: number;
  issue_item_id: number;
  location_code: string;
  issue_qty: number;
}

/** One location row inside a material being issued. `availableQty` and
 * `allocationId` come from the material's current stock (fetched via
 * materialAllocationService.getAllocations) and are required so the
 * Inventory Engine knows the exact allocation row to decrease. */
export interface IssueLocationInput {
  location_code: string;
  availableQty: number;
  allocationId: number;
  issueQty: number;
}

/** One material being issued, with one or more location rows. */
export interface IssueMaterialInput {
  material_code: string;
  short_description: string;
  uom: string;
  locations: IssueLocationInput[];
}

export interface IssueHeaderInput {
  issue_type?: IssueType;
  department: string;
  user_section?: string;
  sap_reservation_number?: string;
  reservation_created_by?: string;
  reservation_photo_url?: string;
  work_order_number?: string;
  cost_center?: string;
  issued_by?: string;
  received_by?: string;
  remarks?: string;
}

function toNullable(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Uploads a reservation slip photograph to Supabase Storage and returns
 * the public URL.
 */
export async function uploadReservationPhoto(file: File): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const path = `reservation-photos/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(RECEIPT_PHOTOS_BUCKET)
    .upload(path, file);

  if (uploadError) {
    console.error("Reservation photo upload failed:", uploadError.message);
    throw uploadError;
  }

  const { data } = supabase.storage
    .from(RECEIPT_PHOTOS_BUCKET)
    .getPublicUrl(path);

  if (!data?.publicUrl) {
    throw new Error("Could not retrieve public URL for uploaded photo.");
  }

  return data.publicUrl;
}

/**
 * Looks up current stock for a material across all locations. This is a
 * thin re-export of the existing, unmodified materialAllocationService
 * function - Material Issue never queries material_allocation directly.
 */
export async function getMaterialStockLocations(materialCode: string) {
  return getAllocations(materialCode);
}

export interface IssueValidationResult {
  valid: boolean;
  error: string | null;
}

/**
 * Client-side validation: Materials section is optional (for quick reservation
 * capture). If materials are added, each must have at least one location,
 * positive issue quantity, and not exceed available stock.
 */
export function validateIssue(
  materials: IssueMaterialInput[]
): IssueValidationResult {
  // Materials section is optional: empty array is valid!
  if (!materials || materials.length === 0) {
    return { valid: true, error: null };
  }

  for (const material of materials) {
    if (material.locations.length === 0) {
      return {
        valid: false,
        error: `Please add at least one location for ${material.material_code}.`,
      };
    }

    for (const loc of material.locations) {
      if (!loc.issueQty || loc.issueQty <= 0) {
        return {
          valid: false,
          error: `Issue Qty must be greater than zero for ${material.material_code} at ${loc.location_code}.`,
        };
      }

      if (loc.issueQty > loc.availableQty) {
        return {
          valid: false,
          error: `Issue Qty (${loc.issueQty}) exceeds available quantity (${loc.availableQty}) for ${material.material_code} at ${loc.location_code}.`,
        };
      }
    }
  }

  return { valid: true, error: null };
}

export interface IssueSummary {
  totalMaterials: number;
  totalLocations: number;
  totalQuantity: number;
}

export function summarizeIssue(materials: IssueMaterialInput[]): IssueSummary {
  if (!materials || materials.length === 0) {
    return { totalMaterials: 0, totalLocations: 0, totalQuantity: 0 };
  }

  const totalMaterials = materials.length;
  const totalLocations = materials.reduce(
    (sum, m) => sum + m.locations.length,
    0
  );
  const totalQuantity = materials.reduce(
    (sum, m) =>
      sum + m.locations.reduce((s, l) => s + (Number(l.issueQty) || 0), 0),
    0
  );

  return { totalMaterials, totalLocations, totalQuantity };
}

function parseIssueRow(row: any): IssueHeader {
  let reservationBy = row.reservation_created_by || row.user_section || null;
  let photoUrl = row.reservation_photo_url || null;

  if (row.remarks) {
    if (!photoUrl) {
      const match = row.remarks.match(/Reservation Photo:\s*([^\s|]+)/i);
      if (match) photoUrl = match[1];
    }
    if (!reservationBy) {
      const match = row.remarks.match(/Reservation By:\s*([^|]+)/i);
      if (match) reservationBy = match[1].trim();
    }
  }

  return {
    ...row,
    reservation_created_by: reservationBy,
    reservation_photo_url: photoUrl,
  };
}

/**
 * Creates a Material Issue: one issue_header row, optional issue_items row
 * per material, optional issue_item_locations row per issued location, and
 * stock movements via applyStockMovement when materials are included.
 */
export async function createIssue(
  header: IssueHeaderInput,
  materials: IssueMaterialInput[] = []
): Promise<IssueHeader> {
  const validation = validateIssue(materials);
  if (!validation.valid) {
    throw new Error(validation.error ?? "Invalid issue.");
  }

  // Blocked materials cannot be issued - check before creating the header
  if (materials.length > 0) {
    for (const material of materials) {
      await assertMaterialNotBlocked(material.material_code);
    }
  }

  const { totalMaterials, totalLocations, totalQuantity } =
    summarizeIssue(materials);

  const issueType = header.issue_type || "Normal";
  const reservationBy = header.reservation_created_by?.trim() || null;
  const photoUrl = header.reservation_photo_url?.trim() || null;
  const rawRemarks = header.remarks?.trim() || "";

  // Combine remarks for fallback storage if custom columns aren't in DB yet
  const noteParts: string[] = [];
  if (rawRemarks) noteParts.push(rawRemarks);
  if (reservationBy) noteParts.push(`Reservation By: ${reservationBy}`);
  if (photoUrl) noteParts.push(`Reservation Photo: ${photoUrl}`);
  const combinedRemarks = noteParts.join(" | ") || null;

  const fullPayload: Record<string, unknown> = {
    issue_type: issueType,
    department: header.department.trim(),
    user_section: toNullable(reservationBy || header.user_section || ""),
    sap_reservation_number: toNullable(header.sap_reservation_number || ""),
    reservation_created_by: reservationBy,
    reservation_photo_url: photoUrl,
    work_order_number: toNullable(header.work_order_number || ""),
    cost_center: toNullable(header.cost_center || ""),
    issued_by: (header.issued_by || reservationBy || "System").trim(),
    received_by: (header.received_by || header.department || "").trim(),
    remarks: photoUrl ? combinedRemarks : toNullable(rawRemarks),
    total_materials: totalMaterials,
    total_locations: totalLocations,
    total_quantity: totalQuantity,
  };

  let headerData: any;

  const res = await supabase
    .from("issue_header")
    .insert([fullPayload])
    .select()
    .single();

  if (res.error) {
    // If reservation columns are not yet in the DB table (error 42703),
    // retry with core columns while preserving the values in user_section & remarks
    if (res.error.code === "42703") {
      console.warn(
        "issue_header missing reservation columns; falling back to remarks/user_section embedding:",
        res.error.message
      );
      const fallbackPayload = {
        issue_type: issueType,
        department: header.department.trim(),
        user_section: toNullable(reservationBy || header.user_section || ""),
        sap_reservation_number: toNullable(header.sap_reservation_number || ""),
        work_order_number: toNullable(header.work_order_number || ""),
        cost_center: toNullable(header.cost_center || ""),
        issued_by: (header.issued_by || reservationBy || "System").trim(),
        received_by: (header.received_by || header.department || "").trim(),
        remarks: combinedRemarks,
        total_materials: totalMaterials,
        total_locations: totalLocations,
        total_quantity: totalQuantity,
      };

      const fallbackRes = await supabase
        .from("issue_header")
        .insert([fallbackPayload])
        .select()
        .single();

      if (fallbackRes.error) throw fallbackRes.error;
      headerData = fallbackRes.data;
    } else {
      throw res.error;
    }
  } else {
    headerData = res.data;
  }

  const issue = parseIssueRow(headerData);

  // If materials were provided, insert item records and perform stock deduction
  if (materials.length > 0) {
    for (const material of materials) {
      const materialTotalQty = material.locations.reduce(
        (sum, l) => sum + l.issueQty,
        0
      );

      const { data: itemData, error: itemError } = await supabase
        .from("issue_items")
        .insert([
          {
            issue_id: issue.id,
            material_code: material.material_code,
            short_description: material.short_description,
            uom: material.uom,
            total_issue_qty: materialTotalQty,
          },
        ])
        .select()
        .single();

      if (itemError) throw itemError;

      const issueItemId = itemData.id as number;

      for (const loc of material.locations) {
        // Inventory Engine: decreases material_allocation and logs one
        // MATERIAL_ISSUE / OUT transaction for this location.
        await applyStockMovement({
          materialCode: material.material_code,
          locationCode: loc.location_code,
          prevQuantity: loc.availableQty,
          newQuantity: loc.availableQty - loc.issueQty,
          allocationId: loc.allocationId,
          transactionType: "MATERIAL_ISSUE",
          referenceType: "ISSUE",
          referenceNumber: issue.issue_number,
          reason: issueType,
          remarks: header.remarks || undefined,
        });

        const { error: locError } = await supabase
          .from("issue_item_locations")
          .insert([
            {
              issue_item_id: issueItemId,
              location_code: loc.location_code,
              issue_qty: loc.issueQty,
            },
          ]);

        if (locError) throw locError;
      }
    }
  }

  return issue;
}

/* =========================================================================
 * Reports
 * ========================================================================= */

function startOfTodayIso(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return start.toISOString();
}

/** Today's issues, newest first. */
export async function getIssuesToday(): Promise<IssueHeader[]> {
  const { data, error } = await supabase
    .from("issue_header")
    .select("*")
    .gte("issue_datetime", startOfTodayIso())
    .order("issue_datetime", { ascending: false });

  if (error) {
    console.error(error);
    return [];
  }

  return ((data ?? []) as any[]).map(parseIssueRow);
}

export interface GetIssuesParams {
  search?: string;
  department?: string;
  onlyWithPhotos?: boolean;
  page?: number;
  pageSize?: number;
}

export interface IssueWithItems extends IssueHeader {
  items: Array<
    IssueItem & {
      locations: IssueItemLocation[];
    }
  >;
}

/**
 * Fetches material issues with optional search, department filter, and pagination.
 * Robustly parses reservation details and photographs.
 */
export async function getIssues(params: GetIssuesParams = {}): Promise<{
  data: IssueHeader[];
  totalCount: number;
}> {
  const page = params.page ?? 0;
  const pageSize = params.pageSize ?? 25;
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("issue_header")
    .select("*", { count: "exact" });

  if (params.department && params.department !== "ALL") {
    query = query.eq("department", params.department);
  }

  if (params.search && params.search.trim()) {
    const term = params.search.trim();
    query = query.or(
      `issue_number.ilike.%${term}%,sap_reservation_number.ilike.%${term}%,reservation_created_by.ilike.%${term}%,user_section.ilike.%${term}%,remarks.ilike.%${term}%,issued_by.ilike.%${term}%,received_by.ilike.%${term}%`
    );
  }

  query = query.order("issue_datetime", { ascending: false }).range(from, to);

  const { data, count, error } = await query;
  if (error) {
    console.error("Failed to fetch issues:", error);
    return { data: [], totalCount: 0 };
  }

  const parsed = ((data ?? []) as any[]).map(parseIssueRow);
  const filtered = params.onlyWithPhotos
    ? parsed.filter((i) => !!i.reservation_photo_url)
    : parsed;

  return {
    data: filtered,
    totalCount: count ?? parsed.length,
  };
}

/**
 * Fetches complete details of an issue, including header, reservation info,
 * photo URL, and any material line items with their location breakdowns.
 */
export async function getIssueWithItems(issueId: number): Promise<IssueWithItems | null> {
  const { data: headerData, error: headerErr } = await supabase
    .from("issue_header")
    .select("*")
    .eq("id", issueId)
    .single();

  if (headerErr || !headerData) return null;

  const header = parseIssueRow(headerData);

  const { data: itemsData, error: itemsErr } = await supabase
    .from("issue_items")
    .select("*")
    .eq("issue_id", issueId);

  if (itemsErr) {
    return { ...header, items: [] };
  }

  const items: Array<IssueItem & { locations: IssueItemLocation[] }> = [];

  for (const it of (itemsData ?? []) as IssueItem[]) {
    const { data: locsData } = await supabase
      .from("issue_item_locations")
      .select("*")
      .eq("issue_item_id", it.id);

    items.push({
      ...it,
      locations: (locsData ?? []) as IssueItemLocation[],
    });
  }

  return {
    ...header,
    items,
  };
}

