import { supabase } from "../config/supabase";
import { applyStockMovement } from "./inventoryTransactionService";
import type { PackageDetailRow, ReceiptHeader } from "./receiptService";

export interface SapMatchedLineItem {
  material_code: string;
  material_description: string;
  item_no: string;
  quantity_103: number;
  quantity_105: number;
  unit_of_entry: string;
  sap_103_doc: string | null;
  sap_103_date: string | null;
  sap_105_doc: string | null;
  sap_105_date: string | null;
  storage_location: string;
  vendor: string | null;
  invoice_number: string | null;
  purchase_order: string | null;
  status: "103_ONLY" | "105_POSTED" | "PARTIAL_105";
}

export interface DrcSapLookupResult {
  hasMatches: boolean;
  has103: boolean;
  has105: boolean;
  poNumber: string | null;
  invoiceNumber: string | null;
  searchedInvoice?: string | null;
  invoiceMatched?: boolean;
  vendorName: string | null;
  doc103List: string[];
  doc105List: string[];
  primary103Doc: string | null;
  primary103Date: string | null;
  primary105Doc: string | null;
  primary105Date: string | null;
  items: SapMatchedLineItem[];
  rawMovementCount: number;
}

export interface ExistingBinAllocation {
  material_code: string;
  location_code: string;
  quantity: number;
}

export interface MaterialBinAllocationInput {
  material_code: string;
  material_description: string;
  quantity: number;
  uom: string;
  location_code: string;
  item_no?: string;
  sap_103_doc?: string;
  sap_105_doc?: string;
}

export interface AllocateDrcMaterialsParams {
  receiptId: number;
  drcNumber: string;
  poNumber: string;
  invoiceNumber: string;
  vendorName: string;
  doc103?: string | null;
  doc105?: string | null;
  doc105Date?: string | null;
  operatorName: string;
  allocations: MaterialBinAllocationInput[];
  closeDrc?: boolean;
}

export interface AllocateDrcMaterialsResult {
  success: boolean;
  allocatedCount: number;
  totalQuantity: number;
  drcClosed: boolean;
  errors: string[];
  updatedReceipt: ReceiptHeader | null;
}

/**
 * Normalizes strings by trimming and stripping leading zeroes for comparison.
 */
function normalizeDocCode(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  // Strip leading zeroes for digits-only strings (e.g. "0357" -> "357")
  if (/^\d+$/.test(trimmed)) {
    return trimmed.replace(/^0+/, "") || "0";
  }
  return trimmed;
}

