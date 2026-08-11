import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import type { BulkMaterialSearchRow } from "../services/bulkMaterialSearchService";

export interface PickListExportRow {
  material_code: string;
  short_description: string;
  uom: string;
  location_code: string;
  quantity: number;
}

/** Location sentinel for "no stock anywhere". */
const NO_STOCK_LOCATION = "\u2014";

/**
 * Flattens bulk results into one row per material+location pair so the
 * storekeeper can collect material by walking locations. Materials with no
 * stock at all get a single row with quantity 0. Rows are sorted by
 * location, then material code, with the no-stock rows at the end.
 */
export function buildPickListRows(
  rows: BulkMaterialSearchRow[]
): PickListExportRow[] {
  const out: PickListExportRow[] = [];

  for (const row of rows) {
    const entries = [
      ...row.locations.map((l) => ({
        location_code: l.location_code,
        quantity: l.quantity,
      })),
      ...(row.unallocatedQty > 0
        ? [{ location_code: "UNALLOCATED", quantity: row.unallocatedQty }]
        : []),
    ];

    if (entries.length === 0) {
      out.push({
        material_code: row.material_code,
        short_description: row.short_description,
        uom: row.uom,
        location_code: NO_STOCK_LOCATION,
        quantity: 0,
      });
    } else {
      for (const entry of entries) {
        out.push({
          material_code: row.material_code,
          short_description: row.short_description,
          uom: row.uom,
          location_code: entry.location_code,
          quantity: entry.quantity,
        });
      }
    }
  }

  out.sort(
    (a, b) =>
      (a.location_code === NO_STOCK_LOCATION ? 1 : 0) -
        (b.location_code === NO_STOCK_LOCATION ? 1 : 0) ||
      a.location_code.localeCompare(b.location_code) ||
      a.material_code.localeCompare(b.material_code)
  );

  return out;
}

const PICK_LIST_HEADERS = [
  "Material Code",
  "Short Description",
  "UoM",
  "Location Code",
  "Quantity",
];

function timestamp(): string {
  return new Date()
    .toISOString()
    .replace("T", "_")
    .replace(/:/g, "-")
    .slice(0, 19);
}

export function pickListFilename(prefix: string): string {
  return `${prefix}_${timestamp()}`;
}

export function exportPickListExcel(
  rows: BulkMaterialSearchRow[],
  notFound: string[],
  filename: string
): void {
  const pickRows = buildPickListRows(rows);

  const workbook = XLSX.utils.book_new();

  const pickSheet = XLSX.utils.aoa_to_sheet([
    PICK_LIST_HEADERS,
    ...pickRows.map((r) => [
      r.material_code,
      r.short_description,
      r.uom,
      r.location_code,
      r.quantity,
    ]),
  ]);
  pickSheet["!cols"] = [
    { wch: 16 },
    { wch: 45 },
    { wch: 8 },
    { wch: 18 },
    { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(workbook, pickSheet, "Pick List");

  if (notFound.length > 0) {
    const notFoundSheet = XLSX.utils.aoa_to_sheet([
      ["Material Code"],
      ...notFound.map((code) => [code]),
    ]);
    notFoundSheet["!cols"] = [{ wch: 20 }];
    XLSX.utils.book_append_sheet(workbook, notFoundSheet, "Not Found");
  }

  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export function exportPickListPdf(
  rows: BulkMaterialSearchRow[],
  notFound: string[],
  filename: string
): void {
  const pickRows = buildPickListRows(rows);

  const doc = new jsPDF({ orientation: "landscape" });

  doc.setFontSize(14);
  doc.text("Bulk Material Search - Pick List", 14, 15);
  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleString("en-IN")}`, 14, 22);

  autoTable(doc, {
    head: [PICK_LIST_HEADERS],
    body: pickRows.map((r) => [
      r.material_code,
      r.short_description,
      r.uom,
      r.location_code,
      String(r.quantity),
    ]),
    startY: 26,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [91, 33, 182], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 243, 255] },
  });

  if (notFound.length > 0) {
    const finalY =
      (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable
        ?.finalY ?? 250;
    doc.setFontSize(9);
    doc.text(
      `Not found (${notFound.length}): ${notFound.join(", ")}`,
      14,
      finalY + 8
    );
  }

  doc.save(`${filename}.pdf`);
}
