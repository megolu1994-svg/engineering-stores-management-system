import { useRef, useState, type ChangeEvent } from "react";
import * as XLSX from "xlsx";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  LinearProgress,
  Snackbar,
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
import DownloadIcon from "@mui/icons-material/Download";

import {
  bulkApplyStockUpdate,
  downloadStockUpdateImportReport,
  parseStockUpdateExcelRows,
  type StockUpdateImportSummary,
  type StockUpdateValidationResult,
} from "../services/stockUpdateService";

type SnackbarSeverity = "success" | "error" | "warning" | "info";

const IMPORT_PREVIEW_LIMIT = 30;

async function readExcelFile(file: File): Promise<Record<string, unknown>[]> {
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

export interface StockUpdateTabProps {
  onImportComplete?: () => void;
}

export default function StockUpdateTab({ onImportComplete }: StockUpdateTabProps) {
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: SnackbarSeverity;
  }>({ open: false, message: "", severity: "info" });

  function showSnackbar(message: string, severity: SnackbarSeverity) {
    setSnackbar({ open: true, message, severity });
  }

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [validation, setValidation] =
    useState<StockUpdateValidationResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [summary, setSummary] = useState<StockUpdateImportSummary | null>(
    null
  );

  function handleDownloadTemplate() {
    downloadWorkbook(
      [
        "Material Code",
        "Short Description",
        "UoM",
        "HSN Code",
        "Material Group",
        "Quantity",
      ],
      [
        ["9000000001", "Ball Bearing 6205", "NOS", "84821010", "BE", 40],
        ["9000000002", "", "", "", "", 25],
      ],
      "ESMS_Stock_Update_Template.xlsx"
    );
    showSnackbar("Stock update template downloaded.", "success");
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
      showSnackbar("Please choose an Excel file first.", "warning");
      return;
    }

    setPreviewLoading(true);
    setSummary(null);

    try {
      const rows = await readExcelFile(file);
      const result = parseStockUpdateExcelRows(rows);

      setValidation(result);

      if (result.validRows.length === 0) {
        showSnackbar("No valid records found in the file.", "error");
      } else {
        showSnackbar(
          `Preview ready. ${result.validRows.length} material(s) found.`,
          "success"
        );
      }
    } catch {
      showSnackbar("Failed to read the Excel file.", "error");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleImport() {
    if (!validation || validation.validRows.length === 0) {
      showSnackbar("Please preview the file before importing.", "warning");
      return;
    }

    setImporting(true);
    setProcessed(0);
    setImportTotal(validation.validRows.length);
    setSummary(null);

    try {
      const result = await bulkApplyStockUpdate(
        validation.validRows,
        file?.name,
        (done, total) => {
          setProcessed(done);
          setImportTotal(total);
        }
      );

      setSummary(result);

      await downloadStockUpdateImportReport(validation, result, file?.name);

      showSnackbar(
        `Import complete. New: ${result.newMaterials}, Matched: ${result.matched}, Flagged for review: ${result.flagged}, Failed: ${result.failed}.`,
        result.failed > 0 ? "warning" : "success"
      );

      onImportComplete?.();
    } catch {
      showSnackbar("Stock update import failed unexpectedly.", "error");
    } finally {
      setImporting(false);
    }
  }

  async function handleDownloadReport() {
    if (!validation || !summary) return;

    try {
      await downloadStockUpdateImportReport(validation, summary, file?.name);
      showSnackbar("Import report downloaded.", "success");
    } catch {
      showSnackbar("Failed to download the import report.", "error");
    }
  }

  const previewRows = validation
    ? [
        ...validation.validRows.map((row) => ({
          rowNumber: row.rowNumber,
          status: "Valid" as const,
          material_code: row.material_code,
          quantity: String(row.quantity),
          errors: [] as string[],
        })),
        ...validation.invalidRows.map((row) => ({
          rowNumber: row.rowNumber,
          status: "Invalid" as const,
          material_code: row.material_code,
          quantity: row.quantityRaw,
          errors: row.errors,
        })),
      ]
        .sort((a, b) => a.rowNumber - b.rowNumber)
        .slice(0, IMPORT_PREVIEW_LIMIT)
    : [];

  return (
    <Box sx={{ mt: 1.5, display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Alert severity="info" sx={{ borderRadius: 2, py: 0.5 }}>
        Upload your current physical stock count for all materials. Existing
        stock and allocations are never overwritten automatically - materials
        whose count differs from the system are flagged for review under
        Stock &gt; the search screen, where you can resolve them. New
        materials are created automatically and their quantity goes to
        Unallocated.
      </Alert>

      <Card
        elevation={0}
        sx={{ borderRadius: 2, boxShadow: "0 2px 10px rgba(15, 23, 42, 0.06)" }}
      >
        <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
          <Typography sx={{ fontWeight: 700, fontSize: "0.9rem", mb: 1 }}>
            Bulk Stock Update
          </Typography>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mb: 1 }}
          >
            Columns: Material Code, Quantity (required). Short Description,
            UoM, HSN Code, Material Group are only needed for materials that
            don't already exist in Material Master. A material may appear on
            multiple rows - quantities are summed.
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
              Download Stock Update Template
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
                  label={`Valid: ${validation.validRows.length}`}
                  color="success"
                />
                <Chip
                  size="small"
                  label={`Invalid: ${validation.invalidRows.length}`}
                  color="error"
                />
              </Box>
            )}

            {validation && previewRows.length > 0 && (
              <TableContainer sx={{ maxHeight: 260, overflowX: "auto", borderRadius: 2 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Row</TableCell>
                      <TableCell>Material</TableCell>
                      <TableCell>Qty</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {previewRows.map((row) => (
                      <TableRow key={row.rowNumber}>
                        <TableCell>{row.rowNumber}</TableCell>
                        <TableCell>{row.material_code}</TableCell>
                        <TableCell>{row.quantity}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={row.status}
                            color={row.status === "Valid" ? "success" : "error"}
                            title={row.errors.join(", ")}
                          />
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
                  value={
                    importTotal > 0
                      ? Math.round((processed / importTotal) * 100)
                      : 0
                  }
                  sx={{ height: 6, borderRadius: 3 }}
                />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 0.25, display: "block" }}
                >
                  Processing {processed} / {importTotal}
                </Typography>
              </Box>
            )}

            {summary && (
              <Alert
                severity={summary.failed > 0 ? "warning" : "success"}
                sx={{ borderRadius: 2, py: 0.25 }}
              >
                New Materials: {summary.newMaterials}, Matched: {summary.matched}
                , Flagged for Review: {summary.flagged}, Failed: {summary.failed}
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

            {summary && summary.outcomes.some((o) => o.status === "failed") && (
              <TableContainer sx={{ maxHeight: 220, overflowX: "auto", borderRadius: 2 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Material</TableCell>
                      <TableCell>Row</TableCell>
                      <TableCell>Reason</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {summary.outcomes
                      .filter((o) => o.status === "failed")
                      .map((outcome, index) => (
                        <TableRow key={`${outcome.material_code}-${index}`}>
                          <TableCell>{outcome.material_code}</TableCell>
                          <TableCell>{outcome.rowNumber}</TableCell>
                          <TableCell>{outcome.message}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        </CardContent>
      </Card>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={snackbar.severity}
          variant="filled"
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