function cleanAlphaNum(val: string | null | undefined): string {
  if (!val) return "";
  return String(val).replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

/**
 * Extracts 3-digit SAP movement code (e.g. "103", "105", "101") from movement type strings
 * that may contain descriptions like "105 - GR from blocked stock" or "103/GR".
 */
export function extractMovementCode(mvt: string | null | undefined): string {
  if (!mvt) return "";
  const s = String(mvt).trim();
  const match = s.match(/\b(101|102|103|104|105|106)\b/);
  if (match) return match[1];
  const digits = s.replace(/\D/g, "");
  if (digits.length >= 3) return digits.slice(0, 3);
  return s;
}

export function isPoMatch(
  targetPo: string | null | undefined,
  rowPo: string | null | undefined
): boolean {
  if (!targetPo || !rowPo) return false;
  const tNorm = normalizeDocCode(targetPo).toLowerCase();
  const rNorm = normalizeDocCode(rowPo).toLowerCase();
  if (tNorm && rNorm && tNorm === rNorm) return true;
  const tClean = String(targetPo).trim().toLowerCase();
  const rClean = String(rowPo).trim().toLowerCase();
  if (tClean === rClean) return true;
  const tAlpha = cleanAlphaNum(targetPo);
  const rAlpha = cleanAlphaNum(rowPo);
  if (tAlpha && rAlpha && tAlpha === rAlpha) return true;
  return false;
}

export function isInvoiceMatch(
  targetInvoice: string,
  rowInvoice: string | null | undefined,
  rowDocText: string | null | undefined
): boolean {
  if (!targetInvoice) return false;
  const tClean = targetInvoice.trim().toLowerCase();
  if (!tClean) return false;
  const tAlpha = cleanAlphaNum(targetInvoice);
  const tNorm = normalizeDocCode(targetInvoice).toLowerCase();

  const rInv = String(rowInvoice || "").trim().toLowerCase();
  const rAlpha = cleanAlphaNum(rowInvoice);
  const rNorm = normalizeDocCode(rowInvoice).toLowerCase();
  const rText = String(rowDocText || "").trim().toLowerCase();
  const rTextAlpha = cleanAlphaNum(rowDocText);

  // 1. Direct exact equality
  if (rInv && (rInv === tClean || (rNorm && rNorm === tNorm))) return true;

  // 2. Alphanumeric canonical match (handles "H-16189" vs "H16189" vs "H 16189" vs "H/16189")
  if (tAlpha && rAlpha && tAlpha === rAlpha) return true;

  // 3. Exact digits match when prefix was omitted (e.g. "GJ3742" vs "3742" where digits >= 4)
  const tDigits = tClean.replace(/\D/g, "");
  const rDigits = rInv.replace(/\D/g, "");
  if (tDigits.length >= 4 && rDigits.length >= 4 && tDigits === rDigits) {
    return true;
  }

  // 4. Check document header text with boundary checks (prevents partial false matches)
  if (rText) {
    if (rText === tClean) return true;
    if (tAlpha && rTextAlpha === tAlpha) return true;

    // Check if header text contains the target invoice as a distinct token
    if (tClean.length >= 3 && rText.includes(tClean)) {
      const escaped = tClean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(^|[^a-zA-Z0-9])${escaped}([^a-zA-Z0-9]|$)`, "i");
      if (regex.test(rText)) return true;
    }

    if (tAlpha.length >= 4 && rTextAlpha.includes(tAlpha)) {
      const escapedAlpha = tAlpha.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regexAlpha = new RegExp(`(^|[^a-zA-Z0-9])${escapedAlpha}([^a-zA-Z0-9]|$)`, "i");
      if (regexAlpha.test(rText)) return true;
    }
  }

  return false;
}

const roundQty = (val: number) => Math.round((val + Number.EPSILON) * 1000) / 1000;

/**
 * Queries `sap_material_documents` (MB51 history) by PO Number and/or Invoice Number.
 * Matches 103 (GR into blocked stock) and 105 (GR release from blocked stock) records.
 */
export async function findSapDocumentsForDrc(
  poNumber?: string | null,
  invoiceNumber?: string | null
): Promise<DrcSapLookupResult> {
  const cleanPo = poNumber ? poNumber.trim() : "";
  const cleanInv = invoiceNumber ? invoiceNumber.trim() : "";

  const emptyResult: DrcSapLookupResult = {
    hasMatches: false,
    has103: false,
    has105: false,
    poNumber: cleanPo || null,
    invoiceNumber: cleanInv || null,
    searchedInvoice: cleanInv || null,
    invoiceMatched: false,
    vendorName: null,
    doc103List: [],
    doc105List: [],
    primary103Doc: null,
    primary103Date: null,
    primary105Doc: null,
    primary105Date: null,
    items: [],
    rawMovementCount: 0,
  };

  if (!cleanPo && !cleanInv) {
    return emptyResult;
  }

  try {
    let query = supabase.from("sap_material_documents").select("*");

    const poNorm = normalizeDocCode(cleanPo);
    const invNorm = normalizeDocCode(cleanInv);

    // Filter by relevant receipt movement types in SAP:
    // 103 (GR Blocked), 104 (103 Reversal), 105 (GR Release), 106 (105 Reversal),
    // 101 (Direct GR), 102 (101 Reversal)
    const validReceiptMovements = new Set(["103", "104", "105", "106", "101", "102"]);

    // Build targeted query conditions
    // Query by PO and/or Invoice so that GeM orders or DRCs with GeM contract numbers
    // (e.g. GEMC-...) can match their SAP MB51 movements via the invoice number,
    // while standard SAP POs match via purchase_order.
    const filterClauses: string[] = [];

    if (cleanPo) {
      filterClauses.push(`purchase_order.eq.${cleanPo}`);
      if (poNorm && poNorm !== cleanPo) {
        filterClauses.push(`purchase_order.eq.${poNorm}`);
      }
      if (/^\d+$/.test(cleanPo) && cleanPo.length < 10) {
        filterClauses.push(`purchase_order.eq.${cleanPo.padStart(10, "0")}`);
      }
      // If cleanPo contains GeM order prefix, also search in document_header_text or purchase_order
      if (/gem/i.test(cleanPo)) {
        filterClauses.push(`document_header_text.ilike.%${cleanPo}%`);
        filterClauses.push(`purchase_order.ilike.%${cleanPo}%`);
      }
    }

    if (cleanInv) {
      filterClauses.push(`invoice_number.eq.${cleanInv}`);
      filterClauses.push(`invoice_number.ilike.%${cleanInv}%`);
      filterClauses.push(`document_header_text.ilike.%${cleanInv}%`);
      if (invNorm && invNorm !== cleanInv) {
        filterClauses.push(`invoice_number.eq.${invNorm}`);
      }
    }

    if (filterClauses.length > 0) {
      query = query.or(filterClauses.join(","));
    }

    const { data: rawRows, error } = await query
      .order("posting_date", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      console.warn("Could not query sap_material_documents:", error.message);
      return emptyResult;
    }

    const rows = (rawRows ?? []).filter((r) => {
      const mvtCode = extractMovementCode(r.movement_type);
      return validReceiptMovements.has(mvtCode);
    });

    if (rows.length === 0) {
      return emptyResult;
    }

    // Matching logic strictly honoring PO and Invoice:
    let invoiceMatched = false;
    let selectedRows: typeof rows = [];

    // Helper to enrich matched rows with corresponding 105 movements on the same SAP PO
    const enrichWithPoMovements = async (
      matchedDirectRows: typeof rows,
      targetPo?: string | null,
      targetInv?: string | null
    ): Promise<typeof rows> => {
      const matched103Docs = new Set<string>();

      for (const r of matchedDirectRows) {
        const mvt = extractMovementCode(r.movement_type);
        const doc = String(r.material_document || "").trim();
        if (mvt === "103" && doc) matched103Docs.add(doc);
      }

      // Check if we need to query additional movements for this PO from the database
      let poolOfPoRows = rows.filter(
        (r) => targetPo && isPoMatch(targetPo, r.purchase_order)
      );

      const has105InPool = poolOfPoRows.some((r) => {
        const m = extractMovementCode(r.movement_type);
        return m === "105" || m === "101";
      });

      if (!has105InPool && targetPo) {
        try {
          const { data: morePoRows } = await supabase
            .from("sap_material_documents")
            .select("*")
            .eq("purchase_order", targetPo)
            .order("posting_date", { ascending: true });
          if (morePoRows && morePoRows.length > 0) {
            const validMore = morePoRows.filter((r) =>
              validReceiptMovements.has(extractMovementCode(r.movement_type))
            );
            poolOfPoRows = [...poolOfPoRows, ...validMore];
          }
        } catch (e) {
          console.warn("Could not query additional PO movements:", e);
        }
      }

      const combinedMap = new Map<string, (typeof rows)[0]>();
      matchedDirectRows.forEach((r) =>
        combinedMap.set(`${r.id}_${r.material_document}`, r)
      );

      for (const r of poolOfPoRows) {
        const mvt = extractMovementCode(r.movement_type);
        if (mvt === "105" || mvt === "106" || mvt === "101" || mvt === "102") {
          const text = String(r.document_header_text || "");
          const invField = String(r.invoice_number || "");

          let matchesThisDelivery = false;
          // 1. Explicit invoice match on this 105 record
          if (targetInv && isInvoiceMatch(targetInv, r.invoice_number, r.document_header_text)) {
            matchesThisDelivery = true;
          }
          // 2. Document header text or invoice references the matched 103 material document
          for (const d103 of matched103Docs) {
            if (text.includes(d103) || invField.includes(d103)) {
              // Ensure it does not have a conflicting different invoice
              if (!targetInv || !r.invoice_number || isInvoiceMatch(targetInv, r.invoice_number, r.document_header_text)) {
                matchesThisDelivery = true;
              }
            }
          }

          if (matchesThisDelivery) {
            combinedMap.set(`${r.id}_${r.material_document}`, r);
          }
        }
      }

      return Array.from(combinedMap.values());
    };

    if (cleanPo && cleanInv) {
      // 1. Filter rows matching the PO directly
      const poRows = rows.filter((r) => isPoMatch(cleanPo, r.purchase_order));

      // 2. Check which rows on this PO explicitly match the Invoice
      const directInvRows = poRows.filter((r) =>
        isInvoiceMatch(cleanInv, r.invoice_number, r.document_header_text)
      );

      if (directInvRows.length > 0) {
        invoiceMatched = true;
        selectedRows = await enrichWithPoMovements(directInvRows, cleanPo, cleanInv);
      } else {
        // Fallback: check if invoice matches any rows across the entire MB51 history
        // (Handles GeM orders where DRC recorded GeM contract number, but SAP recorded internal SAP PO)
        const invRows = rows.filter((r) =>
          isInvoiceMatch(cleanInv, r.invoice_number, r.document_header_text)
        );
        if (invRows.length > 0) {
          invoiceMatched = true;
          const discoveredPo = invRows.find((r) => r.purchase_order)?.purchase_order;
          selectedRows = await enrichWithPoMovements(invRows, discoveredPo, cleanInv);
        } else {
          // CRITICAL FIX: If invoice was provided on DRC, we MUST NEVER fall back to other deliveries on this PO!
          // A single PO often has multiple deliveries/invoices across weeks/months.
          // Falling back to PO alone when the invoice doesn't exist in SAP would incorrectly attach
          // 103/105 document numbers from PREVIOUS invoices (as happened with DRC/26-27/114 and invoice GJ3742).
          selectedRows = [];
        }
      }
    } else if (cleanPo) {
      // Only when NO invoice was provided on the DRC can we match by PO alone
      selectedRows = rows.filter((r) => isPoMatch(cleanPo, r.purchase_order));
    } else if (cleanInv) {
      const invRows = rows.filter((r) =>
        isInvoiceMatch(cleanInv, r.invoice_number, r.document_header_text)
      );
      if (invRows.length > 0) {
        invoiceMatched = true;
        const discoveredPo = invRows.find((r) => r.purchase_order)?.purchase_order;
        selectedRows = await enrichWithPoMovements(invRows, discoveredPo, cleanInv);
      } else {
        selectedRows = [];
      }
    }


    if (selectedRows.length === 0) {
      return emptyResult;
    }

    // Categorize documents and movements
    const doc103Set = new Set<string>();
    const doc105Set = new Set<string>();
    let latest103Date: string | null = null;
    let latest105Date: string | null = null;
    let primary103Doc: string | null = null;
    let primary105Doc: string | null = null;
    let foundVendor: string | null = null;

    // Group items by material and PO item
    const itemMap = new Map<
      string,
      {
        material_code: string;
        material_description: string;
        item_no: string;
        qty103: number;
        qty105: number;
        uom: string;
        doc103: string | null;
        date103: string | null;
        doc105: string | null;
        date105: string | null;
        storage_location: string;
        vendor: string | null;
        invoice_number: string | null;
        purchase_order: string | null;
      }
    >();

    for (const r of selectedRows) {
      const mvt = extractMovementCode(r.movement_type);
      const doc = String(r.material_document || "").trim();
      const date = r.posting_date ? String(r.posting_date).slice(0, 10) : null;
      const matCode = String(r.material_code || "").trim();
      const itemNo = String(r.item || r.material_doc_item || "1").trim();
      const qty = Number(r.quantity) || 0;
      const uom = String(r.unit_of_entry || "EA").trim();
      const desc = String(r.material_description || "").trim();
      const sloc = String(r.storage_location || "").trim();
      const vendor = r.vendor ? String(r.vendor).trim() : null;
      const inv = r.invoice_number ? String(r.invoice_number).trim() : null;
      const po = r.purchase_order ? String(r.purchase_order).trim() : null;

      if (vendor && !foundVendor) {
        foundVendor = vendor;
      }

      if (mvt === "103") {
        if (doc) {
          doc103Set.add(doc);
          if (!primary103Doc) primary103Doc = doc;
        }
        if (date && (!latest103Date || date >= latest103Date)) {
          latest103Date = date;
          if (doc) primary103Doc = doc;
        }
      } else if (mvt === "105" || mvt === "101") {
        if (doc) {
          doc105Set.add(doc);
          if (!primary105Doc) primary105Doc = doc;
        }
        if (date && (!latest105Date || date >= latest105Date)) {
          latest105Date = date;
          if (doc) primary105Doc = doc;
        }
      }

      // Group items by material code & item number
      const key = `${matCode}__${itemNo}`;
      let item = itemMap.get(key);
      if (!item) {
        item = {
          material_code: matCode,
          material_description: desc,
          item_no: itemNo,
          qty103: 0,
          qty105: 0,
          uom,
          doc103: null,
          date103: null,
          doc105: null,
          date105: null,
          storage_location: sloc,
          vendor,
          invoice_number: inv,
          purchase_order: po,
        };
        itemMap.set(key, item);
      }

      if (desc && !item.material_description) {
        item.material_description = desc;
      }
      if (inv && !item.invoice_number) {
        item.invoice_number = inv;
      }

      if (mvt === "103") {
        item.qty103 += qty;
        item.doc103 = doc || item.doc103;
        item.date103 = date || item.date103;
      } else if (mvt === "104") {
        item.qty103 -= Math.abs(qty);
      } else if (mvt === "105" || mvt === "101") {
        item.qty105 += qty;
        item.doc105 = doc || item.doc105;
        item.date105 = date || item.date105;
      } else if (mvt === "106" || mvt === "102") {
        item.qty105 -= Math.abs(qty);
      }
    }

    const items: SapMatchedLineItem[] = [];
    for (const item of itemMap.values()) {
      const q103 = roundQty(Math.max(0, item.qty103));
      const q105 = roundQty(Math.max(0, item.qty105));

      // Exclude line items with zero received quantity
      if (q103 === 0 && q105 === 0) {
        continue;
      }

      let status: SapMatchedLineItem["status"] = "103_ONLY";
      if (q105 > 0 && q105 >= q103) {
        status = "105_POSTED";
      } else if (q105 > 0) {
        status = "PARTIAL_105";
      }

      items.push({
        material_code: item.material_code,
        material_description: item.material_description,
        item_no: item.item_no,
        quantity_103: q103,
        quantity_105: q105,
        unit_of_entry: item.uom,
        sap_103_doc: item.doc103,
        sap_103_date: item.date103,
        sap_105_doc: item.doc105,
        sap_105_date: item.date105,
        storage_location: item.storage_location,
        vendor: item.vendor,
        invoice_number: item.invoice_number,
        purchase_order: item.purchase_order,
        status,
      });
    }

    const doc103List = Array.from(doc103Set);
    const doc105List = Array.from(doc105Set);
    const discoveredPo =
      selectedRows.find((r) => r.purchase_order)?.purchase_order || cleanPo || null;

    return {
      hasMatches: items.length > 0 || doc103List.length > 0 || doc105List.length > 0,
      has103: doc103List.length > 0,
      has105: doc105List.length > 0,
      poNumber: discoveredPo,
      invoiceNumber: cleanInv || null,
      searchedInvoice: cleanInv || null,
      invoiceMatched,
      vendorName: foundVendor,
      doc103List,
      doc105List,
      primary103Doc: primary103Doc || doc103List[0] || null,
      primary103Date: latest103Date,
      primary105Doc: primary105Doc || doc105List[0] || null,
      primary105Date: latest105Date,
      items,
      rawMovementCount: selectedRows.length,
    };
  } catch (err) {
    console.error("findSapDocumentsForDrc error:", err);
    return emptyResult;
  }
}

/**
 * Fetches existing physical bin locations and current quantities for a list of material codes.
 * Helps warehouse staff see where materials are already stored when assigning bins.
 */
export async function fetchExistingAllocationsForMaterials(
  materialCodes: string[]
): Promise<ExistingBinAllocation[]> {
  if (materialCodes.length === 0) return [];

  const uniqueCodes = Array.from(new Set(materialCodes.filter((c) => !!c.trim())));
  if (uniqueCodes.length === 0) return [];

  try {
    const { data, error } = await supabase
      .from("material_allocation")
      .select("material_code, location_code, quantity")
      .in("material_code", uniqueCodes)
      .gt("quantity", 0);

    if (error) {
      console.warn("fetchExistingAllocationsForMaterials failed:", error.message);
      return [];
    }

    return (data ?? []).map((row) => ({
      material_code: row.material_code,
      location_code: row.location_code,
      quantity: Number(row.quantity),
    }));
  } catch (err) {
    console.warn("fetchExistingAllocationsForMaterials exception:", err);
    return [];
  }
}

/**
 * Ensures that all materials exist in `material_master` before allocating stock.
 * Auto-creates active records if any material code is new.
 */
async function ensureMaterialsExist(
  items: { material_code: string; material_description: string; uom: string }[]
): Promise<void> {
  const codes = Array.from(new Set(items.map((i) => i.material_code.trim()))).filter(Boolean);
  if (codes.length === 0) return;

  const { data: existing, error } = await supabase
    .from("material_master")
    .select("material_code")
    .in("material_code", codes);

  if (error) {
    console.warn("Could not check material_master:", error.message);
    return;
  }

  const existingSet = new Set((existing ?? []).map((m) => m.material_code));
  const missing = items.filter((i) => !existingSet.has(i.material_code.trim()));

  if (missing.length === 0) return;

  const toInsert = missing.map((item) => ({
    material_code: item.material_code.trim(),
    short_description: item.material_description.trim() || item.material_code.trim(),
    uom: item.uom.trim() || "NOS",
    hsn_code: "",
    material_group: item.material_code.trim().slice(0, 2),
    is_active: true,
  }));

  try {
    const { error: insertErr } = await supabase.from("material_master").insert(toInsert);
    if (insertErr) {
      console.warn("ensureMaterialsExist insert error:", insertErr.message);
    }
  } catch (err) {
    console.warn("ensureMaterialsExist exception:", err);
  }
}

/**
 * Allocates received materials directly into physical bin locations from the DRC interface.
 * Updates `material_allocation`, creates audit trail in `inventory_transactions`,
 * updates DRC package_details with allocated bins, and closes the DRC if requested.
 */
export async function allocateDrcMaterialsToBins(
  params: AllocateDrcMaterialsParams
): Promise<AllocateDrcMaterialsResult> {
  const {
    receiptId,
    drcNumber,
    poNumber,
    invoiceNumber,
    vendorName,
    doc103,
    doc105,
    doc105Date,
    operatorName,
    allocations,
    closeDrc = true,
  } = params;

  const result: AllocateDrcMaterialsResult = {
    success: false,
    allocatedCount: 0,
    totalQuantity: 0,
    drcClosed: false,
    errors: [],
    updatedReceipt: null,
  };

  const validAllocations = allocations.filter(
    (a) => a.material_code.trim() && a.location_code.trim() && a.quantity > 0
  );

  if (validAllocations.length === 0) {
    result.errors.push("No valid materials and bin locations provided for allocation.");
    return result;
  }

  // 1. Ensure all materials exist in material_master
  await ensureMaterialsExist(validAllocations);

  // 2. Fetch current allocations for target locations
  const targetCodes = validAllocations.map((a) => a.material_code.trim());
  const targetLocations = validAllocations.map((a) => a.location_code.trim());

  const { data: existingAllocs, error: fetchAllocsError } = await supabase
    .from("material_allocation")
    .select("id, material_code, location_code, quantity")
    .in("material_code", targetCodes)
    .in("location_code", targetLocations);

  if (fetchAllocsError) {
    console.warn("Could not fetch target material_allocation:", fetchAllocsError.message);
  }

  const allocMap = new Map<string, { id: number; quantity: number }>();
  for (const row of existingAllocs ?? []) {
    allocMap.set(`${row.material_code}__${row.location_code}`, {
      id: row.id,
      quantity: Number(row.quantity),
    });
  }

  // 3. Apply stock movement for each item
  const allocatedDetailsMap = new Map<
    string,
    { location_code: string; allocated_qty: number }
  >();

  for (const item of validAllocations) {
    const matCode = item.material_code.trim();
    const locCode = item.location_code.trim();
    const qty = Number(item.quantity);

    try {
      const existing = allocMap.get(`${matCode}__${locCode}`);
      const prevQty = existing ? existing.quantity : 0;
      const newQty = prevQty + qty;

      const remarks = `DRC: ${drcNumber} | PO: ${poNumber || "-"} | Inv: ${
        invoiceNumber || "-"
      } | 103 Doc: ${doc103 || "-"} | 105 GRN: ${doc105 || "-"} | Vendor: ${
        vendorName || "-"
      }`;

      await applyStockMovement({
        materialCode: matCode,
        locationCode: locCode,
        prevQuantity: prevQty,
        newQuantity: newQty,
        allocationId: existing?.id,
        transactionType: "MATERIAL_RECEIPT",
        referenceType: "DRC_105_ALLOCATION",
        referenceNumber: drcNumber,
        reason: "105 Goods Receipt & Bin Allocation",
        remarks,
        createdBy: operatorName,
      });

      // Update local map in case same material is allocated again
      allocMap.set(`${matCode}__${locCode}`, {
        id: existing?.id ?? -1,
        quantity: newQty,
      });

      allocatedDetailsMap.set(matCode, {
        location_code: locCode,
        allocated_qty: qty,
      });

      result.allocatedCount += 1;
      result.totalQuantity += qty;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Failed allocating ${matCode} to ${locCode}: ${errMsg}`);
    }
  }

  if (result.allocatedCount === 0) {
    return result;
  }

  // 4. Fetch the existing DRC header to update package_details and status
  const { data: currentReceipt, error: fetchDrcError } = await supabase
    .from("receipt_header")
    .select("*")
    .eq("id", receiptId)
    .single();

  if (fetchDrcError || !currentReceipt) {
    result.errors.push("Failed to reload DRC record after allocation.");
    return result;
  }

  const nowIso = new Date().toISOString();
  // Target items: prefer currentReceipt.sap_items; if empty, check if package_details has legacy material items
  const currentSapItems: PackageDetailRow[] =
    currentReceipt.sap_items && currentReceipt.sap_items.length > 0
      ? currentReceipt.sap_items
      : (currentReceipt.package_details || []).filter((p: PackageDetailRow) => Boolean(p.material_code));

  // Update or append allocated lines in sap_items
  const updatedSapItems: PackageDetailRow[] = currentSapItems.map((item) => {
    const matCode = item.material_code?.trim() || "";
    const allocInfo = matCode ? allocatedDetailsMap.get(matCode) : undefined;
    if (allocInfo) {
      return {
        ...item,
        bin_location: allocInfo.location_code,
        bin_allocated: true,
        allocated_qty: allocInfo.allocated_qty,
        allocated_at: nowIso,
        allocated_by: operatorName,
        sap_103_doc: doc103 || item.sap_103_doc,
        sap_105_doc: doc105 || item.sap_105_doc,
      };
    }
    return item;
  });

  // If there are valid allocations that weren't already represented in sap_items, add them
  for (const item of validAllocations) {
    const exists = updatedSapItems.some(
      (p) => p.material_code?.trim() === item.material_code.trim()
    );
    if (!exists) {
      updatedSapItems.push({
        quantity: String(item.quantity),
        package_type: item.uom || "NOS",
        description: item.material_description || item.material_code,
        material_code: item.material_code.trim(),
        uom: item.uom || "NOS",
        item_no: item.item_no || "1",
        sap_103_doc: doc103 || undefined,
        sap_105_doc: doc105 || undefined,
        bin_location: item.location_code.trim(),
        bin_allocated: true,
        allocated_qty: item.quantity,
        allocated_at: nowIso,
        allocated_by: operatorName,
      });
    }
  }

  // 5. Update DRC header: Store material bin allocations in sap_items
  const updatePayload: Record<string, unknown> = {
    sap_items: updatedSapItems,
    updated_at: nowIso,
  };

  // If package_details had legacy material items, restore genuine physical packages
  const currentPkgs: PackageDetailRow[] = currentReceipt.package_details || [];
  if (currentPkgs.some((p) => p.material_code && p.material_code.trim())) {
    const purePhysical = currentPkgs.filter((p) => !p.material_code || !p.material_code.trim());
    if (purePhysical.length > 0) {
      updatePayload.package_details = purePhysical;
    } else {
      updatePayload.package_details = [
        {
          quantity: String(currentReceipt.package_count || 1),
          package_type: currentReceipt.package_type || "C/Box",
          description: "",
        },
      ];
    }
  }

  if (doc105) {
    updatePayload.grn_number = doc105;
    updatePayload.inspection_status = "GRN created";
    updatePayload.status = "Closed";
  }
  if (doc105Date) {
    updatePayload.grn_date = doc105Date;
  }

  if (closeDrc) {
    updatePayload.status = "Closed";
    updatePayload.inspection_status = "GRN created";
    updatePayload.closed_date = nowIso;
    updatePayload.closed_by = operatorName;
    result.drcClosed = true;
  }

  // Attempt to save to receipt_header
  const extendedPayload: Record<string, unknown> = {
    ...updatePayload,
    sap_103_doc: doc103 || null,
    sap_105_doc: doc105 || null,
    sap_105_date: doc105Date || null,
  };

  let updateRes = await supabase
    .from("receipt_header")
    .update(extendedPayload)
    .eq("id", receiptId)
    .select()
    .single();

  if (updateRes.error) {
    // Fallback: If 0024 migration columns are not yet applied, update without them
    console.warn(
      "Extended DRC update failed, falling back to core columns:",
      updateRes.error.message
    );
    updateRes = await supabase
      .from("receipt_header")
      .update(updatePayload)
      .eq("id", receiptId)
      .select()
      .single();
  }

  if (updateRes.error) {
    result.errors.push(`Could not update DRC header: ${updateRes.error.message}`);
  } else {
    result.updatedReceipt = updateRes.data as ReceiptHeader;
  }

  result.success = result.allocatedCount > 0;
  return result;
}

