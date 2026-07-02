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
  Divider,
  Grid,
  LinearProgress,
  Snackbar,
  Stack,
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

export default function ImportExport() {
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: SnackbarSeverity;
  }>({ open: false, message: "", severity: "info" });

  function showSnackbar(message: string, severity: SnackbarSeverity) {
    setSnackbar({ open: true, message, severity });
  }

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
          material_group: row.material_group,
          errors: [] as string[],
        })),
        ...materialValidation.invalidRows.map((row) => ({
          rowNumber: row.rowNumber,
          status: "Invalid" as const,
          material_code: row.fields.material_code,
          short_description: row.fields.short_description,
          uom: row.fields.uom,
          current_quantity: row.fields.current_quantity,
          hsn_code: row.fields.hsn_code,
          material_group: row.fields.material_group,
          errors: row.errors,
        })),
      ]
        .sort((a, b) => a.rowNumber - b.rowNumber)
        .slice(0, PREVIEW_ROW_LIMIT)
    : [];

  const locationPreviewRows = locationValidation
    ? [
        ...locationValidation.validRows.map((row) => ({
          rowNumber: row.rowNumber,
          status: "Valid" as const,
          location_code: row.location_code,
          location_description: row.location_description,
          location_type: row.location_type,
          errors: [] as string[],
        })),
        ...locationValidation.invalidRows.map((row) => ({
          rowNumber: row.rowNumber,
          status: "Invalid" as const,
          location_code: row.fields.location_code,
          location_description: row.fields.location_description,
          location_type: row.fields.location_type,
          errors: row.errors,
        })),
      ]
        .sort((a, b) => a.rowNumber - b.rowNumber)
        .slice(0, PREVIEW_ROW_LIMIT)
    : [];

  return (
    <Box sx={{ pb: 4 }}>
      <Typography
        variant="h5"
        sx={{
          mb: 3,
          fontWeight: "bold",
          fontSize: { xs: "1.25rem", sm: "1.5rem", md: "2rem" },
        }}
      >
        Import / Export
      </Typography>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card elevation={3} sx={{ borderRadius: 2 }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Typography variant="h6" sx={{ fontWeight: "bold" }} gutterBottom>
                Material Master Import
              </Typography>

              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Columns: Material Code, Short Description, UoM, Current
                Quantity, HSN Code, Material Group
              </Typography>

              <Divider sx={{ mb: 2 }} />

              <Stack spacing={2}>
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
                  sx={{ minHeight: 48 }}
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
                  sx={{ minHeight: 48 }}
                >
                  Preview
                </Button>

                {materialValidation && (
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ flexWrap: "wrap" }}
                    useFlexGap
                  >
                    <Chip
                      label={`Total: ${materialValidation.totalRecords}`}
                    />
                    <Chip
                      label={`Valid: ${materialValidation.validRows.length}`}
                      color="success"
                    />
                    <Chip
                      label={`Invalid: ${materialValidation.invalidRows.length}`}
                      color="error"
                    />
                  </Stack>
                )}

                {materialValidation && materialPreviewRows.length > 0 && (
                  <TableContainer sx={{ maxHeight: 320, overflowX: "auto" }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell>Row</TableCell>
                          <TableCell>Material Code</TableCell>
                          <TableCell>Description</TableCell>
                          <TableCell>UoM</TableCell>
                          <TableCell>Qty</TableCell>
                          <TableCell>HSN</TableCell>
                          <TableCell>Group</TableCell>
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
                            <TableCell>{row.material_group}</TableCell>
                            <TableCell>
                              <Chip
                                size="small"
                                label={row.status}
                                color={
                                  row.status === "Valid"
                                    ? "success"
                                    : "error"
                                }
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
                  sx={{ minHeight: 48 }}
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
                    severity={
                      materialSummary.failed > 0 ? "warning" : "success"
                    }
                  >
                    Import complete. Imported: {materialSummary.imported},
                    Updated: {materialSummary.updated}, Failed:{" "}
                    {materialSummary.failed}
                  </Alert>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card elevation={3} sx={{ borderRadius: 2 }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Typography variant="h6" sx={{ fontWeight: "bold" }} gutterBottom>
                Location Master Import
              </Typography>

              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Columns: Location Code, Location Description, Location Type
              </Typography>

              <Divider sx={{ mb: 2 }} />

              <Stack spacing={2}>
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
                  sx={{ minHeight: 48 }}
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
                  sx={{ minHeight: 48 }}
                >
                  Preview
                </Button>

                {locationValidation && (
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ flexWrap: "wrap" }}
                    useFlexGap
                  >
                    <Chip
                      label={`Total: ${locationValidation.totalRecords}`}
                    />
                    <Chip
                      label={`Valid: ${locationValidation.validRows.length}`}
                      color="success"
                    />
                    <Chip
                      label={`Invalid: ${locationValidation.invalidRows.length}`}
                      color="error"
                    />
                  </Stack>
                )}

                {locationValidation && locationPreviewRows.length > 0 && (
                  <TableContainer sx={{ maxHeight: 320, overflowX: "auto" }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell>Row</TableCell>
                          <TableCell>Location Code</TableCell>
                          <TableCell>Description</TableCell>
                          <TableCell>Type</TableCell>
                          <TableCell>Status</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {locationPreviewRows.map((row) => (
                          <TableRow key={row.rowNumber}>
                            <TableCell>{row.rowNumber}</TableCell>
                            <TableCell>{row.location_code}</TableCell>
                            <TableCell>{row.location_description}</TableCell>
                            <TableCell>{row.location_type}</TableCell>
                            <TableCell>
                              <Chip
                                size="small"
                                label={row.status}
                                color={
                                  row.status === "Valid"
                                    ? "success"
                                    : "error"
                                }
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
                  sx={{ minHeight: 48 }}
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
                    severity={
                      locationSummary.failed > 0 ? "warning" : "success"
                    }
                  >
                    Import complete. Imported: {locationSummary.imported},
                    Updated: {locationSummary.updated}, Failed:{" "}
                    {locationSummary.failed}
                  </Alert>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

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
