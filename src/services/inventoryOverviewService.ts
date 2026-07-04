import { supabase } from "../config/supabase";
import type { InventoryTransactionType } from "./inventoryTransactionService";

/* =========================================================================
 * Inventory Overview (Current Stock tab)
 *
 * Read-only queries in support of the Inventory module's Current Stock
 * tab. This file never writes to material_allocation or
 * inventory_transactions - it only reads from them - so it does not
 * duplicate any Inventory Engine logic. With 10,000-100,000+ materials,
 * nothing here ever loads the full material_master or material_allocation
 * table: every query is targeted (a small `.limit()`, or a batched
 * `.in()` keyed off of an already-narrow result set).
 * ========================================================================= */

const RECENT_ACTIVITY_LIMIT = 30;
// Over-fetch a bit before de-duplicating by material, so that materials
// with several transactions in a row don't crowd out the material count
// we actually want to show.
const RECENT_TRANSACTIONS_FETCH = 200;

export interface InventoryOverviewRow {
  material_code: string;
  short_description: string;
  uom: string;
  currentStock: number;
  lastTransactionTime: string;
  lastTransactionType: InventoryTransactionType;
  /** The affected location, e.g. "CS/HD35BIN B". For a Location
   * Transfer this is "FROM -> TO", e.g. "CS/HD35BIN B -> CS/HE20". */
  locationDisplay: string;
}

async function getCurrentStockForMaterials(
  materialCodes: string[]
): Promise<Map<string, number>> {
  if (materialCodes.length === 0) return new Map();

  const { data, error } = await supabase
    .from("material_allocation")
    .select("material_code, quantity")
    .in("material_code", materialCodes);

  if (error) {
    console.error(error);
    return new Map();
  }

  const map = new Map<string, number>();

  (data ?? []).forEach((row: { material_code: string; quantity: number }) => {
    map.set(
      row.material_code,
      (map.get(row.material_code) ?? 0) + Number(row.quantity)
    );
  });

  return map;
}

async function getMaterialInfoMap(
  materialCodes: string[]
): Promise<Map<string, { short_description: string; uom: string }>> {
  if (materialCodes.length === 0) return new Map();

  const { data, error } = await supabase
    .from("material_master")
    .select("material_code, short_description, uom")
    .in("material_code", materialCodes);

  if (error) {
    console.error(error);
    return new Map();
  }

  const map = new Map<string, { short_description: string; uom: string }>();

  (
    (data ?? []) as {
      material_code: string;
      short_description: string;
      uom: string;
    }[]
  ).forEach((m) =>
    map.set(m.material_code, {
      short_description: m.short_description,
      uom: m.uom,
    })
  );

  return map;
}

/**
 * The latest 20-50 materials that have had an inventory transaction
 * (Opening Stock, Material Receipt, Allocation, Transfer, Adjustment,
 * Material Issue), most recent first. Reads directly from
 * inventory_transactions - never loads material_master or
 * material_allocation in bulk.
 */