/**
 * Converts SAP 103 matched line items into PackageDetailRow[] format for DRC creation/editing.
 */
export function convertSapItemsToPackageDetails(
  items: SapMatchedLineItem[]
): PackageDetailRow[] {
  return items.map((item) => ({
    quantity: String(item.quantity_103 || item.quantity_105 || 1),
    package_type: item.unit_of_entry || "NOS",
    description: item.material_description || `Material ${item.material_code}`,
    material_code: item.material_code,
    uom: item.unit_of_entry || "NOS",
    item_no: item.item_no,
    sap_103_doc: item.sap_103_doc || undefined,
    sap_103_date: item.sap_103_date || undefined,
    sap_105_doc: item.sap_105_doc || undefined,
    sap_105_date: item.sap_105_date || undefined,
    storage_location: item.storage_location || undefined,
    bin_allocated: false,
  }));
}

export interface DrcSyncOutcome {
  updated: boolean;
  unlinked?: boolean;
  drcNumber: string;
  receiptId: number;
  doc103: string | null;
  doc105: string | null;
  isGrnClosed: boolean;
  reason?: string;
  updatedReceipt?: ReceiptHeader;
}

export interface BatchDrcSyncResult {
  totalProcessed: number;
  updatedCount: number;
  unlinkedCount: number;
  grnClosedCount: number;
  doc103Count: number;
  alreadySyncedCount: number;
  noMatchCount: number;
  outcomes: DrcSyncOutcome[];
}

