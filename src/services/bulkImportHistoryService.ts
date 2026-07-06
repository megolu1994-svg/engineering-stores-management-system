import { supabase } from "../config/supabase";
import {
  downloadBulkImportReport,
  type BulkImportReportColumn,
  type BulkImportReportRow,
  type BulkImportSummaryStat,
} from "../utils/bulkImportReport";

export interface BulkImportHistoryListItem {
  id: number;
  created_at: string;
  import_type: string;
  file_name: string | null;
  total_rows: number;
  success_count: number;
  rejected_count: number;
  failed_count: number;
}

const HISTORY_LIST_COLUMNS =
  "id, created_at, import_type, file_name, total_rows, success_count, rejected_count, failed_count";

/**
 * Lists the most recent bulk import runs across every import feature, for
 * the Reports > Import Reports tab. Only summary counts are fetched here -
 * the full row-level report is loaded on demand when the user asks to
 * re-download a specific run - so this stays fast regardless of how large
 * any individual report was.
 */
export async function listBulkImportHistory(
  limit = 100
): Promise<BulkImportHistoryListItem[]> {
  const { data, error } = await supabase
    .from("bulk_import_history")
    .select(HISTORY_LIST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []) as BulkImportHistoryListItem[];
}

/**
 * Re-downloads the Excel report for a past bulk import run, reconstructed
 * exactly as it looked right after that import finished.
 */
export async function downloadHistoryReport(id: number): Promise<void> {
  const { data, error } = await supabase
    .from("bulk_import_history")
    .select("import_type, report_columns, report_rows, report_summary")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Import report not found.");

  const importType = data.import_type as string;

  downloadBulkImportReport({
    fileNamePrefix: importType.replace(/[^a-zA-Z0-9_-]/g, "_"),
    columns: data.report_columns as BulkImportReportColumn[],
    rows: data.report_rows as BulkImportReportRow[],
    summary: data.report_summary as BulkImportSummaryStat[],
  });
}

export interface RecordAndDownloadOptions {
  importType: string;
  fileName?: string | null;
  totalRows: number;
  successCount: number;
  rejectedCount: number;
  failedCount: number;
  fileNamePrefix: string;
  columns: BulkImportReportColumn[];
  rows: BulkImportReportRow[];
  summary: BulkImportSummaryStat[];
}

/**
 * Persists a bulk import run's full report so it can be browsed and
 * re-downloaded later from Reports > Import Reports, then triggers the
 * immediate Excel download - the single entry point every bulk import
 * feature calls once its summary is ready. Saving history never blocks or
 * cancels the download: if the insert fails (e.g. a network hiccup), the
 * user still gets their file, they just won't see this run listed later.
 */
export async function recordAndDownloadBulkImportReport(
  options: RecordAndDownloadOptions
): Promise<void> {
  const {
    importType,
    fileName,
    totalRows,
    successCount,
    rejectedCount,
    failedCount,
    fileNamePrefix,
    columns,
    rows,
    summary,
  } = options;

  try {
    const { error } = await supabase.from("bulk_import_history").insert({
      import_type: importType,
      file_name: fileName ?? null,
      total_rows: totalRows,
      success_count: successCount,
      rejected_count: rejectedCount,
      failed_count: failedCount,
      report_columns: columns,
      report_rows: rows,
      report_summary: summary,
    });

    if (error) throw error;
  } catch (err) {
    console.error("Failed to save bulk import history", err);
  }

  downloadBulkImportReport({ fileNamePrefix, columns, rows, summary });
}
