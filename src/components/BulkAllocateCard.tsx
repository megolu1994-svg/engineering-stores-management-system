import { useRef, useState, type ChangeEvent } from "react";
import * as XLSX from "xlsx";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  CircularProgress,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

import UploadFileIcon from "@mui/icons-material/UploadFile";
import VisibilityIcon from "@mui/icons-material/Visibility";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DownloadIcon from "@mui/icons-material/Download";

import {
  bulkApplyAllocation,
  validateAllocationExcelRows,
  downloadAllocationImportReport,
  type AllocationValidationResult,
  type AllocationImportSummary,
} from "../services/materialAllocationService";

type SnackbarSeverity = "success" | "error" | "warning" | "info";

const IMPORT_PREVIEW_LIMIT = 20;

/** Collapses row-specific detail (quoted codes, numbers) out of an error/
 *  warning message so rows that fail for the same underlying reason group
 *  together, e.g. every "Material Code "X" was not found." becomes one
 *  bucket instead of one per distinct material code. */
function canonicalizeIssueMessage(message: string): string {
  return message.replace(/"[^"]*"/g, '"…"').replace(/\d[\d,]*/g, "N");
}

interface IssueGroup {
  message: string;
  count: number;
}

function buildIssueBreakdown(validation: AllocationValidationResult): {
  invalid: IssueGroup[];
  warning: IssueGroup[];
} {
  const invalidCounts = new Map<string, number>();
  for (const row of validation.invalidRows) {
    for (const error of row.errors) {
      const key = canonicalizeIssueMessage(error);
      invalidCounts.set(key, (invalidCounts.get(key) ?? 0) + 1);
    }
  }

  const warningCounts = new Map<string, number>();
  for (const row of validation.validRows) {
    if (row.warning) {
      const key = canonicalizeIssueMessage(row.warning);
      warningCounts.set(key, (warningCounts.get(key) ?? 0) + 1);
    }
  }

  const toSortedGroups = (counts: Map<string, number>): IssueGroup[] =>
    Array.from(counts.entries())
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count);

  return {
    invalid: toSortedGroups(invalidCounts),
    warning: toSortedGroups(warningCounts),
  };
}

async function readExcelFile(
  file: File
): Promise<Record<string, unknown>[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<
    string,
    unknown
  >[];
}