/**
 * Automatically inspects loaded DRCs and detects any DRC whose attached
 * sap_103_doc / sap_105_doc does not belong to its invoice in MB51 history.
 * If a mismatch is detected (e.g. DRC/26-27/114 with invoice GJ3742 falsely
 * linked to previous delivery documents on PO 72600695), it immediately unlinks
 * the erroneous documents and reverts the DRC to "Pending Inspection".
 */
export async function reconcileAndFixMismatchedDrcs(
  receipts: ReceiptHeader[]
): Promise<{ fixedCount: number; updatedReceipts: ReceiptHeader[] }> {
  let fixedCount = 0;
  const updatedReceipts: ReceiptHeader[] = [];

  for (const r of receipts) {
    const inv = (r.invoice_number || "").trim();
    const po = (r.sap_po_number || r.po_number || "").trim();
    const hasAttachedSap = Boolean(
      r.sap_103_doc ||
        r.sap_105_doc ||
        r.grn_number ||
        r.inspection_status === "GRN created" ||
        (r.status === "Closed" && !r.grn_number)
    );

    if (!inv || !hasAttachedSap) {
      updatedReceipts.push(r);
      continue;
    }

    try {
      const lookup = await findSapDocumentsForDrc(po, inv);
      // If invoice has NO matches in SAP MB51 history at all, yet the DRC has SAP docs:
      if (!lookup.hasMatches) {
        fixedCount++;
        console.warn(
          `Auto-reconciling DRC ${r.drc_number}: invoice ${inv} has no SAP MB51 records, clearing false 103/105 data.`
        );
        const cleanupData = {
          sap_103_doc: null,
          sap_103_date: null,
          sap_105_doc: null,
          sap_105_date: null,
          grn_number: null,
          grn_date: null,
          status: "Pending Inspection" as const,
          inspection_status: "Pending inspection" as const,
          closed_date: null,
          closed_by: null,
          sap_items: [],
        };
        const repairedReceipt: ReceiptHeader = {
          ...r,
          ...cleanupData,
        };

        // Persist to database in background
        supabase
          .from("receipt_header")
          .update(cleanupData)
          .eq("id", r.id)
          .then();

        updatedReceipts.push(repairedReceipt);
        continue;
      }
    } catch (e) {
      console.warn(`Error during reconcile of DRC ${r.drc_number}:`, e);
    }

    updatedReceipts.push(r);
  }

  return { fixedCount, updatedReceipts };
}

