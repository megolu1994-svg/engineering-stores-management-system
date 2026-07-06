import { useRef, useState, type ChangeEvent } from "react";

import * as XLSX from "xlsx";

import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
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
import { alpha } from "@mui/material/styles";

import DownloadIcon from "@mui/icons-material/Download";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import VisibilityIcon from "@mui/icons-material/Visibility";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ErrorIcon from "@mui/icons-material/Error";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import PlaceIcon from "@mui/icons-material/Place";

import {
  parseMaterialExcelRows,
  bulkImportMaterials,
  downloadMaterialImportReport,
  type MaterialValidationResult,
  type MaterialImportSummary,
  type MaterialImportFailure,
} from "../services/materialService";

import {
  parseLocationExcelRows,
  bulkImportLocations,
  downloadLocationImportReport,
  type LocationValidationResult,
  type LocationImportSummary,
} from "../services/locationService";


const IMPORT_BATCH_SIZE = 500;
const PREVIEW_ROW_LIMIT = 20;

type SnackbarSeverity = "success" | "error" | "warning" | "info";

async function readExcelFile(
  file: File
): Promise<Record<string, unknown>[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return json as Record<string, unknown>[];
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

function isDuplicateError(errors: string[]) {
  return errors.some((e) => e.toLowerCase().includes("duplicate"));
}

const cardSx = {
  borderRadius: 4,
  boxShadow: "0 4px 20px rgba(15, 23, 42, 0.07)",
  overflow: "hidden",
};

const primaryButtonSx = {
  minHeight: 56,
  fontWeight: 700,
  fontSize: "0.95rem",
  borderRadius: 3,
  justifyContent: "flex-start",
  px: 2.5,
};

const panelButtonSx = {
  minHeight: 52,
  borderRadius: 2.5,
  fontWeight: 700,
};

const columnFlexSx = {
  display: "flex",
  flexDirection: "column",
};

const rowFlexSx = {
  display: "flex",
  flexDirection: "row",
};

export default function ImportExport() {
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: SnackbarSeverity;
  }>({ open: false, message: "", severity: "info" });

  function showSnackbar(message: string, severity: SnackbarSeverity) {
    setSnackbar({ open: true, message, severity });
  }

  // ---------------- Material Master ----------------
  const [materialImportOpen, setMaterialImportOpen] = useState(false);

  const materialInputRef = useRef<HTMLInputElement | null>(null);
  const [materialFile, setMaterialFile] = useState<File | null>(null);
  const [materialPreviewLoading, setMaterialPreviewLoading] =
    useState(false);
  const [materialValidation, setMaterialValidation] =
    useState<MaterialValidationResult | null>(null);
  const [materialImporting, setMaterialImporting] = useState(false);
  const [materialProcessed, setMaterialProcessed] = useState(0);
  const [materialImportTotal, setMaterialImportTotal] = useState(0);
  const [materialSummary, setMaterialSummary] =
    useState<MaterialImportSummary | null>(null);

  function openMaterialImport() {
    setMaterialImportOpen(true);
    setMaterialFile(null);
    setMaterialValidation(null);
    setMaterialSummary(null);
    setMaterialProcessed(0);
    setMaterialImportTotal(0);
  }

  function closeMaterialImport() {
    setMaterialImportOpen(false);
    setMaterialFile(null);
    setMaterialValidation(null);
    setMaterialSummary(null);
    setMaterialProcessed(0);
    setMaterialImportTotal(0);
  }

  function handleDownloadMaterialTemplate() {
    downloadWorkbook(
      ["Material Code", "Description", "UoM", "HSN Code"],
      [
        ["9000000001", "SAMPLE BEARING 6205 2RS", "EA", "84821000"],
        ["9000000002", "SAMPLE GASKET SET", "EA", "40169300"],
        ["9000000003", "SAMPLE HYDRAULIC OIL 68", "L", "27101983"],
      ],
      "ESMS_Material_Template.xlsx"
    );
    showSnackbar("Material template downloaded.", "success");
  }

  function handleMaterialFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setMaterialFile(file);
    setMaterialValidation(null);
    setMaterialSummary(null);
    setMaterialProcessed(0);
    setMaterialImportTotal(0);
    e.target.value = "";
  }

  async function handleMaterialPreview() {
    if (!materialFile) {
      showSnackbar("Please choose an Excel file first.", "warning");
      return;
    }

    setMaterialPreviewLoading(true);
    setMaterialSummary(null);

    try {
      const rows = await readExcelFile(materialFile);
      const result = parseMaterialExcelRows(rows);

      setMaterialValidation(result);

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
      setMaterialPreviewLoading(false);
    }
  }

  async function handleMaterialImport() {
    if (!materialValidation || materialValidation.validRows.length === 0) {
      showSnackbar("Please preview the file before importing.", "warning");
      return;
    }

    setMaterialImporting(true);
    setMaterialProcessed(0);
    setMaterialImportTotal(materialValidation.validRows.length);
    setMaterialSummary(null);

    try {
      const summary = await bulkImportMaterials(
        materialValidation.validRows,
        IMPORT_BATCH_SIZE,
        (processed, total) => {
          setMaterialProcessed(processed);
          setMaterialImportTotal(total);
        }
      );

      setMaterialSummary(summary);

      await downloadMaterialImportReport(materialValidation, summary, materialFile?.name);

      showSnackbar(
        `Import complete. Imported: ${summary.imported}, Updated: ${summary.updated}, Failed: ${summary.failed}. Result report downloaded.`,
        summary.failed > 0 ? "warning" : "success"
      );
    } catch {
      showSnackbar("Import failed unexpectedly.", "error");
    } finally {
      setMaterialImporting(false);
    }
  }

  async function handleDownloadMaterialReport() {
    if (!materialValidation || !materialSummary) {
      return;
    }

    try {
      await downloadMaterialImportReport(materialValidation, materialSummary, materialFile?.name);
      showSnackbar("Import report downloaded.", "success");
    } catch {
      showSnackbar("Failed to download the import report.", "error");
    }
  }

  // ---------------- Location Master ----------------
  const [locationImportOpen, setLocationImportOpen] = useState(false);

  const locationInputRef = useRef<HTMLInputElement | null>(null);
  const [locationFile, setLocationFile] = useState<File | null>(null);
  const [locationPreviewLoading, setLocationPreviewLoading] =
    useState(false);
  const [locationValidation, setLocationValidation] =
    useState<LocationValidationResult | null>(null);
  const [locationImporting, setLocationImporting] = useState(false);
  const [locationProgress, setLocationProgress] = useState(0);
  const [locationSummary, setLocationSummary] =
    useState<LocationImportSummary | null>(null);

  function openLocationImport() {
    setLocationImportOpen(true);
    setLocationFile(null);
    setLocationValidation(null);
    setLocationSummary(null);
    setLocationProgress(0);
  }

  function closeLocationImport() {
    setLocationImportOpen(false);
    setLocationFile(null);
    setLocationValidation(null);
    setLocationSummary(null);
    setLocationProgress(0);
  }

  function handleDownloadLocationTemplate() {
    downloadWorkbook(
      ["Location Code", "Description"],
      [
        ["WH-A-01-01", "Warehouse A, Rack 1, Bin 1"],
        ["WH-A-01-02", "Warehouse A, Rack 1, Bin 2"],
        ["WH-B-02-05", "Warehouse B, Rack 2, Bin 5"],
      ],
      "ESMS_Location_Template.xlsx"
    );
    showSnackbar("Location template downloaded.", "success");
  }

  function handleLocationFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setLocationFile(file);
    setLocationValidation(null);
    setLocationSummary(null);
    setLocationProgress(0);
    e.target.value = "";
  }

  async function handleLocationPreview() {
    if (!locationFile) {
      showSnackbar("Please choose an Excel file first.", "warning");
      return;
    }

    setLocationPreviewLoading(true);
    setLocationSummary(null);

    try {
      const rows = await readExcelFile(locationFile);
      const result = parseLocationExcelRows(rows);

      setLocationValidation(result);

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
      setLocationPreviewLoading(false);
    }
  }

  async function handleLocationImport() {
    if (!locationValidation || locationValidation.validRows.length === 0) {
      showSnackbar("Please preview the file before importing.", "warning");
      return;
    }

    setLocationImporting(true);
    setLocationProgress(0);
    setLocationSummary(null);

    try {
      const summary = await bulkImportLocations(
        locationValidation.validRows,
        IMPORT_BATCH_SIZE,
        (processed, total) =>
          setLocationProgress(Math.round((processed / total) * 100))
      );

      setLocationSummary(summary);

      await downloadLocationImportReport(locationValidation, summary, locationFile?.name);

      showSnackbar(
        `Import complete. Imported: ${summary.imported}, Updated: ${summary.updated}, Failed: ${summary.failed}. Result report downloaded.`,
        summary.failed > 0 ? "warning" : "success"
      );
    } catch {
      showSnackbar("Import failed unexpectedly.", "error");
    } finally {
      setLocationImporting(false);
    }
  }

  async function handleDownloadLocationReport() {
    if (!locationValidation || !locationSummary) {
      return;
    }

    try {
      await downloadLocationImportReport(locationValidation, locationSummary, locationFile?.name);
      showSnackbar("Import report downloaded.", "success");
    } catch {
      showSnackbar("Failed to download the import report.", "error");
    }
  }

  // ---------------- Derived preview data ----------------
  const materialPreviewRows = materialValidation
    ? [
        ...materialValidation.validRows.map((row) => ({
          rowNumber: row.rowNumber,
          status: "Valid" as const,
          material_code: row.material_code,
          short_description: row.short_description,
          uom: row.uom,
          hsn_code: row.hsn_code,
          errors: [] as string[],
        })),
        ...materialValidation.invalidRows.map((row) => ({
          rowNumber: row.rowNumber,
          status: isDuplicateError(row.errors)
            ? ("Duplicate" as const)
            : ("Invalid" as const),
          material_code: row.fields.material_code,
          short_description: row.fields.short_description,
          uom: row.fields.uom,
          hsn_code: row.fields.hsn_code,
          errors: row.errors,
        })),
      ]
        .sort((a, b) => a.rowNumber - b.rowNumber)
        .slice(0, PREVIEW_ROW_LIMIT)
    : [];

  const materialDuplicateCount = materialValidation
    ? materialValidation.invalidRows.filter((r) => isDuplicateError(r.errors))
        .length
    : 0;

  const materialInvalidOnlyCount = materialValidation
    ? materialValidation.invalidRows.length - materialDuplicateCount
    : 0;

  const locationPreviewRows = locationValidation
    ? [
        ...locationValidation.validRows.map((row) => ({
          rowNumber: row.rowNumber,
          status: "Valid" as const,
          location_code: row.location_code,
          location_description: row.location_description,
          errors: [] as string[],
        })),
        ...locationValidation.invalidRows.map((row) => ({
          rowNumber: row.rowNumber,
          status: isDuplicateError(row.errors)
            ? ("Duplicate" as const)
            : ("Invalid" as const),
          location_code: row.fields.location_code,
          location_description: row.fields.location_description,
          errors: row.errors,
        })),
      ]
        .sort((a, b) => a.rowNumber - b.rowNumber)
        .slice(0, PREVIEW_ROW_LIMIT)
    : [];

  const locationDuplicateCount = locationValidation
    ? locationValidation.invalidRows.filter((r) => isDuplicateError(r.errors))
        .length
    : 0;

  const locationInvalidOnlyCount = locationValidation
    ? locationValidation.invalidRows.length - locationDuplicateCount
    : 0;

  function statusChipColor(status: "Valid" | "Duplicate" | "Invalid") {
    if (status === "Valid") return "success";
    if (status === "Duplicate") return "warning";
    return "error";
  }

  return (
    <Box sx={{ pb: 4 }}>
      <Typography
        variant="h5"
        sx={{
          fontWeight: 800,
          letterSpacing: -0.5,
          fontSize: { xs: "1.4rem", sm: "1.75rem", md: "2.1rem" },
        }}
      >
        Import Center
      </Typography>

      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ mb: 2.5, mt: 0.5 }}
      >
        Download templates and import Material or Location data in bulk.
      </Typography>

      <Box sx={{ ...columnFlexSx, gap: 2.5 }}>

        {/* ============ MATERIAL MASTER ============ */}
        <Card elevation={0} sx={cardSx}>
          <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
            <Box sx={{ ...rowFlexSx, alignItems: "center", gap: 1.5, mb: 2 }}>
              <Avatar
                sx={{
                  bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12),
                  color: "primary.main",
                  width: 46,
                  height: 46,
                  borderRadius: 2.5,
                }}
                variant="rounded"
              >
                <Inventory2Icon />
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                  Material Master
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Template download and bulk import
                </Typography>
              </Box>
            </Box>

            <Box sx={{ ...columnFlexSx, gap: 1.25 }}>
              <Button
                variant="outlined"
                color="inherit"
                fullWidth
                startIcon={<DownloadIcon />}
                onClick={handleDownloadMaterialTemplate}
                sx={{
                  ...primaryButtonSx,
                  borderColor: "divider",
                  color: "text.primary",
                }}
              >
                Download Material Template
              </Button>

              <Button
                variant="contained"
                fullWidth
                startIcon={<CloudUploadIcon />}
                onClick={openMaterialImport}
                sx={primaryButtonSx}
              >
                Import Material Excel
              </Button>
            </Box>

            <Collapse in={materialImportOpen} timeout="auto" unmountOnExit>
              <Box
                sx={{
                  mt: 2.5,
                  p: { xs: 2, sm: 2.5 },
                  borderRadius: 3,
                  bgcolor: "grey.50",
                }}
              >
                <Box sx={{ ...rowFlexSx, alignItems: "center", gap: 1, mb: 1.25 }}>
                  <IconButton
                    onClick={closeMaterialImport}
                    size="small"
                    aria-label="Back"
                    sx={{ minWidth: 40, minHeight: 40 }}
                  >
                    <ArrowBackIcon fontSize="small" />
                  </IconButton>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    Import Material Excel
                  </Typography>
                </Box>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Supports both SAP-exported Excel files and the ESMS material
                  template. Columns are mapped automatically.
                </Typography>

                <Box sx={{ ...columnFlexSx, gap: 1.75 }}>
                  <input
                    ref={materialInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    hidden
                    onChange={handleMaterialFileChange}
                  />

                  <Button
                    variant="outlined"
                    size="large"
                    fullWidth
                    startIcon={<UploadFileIcon />}
                    onClick={() => materialInputRef.current?.click()}
                    sx={{ ...panelButtonSx, fontWeight: 600 }}
                  >
                    Choose Excel File
                  </Button>

                  <Typography variant="body2" color="text.secondary" noWrap>
                    {materialFile ? materialFile.name : "No file selected"}
                  </Typography>

                  <Button
                    variant="contained"
                    size="large"
                    fullWidth
                    startIcon={
                      materialPreviewLoading ? (
                        <CircularProgress size={20} color="inherit" />
                      ) : (
                        <VisibilityIcon />
                      )
                    }
                    onClick={handleMaterialPreview}
                    disabled={!materialFile || materialPreviewLoading}
                    sx={panelButtonSx}
                  >
                    Preview
                  </Button>

                  {materialValidation && (
                    <Box sx={{ ...rowFlexSx, flexWrap: "wrap", gap: 1 }}>
                      <Chip
                        label={`Total Rows: ${materialValidation.totalRecords}`}
                      />
                      <Chip
                        label={`Valid Rows: ${materialValidation.validRows.length}`}
                        color="success"
                      />
                      <Chip
                        label={`Duplicate Rows: ${materialDuplicateCount}`}
                        color="warning"
                      />
                      <Chip
                        label={`Invalid Rows: ${materialInvalidOnlyCount}`}
                        color="error"
                      />
                    </Box>
                  )}

                  {materialValidation && materialPreviewRows.length > 0 && (
                    <TableContainer sx={{ maxHeight: 320, overflowX: "auto", borderRadius: 2 }}>
                      <Table size="small" stickyHeader>
                        <TableHead>
                          <TableRow>
                            <TableCell>Row</TableCell>
                            <TableCell>Material Code</TableCell>
                            <TableCell>Description</TableCell>
                            <TableCell>UoM</TableCell>
                            <TableCell>HSN</TableCell>
                            <TableCell>Status</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {materialPreviewRows.map((row) => (
                            <TableRow key={row.rowNumber}>
                              <TableCell>{row.rowNumber}</TableCell>
                              <TableCell>{row.material_code}</TableCell>
                              <TableCell>{row.short_description}</TableCell>
                              <TableCell>{row.uom}</TableCell>
                              <TableCell>{row.hsn_code}</TableCell>
                              <TableCell>
                                <Chip
                                  size="small"
                                  label={row.status}
                                  color={statusChipColor(row.status)}
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
                      materialImporting ? (
                        <CircularProgress size={20} color="inherit" />
                      ) : (
                        <CloudUploadIcon />
                      )
                    }
                    onClick={handleMaterialImport}
                    disabled={
                      !materialValidation ||
                      materialValidation.validRows.length === 0 ||
                      materialImporting
                    }
                    sx={panelButtonSx}
                  >
                    Import
                  </Button>

                  {materialImporting && (
                    <Box>
                      <LinearProgress
                        variant="determinate"
                        value={
                          materialImportTotal > 0
                            ? Math.round(
                                (materialProcessed / materialImportTotal) * 100
                              )
                            : 0
                        }
                        sx={{ height: 8, borderRadius: 4 }}
                      />
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ mt: 0.5, display: "block" }}
                      >
                        Processing {materialProcessed} / {materialImportTotal}
                      </Typography>
                    </Box>
                  )}

                  {materialSummary && (
                    <Box sx={{ ...columnFlexSx, gap: 1.5 }}>
                      <Alert
                        severity={
                          materialSummary.failed > 0 ? "warning" : "success"
                        }
                        sx={{ borderRadius: 2 }}
                      >
                        Import complete. Imported: {materialSummary.imported},
                        Updated: {materialSummary.updated}, Failed:{" "}
                        {materialSummary.failed}
                      </Alert>

                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<DownloadIcon />}
                        onClick={handleDownloadMaterialReport}
                        sx={{ borderRadius: 2, fontWeight: 600, alignSelf: "flex-start" }}
                      >
                        Download Import Report
                      </Button>

                      <Box
                        sx={{
                          p: 2,
                          borderRadius: 2,
                          bgcolor: "background.paper",
                          border: "1px solid",
                          borderColor: "divider",
                        }}
                      >
                        <Typography
                          variant="subtitle2"
                          sx={{ fontWeight: 700, mb: 1 }}
                        >
                          Import Summary
                        </Typography>

                        <Box sx={{ ...rowFlexSx, flexWrap: "wrap", gap: 1 }}>
                          <Chip
                            label={`Total Excel Rows: ${
                              materialValidation?.totalRecords ?? 0
                            }`}
                          />
                          <Chip
                            label={`Sent for Import: ${materialSummary.totalRows}`}
                          />
                          <Chip
                            label={`Imported: ${materialSummary.imported}`}
                            color="success"
                          />
                          <Chip
                            label={`Updated: ${materialSummary.updated}`}
                            color="info"
                          />
                          <Chip
                            label={`Failed: ${materialSummary.failed}`}
                            color="error"
                          />
                          <Chip
                            label={`Success: ${
                              materialSummary.totalRows > 0
                                ? (
                                    ((materialSummary.imported +
                                      materialSummary.updated) /
                                      materialSummary.totalRows) *
                                    100
                                  ).toFixed(1)
                                : "0.0"
                            }%`}
                          />
                          <Chip
                            label={`Time Taken: ${(
                              materialSummary.timeTakenMs / 1000
                            ).toFixed(1)}s`}
                          />
                        </Box>
                      </Box>

                      {materialSummary.failures.length > 0 && (
                        <Box
                          sx={{
                            p: 2,
                            borderRadius: 2,
                            bgcolor: "background.paper",
                            border: "1px solid",
                            borderColor: "error.light",
                          }}
                        >
                          <Box
                            sx={{
                              ...rowFlexSx,
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 1,
                              mb: 1.5,
                              flexWrap: "wrap",
                            }}
                          >
                            <Box
                              sx={{
                                ...rowFlexSx,
                                alignItems: "center",
                                gap: 1,
                              }}
                            >
                              <ErrorIcon color="error" fontSize="small" />
                              <Typography
                                variant="subtitle2"
                                sx={{ fontWeight: 700 }}
                              >
                                Failed Records ({materialSummary.failures.length})
                              </Typography>
                            </Box>

                            <Button
                              size="small"
                              variant="outlined"
                              color="error"
                              startIcon={<DownloadIcon />}
                              onClick={handleDownloadMaterialReport}
                              sx={{ borderRadius: 2, fontWeight: 600 }}
                            >
                              Download Import Report
                            </Button>
                          </Box>

                          <TableContainer
                            sx={{
                              maxHeight: 320,
                              overflowX: "auto",
                              borderRadius: 2,
                            }}
                          >
                            <Table size="small" stickyHeader>
                              <TableHead>
                                <TableRow>
                                  <TableCell>Material Code</TableCell>
                                  <TableCell>Row</TableCell>
                                  <TableCell>Reason</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {materialSummary.failures.map(
                                  (
                                    failure: MaterialImportFailure,
                                    index: number
                                  ) => (
                                    <TableRow
                                      key={`${failure.material_code}-${index}`}
                                    >
                                      <TableCell>
                                        {failure.material_code}
                                      </TableCell>
                                      <TableCell>{failure.rowNumber}</TableCell>
                                      <TableCell>
                                        <Chip
                                          size="small"
                                          label={failure.errorCategory}
                                          color="error"
                                          sx={{ mr: 1 }}
                                        />
                                        {failure.error}
                                      </TableCell>
                                    </TableRow>
                                  )
                                )}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        </Box>
                      )}
                    </Box>
                  )}
                </Box>
              </Box>
            </Collapse>
          </CardContent>
        </Card>

        {/* ============ LOCATION MASTER ============ */}
        <Card elevation={0} sx={cardSx}>
          <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
            <Box sx={{ ...rowFlexSx, alignItems: "center", gap: 1.5, mb: 2 }}>
              <Avatar
                sx={{
                  bgcolor: (theme) => alpha(theme.palette.secondary.main, 0.12),
                  color: "secondary.main",
                  width: 46,
                  height: 46,
                  borderRadius: 2.5,
                }}
                variant="rounded"
              >
                <PlaceIcon />
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                  Location Master
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Template download and bulk import
                </Typography>
              </Box>
            </Box>

            <Box sx={{ ...columnFlexSx, gap: 1.25 }}>
              <Button
                variant="outlined"
                color="inherit"
                fullWidth
                startIcon={<DownloadIcon />}
                onClick={handleDownloadLocationTemplate}
                sx={{
                  ...primaryButtonSx,
                  borderColor: "divider",
                  color: "text.primary",
                }}
              >
                Download Location Template
              </Button>

              <Button
                variant="contained"
                fullWidth
                startIcon={<CloudUploadIcon />}
                onClick={openLocationImport}
                sx={primaryButtonSx}
              >
                Import Location Excel
              </Button>
            </Box>

            <Collapse in={locationImportOpen} timeout="auto" unmountOnExit>
              <Box
                sx={{
                  mt: 2.5,
                  p: { xs: 2, sm: 2.5 },
                  borderRadius: 3,
                  bgcolor: "grey.50",
                }}
              >
                <Box sx={{ ...rowFlexSx, alignItems: "center", gap: 1, mb: 1.25 }}>
                  <IconButton
                    onClick={closeLocationImport}
                    size="small"
                    aria-label="Back"
                    sx={{ minWidth: 40, minHeight: 40 }}
                  >
                    <ArrowBackIcon fontSize="small" />
                  </IconButton>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    Import Location Excel
                  </Typography>
                </Box>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Upload a file using the columns: Location Code, Description.
                </Typography>

                <Box sx={{ ...columnFlexSx, gap: 1.75 }}>
                  <input
                    ref={locationInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    hidden
                    onChange={handleLocationFileChange}
                  />

                  <Button
                    variant="outlined"
                    size="large"
                    fullWidth
                    startIcon={<UploadFileIcon />}
                    onClick={() => locationInputRef.current?.click()}
                    sx={{ ...panelButtonSx, fontWeight: 600 }}
                  >
                    Choose Excel File
                  </Button>

                  <Typography variant="body2" color="text.secondary" noWrap>
                    {locationFile ? locationFile.name : "No file selected"}
                  </Typography>

                  <Button
                    variant="contained"
                    size="large"
                    fullWidth
                    startIcon={
                      locationPreviewLoading ? (
                        <CircularProgress size={20} color="inherit" />
                      ) : (
                        <VisibilityIcon />
                      )
                    }
                    onClick={handleLocationPreview}
                    disabled={!locationFile || locationPreviewLoading}
                    sx={panelButtonSx}
                  >
                    Preview
                  </Button>

                  {locationValidation && (
                    <Box sx={{ ...rowFlexSx, flexWrap: "wrap", gap: 1 }}>
                      <Chip
                        label={`Total Rows: ${locationValidation.totalRecords}`}
                      />
                      <Chip
                        label={`Valid Rows: ${locationValidation.validRows.length}`}
                        color="success"
                      />
                      <Chip
                        label={`Duplicate Rows: ${locationDuplicateCount}`}
                        color="warning"
                      />
                      <Chip
                        label={`Invalid Rows: ${locationInvalidOnlyCount}`}
                        color="error"
                      />
                    </Box>
                  )}

                  {locationValidation && locationPreviewRows.length > 0 && (
                    <TableContainer sx={{ maxHeight: 320, overflowX: "auto", borderRadius: 2 }}>
                      <Table size="small" stickyHeader>
                        <TableHead>
                          <TableRow>
                            <TableCell>Row</TableCell>
                            <TableCell>Location Code</TableCell>
                            <TableCell>Description</TableCell>
                            <TableCell>Status</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {locationPreviewRows.map((row) => (
                            <TableRow key={row.rowNumber}>
                              <TableCell>{row.rowNumber}</TableCell>
                              <TableCell>{row.location_code}</TableCell>
                              <TableCell>{row.location_description}</TableCell>
                              <TableCell>
                                <Chip
                                  size="small"
                                  label={row.status}
                                  color={statusChipColor(row.status)}
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
                      locationImporting ? (
                        <CircularProgress size={20} color="inherit" />
                      ) : (
                        <CloudUploadIcon />
                      )
                    }
                    onClick={handleLocationImport}
                    disabled={
                      !locationValidation ||
                      locationValidation.validRows.length === 0 ||
                      locationImporting
                    }
                    sx={panelButtonSx}
                  >
                    Import
                  </Button>

                  {locationImporting && (
                    <Box>
                      <LinearProgress
                        variant="determinate"
                        value={locationProgress}
                        sx={{ height: 8, borderRadius: 4 }}
                      />
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ mt: 0.5, display: "block" }}
                      >
                        {locationProgress}% complete
                      </Typography>
                    </Box>
                  )}

                  {locationSummary && (
                    <Box sx={{ ...columnFlexSx, gap: 1.5 }}>
                      <Alert
                        severity={locationSummary.failed > 0 ? "warning" : "success"}
                        sx={{ borderRadius: 2 }}
                      >
                        Import complete. Imported: {locationSummary.imported},
                        Updated: {locationSummary.updated}, Failed:{" "}
                        {locationSummary.failed}
                      </Alert>

                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<DownloadIcon />}
                        onClick={handleDownloadLocationReport}
                        sx={{ borderRadius: 2, fontWeight: 600, alignSelf: "flex-start" }}
                      >
                        Download Import Report
                      </Button>

                      {locationSummary.failures.length > 0 && (
                        <TableContainer
                          sx={{ maxHeight: 260, overflowX: "auto", borderRadius: 2 }}
                        >
                          <Table size="small" stickyHeader>
                            <TableHead>
                              <TableRow>
                                <TableCell>Location Code</TableCell>
                                <TableCell>Row</TableCell>
                                <TableCell>Reason</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {locationSummary.failures.map((failure, index) => (
                                <TableRow key={`${failure.location_code}-${index}`}>
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
                  )}
                </Box>
              </Box>
            </Collapse>
          </CardContent>
        </Card>

      </Box>

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
