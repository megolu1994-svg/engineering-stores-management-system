import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import * as XLSX from "xlsx";
import {
  Alert,
  Box,
  Button,
  Chip,
  Card,
  CardContent,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  InputAdornment,
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

import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import DownloadIcon from "@mui/icons-material/Download";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import VisibilityIcon from "@mui/icons-material/Visibility";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

import MaterialForm from "../components/MaterialForm";
import MaterialTable from "../components/MaterialTable";

import {
  addMaterial,
  deleteMaterial,
  searchMaterials,
  updateMaterial,
  parseMaterialExcelRows,
  bulkImportMaterials,
  type MaterialValidationResult,
  type MaterialImportSummary,
} from "../services/materialService";

import type { Material } from "../types/material";

const SEARCH_DEBOUNCE_MS = 300;
const BROWSE_PAGE_SIZE = 50;
const SEARCH_PAGE_SIZE = 20;
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

export default function MaterialMaster() {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [materials, setMaterials] = useState<Material[]>([]);

  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);

  const [selectedMaterial, setSelectedMaterial] =
    useState<Material | null>(null);

  const [deleteMaterialData, setDeleteMaterialData] =
    useState<Material | null>(null);

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
    useState<MaterialValidationResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProcessed, setImportProcessed] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [importSummary, setImportSummary] =
    useState<MaterialImportSummary | null>(null);

  function openImport() {
    setImportOpen(true);
    setImportFile(null);
    setImportValidation(null);
    setImportSummary(null);
    setImportProcessed(0);
    setImportTotal(0);
  }

  function closeImport() {
    setImportOpen(false);
    setImportFile(null);
    setImportValidation(null);
    setImportSummary(null);
    setImportProcessed(0);
    setImportTotal(0);
  }

  function handleDownloadTemplate() {
    downloadWorkbook(
      ["Material Code", "Description", "UoM", "HSN Code"],
      [
        ["9000000001", "SAMPLE BEARING 6205 2RS", "EA", "84821000"],
        ["9000000002", "SAMPLE GASKET SET", "EA", "40169300"],
        ["9000000003", "SAMPLE HYDRAULIC OIL 68", "L", "27101983"],
      ],
      "ESMS_Material_Template.xlsx"
    );
    setSnackbarSeverity("success");
    setSnackbarMessage("Material template downloaded.");
    setSnackbarOpen(true);
  }

  function handleImportFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setImportFile(file);
    setImportValidation(null);
    setImportSummary(null);
    setImportProcessed(0);
    setImportTotal(0);
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
      const result = parseMaterialExcelRows(rows);

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
    setImportProcessed(0);
    setImportTotal(importValidation.validRows.length);
    setImportSummary(null);

    try {
      const summary = await bulkImportMaterials(
        importValidation.validRows,
        IMPORT_BATCH_SIZE,
        (processed, total) => {
          setImportProcessed(processed);
          setImportTotal(total);
        }
      );

      setImportSummary(summary);

      setSnackbarSeverity(summary.failed > 0 ? "error" : "success");
      setSnackbarMessage(
        `Import complete. Imported: ${summary.imported}, Updated: ${summary.updated}, Failed: ${summary.failed}.`
      );
      setSnackbarOpen(true);

      // Refresh the current view so newly imported materials show up.
      await loadCurrentView(search);
    } catch {
      setSnackbarSeverity("error");
      setSnackbarMessage("Import failed unexpectedly.");
      setSnackbarOpen(true);
    } finally {
      setImporting(false);
    }
  }

  const importPreviewRows = importValidation
    ? [
        ...importValidation.validRows.map((row) => ({
          rowNumber: row.rowNumber,
          status: "Valid" as const,
          material_code: row.material_code,
          short_description: row.short_description,
          uom: row.uom,
          errors: [] as string[],
        })),
        ...importValidation.invalidRows.map((row) => ({
          rowNumber: row.rowNumber,
          status: isDuplicateError(row.errors)
            ? ("Duplicate" as const)
            : ("Invalid" as const),
          material_code: row.fields.material_code,
          short_description: row.fields.short_description,
          uom: row.fields.uom,
          errors: row.errors,
        })),
      ]
        .sort((a, b) => a.rowNumber - b.rowNumber)
        .slice(0, PREVIEW_ROW_LIMIT)
    : [];

  // Loads whatever is currently "in view": either the first browse page
  // (no search text) or the current search results. This is intentionally
  // lightweight (<= 50 rows) - it never loads the entire material_master
  // table.
  const loadCurrentView = useCallback(async (query: string) => {
    const currentRequestId = ++requestId.current;

    const pageSize = query.trim() ? SEARCH_PAGE_SIZE : BROWSE_PAGE_SIZE;

    const data = await searchMaterials(query, 0, pageSize);

    if (currentRequestId === requestId.current) {
      setMaterials(data);
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
    async (material: Material) => {
      try {
        if (selectedMaterial) {
          await updateMaterial(material);

          setSnackbarSeverity("success");
          setSnackbarMessage("Material updated successfully.");
        } else {
          await addMaterial(material);

          setSnackbarSeverity("success");
          setSnackbarMessage("Material saved successfully.");
        }

        // Refresh only the current (small) view instead of reloading the
        // entire material_master table.
        await loadCurrentView(search);

        setShowForm(false);
        setSelectedMaterial(null);

        setSnackbarOpen(true);
      } catch (error: any) {
        setSnackbarSeverity("error");
        setSnackbarMessage(error.message);
        setSnackbarOpen(true);
      }
    },
    [selectedMaterial, search, loadCurrentView]
  );

  function handleEdit(material: Material) {
    setSelectedMaterial(material);
    setShowForm(true);
  }

  function handleAdd() {
    setSelectedMaterial(null);
    setShowForm(true);
  }

  const confirmDelete = useCallback(async () => {
    if (!deleteMaterialData) return;

    try {
      await deleteMaterial(deleteMaterialData.material_code);

      // Refresh only the current (small) view instead of reloading the
      // entire material_master table.
      await loadCurrentView(search);

      setSnackbarSeverity("success");
      setSnackbarMessage("Material deleted successfully.");
    } catch (error: any) {
      setSnackbarSeverity("error");
      setSnackbarMessage(error.message);
    }

    setDeleteMaterialData(null);
    setSnackbarOpen(true);
  }, [deleteMaterialData, search, loadCurrentView]);

  return (
    <Box sx={{ overflowX: "hidden" }}>

      <Typography
        variant="h5"
        sx={{
          mb: 2,
          fontWeight: 800,
          letterSpacing: -0.5,
          fontSize: { xs: "1.4rem", sm: "1.75rem", md: "2.1rem" },
        }}
      >
        Material Master
      </Typography>

      <Box
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 5,
          bgcolor: "background.default",
          pt: 0.5,
          pb: 2,
        }}
      >
        <TextField
          label="Search Material"
          placeholder="Search by Code, Description or UoM"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          fullWidth
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" />
                </InputAdornment>
              ),
            },
          }}
          sx={{
            "& .MuiOutlinedInput-root": {
              borderRadius: 3,
              bgcolor: "background.paper",
              minHeight: 56,
              boxShadow: "0 2px 10px rgba(15, 23, 42, 0.06)",
            },
          }}
        />
      </Box>

      <Button
        variant="contained"
        size="large"
        fullWidth
        startIcon={<AddIcon />}
        onClick={handleAdd}
        sx={{
          minHeight: 56,
          fontWeight: 700,
          fontSize: "1rem",
          borderRadius: 3,
          mb: 3,
          width: { xs: "100%", sm: "auto" },
        }}
      >
        Add Material
      </Button>

      <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 1, mb: 1.5 }}>
        <Button
          variant="outlined"
          color="inherit"
          fullWidth
          startIcon={<DownloadIcon />}
          onClick={handleDownloadTemplate}
          sx={{
            minHeight: 48,
            fontWeight: 600,
            borderRadius: 2.5,
            borderColor: "divider",
            color: "text.primary",
          }}
        >
          Download Template
        </Button>

        <Button
          variant="outlined"
          fullWidth
          startIcon={<CloudUploadIcon />}
          onClick={openImport}
          sx={{ minHeight: 48, fontWeight: 600, borderRadius: 2.5 }}
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
                Import Material Excel
              </Typography>
            </Box>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Columns: Material Code, Description, UoM, HSN Code.
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
                        <TableCell>Material Code</TableCell>
                        <TableCell>Description</TableCell>
                        <TableCell>UoM</TableCell>
                        <TableCell>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {importPreviewRows.map((row) => (
                        <TableRow key={row.rowNumber}>
                          <TableCell>{row.rowNumber}</TableCell>
                          <TableCell>{row.material_code}</TableCell>
                          <TableCell>{row.short_description}</TableCell>
                          <TableCell>{row.uom}</TableCell>
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
                    value={
                      importTotal > 0
                        ? Math.round((importProcessed / importTotal) * 100)
                        : 0
                    }
                    sx={{ height: 8, borderRadius: 4 }}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                    Processing {importProcessed} / {importTotal}
                  </Typography>
                </Box>
              )}

              {importSummary && (
                <Alert
                  severity={importSummary.failed > 0 ? "warning" : "success"}
                  sx={{ borderRadius: 2 }}
                >
                  Import complete. Imported: {importSummary.imported}, Updated:{" "}
                  {importSummary.updated}, Failed: {importSummary.failed}
                </Alert>
              )}
            </Box>
          </CardContent>
        </Card>
      </Collapse>

      {showForm && (
        <MaterialForm
          material={selectedMaterial}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false);
            setSelectedMaterial(null);
          }}
        />
      )}

      <MaterialTable
        materials={materials}
        onEdit={handleEdit}
        onDelete={(material) =>
          setDeleteMaterialData(material)
        }
      />

      <Dialog
        open={!!deleteMaterialData}
        onClose={() => setDeleteMaterialData(null)}
        fullWidth
        maxWidth="xs"
        fullScreen={mobile}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          Delete Material
        </DialogTitle>

        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this material? This action
            cannot be undone.
          </DialogContentText>
        </DialogContent>

        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button
            onClick={() =>
              setDeleteMaterialData(null)
            }
            fullWidth={mobile}
            sx={{ minHeight: 48, borderRadius: 2 }}
          >
            Cancel
          </Button>

          <Button
            color="error"
            variant="contained"
            onClick={confirmDelete}
            fullWidth={mobile}
            sx={{ minHeight: 48, borderRadius: 2, fontWeight: 700 }}
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