/**
 * Syncs a single DRC with SAP MB51 history matching STRICTLY on PO and Invoice.
 * Automatically maps 103 and 105 documents, updates status to "Closed" / "GRN created"
 * if 105 is posted, and populates package details with material line items.
 */
export async function syncSingleDrcWithSap(
  receipt: ReceiptHeader
): Promise<DrcSyncOutcome> {
  const po = (receipt.sap_po_number || receipt.po_number || "").trim();
  const inv = (receipt.invoice_number || "").trim();

  if (!po && !inv) {
    return {
      updated: false,
      drcNumber: receipt.drc_number,
      receiptId: receipt.id,
      doc103: null,
      doc105: null,
      isGrnClosed: false,
      reason: "No PO or Invoice provided in DRC",
    };
  }

  const lookupResult = await findSapDocumentsForDrc(po, inv);
  if (!lookupResult.hasMatches) {
    // If DRC previously had false SAP documents attached that do not match its invoice:
    const hasErroneousSapData =
      Boolean(receipt.sap_103_doc) ||
      Boolean(receipt.sap_105_doc) ||
      Boolean(receipt.grn_number) ||
      receipt.inspection_status === "GRN created" ||
      receipt.status === "Closed";

    if (hasErroneousSapData && inv) {
      console.warn(
        `Cleaning up mismatched SAP documents from DRC ${receipt.drc_number}: invoice ${inv} has no SAP transactions.`
      );
      const cleanupUpdate: Record<string, unknown> = {
        sap_103_doc: null,
        sap_103_date: null,
        sap_105_doc: null,
        sap_105_date: null,
        grn_number: null,
        grn_date: null,
        status: "Pending Inspection",
        inspection_status: "Pending inspection",
        closed_date: null,
        closed_by: null,
        sap_items: [],
      };

      try {
        const { data: cleanedHeader } = await supabase
          .from("receipt_header")
          .update(cleanupUpdate)
          .eq("id", receipt.id)
          .select()
          .single();

        return {
          updated: true,
          unlinked: true,
          drcNumber: receipt.drc_number,
          receiptId: receipt.id,
          doc103: null,
          doc105: null,
          isGrnClosed: false,
          reason: "Un-linked mismatched SAP documents (no SAP transaction for this invoice)",
          updatedReceipt: (cleanedHeader as ReceiptHeader) || undefined,
        };
      } catch (e) {
        console.warn("Could not clean up receipt in database:", e);
      }
    }

    return {
      updated: false,
      drcNumber: receipt.drc_number,
      receiptId: receipt.id,
      doc103: null,
      doc105: null,
      isGrnClosed: false,
      reason: "No matching MB51 records found for PO & Invoice",
    };
  }

  const doc103 =
    lookupResult.primary103Doc ||
    lookupResult.items.find((i) => i.sap_103_doc)?.sap_103_doc ||
    null;
  const date103 =
    lookupResult.primary103Date ||
    lookupResult.items.find((i) => i.sap_103_date)?.sap_103_date ||
    null;
  const doc105 =
    lookupResult.primary105Doc ||
    lookupResult.items.find((i) => i.sap_105_doc)?.sap_105_doc ||
    null;
  const date105 =
    lookupResult.primary105Date ||
    lookupResult.items.find((i) => i.sap_105_date)?.sap_105_date ||
    null;

  const headerUpdate: Record<string, unknown> = {};

  if (doc103 && receipt.sap_103_doc !== doc103) {
    headerUpdate.sap_103_doc = doc103;
    if (date103) headerUpdate.sap_103_date = date103;
  }

  if (doc105) {
    if (receipt.sap_105_doc !== doc105 || receipt.grn_number !== doc105) {
      headerUpdate.sap_105_doc = doc105;
      headerUpdate.grn_number = doc105;
    }
    if (date105) {
      headerUpdate.sap_105_date = date105;
      headerUpdate.grn_date = date105.split("T")[0];
    }
    if (receipt.status !== "Closed") {
      headerUpdate.status = "Closed";
      headerUpdate.closed_date = receipt.closed_date || new Date().toISOString();
    }
    if (receipt.inspection_status !== "GRN created") {
      headerUpdate.inspection_status = "GRN created";
    }
  }

  // Store fetched SAP line items in sap_items (NEVER overwrite package_details)
  if (lookupResult.items.length > 0) {
    const fetchedSapItems = convertSapItemsToPackageDetails(lookupResult.items);
    const existingSapItems: PackageDetailRow[] = receipt.sap_items || [];

    // Merge fetched SAP items with existing sap_items to preserve any existing bin allocations
    const mergedSapItems: PackageDetailRow[] = [...existingSapItems];
    for (const item of fetchedSapItems) {
      const idx = mergedSapItems.findIndex(
        (m) =>
          m.material_code &&
          m.material_code.toLowerCase() === (item.material_code || "").toLowerCase()
      );
      if (idx >= 0) {
        mergedSapItems[idx] = {
          ...item,
          bin_location: mergedSapItems[idx].bin_location || item.bin_location,
          bin_allocated: mergedSapItems[idx].bin_allocated ?? item.bin_allocated,
          allocated_qty: mergedSapItems[idx].allocated_qty ?? item.allocated_qty,
          allocated_at: mergedSapItems[idx].allocated_at || item.allocated_at,
          allocated_by: mergedSapItems[idx].allocated_by || item.allocated_by,
        };
      } else {
        mergedSapItems.push(item);
      }
    }
    headerUpdate.sap_items = mergedSapItems;

    // Check if package_details was previously polluted with material codes; if so, restore it
    const currentPkgs = receipt.package_details || [];
    if (currentPkgs.some((p) => Boolean(p.material_code && p.material_code.trim()))) {
      const purePhysical = currentPkgs.filter((p) => !p.material_code || !p.material_code.trim());
      if (purePhysical.length > 0) {
        headerUpdate.package_details = purePhysical;
      } else {
        // Reconstruct physical package from count and type (e.g. 1 x C/Box)
        headerUpdate.package_details = [
          {
            quantity: String(receipt.package_count || 1),
            package_type: receipt.package_type || "C/Box",
            description: "",
          },
        ];
      }
    }
  }

  if (
    lookupResult.vendorName &&
    (!receipt.vendor_name || receipt.vendor_name === "Unknown Vendor")
  ) {
    headerUpdate.vendor_name = lookupResult.vendorName;
  }
  if (lookupResult.poNumber) {
    const currentSapPo = (receipt.sap_po_number || "").trim();
    if (
      !currentSapPo ||
      /^gem/i.test(currentSapPo) ||
      currentSapPo !== lookupResult.poNumber
    ) {
      headerUpdate.sap_po_number = lookupResult.poNumber;
      if (
        !receipt.gem_order_number &&
        (/^gem/i.test(receipt.po_number || "") || /^gem/i.test(currentSapPo))
      ) {
        headerUpdate.gem_order_number =
          receipt.gem_order_number || currentSapPo || receipt.po_number;
      }
    }
  }

  if (Object.keys(headerUpdate).length === 0) {
    return {
      updated: false,
      drcNumber: receipt.drc_number,
      receiptId: receipt.id,
      doc103,
      doc105,
      isGrnClosed: !!(receipt.sap_105_doc || receipt.grn_number),
      reason: "Already up to date",
    };
  }

  // Perform resilient update with automatic fallbacks for check constraints and missing columns
  let updateError: { message: string } | null = null;
  let finalUpdatedHeader: ReceiptHeader | null = null;

  // Attempt 1: Full update with all fields
  const res1 = await supabase
    .from("receipt_header")
    .update(headerUpdate)
    .eq("id", receipt.id)
    .select()
    .single();

  if (!res1.error && res1.data) {
    finalUpdatedHeader = res1.data as ReceiptHeader;
  } else if (res1.error) {
    console.warn(`Attempt 1 update failed for DRC ${receipt.drc_number}:`, res1.error.message);
    updateError = res1.error;

    const errMsg = (res1.error.message || "").toLowerCase();
    const isConstraintErr =
      errMsg.includes("check constraint") ||
      errMsg.includes("inspection_status") ||
      errMsg.includes("receipt_header_inspection_status_check");
    const isColumnMissing =
      errMsg.includes("column") || errMsg.includes("does not exist");

    // Attempt 2: If check constraint failed on inspection_status, omit inspection_status.
    // (status = "Closed" and grn_number / sap_105_doc will still cause getDrcDisplayStatus to display "GRN created")
    const retryUpdate = { ...headerUpdate };
    if (isConstraintErr) {
      delete retryUpdate.inspection_status;
    }
    if (isColumnMissing) {
      if (errMsg.includes("sap_103_doc")) delete retryUpdate.sap_103_doc;
      if (errMsg.includes("sap_103_date")) delete retryUpdate.sap_103_date;
      if (errMsg.includes("sap_105_doc")) delete retryUpdate.sap_105_doc;
      if (errMsg.includes("sap_105_date")) delete retryUpdate.sap_105_date;
      if (errMsg.includes("sap_items")) delete retryUpdate.sap_items;
    }

    const res2 = await supabase
      .from("receipt_header")
      .update(retryUpdate)
      .eq("id", receipt.id)
      .select()
      .single();

    if (!res2.error && res2.data) {
      finalUpdatedHeader = res2.data as ReceiptHeader;
      updateError = null;
    } else if (res2.error) {
      console.warn(`Attempt 2 update failed for DRC ${receipt.drc_number}:`, res2.error.message);
      // Attempt 3: Core columns only (status, grn_number, grn_date, closed_date)
      const coreUpdate: Record<string, unknown> = {};
      if (doc105) {
        coreUpdate.status = "Closed";
        coreUpdate.grn_number = doc105;
        if (date105) coreUpdate.grn_date = date105.split("T")[0];
        coreUpdate.closed_date = receipt.closed_date || new Date().toISOString();
      }
      if (headerUpdate.vendor_name) coreUpdate.vendor_name = headerUpdate.vendor_name;
      if (headerUpdate.package_details) coreUpdate.package_details = headerUpdate.package_details;

      if (Object.keys(coreUpdate).length > 0) {
        const res3 = await supabase
          .from("receipt_header")
          .update(coreUpdate)
          .eq("id", receipt.id)
          .select()
          .single();

        if (!res3.error && res3.data) {
          finalUpdatedHeader = res3.data as ReceiptHeader;
          updateError = null;
        } else if (res3.error) {
          updateError = res3.error;
        }
      }
    }
  }

  if (updateError && !finalUpdatedHeader) {
    console.error(`Error updating DRC ${receipt.drc_number}:`, updateError);
    return {
      updated: false,
      drcNumber: receipt.drc_number,
      receiptId: receipt.id,
      doc103,
      doc105,
      isGrnClosed: false,
      reason: updateError.message,
    };
  }

  return {
    updated: true,
    drcNumber: receipt.drc_number,
    receiptId: receipt.id,
    doc103,
    doc105,
    isGrnClosed: !!doc105,
    updatedReceipt: finalUpdatedHeader as ReceiptHeader,
  };
}

