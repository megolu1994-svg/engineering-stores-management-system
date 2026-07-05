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
  Menu,
  MenuItem,
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
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import PhotoLibraryIcon from "@mui/icons-material/PhotoLibrary";

import MaterialForm from "../components/MaterialForm";
import MaterialMasterListView from "../components/MaterialMasterListView";
import MaterialInfoDialog from "../components/MaterialInfoDialog";

import {
  addMaterial,
  deleteMaterial,
  searchMaterials,
  updateMaterial,
  parseMaterialExcelRows,
  bulkImportMaterials,
  getMaterialsCount,
  getLastMaterialUpdate,
  type MaterialValidationResult,
  type MaterialImportSummary,
} from "../services/materialService";
import { uploadMaterialPhoto } from "../services/materialPhotoService";

import type { Material } from "../types/material";
import { useSwipeOpenDrawer } from "../hooks/useSwipeTabs";

const SEARCH_DEBOUNCE_MS = 300;
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
  useSwipeOpenDrawer();

  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("sm"));

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
      await refreshCurrentView();
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

  // ---------------- Paginated material list ----------------
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const loadMaterials = useCallback(
    async (query: string, page: number, pageSize: number) => {
      const currentRequestId = ++requestId.current;

      const [data, count] = await Promise.all([
        searchMaterials(query, page, pageSize),
        getMaterialsCount(query),
      ]);

      if (currentRequestId === requestId.current) {
        setMaterials(data);
        setTotalCount(count);
      }
    },
    []
  );

  // Debounce only the search text - page/page-size changes should feel instant.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    loadMaterials(debouncedSearch, page, pageSize);
  }, [debouncedSearch, page, pageSize, loadMaterials]);

  useEffect(() => {
    getLastMaterialUpdate()
      .then(setLastUpdated)
      .catch(() => setLastUpdated(null));
  }, []);

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(0);
  }

  function handlePageSizeChange(newPageSize: number) {
    setPageSize(newPageSize);
    setPage(0);
  }

  // Refreshes the current page after an add/edit/delete/import mutation.
  async function refreshCurrentView() {
    await Promise.all([
      loadMaterials(debouncedSearch, page, pageSize),
      getLastMaterialUpdate()
        .then(setLastUpdated)
        .catch(() => {}),
    ]);
  }

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

        // Refresh only the current (small) page instead of reloading the
        // entire material_master table.
        await Promise.all([
          loadMaterials(debouncedSearch, page, pageSize),
          getLastMaterialUpdate()
            .then(setLastUpdated)
            .catch(() => {}),
        ]);

        setShowForm(false);
        setSelectedMaterial(null);

        setSnackbarOpen(true);
      } catch (error: any) {
        setSnackbarSeverity("error");
        setSnackbarMessage(error.message);
        setSnackbarOpen(true);
      }
    },
    [selectedMaterial, debouncedSearch, page, pageSize, loadMaterials]
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

      // Refresh only the current (small) page instead of reloading the
      // entire material_master table.
      await Promise.all([
        loadMaterials(debouncedSearch, page, pageSize),
        getLastMaterialUpdate()
          .then(setLastUpdated)
          .catch(() => {}),
      ]);

      setSnackbarSeverity("success");
      setSnackbarMessage("Material deleted successfully.");
    } catch (error: any) {
      setSnackbarSeverity("error");
      setSnackbarMessage(error.message);
    }

    setDeleteMaterialData(null);
    setSnackbarOpen(true);
  }, [deleteMaterialData, debouncedSearch, page, pageSize, loadMaterials]);

  // ---------------- Material photo upload ----------------
  const [photoMenuAnchor, setPhotoMenuAnchor] = useState<HTMLElement | null>(null);
  const [photoMenuMaterial, setPhotoMenuMaterial] = useState<Material | null>(null);
  const [uploadingPhotoCode, setUploadingPhotoCode] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  function handleOpenPhotoMenu(material: Material, anchorEl: HTMLElement) {
    setPhotoMenuMaterial(material);
    setPhotoMenuAnchor(anchorEl);
  }

  function closePhotoMenu() {
    setPhotoMenuAnchor(null);
  }

  function handleTakePhoto() {
    closePhotoMenu();
    cameraInputRef.current?.click();
  }

  function handleChooseFromGallery() {
    closePhotoMenu();
    galleryInputRef.current?.click();
  }

  async function handlePhotoFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file || !photoMenuMaterial) return;

    const materialCode = photoMenuMaterial.material_code;
    setUploadingPhotoCode(materialCode);

    try {
      await uploadMaterialPhoto(materialCode, file);
      setSnackbarSeverity("success");
      setSnackbarMessage("Photo uploaded successfully.");
    } catch (error: any) {
      setSnackbarSeverity("error");
      setSnackbarMessage(error?.message || "Failed to upload photo. Please try again.");
    } finally {
      setUploadingPhotoCode(null);
      setPhotoMenuMaterial(null);
      setSnackbarOpen(true);
    }
  }

  // ---------------- Material info dialog ----------------
  const [infoMaterial, setInfoMaterial] = useState<Material | null>(null);

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
          onChange={(e) => handleSearchChange(e.target.value)}
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

      <Box sx={{ display: "flex", gap: { xs: 0.75, sm: 1.5 }, mb: 3 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon fontSize="small" />}
          onClick={handleAdd}
          sx={{
            flex: { xs: 1, sm: "0 0 auto" },
            minWidth: 0,
            minHeight: { xs: 44, sm: 56 },
            px: { xs: 0.5, sm: 3 },
            fontWeight: 700,
            fontSize: { xs: "0.68rem", sm: "1rem" },
            borderRadius: 3,
            whiteSpace: "nowrap",
            "& .MuiButton-startIcon": { mr: { xs: 0.5, sm: 1 } },
          }}
        >
          Add Material
        </Button>

        <Button
          variant="outlined"
          color="inherit"
          startIcon={<DownloadIcon fontSize="small" />}
          onClick={handleDownloadTemplate}
          sx={{
            flex: { xs: 1, sm: "0 0 auto" },
            minWidth: 0,
            minHeight: { xs: 44, sm: 48 },
            px: { xs: 0.5, sm: 2.5 },
            fontWeight: 600,
            fontSize: { xs: "0.68rem", sm: "0.95rem" },
            borderRadius: 2.5,
            borderColor: "divider",
            color: "text.primary",
            whiteSpace: "nowrap",
            "& .MuiButton-startIcon": { mr: { xs: 0.5, sm: 1 } },
          }}
        >
          Download Template
        </Button>

        <Button
          variant="outlined"
          startIcon={<CloudUploadIcon fontSize="small" />}
          onClick={openImport}
          sx={{
            flex: { xs: 1, sm: "0 0 auto" },
            minWidth: 0,
            minHeight: { xs: 44, sm: 48 },
            px: { xs: 0.5, sm: 2.5 },
            fontWeight: 600,
            fontSize: { xs: "0.68rem", sm: "0.95rem" },
            borderRadius: 2.5,
            whiteSpace: "nowrap",
            "& .MuiButton-startIcon": { mr: { xs: 0.5, sm: 1 } },
          }}
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

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={handlePhotoFileSelected}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handlePhotoFileSelected}
      />

      <Menu anchorEl={photoMenuAnchor} open={!!photoMenuAnchor} onClose={closePhotoMenu}>
        <MenuItem onClick={handleTakePhoto}>
          <PhotoCameraIcon fontSize="small" sx={{ mr: 1 }} />
          Take Photo
        </MenuItem>
        <MenuItem onClick={handleChooseFromGallery}>
          <PhotoLibraryIcon fontSize="small" sx={{ mr: 1 }} />
          Choose From Gallery
        </MenuItem>
      </Menu>

      <MaterialMasterListView
        materials={materials}
        totalCount={totalCount}
        lastUpdated={lastUpdated}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={handlePageSizeChange}
        onEdit={handleEdit}
        onDelete={(material) => setDeleteMaterialData(material)}
        onUploadPhoto={handleOpenPhotoMenu}
        uploadingPhotoCode={uploadingPhotoCode}
        onRowClick={setInfoMaterial}
      />

      <MaterialInfoDialog material={infoMaterial} onClose={() => setInfoMaterial(null)} />

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
