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
  TextField,
  Typography,
} from "@mui/material";

import UploadFileIcon from "@mui/icons-material/UploadFile";
import VisibilityIcon from "@mui/icons-material/Visibility";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import PlaylistAddIcon from "@mui/icons-material/PlaylistAdd";

import MaterialSearch from "./MaterialSearch";
import LocationSearch from "./LocationSearch";

import type { Material } from "../types/material";
import type { Location } from "../types/location";

import {
  applyOpeningStock,
  bulkApplyOpeningStock,
  parseOpeningStockExcelRows,
  type OpeningStockValidationResult,
  type OpeningStockImportSummary,
} from "../services/materialAllocationService";

type SnackbarSeverity = "success" | "error" | "warning" | "info";

const IMPORT_PREVIEW_LIMIT = 20;

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

export default function OpeningStockTab() {
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: SnackbarSeverity;
  }>({ open: false, message: "", severity: "info" });

  function showSnackbar(message: string, severity: SnackbarSeverity) {
    setSnackbar({ open: true, message, severity });
  }

  // ---------------- Manual entry ----------------
  const [manualMaterial, setManualMaterial] = useState<Material | null>(null);
  const [manualLocation, setManualLocation] = useState<Location | null>(null);
  const [manualQuantity, setManualQuantity] = useState("");
  const [savingManual, setSavingManual] = useState(false);

  async function handleManualSubmit() {
    if (!manualMaterial) {
      showSnackbar("Please select a material.", "warning");
      return;
    }

    if (!manualLocation) {
      showSnackbar("Please select a location.", "warning");
      return;
    }

    const quantity = Number(manualQuantity);

    if (!manualQuantity || Number.isNaN(quantity) || quantity <= 0) {
      showSnackbar("Please enter a valid quantity.", "warning");
      return;
    }

    setSavingManual(true);

    try {
      await applyOpeningStock(
        manualMaterial.material_code,
        manualLocation.location_code,
        quantity,
        "Manual entry"
      );

      showSnackbar(
        `Opening balance of ${quantity} recorded for ${manualMaterial.material_code} at ${manualLocation.location_code}.`,
        "success"
      );

      setManualMaterial(null);
      setManualLocation(null);
      setManualQuantity("");
    } catch {
      showSnackbar("Something went wrong while saving the opening balance.", "error");
    } finally {
      setSavingManual(false);
    }
  }

  // ---------------- Bulk Excel import ----------------
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [validation, setValidation] =
    useState<OpeningStockValidationResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [summary, setSummary] = useState<OpeningStockImportSummary | null>(
    null
  );

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
      const result = parseOpeningStockExcelRows(rows);

      setValidation(result);

      if (result.validRows.length === 0) {
        showSnackbar("No valid records found in the file.", "error");
      } else {
        showSnackbar(
          `Preview ready. ${result.validRows.length} valid record(s) found.`,
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
      const result = await bulkApplyOpeningStock(
        validation.validRows,
        (done, total) => {
          setProcessed(done);
          setImportTotal(total);
        }
      );

      setSummary(result);

      showSnackbar(
        `Opening stock import complete. Applied: ${result.applied}, Failed: ${result.failed}.`,
        result.failed > 0 ? "warning" : "success"
      );
    } catch {
      showSnackbar("Opening stock import failed unexpectedly.", "error");
    } finally {
      setImporting(false);
    }
  }

  const previewRows = validation
    ? [
        ...validation.validRows.map((row) => ({
          rowNumber: row.rowNumber,
          status: "Valid" as const,
          material_code: row.material_code,
          location_code: row.location_code,
          quantity: String(row.quantity),
          errors: [] as string[],
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
        .sort((a, b) => a.rowNumber - b.rowNumber)
        .slice(0, IMPORT_PREVIEW_LIMIT)
    : [];

  return (
    <Box sx={{ mt: 2.5, display: "flex", flexDirection: "column", gap: 2.5 }}>
      {/* ---- Manual entry ---- */}
      <Card elevation={0} sx={{ borderRadius: 4, boxShadow: "0 4px 20px rgba(15, 23, 42, 0.07)" }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
            Manual Opening Balance
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
            Enter an opening stock quantity for a material at a location.
          </Typography>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <MaterialSearch value={manualMaterial} onChange={setManualMaterial} />

            <LocationSearch value={manualLocation} onChange={setManualLocation} />

            <TextField
              label="Opening Quantity"
              type="number"
              fullWidth
              value={manualQuantity}
              onChange={(e) => setManualQuantity(e.target.value)}
              slotProps={{ htmlInput: { inputMode: "numeric" } }}
            />

            <Button
              variant="contained"
              size="large"
              fullWidth
              startIcon={
                savingManual ? (
                  <CircularProgress size={20} color="inherit" />
                ) : (
                  <PlaylistAddIcon />
                )
              }
              onClick={handleManualSubmit}
              disabled={savingManual}
              sx={{ minHeight: 52, borderRadius: 2.5, fontWeight: 700 }}
            >
              Save Opening Balance
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* ---- Bulk Excel import ---- */}
      <Card elevation={0} sx={{ borderRadius: 4, boxShadow: "0 4px 20px rgba(15, 23, 42, 0.07)" }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
            Bulk Opening Balance Import
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
            Upload an Excel file with columns: Material Code, Location Code, Quantity.
          </Typography>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.75 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              hidden
              onChange={handleFileChange}
            />

            <Button
              variant="outlined"
              size="large"
              fullWidth
              startIcon={<UploadFileIcon />}
              onClick={() => fileInputRef.current?.click()}
              sx={{ minHeight: 52, borderRadius: 2.5, fontWeight: 600 }}
            >
              Choose Excel File
            </Button>

            <Typography variant="body2" color="text.secondary" noWrap>
              {file ? file.name : "No file selected"}
            </Typography>

            <Button
              variant="contained"
              size="large"
              fullWidth
              startIcon={
                previewLoading ? (
                  <CircularProgress size={20} color="inherit" />
                ) : (
                  <VisibilityIcon />
                )
              }
              onClick={handlePreview}
              disabled={!file || previewLoading}
              sx={{ minHeight: 52, borderRadius: 2.5, fontWeight: 700 }}
            >
              Preview
            </Button>

            {validation && (
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                <Chip label={`Total Rows: ${validation.totalRecords}`} />
                <Chip
                  label={`Valid Rows: ${validation.validRows.length}`}
                  color="success"
                />
                <Chip
                  label={`Invalid Rows: ${validation.invalidRows.length}`}
                  color="error"
                />
              </Box>
            )}

            {validation && previewRows.length > 0 && (
              <TableContainer sx={{ maxHeight: 320, overflowX: "auto", borderRadius: 2 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Row</TableCell>
                      <TableCell>Material Code</TableCell>
                      <TableCell>Location Code</TableCell>
                      <TableCell>Quantity</TableCell>
                      <TableCell>Status</TableCell>
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
              size="large"
              fullWidth
              startIcon={
                importing ? (
                  <CircularProgress size={20} color="inherit" />
                ) : (
                  <CloudUploadIcon />
                )
              }
              onClick={handleImport}
              disabled={
                !validation || validation.validRows.length === 0 || importing
              }
              sx={{ minHeight: 52, borderRadius: 2.5, fontWeight: 700 }}
            >
              Import
            </Button>

            {importing && (
              <Box>
                <LinearProgress
                  variant="determinate"
                  value={importTotal > 0 ? Math.round((processed / importTotal) * 100) : 0}
                  sx={{ height: 8, borderRadius: 4 }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                  Processing {processed} / {importTotal}
                </Typography>
              </Box>
            )}

            {summary && (
              <Alert
                severity={summary.failed > 0 ? "warning" : "success"}
                sx={{ borderRadius: 2 }}
              >
                Import complete. Applied: {summary.applied}, Failed: {summary.failed}
              </Alert>
            )}

            {summary && summary.failures.length > 0 && (
              <TableContainer sx={{ maxHeight: 260, overflowX: "auto", borderRadius: 2 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Material Code</TableCell>
                      <TableCell>Location Code</TableCell>
                      <TableCell>Row</TableCell>
                      <TableCell>Reason</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {summary.failures.map((failure, index) => (
                      <TableRow key={`${failure.material_code}-${index}`}>
                        <TableCell>{failure.material_code}</TableCell>
                        <TableCell>{failure.location_code}</TableCell>
                        <TableCell>{failure.rowNumber}</TableCell>
                        <TableCell>{failure.error}</TableCell>
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
