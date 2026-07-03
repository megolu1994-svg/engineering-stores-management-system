import { supabase } from "../config/supabase";
import { applyStockMovement } from "./inventoryTransactionService";
import { getAllocations } from "./materialAllocationService";

/* =========================================================================
 * Material Issue
 *
 * Stock is decreased and every movement is logged exclusively through the
 * Inventory Transaction Engine's `applyStockMovement` (transactionType
 * "MATERIAL_ISSUE") - this file never writes to material_allocation or
 * inventory_transactions directly, so there is no duplicate stock logic.
 * ========================================================================= */

export type IssueType = "Normal" | "Emergency" | "Returnable" | "Sample";

export const ISSUE_TYPES: IssueType[] = [
  "Normal",
  "Emergency",
  "Returnable",
  "Sample",
];

export interface IssueHeader {
  id: number;
  issue_number: string;
  issue_datetime: string;
  issue_type: IssueType;
  department: string;
  user_section: string | null;
  sap_reservation_number: string | null;
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
  issue_type: IssueType;
  department: string;
  user_section: string;
  sap_reservation_number: string;
  work_order_number: string;
  cost_center: string;
  issued_by: string;
  received_by: string;
  remarks: string;
}

function toNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
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
 * Client-side validation matching the module's save rules: at least one
 * material, every material has at least one location, every issue
 * quantity is greater than zero, and no issue quantity exceeds the
 * available quantity at that location.
 */
export function validateIssue(
  materials: IssueMaterialInput[]
): IssueValidationResult {
  if (materials.length === 0) {
    return { valid: false, error: "Please add at least one material." };
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

/**
 * Creates a Material Issue: one issue_header row, one issue_items row
 * per material, one issue_item_locations row per issued location, and -
 * for every issued location - one MATERIAL_ISSUE stock movement via the
 * Inventory Engine (which decreases material_allocation and logs the OUT
 * transaction). issue_number and issue_datetime are generated by the
 * database trigger.
 */
export async function createIssue(
  header: IssueHeaderInput,
  materials: IssueMaterialInput[]
): Promise<IssueHeader> {
  const validation = validateIssue(materials);
  if (!validation.valid) {
    throw new Error(validation.error ?? "Invalid issue.");
  }

  const { totalMaterials, totalLocations, totalQuantity } =
    summarizeIssue(materials);

  const { data: headerData, error: headerError } = await supabase
    .from("issue_header")
    .insert([
      {
        issue_type: header.issue_type,
        department: header.department.trim(),
        user_section: toNullable(header.user_section),
        sap_reservation_number: toNullable(header.sap_reservation_number),
        work_order_number: toNullable(header.work_order_number),
        cost_center: toNullable(header.cost_center),
        issued_by: header.issued_by.trim(),
        received_by: header.received_by.trim(),
        remarks: toNullable(header.remarks),
        total_materials: totalMaterials,
        total_locations: totalLocations,
        total_quantity: totalQuantity,
      },
    ])
    .select()
    .single();

  if (headerError) throw headerError;

  const issue = headerData as IssueHeader;

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
        reason: header.issue_type,
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

  return (data ?? []) as IssueHeader[];
}

export interface IssueSearchFilters {
  search?: string;
}

/**
 * Searches issues by Issue No, Department, SAP Reservation Number, Work
 * Order/Notification (all on issue_header), or Material Code/Description
 * (on issue_items, resolved to their parent issues in a second query).
 * With no search text, returns the most recent issues.
 */
export async function searchIssues(
  filters: IssueSearchFilters = {}
): Promise<IssueHeader[]> {
  const search = filters.search?.trim();

  if (!search) {
    const { data, error } = await supabase
      .from("issue_header")
      .select("*")
      .order("issue_datetime", { ascending: false })
      .limit(50);

    if (error) {
      console.error(error);
      return [];
    }

    return (data ?? []) as IssueHeader[];
  }

  const safe = search.replace(/[%_]/g, (match) => `\\${match}`);

  const [headerResult, itemResult] = await Promise.all([
    supabase
      .from("issue_header")
      .select("*")
      .or(
        `issue_number.ilike.%${safe}%,department.ilike.%${safe}%,sap_reservation_number.ilike.%${safe}%,work_order_number.ilike.%${safe}%`
      )
      .order("issue_datetime", { ascending: false }),
    supabase
      .from("issue_items")
      .select("issue_id")
      .or(`material_code.ilike.%${safe}%,short_description.ilike.%${safe}%`),
  ]);

  if (headerResult.error) console.error(headerResult.error);
  if (itemResult.error) console.error(itemResult.error);

  const directMatches = (headerResult.data ?? []) as IssueHeader[];

  const matchedIssueIds = Array.from(
    new Set(
      ((itemResult.data ?? []) as { issue_id: number }[]).map(
        (row) => row.issue_id
      )
    )
  );

  let materialMatches: IssueHeader[] = [];

  if (matchedIssueIds.length > 0) {
    const { data, error } = await supabase
      .from("issue_header")
      .select("*")
      .in("id", matchedIssueIds)
      .order("issue_datetime", { ascending: false });

    if (error) {
      console.error(error);
    } else {
      materialMatches = (data ?? []) as IssueHeader[];
    }
  }

  const merged = new Map<number, IssueHeader>();
  [...directMatches, ...materialMatches].forEach((issue) => {
    merged.set(issue.id, issue);
  });

  return Array.from(merged.values()).sort(
    (a, b) =>
      new Date(b.issue_datetime).getTime() -
      new Date(a.issue_datetime).getTime()
  );
}

export async function getIssueItems(issueId: number): Promise<IssueItem[]> {
  const { data, error } = await supabase
    .from("issue_items")
    .select("*")
    .eq("issue_id", issueId)
    .order("material_code");

  if (error) {
    console.error(error);
    return [];
  }

  return (data ?? []) as IssueItem[];
}

export async function getIssueItemLocations(
  issueItemId: number
): Promise<IssueItemLocation[]> {
  const { data, error } = await supabase
    .from("issue_item_locations")
    .select("*")
    .eq("issue_item_id", issueItemId)
    .order("location_code");

  if (error) {
    console.error(error);
    return [];
  }

  return (data ?? []) as IssueItemLocation[];
}
