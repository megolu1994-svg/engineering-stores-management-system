import { supabase } from "../config/supabase";

/* =========================================================================
 * Inventory Transaction Engine
 *
 * This is the single, reusable place that:
 *   1. writes the actual stock quantity to `material_allocation`, and
 *   2. best-effort logs the movement to `inventory_transactions`
 *
 * for every stock-changing workflow: Opening Stock, Adjustment, Material
 * Allocation, and (in future) Material Receipt / Material Issue. No other
 * service should write to `material_allocation` directly - route every
 * quantity change through `applyStockMovement` / `reverseStockMovement`
 * below so there is exactly one place stock update logic lives.
 * ========================================================================= */

export type MovementDirection = "IN" | "OUT";

export type InventoryTransactionType =
  | "OPENING_STOCK"
  | "ADJUSTMENT"
  | "ALLOCATION"
  | "MATERIAL_RECEIPT"
  | "MATERIAL_ISSUE";

export interface InventoryTransactionRecord {
  transaction_no: string;
  transaction_type: InventoryTransactionType;
  material_code: string;
  location_code: string;
  quantity: number;
  movement: MovementDirection;
  balance_after: number;
  reference_type?: string;
  reference_number?: string;
  reason?: string;
  remarks?: string;
  created_by?: string;
}

const TRANSACTION_PREFIX: Record<InventoryTransactionType, string> = {
  OPENING_STOCK: "OB",
  ADJUSTMENT: "ADJ",
  ALLOCATION: "ALC",
  MATERIAL_RECEIPT: "GRN",
  MATERIAL_ISSUE: "ISS",
};

function generateTransactionNumber(type: InventoryTransactionType): string {
  const prefix = TRANSACTION_PREFIX[type] ?? "TXN";
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Best-effort audit log insert into `inventory_transactions`.
 *
 * This NEVER throws. If the table doesn't exist yet (or the insert
 * otherwise fails), it logs a warning and returns normally, so every
 * caller keeps working even before the SQL migration below has been run.
 */
export async function recordInventoryTransaction(
  entry: Omit<InventoryTransactionRecord, "transaction_no"> & {
    transaction_no?: string;
  }
): Promise<void> {
  try {
    const payload: InventoryTransactionRecord = {
      ...entry,
      transaction_no:
        entry.transaction_no ??
        generateTransactionNumber(entry.transaction_type),
    };

    const { error } = await supabase
      .from("inventory_transactions")
      .insert([payload]);

    if (error) {
      console.warn(
        "Inventory transaction log skipped (inventory_transactions table may not exist yet):",
        error.message
      );
    }
  } catch (err) {
    console.warn("Inventory transaction log skipped:", err);
  }
}

export interface ApplyStockMovementParams {
  materialCode: string;
  locationCode: string;
  /** Quantity at this location before the movement (0 if no row exists yet). */
  prevQuantity: number;
  /** Absolute quantity at this location after the movement. */
  newQuantity: number;
  /** Existing material_allocation row id; omit to insert a new row. */
  allocationId?: number;
  transactionType: InventoryTransactionType;
  referenceType?: string;
  referenceNumber?: string;
  reason?: string;
  remarks?: string;
  createdBy?: string;
}

/**
 * The single place stock quantities are written for a (material,
 * location) allocation. Used by Opening Stock, Adjustment, and Material
 * Allocation today; Material Receipt and Material Issue should call this
 * too once implemented.
 *
 * - Writes `newQuantity` to `material_allocation` (insert if
 *   `allocationId` is not provided, update otherwise). This write is the
 *   source of truth and throws on failure, exactly like the direct
 *   addAllocation/updateAllocation calls it replaces.
 * - Then best-effort logs the IN/OUT movement to `inventory_transactions`
 *   via `recordInventoryTransaction` (never throws).
 */
export async function applyStockMovement(
  params: ApplyStockMovementParams
): Promise<void> {
  const {
    materialCode,
    locationCode,
    prevQuantity,
    newQuantity,
    allocationId,
    transactionType,
    referenceType,
    referenceNumber,
    reason,
    remarks,
    createdBy,
  } = params;

  if (allocationId !== undefined) {
    const { error } = await supabase
      .from("material_allocation")
      .update({ quantity: newQuantity })
      .eq("id", allocationId);

    if (error) throw error;
  } else {
    const { error } = await supabase.from("material_allocation").insert([
      {
        material_code: materialCode,
        location_code: locationCode,
        quantity: newQuantity,
      },
    ]);

    if (error) throw error;
  }

  const delta = newQuantity - prevQuantity;

  if (delta === 0) {
    return;
  }

  const movement: MovementDirection = delta > 0 ? "IN" : "OUT";
  const quantity = Math.abs(delta);

  await recordInventoryTransaction({
    transaction_type: transactionType,
    material_code: materialCode,
    location_code: locationCode,
    quantity,
    movement,
    balance_after: newQuantity,
    reference_type: referenceType,
    reference_number: referenceNumber,
    reason,
    remarks,
    created_by: createdBy,
  });
}

export interface ReverseStockMovementParams {
  materialCode: string;
  locationCode: string;
  allocationId: number;
  /** Quantity at this location before it is removed. */
  prevQuantity: number;
  transactionType: InventoryTransactionType;
  referenceType?: string;
  referenceNumber?: string;
  reason?: string;
  remarks?: string;
  createdBy?: string;
}

/**
 * Removes an allocation row entirely (e.g. deleting an allocation) and
 * logs the corresponding OUT movement down to a balance of zero.
 */
export async function reverseStockMovement(
  params: ReverseStockMovementParams
): Promise<void> {
  const {
    materialCode,
    locationCode,
    allocationId,
    prevQuantity,
    transactionType,
    referenceType,
    referenceNumber,
    reason,
    remarks,
    createdBy,
  } = params;

  const { error } = await supabase
    .from("material_allocation")
    .delete()
    .eq("id", allocationId);

  if (error) throw error;

  if (prevQuantity === 0) {
    return;
  }

  await recordInventoryTransaction({
    transaction_type: transactionType,
    material_code: materialCode,
    location_code: locationCode,
    quantity: prevQuantity,
    movement: "OUT",
    balance_after: 0,
    reference_type: referenceType,
    reference_number: referenceNumber,
    reason,
    remarks,
    created_by: createdBy,
  });
}
