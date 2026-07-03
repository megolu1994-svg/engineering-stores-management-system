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
  Collapse,
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
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

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
  const [bulkOpen, setBulkOpen] = useState(false);

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
    <Box sx={{ mt: 1.5, display: "flex", flexDirection: "column", gap: 1.5 }}>
      {/* ---- Manual entry ---- */}
      <Card elevation={0} sx={{ borderRadius: 2, boxShadow: "0 2px 10px rgba(15, 23, 42, 0.06)" }}>
        <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
          <Typography sx={{ fontWeight: 700, fontSize: "0.9rem", mb: 1 }}>
            Manual Opening Balance
          </Typography>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <MaterialSearch value={manualMaterial} onChange={setManualMaterial} />

            <LocationSearch value={manualLocation} onChange={setManualLocation} />

            <TextField
              label="Opening Quantity"
              type="number"
              size="small"
              fullWidth
              value={manualQuantity}
              onChange={(e) => setManualQuantity(e.target.value)}
              slotProps={{ htmlInput: { inputMode: "numeric" } }}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            />

            <Button
              variant="contained"
              fullWidth
              startIcon={
                savingManual ? (
                  <CircularProgress size={18} color="inherit" />
                ) : (
                  <PlaylistAddIcon fontSize="small" />
                )
              }
              onClick={handleManualSubmit}
              disabled={savingManual}
              sx={{ minHeight: 42, borderRadius: 2, fontWeight: 700 }}
            >
              Save
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* ---- Bulk Excel import (collapsible, collapsed by default) ---- */}
      <Card elevation={0} sx={{ borderRadius: 2, boxShadow: "0 2px 10px rgba(15, 23, 42, 0.06)" }}>
        <Box
          onClick={() => setBulkOpen((prev) => !prev)}
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
            Bulk Excel Import
          </Typography>

          <ExpandMoreIcon
            fontSize="small"
            sx={{
              transition: "transform 0.2s",
              transform: bulkOpen ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </Box>

        <Collapse in={bulkOpen} timeout="auto" unmountOnExit>
          <CardContent sx={{ p: 1.5, pt: 0, "&:last-child": { pb: 1.5 } }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
              Columns: Material Code, Location Code, Quantity.
            </Typography>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
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

              <Typography variant="caption" color="text.secondary" noWrap>
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
                        <TableCell>Location</TableCell>
                        <TableCell>Qty</TableCell>
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
                  severity={summary.failed > 0 ? "warning" : "success"}
                  sx={{ borderRadius: 2, py: 0.25 }}
                >
                  Applied: {summary.applied}, Failed: {summary.failed}
                </Alert>
              )}

              {summary && summary.failures.length > 0 && (
                <TableContainer sx={{ maxHeight: 220, overflowX: "auto", borderRadius: 2 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>Material</TableCell>
                        <TableCell>Location</TableCell>
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
        </Collapse>
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
