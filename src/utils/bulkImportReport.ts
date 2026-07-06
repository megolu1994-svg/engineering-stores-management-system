import * as XLSX from "xlsx";

/** Outcome of a single row after a bulk import ran. "Rejected" is for rows
 *  that never reached the database (failed file/lookup validation);
 *  "Failed" is for rows that were sent for import but the write itself
 *  failed; "Partial" is for rows where only part of the request could be
 *  applied (e.g. bulk allocate running out of unallocated balance). */
export type BulkImportRowStatus =
  | "Imported"
  | "Updated"
  | "Applied"
  | "Partial"
  | "Rejected"
  | "Failed";

export interface BulkImportReportRow {
  rowNumber: number;
  status: BulkImportRowStatus;
  reason?: string;
  data: Record<string, string | number>;
}

export interface BulkImportReportColumn {
  header: string;
  key: string;
}

export interface BulkImportSummaryStat {
  label: string;
  value: string | number;
}

export interface BulkImportReportOptions {
  /** Used as the downloaded file's name prefix, e.g. "Material_Import". */
  fileNamePrefix: string;
  /** Per-row data columns, in display order. `key` must match a key in
   *  each row's `data` object. */
  columns: BulkImportReportColumn[];
  rows: BulkImportReportRow[];
  summary: BulkImportSummaryStat[];
}

/**
 * Builds and immediately downloads a two-sheet Excel workbook reporting the
 * outcome of a bulk import: a "Summary" sheet with aggregate counts, and an
 * "Import Result" sheet listing every row that was submitted along with its
 * outcome (Imported/Updated/Applied/Partial/Rejected/Failed) and, for
 * anything other than a clean success, the reason. Every bulk import
 * feature in the app calls this right after the import finishes so the
 * user always ends up with a downloadable record of exactly what happened
 * to each row - including rows rejected before the import even ran.
 */
export function downloadBulkImportReport(options: BulkImportReportOptions): void {
  const { fileNamePrefix, columns, rows, summary } = options;

  const workbook = XLSX.utils.book_new();

  const summarySheet = XLSX.utils.aoa_to_sheet([
    ["Metric", "Value"],
    ...summary.map((stat) => [stat.label, stat.value]),
  ]);
  summarySheet["!cols"] = [{ wch: 30 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

  const headers = [
    "Row Number",
    ...columns.map((c) => c.header),
    "Status",
    "Reason",
  ];

  const sortedRows = [...rows].sort((a, b) => a.rowNumber - b.rowNumber);

  const resultSheet = XLSX.utils.aoa_to_sheet([
    headers,
    ...sortedRows.map((row) => [
      row.rowNumber,
      ...columns.map((c) => row.data[c.key] ?? ""),
      row.status,
      row.reason ?? "",
    ]),
  ]);
  resultSheet["!cols"] = headers.map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(workbook, resultSheet, "Import Result");

  const timestamp = new Date()
    .toISOString()
    .replace("T", "_")
    .replace(/:/g, "-")
    .slice(0, 19);

  XLSX.writeFile(workbook, `${fileNamePrefix}_Result_${timestamp}.xlsx`);
}