export async function getRecentActivity(): Promise<InventoryOverviewRow[]> {
  const { data, error } = await supabase
    .from("inventory_transactions")
    .select(
      "material_code, transaction_type, location_code, movement, reference_number, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(RECENT_TRANSACTIONS_FETCH);

  if (error) {
    console.error(error);
    return [];
  }

  const rows = (data ?? []) as {
    material_code: string;
    transaction_type: InventoryTransactionType;
    location_code: string;
    movement: "IN" | "OUT";
    reference_number: string | null;
    created_at: string;
  }[];

  const latestByMaterial = new Map<string, (typeof rows)[number]>();

  for (const row of rows) {
    if (!latestByMaterial.has(row.material_code)) {
      latestByMaterial.set(row.material_code, row);
    }

    if (latestByMaterial.size >= RECENT_ACTIVITY_LIMIT) {
      break;
    }
  }

  const materialCodes = Array.from(latestByMaterial.keys());

  // For any LOCATION_TRANSFER among the latest transactions, find its
  // sibling leg (same material + reference_number, opposite movement) so
  // the UI can show "FROM -> TO" rather than just one side of the move.
  const transferRows = Array.from(latestByMaterial.values()).filter(
    (r) => r.transaction_type === "LOCATION_TRANSFER" && r.reference_number
  );

  const siblingMap = new Map<string, string>(); // key: material|reference_number|movement -> location_code

  if (transferRows.length > 0) {
    const referenceNumbers = Array.from(
      new Set(transferRows.map((r) => r.reference_number as string))
    );

    const { data: siblingData, error: siblingError } = await supabase
      .from("inventory_transactions")
      .select("material_code, reference_number, movement, location_code")
      .eq("transaction_type", "LOCATION_TRANSFER")
      .in("reference_number", referenceNumbers)
      .in("material_code", materialCodes);

    if (siblingError) {
      console.error(siblingError);
    } else {
      (
        (siblingData ?? []) as {
          material_code: string;
          reference_number: string;
          movement: "IN" | "OUT";
          location_code: string;
        }[]
      ).forEach((s) => {
        siblingMap.set(
          `${s.material_code}|${s.reference_number}|${s.movement}`,
          s.location_code
        );
      });
    }
  }

  const [infoMap, stockMap] = await Promise.all([
    getMaterialInfoMap(materialCodes),
    getCurrentStockForMaterials(materialCodes),
  ]);

  return materialCodes.map((code) => {
    const last = latestByMaterial.get(code)!;
    const info = infoMap.get(code);

    let locationDisplay = last.location_code;

    if (last.transaction_type === "LOCATION_TRANSFER" && last.reference_number) {
      if (last.movement === "OUT") {
        const to = siblingMap.get(`${code}|${last.reference_number}|IN`);
        locationDisplay = to
          ? `${last.location_code} -> ${to}`
          : last.location_code;
      } else {
        const from = siblingMap.get(`${code}|${last.reference_number}|OUT`);
        locationDisplay = from
          ? `${from} -> ${last.location_code}`
          : last.location_code;
      }
    }

    return {
      material_code: code,
      short_description: info?.short_description ?? "",
      uom: info?.uom ?? "",
      currentStock: stockMap.get(code) ?? 0,
      lastTransactionTime: last.created_at,
      lastTransactionType: last.transaction_type,
      locationDisplay,
    };
  });
}

export interface InventorySearchResult {
  material_code: string;
  short_description: string;
  uom: string;
  currentStock: number;
}

/**
 * Searches for materials by Material Code, Description, or Location
 * Code. Requires at least 2 characters and is meant to be called
 * debounced from the UI. Every lookup is targeted (small `.limit()`
 * results, or `.in()` against an already-narrow set of codes) so this
 * stays fast with 100,000+ materials and never loads a full table.
 */
export async function searchInventory(
  query: string
): Promise<InventorySearchResult[]> {
  const trimmed = query.trim();

  if (trimmed.length < 2) {
    return [];
  }

  const safe = trimmed.replace(/[%_]/g, (match) => `\\${match}`);

  const [materialResult, locationResult] = await Promise.all([
    supabase
      .from("material_master")
      .select("material_code, short_description, uom")
      .or(`material_code.ilike.%${safe}%,short_description.ilike.%${safe}%`)
      .limit(20),
    supabase
      .from("location_master")
      .select("location_code")
      .or(`location_code.ilike.%${safe}%,location_description.ilike.%${safe}%`)
      .limit(20),
  ]);

  if (materialResult.error) console.error(materialResult.error);
  if (locationResult.error) console.error(locationResult.error);

  const directMaterials = (materialResult.data ?? []) as {
    material_code: string;
    short_description: string;
    uom: string;
  }[];

  const matchedLocationCodes = (
    (locationResult.data ?? []) as { location_code: string }[]
  ).map((l) => l.location_code);

  let materialsFromLocation: {
    material_code: string;
    short_description: string;
    uom: string;
  }[] = [];

  if (matchedLocationCodes.length > 0) {
    const { data: allocRows, error: allocError } = await supabase
      .from("material_allocation")
      .select("material_code")
      .in("location_code", matchedLocationCodes)
      .limit(100);

    if (allocError) {
      console.error(allocError);
    } else {
      const codes = Array.from(
        new Set(
          ((allocRows ?? []) as { material_code: string }[]).map(
            (r) => r.material_code
          )
        )
      ).slice(0, 20);

      if (codes.length > 0) {
        const { data: materials, error } = await supabase
          .from("material_master")
          .select("material_code, short_description, uom")
          .in("material_code", codes);

        if (error) {
          console.error(error);
        } else {
          materialsFromLocation = materials ?? [];
        }
      }
    }
  }

  const merged = new Map<
    string,
    { material_code: string; short_description: string; uom: string }
  >();

  [...directMaterials, ...materialsFromLocation].forEach((m) =>
    merged.set(m.material_code, m)
  );

  const materialCodes = Array.from(merged.keys());
  const stockMap = await getCurrentStockForMaterials(materialCodes);

  return materialCodes.map((code) => {
    const m = merged.get(code)!;
    return {
      material_code: code,
      short_description: m.short_description,
      uom: m.uom,
      currentStock: stockMap.get(code) ?? 0,
    };
  });
}

/* =========================================================================
 * Reports: per-material movement dates
 * ========================================================================= */

export interface MaterialMovementDates {
  lastReceiptDate: string | null;
  lastIssueDate: string | null;
  lastMovementDate: string | null;
}

/**
 * Last Receipt / Last Issue / Last Movement (of any type) dates for a
 * single material, read directly from inventory_transactions. A single
 * targeted query (filtered to one material_code, small `.limit()`) - not
 * a table scan.
 */
export async function getMaterialMovementDates(
  materialCode: string
): Promise<MaterialMovementDates> {
  const { data, error } = await supabase
    .from("inventory_transactions")
    .select("transaction_type, created_at")
    .eq("material_code", materialCode)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error(error);
    return { lastReceiptDate: null, lastIssueDate: null, lastMovementDate: null };
  }

  const rows = (data ?? []) as {
    transaction_type: InventoryTransactionType;
    created_at: string;
  }[];

  const lastMovementDate = rows.length > 0 ? rows[0].created_at : null;
  const lastReceiptDate =
    rows.find((r) => r.transaction_type === "MATERIAL_RECEIPT")?.created_at ??
    null;
  const lastIssueDate =
    rows.find((r) => r.transaction_type === "MATERIAL_ISSUE")?.created_at ??
    null;

  return { lastReceiptDate, lastIssueDate, lastMovementDate };
}
