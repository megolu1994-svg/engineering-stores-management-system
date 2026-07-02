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

import DownloadIcon from "@mui/icons-material/Download";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import CloudSyncIcon from "@mui/icons-material/CloudSync";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import VisibilityIcon from "@mui/icons-material/Visibility";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import PlaceIcon from "@mui/icons-material/Place";

import {
  parseMaterialExcelRows,
  bulkImportMaterials,
  type MaterialValidationResult,
  type MaterialImportSummary,
} from "../services/materialService";

import {
  parseLocationExcelRows,
  bulkImportLocations,
  type LocationValidationResult,
  type LocationImportSummary,
} from "../services/locationService";

const IMPORT_BATCH_SIZE = 500;
const PREVIEW_ROW_LIMIT = 20;

type SnackbarSeverity = "success" | "error" | "warning" | "info";
type MaterialImportMode = "sap" | "esms" | null;

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
  boxShadow: "0 4px 20px rgba(15, 23, 42, 0.08)",
};

const primaryButtonSx = {
  minHeight: 56,
  fontWeight: 700,
  fontSize: "0.95rem",
  borderRadius: 3,
  justifyContent: "flex-start",
  px: 2.5,
};

const columnStackSx = {
  display: "flex",
  flexDirection: "column",
};

const rowStackSx = {
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
  const [materialMode, setMaterialMode] = useState<MaterialImportMode>(null);

  const materialInputRef = useRef<HTMLInputElement | null>(null);
  const [materialFile, setMaterialFile] = useState<File | null>(null);
  const [materialPreviewLoading, setMaterialPreviewLoading] =
    useState(false);
  const [materialValidation, setMaterialValidation] =
    useState<MaterialValidationResult | null>(null);
  const [materialImporting, setMaterialImporting] = useState(false);
  const [materialProgress, setMaterialProgress] = useState(0);
  const [materialSummary, setMaterialSummary] =
    useState<MaterialImportSummary | null>(null);

  function openMaterialImport(mode: "sap" | "esms") {
    setMaterialMode(mode);
    setMaterialFile(null);
    setMaterialValidation(null);
    setMaterialSummary(null);
    setMaterialProgress(0);
  }

  function closeMaterialImport() {
    setMaterialMode(null);
    setMaterialFile(null);
    setMaterialValidation(null);
    setMaterialSummary(null);
    setMaterialProgress(0);
  }

  function handleDownloadMaterialTemplate() {
    downloadWorkbook(
      ["Material Code", "Description", "UoM", "Quantity", "HSN Code"],
      [
        ["9000000001", "SAMPLE BEARING 6205 2RS", "EA", 10, "84821000"],
        ["9000000002", "SAMPLE GASKET SET", "EA", 25, "40169300"],
        ["9000000003", "SAMPLE HYDRAULIC OIL 68", "L", 200, "27101983"],
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
    setMaterialProgress(0);
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
    setMaterialProgress(0);
    setMaterialSummary(null);

    try {
      const summary = await bulkImportMaterials(
        materialValidation.validRows,
        IMPORT_BATCH_SIZE,
        (processed, total) =>
          setMaterialProgress(Math.round((processed / total) * 100))
      );

      setMaterialSummary(summary);

      showSnackbar(
        `Import complete. Imported: ${summary.imported}, Updated: ${summary.updated}, Failed: ${summary.failed}.`,
        summary.failed > 0 ? "warning" : "success"
      );
    } catch {
      showSnackbar("Import failed unexpectedly.", "error");
    } finally {
      setMaterialImporting(false);
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

      showSnackbar(
        `Import complete. Imported: ${summary.imported}, Updated: ${summary.updated}, Failed: ${summary.failed}.`,
        summary.failed > 0 ? "warning" : "success"
      );
    } catch {
      showSnackbar("Import failed unexpectedly.", "error");
    } finally {
      setLocationImporting(false);
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
          current_quantity: String(row.current_quantity),
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
          current_quantity: row.fields.current_quantity,
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
        sx={{ mb: 3, mt: 0.5 }}
      >
        Download templates and import Material or Location data in bulk.
      </Typography>

      <Box sx={{ ...columnStackSx, gap: 3 }}>

        {/* ============ MATERIAL MASTER ============ */}
        <Card elevation={0} sx={cardSx}>
          <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
            <Box sx={{ ...rowStackSx, alignItems: "center", gap: 1.5, mb: 2.5 }}>
              <Avatar sx={{ bgcolor: "primary.main", width: 44, height: 44 }}>
                <Inventory2Icon />
              </Avatar>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Material Master
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Download the template or import material data
                </Typography>
              </Box>
            </Box>

            <Box sx={{ ...columnStackSx, gap: 1.5 }}>
              <Button
                variant="outlined"
                fullWidth
                startIcon={<DownloadIcon />}
                onClick={handleDownloadMaterialTemplate}
                sx={primaryButtonSx}
              >
                Download ESMS Material Template
              </Button>

              <Button
                variant="contained"
                fullWidth
                startIcon={<CloudSyncIcon />}
                onClick={() => openMaterialImport("sap")}
                sx={primaryButtonSx}
              >
                Import SAP Material Excel
              </Button>

              <Button
                variant="contained"
                color="secondary"
                fullWidth
                startIcon={<CloudUploadIcon />}
                onClick={() => openMaterialImport("esms")}
                sx={primaryButtonSx}
              >
                Import ESMS Material Template
              </Button>
            </Box>

            {materialMode && (
              <Box
                sx={{
                  mt: 3,
                  p: { xs: 2, sm: 2.5 },
                  borderRadius: 3,
                  bgcolor: "grey.50",
                }}
              >
                <Box sx={{ ...rowStackSx, alignItems: "center", gap: 1, mb: 1.5 }}>
                  <IconButton
                    onClick={closeMaterialImport}
                    size="small"
                    aria-label="Back"
                    sx={{ minWidth: 40, minHeight: 40 }}
                  >
                    <ArrowBackIcon fontSize="small" />
                  </IconButton>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {materialMode === "sap"
                      ? "Import SAP Material Excel"
                      : "Import ESMS Material Template"}
                  </Typography>
                </Box>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {materialMode === "sap"
                    ? "Upload the raw Excel export from SAP. Columns such as Material, Material Description, EUn, Qty in UnE and HSN Code (if present) are mapped automatically."
                    : "Upload a file using the ESMS template columns: Material Code, Description, UoM, Quantity, HSN Code."}
                </Typography>

                <Box sx={{ ...columnStackSx, gap: 2 }}>
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
                    sx={{ minHeight: 52, borderRadius: 2.5, fontWeight: 600 }}
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
                    sx={{ minHeight: 52, borderRadius: 2.5, fontWeight: 700 }}
                  >
                    Preview
                  </Button>

                  {materialValidation && (
                    <Box sx={{ ...rowStackSx, flexWrap: "wrap", gap: 1 }}>
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
                            <TableCell>Qty</TableCell>
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
                              <TableCell>{row.current_quantity}</TableCell>
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
                    sx={{ minHeight: 52, borderRadius: 2.5, fontWeight: 700 }}
                  >
                    Import
                  </Button>

                  {materialImporting && (
                    <Box>
                      <LinearProgress
                        variant="determinate"
                        value={materialProgress}
                        sx={{ height: 8, borderRadius: 4 }}
                      />
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ mt: 0.5, display: "block" }}
                      >
                        {materialProgress}% complete
                      </Typography>
                    </Box>
                  )}

                  {materialSummary && (
                    <Alert
                      severity={materialSummary.failed > 0 ? "warning" : "success"}
                      sx={{ borderRadius: 2 }}
                    >
                      Import complete. Imported: {materialSummary.imported},
                      Updated: {materialSummary.updated}, Failed:{" "}
                      {materialSummary.failed}
                    </Alert>
                  )}
                </Box>
              </Box>
            )}
          </CardContent>
        </Card>

        {/* ============ LOCATION MASTER ============ */}
        <Card elevation={0} sx={cardSx}>
          <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
            <Box sx={{ ...rowStackSx, alignItems: "center", gap: 1.5, mb: 2.5 }}>
              <Avatar sx={{ bgcolor: "secondary.main", width: 44, height: 44 }}>
                <PlaceIcon />
              </Avatar>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Location Master
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Download the template or import location data
                </Typography>
              </Box>
            </Box>

            <Box sx={{ ...columnStackSx, gap: 1.5 }}>
              <Button
                variant="outlined"
                fullWidth
                startIcon={<DownloadIcon />}
                onClick={handleDownloadLocationTemplate}
                sx={primaryButtonSx}
              >
                Download ESMS Location Template
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

            {locationImportOpen && (
              <Box
                sx={{
                  mt: 3,
                  p: { xs: 2, sm: 2.5 },
                  borderRadius: 3,
                  bgcolor: "grey.50",
                }}
              >
                <Box sx={{ ...rowStackSx, alignItems: "center", gap: 1, mb: 1.5 }}>
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

                <Box sx={{ ...columnStackSx, gap: 2 }}>
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
                    sx={{ minHeight: 52, borderRadius: 2.5, fontWeight: 600 }}
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
                    sx={{ minHeight: 52, borderRadius: 2.5, fontWeight: 700 }}
                  >
                    Preview
                  </Button>

                  {locationValidation && (
                    <Box sx={{ ...rowStackSx, flexWrap: "wrap", gap: 1 }}>
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
                    sx={{ minHeight: 52, borderRadius: 2.5, fontWeight: 700 }}
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
                    <Alert
                      severity={locationSummary.failed > 0 ? "warning" : "success"}
                      sx={{ borderRadius: 2 }}
                    >
                      Import complete. Imported: {locationSummary.imported},
                      Updated: {locationSummary.updated}, Failed:{" "}
                      {locationSummary.failed}
                    </Alert>
                  )}
                </Box>
              </Box>
            )}
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