/**
 * Common batch fetch function:
 * Automatically iterates through DRCs, fetches 103 and 105 SAP documents
 * matching strictly by PO and Invoice in MB51 history, and updates status and details.
 */
export async function syncAllDrcsWithSap(
  targetReceipts?: ReceiptHeader[]
): Promise<BatchDrcSyncResult> {
  let receiptsToSync = targetReceipts;
  if (!receiptsToSync || receiptsToSync.length === 0) {
    const { data, error } = await supabase
      .from("receipt_header")
      .select("*")
      .order("id", { ascending: false });
    if (error) {
      console.error("Error fetching receipts for SAP sync:", error);
      return {
        totalProcessed: 0,
        updatedCount: 0,
        unlinkedCount: 0,
        grnClosedCount: 0,
        doc103Count: 0,
        alreadySyncedCount: 0,
        noMatchCount: 0,
        outcomes: [],
      };
    }
    receiptsToSync = (data ?? []) as ReceiptHeader[];
  }

  // Filter receipts that have either PO or Invoice
  const eligible = receiptsToSync.filter(
    (r) =>
      (r.sap_po_number || r.po_number || "").trim() ||
      (r.invoice_number || "").trim()
  );

  const outcomes: DrcSyncOutcome[] = [];
  let updatedCount = 0;
  let unlinkedCount = 0;
  let grnClosedCount = 0;
  let doc103Count = 0;
  let alreadySyncedCount = 0;
  let noMatchCount = 0;

  // Process in small parallel chunks to avoid exhausting database connections
  const CHUNK_SIZE = 5;
  for (let i = 0; i < eligible.length; i += CHUNK_SIZE) {
    const chunk = eligible.slice(i, i + CHUNK_SIZE);
    const chunkResults = await Promise.all(
      chunk.map((r) => syncSingleDrcWithSap(r))
    );
    for (const res of chunkResults) {
      outcomes.push(res);
      if (res.updated) {
        updatedCount++;
        if (res.unlinked) unlinkedCount++;
        if (res.isGrnClosed) grnClosedCount++;
        else if (res.doc103) doc103Count++;
      } else if (res.reason === "Already up to date") {
        alreadySyncedCount++;
      } else if (
        res.reason === "No matching MB51 records found for PO & Invoice"
      ) {
        noMatchCount++;
      }
    }
  }

  return {
    totalProcessed: eligible.length,
    updatedCount,
    unlinkedCount,
    grnClosedCount,
    doc103Count,
    alreadySyncedCount,
    noMatchCount,
    outcomes,
  };
}
