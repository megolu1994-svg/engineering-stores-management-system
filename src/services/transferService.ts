import { supabase } from "../config/supabase";
import { applyStockMovement } from "./inventoryTransactionService";
import { getAllocations } from "./materialAllocationService";
import type { MaterialAllocation } from "../types/materialAllocation";

/* =========================================================================
 * Location Transfer
 *
 * Stock is moved (decreased at FROM, increased at TO) and every movement
 * is logged exclusively through the Inventory Transaction Engine's
 * `applyStockMovement` (transactionType "LOCATION_TRANSFER") - this file
 * never writes to material_allocation or inventory_transactions directly,
 * so there is no duplicate stock logic. Total stock for a material is
 * unchanged by a transfer: the OUT at FROM and the IN at TO always carry
 * the same quantity.
 * ========================================================================= */

export const UNALLOCATED_LOCATION = "UNALLOCATED";

export interface TransferHeader {
  id: number;
  transfer_number: string;
  transfer_datetime: string;
  transfer_by: string;
  reason: string | null;
  remarks: string | null;
  total_materials: number;
  total_locations: number;
  total_quantity: number;
  created_at: string;
}

export interface TransferItem {
  id: number;
  transfer_id: number;
  material_code: string;
  short_description: string | null;
  uom: string | null;
  total_transfer_qty: number;
}

export interface TransferItemLocation {
  id: number;
  transfer_item_id: number;
  from_location_code: string;
  to_location_code: string;
  transfer_qty: number;
}

/** One FROM -> TO movement row inside a material being transferred.
 * `fromAvailableQty` and `fromAllocationId` come from the material's
 * current stock at the FROM location (fetched via
 * materialAllocationService.getAllocations) so the Inventory Engine
 * knows the exact allocation row to decrease. `toAllocationId` is the
 * TO location's existing allocation row for this material, if any -
 * omitted when the material doesn't exist there yet (a new allocation
 * row is created). */
export interface TransferLocationInput {
  from_location_code: string;
  fromAvailableQty: number;
  fromAllocationId: number;
  to_location_code: string;
  toAvailableQty: number;
  toAllocationId?: number;
  transferQty: number;
}

/** One material being transferred, with one or more FROM/TO location rows. */
export interface TransferMaterialInput {
  material_code: string;
  short_description: string;
  uom: string;
  locations: TransferLocationInput[];
}

export interface TransferHeaderInput {
  transfer_by: string;
  reason: string;
  remarks: string;
}

function toNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Looks up current stock for a material across all locations. This is a
 * thin re-export of the existing, unmodified materialAllocationService
 * function - Location Transfer never queries material_allocation
 * directly.
 */
export async function getMaterialStockLocations(
  materialCode: string
): Promise<MaterialAllocation[]> {
  return getAllocations(materialCode);
}

export interface MaterialStockSummary {
  totalStock: number;
  allocatedStock: number;
  unallocatedStock: number;
}

/**
 * Splits a material's stock into Total / Allocated / Unallocated,
 * matching the terminology already used in Material Allocation.
 * Unallocated is whatever sits in the UNALLOCATED sentinel location;
 * Allocated is everything else.
 */
export function summarizeMaterialStock(
  allocations: MaterialAllocation[]
): MaterialStockSummary {
  const totalStock = allocations.reduce((sum, a) => sum + Number(a.quantity), 0);
  const unallocatedStock = allocations
    .filter((a) => a.location_code === UNALLOCATED_LOCATION)
    .reduce((sum, a) => sum + Number(a.quantity), 0);

  return {
    totalStock,
    allocatedStock: totalStock - unallocatedStock,
    unallocatedStock,
  };
}

export interface TransferValidationResult {
  valid: boolean;
  error: string | null;
}

/**
 * Client-side validation matching the module's save rules: at least one
 * material, every material has at least one FROM/TO row, FROM cannot
 * equal TO, transfer quantity must be greater than zero, and cannot
 * exceed the FROM location's available quantity.
 */
export function validateTransfer(
  materials: TransferMaterialInput[]
): TransferValidationResult {
  if (materials.length === 0) {
    return { valid: false, error: "Please add at least one material." };
  }

  for (const material of materials) {
    if (material.locations.length === 0) {
      return {
        valid: false,
        error: `Please add at least one location row for ${material.material_code}.`,
      };
    }

    for (const loc of material.locations) {
      if (loc.from_location_code === loc.to_location_code) {
        return {
          valid: false,
          error: `From Location cannot equal To Location for ${material.material_code}.`,
        };
      }

      if (!loc.transferQty || loc.transferQty <= 0) {
        return {
          valid: false,
          error: `Transfer Qty must be greater than zero for ${material.material_code} at ${loc.from_location_code}.`,
        };
      }

      if (loc.transferQty > loc.fromAvailableQty) {
        return {
          valid: false,
          error: `Transfer Qty (${loc.transferQty}) exceeds available quantity (${loc.fromAvailableQty}) for ${material.material_code} at ${loc.from_location_code}.`,
        };
      }
    }
  }

  return { valid: true, error: null };
}

