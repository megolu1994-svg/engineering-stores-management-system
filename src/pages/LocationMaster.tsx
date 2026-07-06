import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
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
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
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
  useMediaQuery,
} from "@mui/material";

import { useTheme } from "@mui/material/styles";

import DownloadIcon from "@mui/icons-material/Download";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import VisibilityIcon from "@mui/icons-material/Visibility";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

import LocationForm from "../components/LocationForm";
import LocationTable from "../components/LocationTable";

import {
  addLocation,
  deleteLocation,
  searchLocations,
  updateLocation,
  parseLocationExcelRows,
  bulkImportLocations,
  downloadLocationImportReport,
  type LocationValidationResult,
  type LocationImportSummary,
} from "../services/locationService";

import type { Location } from "../types/location";
import { useSwipeOpenDrawer } from "../hooks/useSwipeTabs";

const SEARCH_DEBOUNCE_MS = 300;
const BROWSE_PAGE_SIZE = 50;
const SEARCH_PAGE_SIZE = 20;
const MIN_SEARCH_LENGTH = 2;
const IMPORT_BATCH_SIZE = 500;
const PREVIEW_ROW_LIMIT = 20;

function isDuplicateError(errors: string[]) {
  return errors.some((e) => e.toLowerCase().includes("duplicate"));
}

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

