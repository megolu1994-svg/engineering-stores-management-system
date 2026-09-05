import { supabase } from "../config/supabase";
import { normalizeMaterialCode } from "../utils/materialCode";
import { getBlockedMaterialCodes } from "./materialService";

const UNALLOCATED_LOCATION = "UNALLOCATED";
const CHUNK_SIZE = 100;
export const MAX_BULK_CODES = 2000;
// PostgREST caps a plain `.select()` at 1000 rows, so allocation rows are
// fetched per-chunk with explicit range pagination (same pattern as the
// dashboard's fetchAllAllocationRows).
const PAGE_SIZE = 1000;

export interface BulkMaterialSearchLocation {
  location_code: string;
  quantity: number;
}

export interface BulkMaterialSearchRow {
  material_code: string;
  short_description: string;
  uom: string;
  totalStock: number;
  /** Quantity sitting in the UNALLOCATED sentinel location. */
  unallocatedQty: number;
  /** Real (non-UNALLOCATED) locations, highest quantity first. */
  locations: BulkMaterialSearchLocation[];
}

export interface BulkMaterialSearchResult {
  rows: BulkMaterialSearchRow[];
  /** Input codes that have no row in Material Master. */
  notFound: string[];
}

function safeNumber(value: number | string | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Turns pasted Excel content into a deduped list of material codes.
 * Handles a column copy (one code per line), a row copy (tab-separated),
 * and comma/space/semicolon separated input; strips surrounding quotes;
 * drops blanks; dedupes case-insensitively while preserving first-seen
 * order.
 */
export function parseMaterialCodes(raw: string): string[] {
  const seen = new Set<string>();
  const codes: string[] = [];

  for (const token of raw.split(/[\s,;]+/)) {
    const code = token.trim().replace(/^['"`]+|['"`]+$/g, "");
    if (!code) continue;

    // Numeric material-code rule: IN000219 / 000219 normalize to 219.
    // Tokens with no digits at all can't match a numeric master and are
    // dropped (they are still shown by the dialog's raw count).
    const normalized = normalizeMaterialCode(code);
    if (!normalized) continue;

    if (seen.has(normalized)) continue;
    seen.add(normalized);
    codes.push(normalized);
  }

  return codes;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/** All material_allocation rows for a chunk of codes, paginated past the
 *  PostgREST 1000-row cap. */
async function fetchAllocationRowsForChunk(
  chunk: string[]
): Promise<{ material_code: string; location_code: string; quantity: number }[]> {
  const rows: { material_code: string; location_code: string; quantity: number }[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("material_allocation")
      .select("material_code, location_code, quantity")
      .in("material_code", chunk)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const page = (data ?? []) as {
      material_code: string;
      location_code: string;
      quantity: number;
    }[];

    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

/**
 * Looks up stock for many material codes at once. Material Master info is
 * fetched in `.in()` chunks; allocation rows (the source of every stock
 * quantity) are fetched for the same chunks with range pagination. Codes
 * without a Material Master row are returned separately as `notFound`.
 */
export async function bulkSearchMaterialsByCodes(
  codes: string[]
): Promise<BulkMaterialSearchResult> {
  const chunks = chunkArray(codes, CHUNK_SIZE);

  const materialMap = new Map<string, { short_description: string; uom: string }>();
  const allocationRows: {
    material_code: string;
    location_code: string;
    quantity: number;
  }[] = [];

  for (const chunk of chunks) {
    const [materialResult, allocRows] = await Promise.all([
      supabase
        .from("material_master")
        .select("material_code, short_description, uom")
        .in("material_code", chunk),
      fetchAllocationRowsForChunk(chunk),
    ]);

    if (materialResult.error) throw materialResult.error;

    for (const m of (materialResult.data ?? []) as {
      material_code: string;
      short_description: string;
      uom: string;
    }[]) {
      materialMap.set(m.material_code, {
        short_description: m.short_description,
        uom: m.uom,
      });
    }

    allocationRows.push(...allocRows);
  }

  const notFound = codes.filter((code) => !materialMap.has(code));

  // Blocked materials are hidden from every screen, including bulk
  // pick-list searches.
  let blockedCodes = new Set<string>();
  try {
    blockedCodes = await getBlockedMaterialCodes();
  } catch {
    // Fall through - blocked materials would only be visible briefly.
  }

  const rows: BulkMaterialSearchRow[] = [];

  for (const code of codes) {
    const info = materialMap.get(code);
    if (!info) continue;
    if (blockedCodes.has(code)) continue;

    let totalStock = 0;
    let unallocatedQty = 0;
    const locationMap = new Map<string, number>();

    for (const a of allocationRows) {
      if (a.material_code !== code) continue;
      const qty = safeNumber(a.quantity);
      totalStock += qty;
      if (a.location_code === UNALLOCATED_LOCATION) {
        unallocatedQty += qty;
      } else {
        locationMap.set(a.location_code, (locationMap.get(a.location_code) ?? 0) + qty);
      }
    }

    const locations = Array.from(locationMap.entries())
      .map(([location_code, quantity]) => ({ location_code, quantity }))
      .sort(
        (a, b) =>
          b.quantity - a.quantity || a.location_code.localeCompare(b.location_code)
      );

    rows.push({
      material_code: code,
      short_description: info.short_description,
      uom: info.uom,
      totalStock,
      unallocatedQty,
      locations,
    });
  }

  return { rows, notFound };
}