export interface TransferSummary {
  totalMaterials: number;
  totalLocations: number;
  totalQuantity: number;
}

export function summarizeTransfer(
  materials: TransferMaterialInput[]
): TransferSummary {
  const totalMaterials = materials.length;
  const totalLocations = materials.reduce(
    (sum, m) => sum + m.locations.length,
    0
  );
  const totalQuantity = materials.reduce(
    (sum, m) =>
      sum + m.locations.reduce((s, l) => s + (Number(l.transferQty) || 0), 0),
    0
  );

  return { totalMaterials, totalLocations, totalQuantity };
}

/**
 * Creates a Location Transfer: one transfer_header row, one
 * transfer_items row per material, one transfer_item_locations row per
 * FROM/TO movement, and - for every movement - two stock movements via
 * the Inventory Engine (one OUT at the FROM location, one IN at the TO
 * location, same quantity, so total stock for the material is
 * unchanged). transfer_number and transfer_datetime are generated by
 * the database trigger.
 */
export async function createTransfer(
  header: TransferHeaderInput,
  materials: TransferMaterialInput[]
): Promise<TransferHeader> {
  const validation = validateTransfer(materials);
  if (!validation.valid) {
    throw new Error(validation.error ?? "Invalid transfer.");
  }

  const { totalMaterials, totalLocations, totalQuantity } =
    summarizeTransfer(materials);

  const { data: headerData, error: headerError } = await supabase
    .from("transfer_header")
    .insert([
      {
        transfer_by: header.transfer_by.trim(),
        reason: toNullable(header.reason),
        remarks: toNullable(header.remarks),
        total_materials: totalMaterials,
        total_locations: totalLocations,
        total_quantity: totalQuantity,
      },
    ])
    .select()
    .single();

  if (headerError) throw headerError;

  const transfer = headerData as TransferHeader;

  for (const material of materials) {
    const materialTotalQty = material.locations.reduce(
      (sum, l) => sum + l.transferQty,
      0
    );

    const { data: itemData, error: itemError } = await supabase
      .from("transfer_items")
      .insert([
        {
          transfer_id: transfer.id,
          material_code: material.material_code,
          short_description: material.short_description,
          uom: material.uom,
          total_transfer_qty: materialTotalQty,
        },
      ])
      .select()
      .single();

    if (itemError) throw itemError;

    const transferItemId = itemData.id as number;

    for (const loc of material.locations) {
      // Inventory Engine: decrease FROM (OUT) - one movement.
      await applyStockMovement({
        materialCode: material.material_code,
        locationCode: loc.from_location_code,
        prevQuantity: loc.fromAvailableQty,
        newQuantity: loc.fromAvailableQty - loc.transferQty,
        allocationId: loc.fromAllocationId,
        transactionType: "LOCATION_TRANSFER",
        referenceType: "TRANSFER",
        referenceNumber: transfer.transfer_number,
        reason: header.reason || undefined,
        remarks: header.remarks || undefined,
      });

      // Inventory Engine: increase TO (IN) - one movement.
      await applyStockMovement({
        materialCode: material.material_code,
        locationCode: loc.to_location_code,
        prevQuantity: loc.toAvailableQty,
        newQuantity: loc.toAvailableQty + loc.transferQty,
        allocationId: loc.toAllocationId,
        transactionType: "LOCATION_TRANSFER",
        referenceType: "TRANSFER",
        referenceNumber: transfer.transfer_number,
        reason: header.reason || undefined,
        remarks: header.remarks || undefined,
      });

      const { error: locError } = await supabase
        .from("transfer_item_locations")
        .insert([
          {
            transfer_item_id: transferItemId,
            from_location_code: loc.from_location_code,
            to_location_code: loc.to_location_code,
            transfer_qty: loc.transferQty,
          },
        ]);

      if (locError) throw locError;
    }
  }

  return transfer;
}

/* =========================================================================
 * Reports
 * ========================================================================= */

function startOfTodayIso(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return start.toISOString();
}

