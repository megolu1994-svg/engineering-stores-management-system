/**
 * SAP reference data used by the "Import SAP Material History" flow.
 *
 * The movement-type descriptions come from the user's SAP movement-type
 * list (the codes below 300 are transcribed verbatim from that PDF); the
 * higher codes (311/521/641/981/983) are the standard SAP descriptions for
 * the movement types that actually appear in the user's material-history
 * export. Unknown codes fall back to "Movement type <code>" so the import
 * never fails on a code we don't know.
 *
 * The storage-location descriptions come from the user's SAP SLoc list and
 * are used to auto-create Location Master rows with meaningful
 * descriptions (e.g. T004 -> "200-T-2001A / AA").
 */

export const SAP_MOVEMENT_TYPES: Record<string, string> = {
  "101": "GR goods receipt",
  "102": "GR for PO reversal",
  "103": "GR into blocked stck",
  "104": "GR to blocked rev.",
  "105": "GR from blocked stck",
  "106": "GR from blocked rev.",
  "107": "GR to Val. Bl. Stock",
  "108": "GR to Val. Bl. Rev.",
  "109": "GR fr. Val. Bl. St.",
  "110": "GR fr. Val. Bl. Rev.",
  "121": "GR subseq. adjustm.",
  "122": "RE return to vendor",
  "123": "RE rtrn vendor rev.",
  "124": "GR rtrn blocked stck",
  "125": "GR rtrn blkd stck rev",
  "131": "Goods receipt",
  "132": "Goods receipt",
  "141": "GR G subseq. adjustm",
  "142": "GR G subseq. adjustm",
  "161": "GR returns",
  "162": "GR rtrns reversal",
  "201": "GI for cost center",
  "202": "RE for cost center",
  "221": "GI for project",
  "222": "RE for project",
  "231": "GI for sales order",
  "232": "RE for sales order",
  "241": "GI for asset",
  "242": "RE for asset",
  "251": "GI for sales",
  "252": "RE for sales",
  "311": "Transfer posting material-to-material",
  "521": "GI for cost center",
  "641": "Transfer posting",
  "981": "Transfer posting for CC",
  "983": "Transfer posting for CC",
};

export function getMovementTypeDescription(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return "";
  return SAP_MOVEMENT_TYPES[trimmed] ?? `Movement type ${trimmed}`;
}

export const SAP_STORAGE_LOCATION_DESCRIPTIONS: Record<string, string> = {
  AFCN: "AF Common Store",
  BNKR: "Bunker SLoc",
  DESP: "Despatch S.Loc",
  ESRN: "ES Revenue",
  FNPR: "Fin. Prod. Store",
  INSL: "In-Transit S Loc",
  IWH1: "Warehouse (Input)",
  LOG1: "Logical SLoc 1",
  MNSL: "Main S Loc",
  PIPE: "Line Fill",
  PROJ: "Proj. Leftovers",
  RECT: "Receipt S Loc",
  REVN: "Revenue Store",
  SCRP: "Scrap Yard",
  SUP1: "Super HSD",
  T001: "0931-V-0001/PPYL",
  T002: "0931-V-0002/PPYL",
  T003: "0931-V-0003/PPYL",
  T004: "200-T-2001A / AA",
  T005: "200-T-2001B / AA",
  T006: "200-T-2002 / AA O",
  T007: "200-T-2009 / AA",
  T008: "400-T-4001A / BA",
  T009: "400-T-4001B / BA",
  T010: "933-T0010 / HSD",
  T011: "200-T-2011 / TOU",
  T012: "200-T-2012 / TOU",
};

export function getStorageLocationDescription(code: string): string {
  return SAP_STORAGE_LOCATION_DESCRIPTIONS[code.trim().toUpperCase()] ?? "";
}