export default function LocationMaster() {
  useSwipeOpenDrawer();

  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [locations, setLocations] = useState<Location[]>([]);

  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);

  const [selectedLocation, setSelectedLocation] =
    useState<Location | null>(null);

  const [deleteLocationData, setDeleteLocationData] =
    useState<Location | null>(null);

  const [snackbarOpen, setSnackbarOpen] = useState(false);

  const [snackbarMessage, setSnackbarMessage] = useState("");

  const [snackbarSeverity, setSnackbarSeverity] = useState<
    "success" | "error" | "warning"
  >("success");

  const requestId = useRef(0);

  // ---------------- Import Excel ----------------
  const [importOpen, setImportOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreviewLoading, setImportPreviewLoading] = useState(false);
  const [importValidation, setImportValidation] =
    useState<LocationValidationResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importSummary, setImportSummary] =
    useState<LocationImportSummary | null>(null);

  function openImport() {
    setImportOpen(true);
    setImportFile(null);
    setImportValidation(null);
    setImportSummary(null);
    setImportProgress(0);
  }

  function closeImport() {
    setImportOpen(false);
    setImportFile(null);
    setImportValidation(null);
    setImportSummary(null);
    setImportProgress(0);
  }

  function handleDownloadTemplate() {
    downloadWorkbook(
      ["Location Code", "Description"],
      [
        ["WH-A-01-01", "Warehouse A, Rack 1, Bin 1"],
        ["WH-A-01-02", "Warehouse A, Rack 1, Bin 2"],
        ["WH-B-02-05", "Warehouse B, Rack 2, Bin 5"],
      ],
      "ESMS_Location_Template.xlsx"
    );
    setSnackbarSeverity("success");
    setSnackbarMessage("Location template downloaded.");
    setSnackbarOpen(true);
  }

  function handleImportFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setImportFile(file);
    setImportValidation(null);
    setImportSummary(null);
    setImportProgress(0);
    e.target.value = "";
  }

  async function handleImportPreview() {
    if (!importFile) {
      setSnackbarSeverity("error");
      setSnackbarMessage("Please choose an Excel file first.");
      setSnackbarOpen(true);
      return;
    }

    setImportPreviewLoading(true);
    setImportSummary(null);

    try {
      const rows = await readExcelFile(importFile);
      const result = parseLocationExcelRows(rows);

      setImportValidation(result);

      setSnackbarSeverity(result.validRows.length === 0 ? "error" : "success");
      setSnackbarMessage(
        result.validRows.length === 0
          ? "No valid records found in the file."
          : `Preview ready. ${result.validRows.length} valid record(s) found.`
      );
      setSnackbarOpen(true);
    } catch {
      setSnackbarSeverity("error");
      setSnackbarMessage("Failed to read the Excel file.");
      setSnackbarOpen(true);
    } finally {
      setImportPreviewLoading(false);
    }
  }

  async function handleImportRun() {
    if (!importValidation || importValidation.validRows.length === 0) {
      setSnackbarSeverity("warning");
      setSnackbarMessage("Please preview the file before importing.");
      setSnackbarOpen(true);
      return;
    }

    setImporting(true);
    setImportProgress(0);
    setImportSummary(null);

    try {
      const summary = await bulkImportLocations(
        importValidation.validRows,
        IMPORT_BATCH_SIZE,
        (processed, total) =>
          setImportProgress(Math.round((processed / total) * 100))
      );

      setImportSummary(summary);

      await downloadLocationImportReport(importValidation, summary, importFile?.name);

      setSnackbarSeverity(summary.failed > 0 ? "error" : "success");
      setSnackbarMessage(
        `Import complete. Imported: ${summary.imported}, Updated: ${summary.updated}, Failed: ${summary.failed}. Result report downloaded.`
      );
      setSnackbarOpen(true);

      await loadCurrentView(search);
    } catch {
      setSnackbarSeverity("error");
      setSnackbarMessage("Import failed unexpectedly.");
      setSnackbarOpen(true);
    } finally {
      setImporting(false);
    }
  }

  async function handleDownloadImportReport() {
    if (!importValidation || !importSummary) {
      return;
    }

    try {
      await downloadLocationImportReport(importValidation, importSummary, importFile?.name);
      setSnackbarSeverity("success");
      setSnackbarMessage("Import report downloaded.");
    } catch {
      setSnackbarSeverity("error");
      setSnackbarMessage("Failed to download the import report.");
    }
    setSnackbarOpen(true);
  }

  const importPreviewRows = importValidation
    ? [
        ...importValidation.validRows.map((row) => ({
          rowNumber: row.rowNumber,
          status: "Valid" as const,
          location_code: row.location_code,
          location_description: row.location_description,
          errors: [] as string[],
        })),
        ...importValidation.invalidRows.map((row) => ({
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

  function importStatusColor(status: "Valid" | "Duplicate" | "Invalid") {
    if (status === "Valid") return "success";
    if (status === "Duplicate") return "warning";
    return "error";
  }

  // Loads whatever is currently "in view": either the first browse page
  // (no search text) or the current search results (>= 2 characters).
  // This never loads the entire location_master table into memory.
  const loadCurrentView = useCallback(async (query: string) => {
    const trimmed = query.trim();

    // Below the minimum search length, keep whatever is currently shown
    // rather than firing an unnecessary request (avoids a query per
    // keystroke for 0-1 character input).
    if (trimmed.length > 0 && trimmed.length < MIN_SEARCH_LENGTH) {
      return;
    }

    const currentRequestId = ++requestId.current;

    const pageSize = trimmed ? SEARCH_PAGE_SIZE : BROWSE_PAGE_SIZE;

    const data = await searchLocations(query, 0, pageSize);

    if (currentRequestId === requestId.current) {
      setLocations(data);
    }
  }, []);

  // Initial browse page on mount.
  useEffect(() => {
    loadCurrentView("");
  }, [loadCurrentView]);

  // Debounced server-side search as the user types.
  useEffect(() => {
    const timer = setTimeout(() => {
      loadCurrentView(search);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [search, loadCurrentView]);

  const handleSave = useCallback(
    async (location: Location) => {
      try {
        if (selectedLocation) {
          await updateLocation(selectedLocation.location_code, location);

          setSnackbarSeverity("success");
          setSnackbarMessage("Location updated successfully.");
        } else {
          await addLocation(location);

          setSnackbarSeverity("success");
          setSnackbarMessage("Location saved successfully.");
        }

        // Refresh only the current (small) view instead of reloading the
        // entire location_master table.
        await loadCurrentView(search);

        setShowForm(false);
        setSelectedLocation(null);

        setSnackbarOpen(true);
      } catch (error: any) {
        setSnackbarSeverity("error");
        setSnackbarMessage(error.message);

        setSnackbarOpen(true);
      }
    },
    [selectedLocation, search, loadCurrentView]
  );

  function handleAdd() {
    setSelectedLocation(null);
    setShowForm(true);
  }

  function handleEdit(location: Location) {
    setSelectedLocation(location);
    setShowForm(true);
  }

  const confirmDelete = useCallback(async () => {
    if (!deleteLocationData) return;

    try {
      await deleteLocation(deleteLocationData.location_code);

      // Refresh only the current (small) view instead of reloading the
      // entire location_master table.
      await loadCurrentView(search);

      setSnackbarSeverity("success");
      setSnackbarMessage("Location deleted successfully.");
    } catch (error: any) {
      setSnackbarSeverity("error");
      setSnackbarMessage(error.message);
    }

    setDeleteLocationData(null);
    setSnackbarOpen(true);
  }, [deleteLocationData, search, loadCurrentView]);

  return (
    <Box>

      <Typography
        variant="h5"
        sx={{
          mb: 3,
          fontWeight: "bold",
          fontSize: { xs: "1.25rem", sm: "1.5rem", md: "2rem" },
        }}
      >
        Location Master
      </Typography>

      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          justifyContent: { sm: "space-between" },
          alignItems: { xs: "stretch", sm: "center" },
          gap: 2,
          mb: 3,
        }}
      >
        <TextField
          label="Search Location"
          placeholder="Search by Code or Description"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          fullWidth
          sx={{ width: "100%", flex: { sm: 1 }, maxWidth: { sm: 350 } }}
        />

        <Button
          variant="contained"
          size="large"
          fullWidth
          onClick={handleAdd}
          sx={{
            minHeight: 48,
            width: { xs: "100%", sm: "auto" },
          }}
        >
          Add Location
        </Button>
      </Box>

      <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 1, mb: 2 }}>
        <Button
          variant="outlined"
          color="inherit"
          fullWidth
          startIcon={<DownloadIcon />}
          onClick={handleDownloadTemplate}
          sx={{ minHeight: 48, fontWeight: 600, borderRadius: 2, width: { xs: "100%", sm: "auto" } }}
        >
          Download Template
        </Button>

        <Button
          variant="outlined"
          fullWidth
          startIcon={<CloudUploadIcon />}
          onClick={openImport}
          sx={{ minHeight: 48, fontWeight: 600, borderRadius: 2, width: { xs: "100%", sm: "auto" } }}
        >
          Import Excel
        </Button>
      </Box>

      <Collapse in={importOpen} timeout="auto" unmountOnExit>
        <Card elevation={0} sx={{ borderRadius: 3, mb: 3, boxShadow: "0 2px 14px rgba(15, 23, 42, 0.06)" }}>
          <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.25 }}>
              <IconButton
                onClick={closeImport}
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
              Columns: Location Code, Description.
            </Typography>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.75 }}>
              <input
                ref={importInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                hidden
                onChange={handleImportFileChange}
              />

              <Button
                variant="outlined"
                size="large"
                fullWidth
                startIcon={<UploadFileIcon />}
                onClick={() => importInputRef.current?.click()}
                sx={{ minHeight: 52, borderRadius: 2.5, fontWeight: 600 }}
              >
                Choose Excel File
              </Button>

              <Typography variant="body2" color="text.secondary" noWrap>
                {importFile ? importFile.name : "No file selected"}
              </Typography>

              <Button
                variant="contained"
                size="large"
                fullWidth
                startIcon={
                  importPreviewLoading ? (
                    <CircularProgress size={20} color="inherit" />
                  ) : (
                    <VisibilityIcon />
                  )
                }
                onClick={handleImportPreview}
                disabled={!importFile || importPreviewLoading}
                sx={{ minHeight: 52, borderRadius: 2.5, fontWeight: 700 }}
              >
                Preview
              </Button>

              {importValidation && (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                  <Chip label={`Total Rows: ${importValidation.totalRecords}`} />
                  <Chip
                    label={`Valid Rows: ${importValidation.validRows.length}`}
                    color="success"
                  />
                  <Chip
                    label={`Invalid Rows: ${importValidation.invalidRows.length}`}
                    color="error"
                  />
                </Box>
              )}

              {importValidation && importPreviewRows.length > 0 && (
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
                      {importPreviewRows.map((row) => (
                        <TableRow key={row.rowNumber}>
                          <TableCell>{row.rowNumber}</TableCell>
                          <TableCell>{row.location_code}</TableCell>
                          <TableCell>{row.location_description}</TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={row.status}
                              color={importStatusColor(row.status)}
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
                onClick={handleImportRun}
                disabled={
                  !importValidation ||
                  importValidation.validRows.length === 0 ||
                  importing
                }
                sx={{ minHeight: 52, borderRadius: 2.5, fontWeight: 700 }}
              >
                Import
              </Button>

              {importing && (
                <Box>
                  <LinearProgress
                    variant="determinate"
                    value={importProgress}
                    sx={{ height: 8, borderRadius: 4 }}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                    {importProgress}% complete
                  </Typography>
                </Box>
              )}

              {importSummary && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                  <Alert
                    severity={importSummary.failed > 0 ? "warning" : "success"}
                    sx={{ borderRadius: 2 }}
                  >
                    Import complete. Imported: {importSummary.imported}, Updated:{" "}
                    {importSummary.updated}, Failed: {importSummary.failed}
                  </Alert>

                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<DownloadIcon />}
                    onClick={handleDownloadImportReport}
                    sx={{ borderRadius: 2, fontWeight: 600, alignSelf: "flex-start" }}
                  >
                    Download Import Report
                  </Button>

                  {importSummary.failures.length > 0 && (
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
                          {importSummary.failures.map((failure, index) => (
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
          </CardContent>
        </Card>
      </Collapse>

      {showForm && (
        <LocationForm
          location={selectedLocation}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false);
            setSelectedLocation(null);
          }}
        />
      )}

      <LocationTable
        locations={locations}
        onEdit={handleEdit}
        onDelete={(location) =>
          setDeleteLocationData(location)
        }
      />

      <Dialog
        open={!!deleteLocationData}
        onClose={() => setDeleteLocationData(null)}
        fullWidth
        maxWidth="xs"
        fullScreen={mobile}
      >
        <DialogTitle>
          Delete Location
        </DialogTitle>

        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this location?
          </DialogContentText>
        </DialogContent>

        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button
            onClick={() => setDeleteLocationData(null)}
            fullWidth={mobile}
            sx={{ minHeight: 48 }}
          >
            Cancel
          </Button>

          <Button
            color="error"
            variant="contained"
            onClick={confirmDelete}
            fullWidth={mobile}
            sx={{ minHeight: 48 }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
      >
        <Alert
          severity={snackbarSeverity}
          variant="filled"
          onClose={() => setSnackbarOpen(false)}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>

    </Box>
  );
}