/** Today's transfers, newest first. */
export async function getTransfersToday(): Promise<TransferHeader[]> {
  const { data, error } = await supabase
    .from("transfer_header")
    .select("*")
    .gte("transfer_datetime", startOfTodayIso())
    .order("transfer_datetime", { ascending: false });

  if (error) {
    console.error(error);
    return [];
  }

  return (data ?? []) as TransferHeader[];
}

export interface TransferSearchFilters {
  search?: string;
}

/**
 * Searches transfers by Transfer Number, Transfer By, or Reason (on
 * transfer_header), Material Code/Description (on transfer_items,
 * resolved to their parent transfers), or From/To Location (on
 * transfer_item_locations, resolved via transfer_items to their parent
 * transfers). With no search text, returns the most recent transfers.
 */
export async function searchTransfers(
  filters: TransferSearchFilters = {}
): Promise<TransferHeader[]> {
  const search = filters.search?.trim();

  if (!search) {
    const { data, error } = await supabase
      .from("transfer_header")
      .select("*")
      .order("transfer_datetime", { ascending: false })
      .limit(50);

    if (error) {
      console.error(error);
      return [];
    }

    return (data ?? []) as TransferHeader[];
  }

  const safe = search.replace(/[%_]/g, (match) => `\\${match}`);

  const [headerResult, itemResult, locationResult] = await Promise.all([
    supabase
      .from("transfer_header")
      .select("*")
      .or(
        `transfer_number.ilike.%${safe}%,transfer_by.ilike.%${safe}%,reason.ilike.%${safe}%`
      )
      .order("transfer_datetime", { ascending: false }),
    supabase
      .from("transfer_items")
      .select("id, transfer_id")
      .or(`material_code.ilike.%${safe}%,short_description.ilike.%${safe}%`),
    supabase
      .from("transfer_item_locations")
      .select("transfer_item_id")
      .or(`from_location_code.ilike.%${safe}%,to_location_code.ilike.%${safe}%`),
  ]);

  if (headerResult.error) console.error(headerResult.error);
  if (itemResult.error) console.error(itemResult.error);
  if (locationResult.error) console.error(locationResult.error);

  const directMatches = (headerResult.data ?? []) as TransferHeader[];

  const itemIdsFromMaterialMatch = (
    (itemResult.data ?? []) as { id: number; transfer_id: number }[]
  );

  const transferIdsFromMaterial = new Set(
    itemIdsFromMaterialMatch.map((row) => row.transfer_id)
  );

  // Location matches only give us transfer_item_id - resolve those to
  // their parent transfer_id via transfer_items.
  const matchedItemIds = Array.from(
    new Set(
      ((locationResult.data ?? []) as { transfer_item_id: number }[]).map(
        (row) => row.transfer_item_id
      )
    )
  );

  const transferIdsFromLocation = new Set<number>();

  if (matchedItemIds.length > 0) {
    const { data, error } = await supabase
      .from("transfer_items")
      .select("id, transfer_id")
      .in("id", matchedItemIds);

    if (error) {
      console.error(error);
    } else {
      (data ?? []).forEach((row: { id: number; transfer_id: number }) =>
        transferIdsFromLocation.add(row.transfer_id)
      );
    }
  }

  const indirectTransferIds = Array.from(
    new Set([...transferIdsFromMaterial, ...transferIdsFromLocation])
  );

  let indirectMatches: TransferHeader[] = [];

  if (indirectTransferIds.length > 0) {
    const { data, error } = await supabase
      .from("transfer_header")
      .select("*")
      .in("id", indirectTransferIds)
      .order("transfer_datetime", { ascending: false });

    if (error) {
      console.error(error);
    } else {
      indirectMatches = (data ?? []) as TransferHeader[];
    }
  }

  const merged = new Map<number, TransferHeader>();
  [...directMatches, ...indirectMatches].forEach((transfer) => {
    merged.set(transfer.id, transfer);
  });

  return Array.from(merged.values()).sort(
    (a, b) =>
      new Date(b.transfer_datetime).getTime() -
      new Date(a.transfer_datetime).getTime()
  );
}

export async function getTransferItems(
  transferId: number
): Promise<TransferItem[]> {
  const { data, error } = await supabase
    .from("transfer_items")
    .select("*")
    .eq("transfer_id", transferId)
    .order("material_code");

  if (error) {
    console.error(error);
    return [];
  }

  return (data ?? []) as TransferItem[];
}

export async function getTransferItemLocations(
  transferItemId: number
): Promise<TransferItemLocation[]> {
  const { data, error } = await supabase
    .from("transfer_item_locations")
    .select("*")
    .eq("transfer_item_id", transferItemId)
    .order("from_location_code");

  if (error) {
    console.error(error);
    return [];
  }

  return (data ?? []) as TransferItemLocation[];
}