function downloadWorkbook(
  headers: string[],
  rows: (string | number)[][],
  filename: string
) {
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  worksheet["!cols"] = headers.map(() => ({ wch: 22 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Template");
  XLSX.writeFile(workbook, filename);
}

interface Props {
  onShowSnackbar: (message: string, severity: SnackbarSeverity) => void;
  onImportComplete?: () => void;
}

export default function BulkAllocateCard({
  onShowSnackbar,
  onImportComplete,
}: Props) {
  const [open, setOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [validation, setValidation] =
    useState<AllocationValidationResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [summary, setSummary] = useState<AllocationImportSummary | null>(
    null
  );

  function handleDownloadTemplate() {
    downloadWorkbook(
      ["Material Code", "Location Code", "Quantity"],
      [
        ["9000000001", "CS/HD35 BIN A", 10],
        ["9000000002", "CS/HD35 BIN B", 25],
      ],
      "ESMS_Bulk_Allocate_Template.xlsx"
    );
    onShowSnackbar("Bulk allocate template downloaded.", "success");
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setValidation(null);
    setSummary(null);
    setProcessed(0);
    setImportTotal(0);
    e.target.value = "";
  }

  async function handlePreview() {
    if (!file) {
      onShowSnackbar("Please choose an Excel file first.", "warning");
      return;
    }

    setPreviewLoading(true);
    setSummary(null);

    try {
      const rows = await readExcelFile(file);
      const result = await validateAllocationExcelRows(rows);

      setValidation(result);

      if (result.validRows.length === 0) {
        onShowSnackbar("No valid records found in the file.", "error");
      } else {
        const withWarnings = result.validRows.filter((r) => r.warning).length;
        onShowSnackbar(
          withWarnings > 0
            ? `Preview ready. ${result.validRows.length} record(s) found, ${withWarnings} with an insufficient-balance warning.`
            : `Preview ready. ${result.validRows.length} valid record(s) found.`,
          withWarnings > 0 ? "warning" : "success"
        );
      }
    } catch {
      onShowSnackbar("Failed to read the Excel file.", "error");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleImport() {
    if (!validation || validation.validRows.length === 0) {
      onShowSnackbar("Please preview the file before importing.", "warning");
      return;
    }

    setImporting(true);
    setProcessed(0);
    setImportTotal(validation.validRows.length);
    setSummary(null);

    try {
      const result = await bulkApplyAllocation(
        validation.validRows,
        (done, total) => {
          setProcessed(done);
          setImportTotal(total);
        }
      );

      setSummary(result);

      downloadAllocationImportReport(validation, result);

      onShowSnackbar(
        `Bulk allocate complete. Applied: ${result.applied}, Partial: ${result.partial}, Failed: ${result.failed}. Result report downloaded.`,
        result.failed > 0 || result.partial > 0 ? "warning" : "success"
      );

      onImportComplete?.();
    } catch {
      onShowSnackbar("Bulk allocate failed unexpectedly.", "error");
    } finally {
      setImporting(false);
    }
  }

  function handleDownloadReport() {
    if (!validation || !summary) {
      return;
    }

    downloadAllocationImportReport(validation, summary);
    onShowSnackbar("Import report downloaded.", "success");
  }

  const issueBreakdown = validation ? buildIssueBreakdown(validation) : null;

  const statusPriority = { Invalid: 0, Warning: 1, Valid: 2 } as const;

  const previewRows = validation
    ? [
        ...validation.validRows.map((row) => ({
          rowNumber: row.rowNumber,
          status: row.warning ? ("Warning" as const) : ("Valid" as const),
          material_code: row.material_code,
          location_code: row.location_code,
          quantity: String(row.quantity),
          errors: row.warning ? [row.warning] : ([] as string[]),
        })),
        ...validation.invalidRows.map((row) => ({
          rowNumber: row.rowNumber,
          status: "Invalid" as const,
          material_code: row.material_code,
          location_code: row.location_code,
          quantity: row.quantityRaw,
          errors: row.errors,
        })),
      ]
        // Invalid/Warning rows surface first so they aren't pushed out of
        // the capped preview by earlier Valid rows in a large file.
        .sort((a, b) => {
          const priorityDiff = statusPriority[a.status] - statusPriority[b.status];
          return priorityDiff !== 0 ? priorityDiff : a.rowNumber - b.rowNumber;
        })
        .slice(0, IMPORT_PREVIEW_LIMIT)
        .sort((a, b) => a.rowNumber - b.rowNumber)
    : [];

  function statusColor(status: "Valid" | "Warning" | "Invalid") {
    if (status === "Valid") return "success";
    if (status === "Warning") return "warning";
    return "error";
  }

  function outcomeColor(status: "applied" | "partial" | "failed") {
    if (status === "applied") return "success";
    if (status === "partial") return "warning";
    return "error";
  }

  return (
    <Card
      elevation={0}
      sx={{ borderRadius: 2, boxShadow: "0 2px 10px rgba(15, 23, 42, 0.06)", mb: 1 }}
    >
      <Box
        onClick={() => setOpen((prev) => !prev)}
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 1.5,
          py: 1,
          cursor: "pointer",
        }}
      >
        <Typography sx={{ fontWeight: 700, fontSize: "0.9rem" }}>
          Bulk Allocate (Excel Import)
        </Typography>

        <ExpandMoreIcon
          fontSize="small"
          sx={{
            transition: "transform 0.2s",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </Box>

      <Collapse in={open} timeout="auto" unmountOnExit>
        <CardContent sx={{ p: 1.5, pt: 0, "&:last-child": { pb: 1.5 } }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mb: 1 }}
          >
            Columns: Material Code, Location Code, Quantity. Each row adds
            the given quantity to that location out of the material's
            unallocated balance - existing allocations elsewhere are never
            overwritten or reduced.
          </Typography>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Button
              variant="outlined"
              color="inherit"
              fullWidth
              startIcon={<DownloadIcon fontSize="small" />}
              onClick={handleDownloadTemplate}
              sx={{ minHeight: 42, borderRadius: 2, fontWeight: 600, borderColor: "divider" }}
            >
              Download Bulk Allocate Template
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              hidden
              onChange={handleFileChange}
            />

            <Button
              variant="outlined"
              fullWidth
              startIcon={<UploadFileIcon fontSize="small" />}
              onClick={() => fileInputRef.current?.click()}
              sx={{ minHeight: 42, borderRadius: 2, fontWeight: 600 }}
            >
              Choose Excel File
            </Button>

            <Typography
              variant="caption"
              color="text.secondary"
              noWrap
              title={file ? file.name : undefined}
              sx={{ minWidth: 0 }}
            >
              {file ? file.name : "No file selected"}
            </Typography>

            <Button
              variant="contained"
              fullWidth
              startIcon={
                previewLoading ? (
                  <CircularProgress size={18} color="inherit" />
                ) : (
                  <VisibilityIcon fontSize="small" />
                )
              }
              onClick={handlePreview}
              disabled={!file || previewLoading}
              sx={{ minHeight: 42, borderRadius: 2, fontWeight: 700 }}
            >
              Preview
            </Button>

            {validation && (
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                <Chip size="small" label={`Total: ${validation.totalRecords}`} />
                <Chip
                  size="small"
                  label={`Valid: ${
                    validation.validRows.filter((r) => !r.warning).length
                  }`}
                  color="success"
                />
                <Chip
                  size="small"
                  label={`Warning: ${
                    validation.validRows.filter((r) => r.warning).length
                  }`}
                  color="warning"
                />
                <Chip
                  size="small"
                  label={`Invalid: ${validation.invalidRows.length}`}
                  color="error"
                />
              </Box>
            )}

            {issueBreakdown &&
              (issueBreakdown.invalid.length > 0 ||
                issueBreakdown.warning.length > 0) && (
                <Box>
                  <Typography
                    variant="caption"
                    sx={{ display: "block", mb: 0.5, fontWeight: 700 }}
                  >
                    Issues found (by reason)
                  </Typography>
                  <TableContainer
                    sx={{ maxHeight: 200, overflowX: "auto", borderRadius: 2 }}
                  >
                    <Table size="small">
                      <TableBody>
                        {issueBreakdown.invalid.map((group) => (
                          <TableRow key={`invalid-${group.message}`}>
                            <TableCell sx={{ width: 56, py: 0.5 }}>
                              <Chip
                                size="small"
                                label={group.count}
                                color="error"
                              />
                            </TableCell>
                            <TableCell sx={{ py: 0.5 }}>
                              {group.message}
                            </TableCell>
                          </TableRow>
                        ))}
                        {issueBreakdown.warning.map((group) => (
                          <TableRow key={`warning-${group.message}`}>
                            <TableCell sx={{ width: 56, py: 0.5 }}>
                              <Chip
                                size="small"
                                label={group.count}
                                color="warning"
                              />
                            </TableCell>
                            <TableCell sx={{ py: 0.5 }}>
                              {group.message}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}

            {validation && previewRows.length > 0 && (
              <TableContainer sx={{ maxHeight: 260, overflowX: "auto", borderRadius: 2 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Row</TableCell>
                      <TableCell>Material</TableCell>
                      <TableCell>Location</TableCell>
                      <TableCell>Qty</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Issue</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {previewRows.map((row) => (
                      <TableRow key={row.rowNumber}>
                        <TableCell>{row.rowNumber}</TableCell>
                        <TableCell>{row.material_code}</TableCell>
                        <TableCell>{row.location_code}</TableCell>
                        <TableCell>{row.quantity}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={row.status}
                            color={statusColor(row.status)}
                          />
                        </TableCell>
                        <TableCell title={row.errors.join(", ")}>
                          {row.errors.join(", ")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            <Button
              variant="contained"
              color="primary"
              fullWidth
              startIcon={
                importing ? (
                  <CircularProgress size={18} color="inherit" />
                ) : (
                  <CloudUploadIcon fontSize="small" />
                )
              }
              onClick={handleImport}
              disabled={
                !validation || validation.validRows.length === 0 || importing
              }
              sx={{ minHeight: 42, borderRadius: 2, fontWeight: 700 }}
            >
              Import
            </Button>

            {importing && (
              <Box>
                <LinearProgress
                  variant="determinate"
                  value={importTotal > 0 ? Math.round((processed / importTotal) * 100) : 0}
                  sx={{ height: 6, borderRadius: 3 }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, display: "block" }}>
                  Processing {processed} / {importTotal}
                </Typography>
              </Box>
            )}

            {summary && (
              <Alert
                severity={
                  summary.failed > 0
                    ? "error"
                    : summary.partial > 0
                    ? "warning"
                    : "success"
                }
                sx={{ borderRadius: 2, py: 0.25 }}
              >
                Applied: {summary.applied}, Partial: {summary.partial}, Failed:{" "}
                {summary.failed}
              </Alert>
            )}

            {summary && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<DownloadIcon fontSize="small" />}
                onClick={handleDownloadReport}
                sx={{ borderRadius: 2, fontWeight: 600, alignSelf: "flex-start" }}
              >
                Download Import Report
              </Button>
            )}

            {summary && summary.outcomes.length > 0 && (
              <TableContainer sx={{ maxHeight: 220, overflowX: "auto", borderRadius: 2 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Row</TableCell>
                      <TableCell>Material</TableCell>
                      <TableCell>Location</TableCell>
                      <TableCell>Applied / Requested</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Message</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {summary.outcomes.map((outcome) => (
                      <TableRow key={`${outcome.rowNumber}-${outcome.material_code}`}>
                        <TableCell>{outcome.rowNumber}</TableCell>
                        <TableCell>{outcome.material_code}</TableCell>
                        <TableCell>{outcome.location_code}</TableCell>
                        <TableCell>
                          {outcome.appliedQuantity} / {outcome.requestedQuantity}
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={outcome.status}
                            color={outcomeColor(outcome.status)}
                          />
                        </TableCell>
                        <TableCell>{outcome.message ?? ""}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        </CardContent>
      </Collapse>
    </Card>
  );
}
