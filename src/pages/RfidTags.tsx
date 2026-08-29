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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  LinearProgress,
  Snackbar,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import Inventory2Icon from "@mui/icons-material/Inventory2";

import {
  getRfidTags,
  addRfidTag,
  updateRfidTag,
  deleteRfidTag,
  bulkImportRfidTags,
  getRfidStockSummary,
  type RfidTag,
  type RfidTagInput,
  type RfidStockRow,
  type BulkRfidRow,
} from "../services/rfidTagService";
import { searchMaterials } from "../services/materialService";
import type { Material } from "../types/material";
import { BOTTOM_NAV_OFFSET } from "../components/AppLayout";

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const TAB_REGISTER = 0;
const TAB_BULK_IMPORT = 1;
const TAB_STOCK = 2;

const SEARCH_DEBOUNCE_MS = 300;

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function downloadWorkbook(
  headers: string[],
  rows: (string | number)[][],
  filename: string
) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = headers.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "RFID Tags");
  XLSX.writeFile(wb, filename);
}

function downloadTemplate() {
  downloadWorkbook(
    ["rfid_code", "material_code", "quantity", "uom", "storage_location", "notes"],
    [["E2801160C00000000000001A", "219", 50, "KG", "Ware House", "First batch"]],
    "rfid_import_template.xlsx"
  );
}

/* ------------------------------------------------------------------ */
/*  Empty form                                                        */
/* ------------------------------------------------------------------ */

const emptyForm: RfidTagInput = {
  rfid_code: "",
  material_code: "",
  quantity: 1,
  uom: "NOS",
  storage_location: "",
  status: "active",
  notes: "",
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function RfidTags() {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("sm"));

  /* ---- state ---- */
  const [activeTab, setActiveTab] = useState(TAB_REGISTER);

  // Tag list
  const [tags, setTags] = useState<RfidTag[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Add / Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<RfidTag | null>(null);
  const [form, setForm] = useState<RfidTagInput>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Material search for autocomplete
  const [matQuery, setMatQuery] = useState("");
  const [matOptions, setMatOptions] = useState<Material[]>([]);
  const [matSearching, setMatSearching] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<RfidTag | null>(null);

  // Bulk import
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<{
    imported: number;
    errors: Array<{ row: number; message: string }>;
  } | null>(null);

  // Scan mode
  const [scanMode, setScanMode] = useState(false);
  const [scanBuffer, setScanBuffer] = useState("");
  const scanInputRef = useRef<HTMLInputElement>(null);

  // Stock summary
  const [stockRows, setStockRows] = useState<RfidStockRow[]>([]);
  const [stockLoading, setStockLoading] = useState(false);

  // Snackbar
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    msg: string;
    severity: "success" | "error" | "warning";
  }>({ open: false, msg: "", severity: "success" });

  /* ---- data loading ---- */

  const loadTags = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getRfidTags(search, statusFilter);
      setTags(data);
    } catch {
      setSnackbar({ open: true, msg: "Failed to load RFID tags.", severity: "error" });
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  const loadStock = useCallback(async () => {
    setStockLoading(true);
    try {
      const data = await getRfidStockSummary();
      setStockRows(data);
    } catch {
      setSnackbar({ open: true, msg: "Failed to load stock summary.", severity: "error" });
    } finally {
      setStockLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === TAB_REGISTER) loadTags();
    if (activeTab === TAB_STOCK) loadStock();
  }, [activeTab, loadTags, loadStock]);

  /* ---- search debounce ---- */

  function handleSearchChange(value: string) {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      /* loadTags is called via useEffect when `search` state changes */
    }, SEARCH_DEBOUNCE_MS);
  }

  /* ---- material search ---- */

  useEffect(() => {
    if (!matQuery.trim()) {
      setMatOptions([]);
      return;
    }
    let cancelled = false;
    setMatSearching(true);
    searchMaterials(matQuery, 0, 15)
      .then((mats) => {
        if (!cancelled) setMatOptions(mats);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setMatSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [matQuery]);

  /* ---- add / edit ---- */

  function openAddDialog() {
    setEditingTag(null);
    setForm({ ...emptyForm });
    setFormError("");
    setMatQuery("");
    setDialogOpen(true);
  }

  function openEditDialog(tag: RfidTag) {
    setEditingTag(tag);
    setForm({
      rfid_code: tag.rfid_code,
      material_code: tag.material_code,
      quantity: tag.quantity,
      uom: tag.uom,
      storage_location: tag.storage_location ?? "",
      status: tag.status,
      notes: tag.notes ?? "",
    });
    setFormError("");
    setMatQuery(tag.material_code);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.rfid_code.trim()) {
      setFormError("RFID code is required.");
      return;
    }
    if (!form.material_code.trim()) {
      setFormError("Material code is required.");
      return;
    }
    if (!form.quantity || form.quantity <= 0) {
      setFormError("Quantity must be greater than 0.");
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      if (editingTag) {
        await updateRfidTag(editingTag.id, form);
        setSnackbar({ open: true, msg: "Tag updated successfully.", severity: "success" });
      } else {
        await addRfidTag(form);
        setSnackbar({ open: true, msg: "Tag added successfully.", severity: "success" });
      }
      setDialogOpen(false);
      loadTags();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Save failed.";
      if (msg.includes("duplicate") || msg.includes("unique")) {
        setFormError("This RFID code is already registered.");
      } else {
        setFormError(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  /* ---- delete ---- */

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteRfidTag(deleteTarget.id);
      setSnackbar({ open: true, msg: "Tag deleted.", severity: "success" });
      loadTags();
    } catch {
      setSnackbar({ open: true, msg: "Delete failed.", severity: "error" });
    }
    setDeleteTarget(null);
  }

  /* ---- scan mode ---- */

  useEffect(() => {
    if (!scanMode) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Enter" && scanBuffer.trim()) {
        // Pre-fill the RFID code in the add dialog
        setEditingTag(null);
        setForm({ ...emptyForm, rfid_code: scanBuffer.trim() });
        setFormError("");
        setMatQuery("");
        setDialogOpen(true);
        setScanBuffer("");
        setScanMode(false);
      } else {
        setScanBuffer((prev) => prev + e.key);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    scanInputRef.current?.focus();
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [scanMode, scanBuffer]);

  /* ---- bulk import ---- */

  async function handleImportPreview() {
    if (!importFile) return;
    try {
      const buffer = await importFile.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

      const mapped: BulkRfidRow[] = rows.map((r) => ({
        rfid_code: String(r.rfid_code ?? r["RFID Code"] ?? r["rfid code"] ?? "").trim(),
        material_code: String(r.material_code ?? r["Material Code"] ?? r["material code"] ?? "").trim(),
        quantity: Number(r.quantity ?? r["Quantity"] ?? 0),
        uom: String(r.uom ?? r["UOM"] ?? "NOS").trim(),
        storage_location: String(r.storage_location ?? r["Storage Location"] ?? r.location ?? "").trim() || undefined,
        notes: String(r.notes ?? r["Notes"] ?? "").trim() || undefined,
      }));

      const result = await bulkImportRfidTags(mapped);
      setImportResult(result);

      if (result.errors.length === 0) {
        setSnackbar({ open: true, msg: `${result.imported} tag(s) imported successfully.`, severity: "success" });
      } else {
        setSnackbar({ open: true, msg: `Imported: ${result.imported}, Errors: ${result.errors.length}`, severity: result.imported > 0 ? "warning" : "error" });
      }

      if (result.imported > 0) loadTags();
    } catch {
      setSnackbar({ open: true, msg: "Failed to read file.", severity: "error" });
    } finally {
      setImporting(false);
      setImportProgress(0);
    }
  }

  /* ---- field update ---- */

  function updateField<K extends keyof RfidTagInput>(key: K, value: RfidTagInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /* ============================================================== */
  /*  RENDER                                                        */
  /* ============================================================== */

  return (
    <Box sx={{ pb: BOTTOM_NAV_OFFSET }}>
      {/* Title */}
      <Typography
        variant="h5"
        sx={{
          mb: 2,
          fontWeight: 800,
          letterSpacing: -0.5,
          fontSize: { xs: "1.4rem", sm: "1.75rem", md: "2.1rem" },
        }}
      >
        RFID Tags
      </Typography>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{ mb: 2 }}
        variant={mobile ? "fullWidth" : "standard"}
      >
        <Tab
          icon={<QrCodeScannerIcon />}
          iconPosition="start"
          label="Tag Registration"
          sx={{ minHeight: 44, textTransform: "none", fontWeight: 600 }}
        />
        <Tab
          icon={<UploadFileIcon />}
          iconPosition="start"
          label="Bulk Import"
          sx={{ minHeight: 44, textTransform: "none", fontWeight: 600 }}
        />
        <Tab
          icon={<Inventory2Icon />}
          iconPosition="start"
          label="RFID Stock"
          sx={{ minHeight: 44, textTransform: "none", fontWeight: 600 }}
        />
      </Tabs>

      {/* ============================================================ */}
      {/*  TAB 1: TAG REGISTRATION                                     */}
      {/* ============================================================ */}
      {activeTab === TAB_REGISTER && (
        <>
          {/* Toolbar */}
          <Box
            sx={{
              display: "flex",
              gap: 1,
              mb: 2,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <TextField
              size="small"
              placeholder="Search RFID / Material / Location"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              sx={{ flex: 1, minWidth: 200 }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
            />

            <TextField
              size="small"
              select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              sx={{ minWidth: 120 }}
              slotProps={{ select: { native: true } }}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="damaged">Damaged</option>
              <option value="decommissioned">Decommissioned</option>
            </TextField>

            <Button
              variant="contained"
              startIcon={<QrCodeScannerIcon />}
              onClick={() => {
                setScanMode(true);
                setScanBuffer("");
              }}
              sx={{ textTransform: "none" }}
            >
              Scan Tag
            </Button>

            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={openAddDialog}
              sx={{ textTransform: "none" }}
            >
              Add Tag
            </Button>
          </Box>

          {/* Tag count */}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {tags.length} tag(s) found
          </Typography>

          {/* Table / Cards */}
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress />
            </Box>
          ) : tags.length === 0 ? (
            <Card sx={{ textAlign: "center", py: 6 }}>
              <CardContent>
                <QrCodeScannerIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
                <Typography color="text.secondary">
                  No RFID tags registered yet. Click "Add Tag" or "Scan Tag" to begin.
                </Typography>
              </CardContent>
            </Card>
          ) : mobile ? (
            /* Mobile: card list */
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              {tags.map((tag) => (
                <Card key={tag.id} variant="outlined" sx={{ p: 1.5 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, wordBreak: "break-all" }}>
                        {tag.rfid_code}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Mat: {tag.material_code} &middot; {tag.quantity} {tag.uom}
                      </Typography>
                      {tag.storage_location && (
                        <Typography variant="body2" color="text.secondary">
                          Loc: {tag.storage_location}
                        </Typography>
                      )}
                    </Box>
                    <Box sx={{ display: "flex", gap: 0.5, ml: 1 }}>
                      <Chip
                        size="small"
                        label={tag.status}
                        color={
                          tag.status === "active"
                            ? "success"
                            : tag.status === "damaged"
                              ? "warning"
                              : "default"
                        }
                        sx={{ textTransform: "capitalize", fontSize: "0.7rem" }}
                      />
                      <IconButton size="small" onClick={() => openEditDialog(tag)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => setDeleteTarget(tag)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>
                </Card>
              ))}
            </Box>
          ) : (
            /* Desktop: table */
            <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: "grey.50" }}>
                    <TableCell sx={{ fontWeight: 700 }}>RFID Code</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Material</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Qty</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>UOM</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Location</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Created</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tags.map((tag) => (
                    <TableRow key={tag.id} hover>
                      <TableCell>
                        <Tooltip title={tag.rfid_code}>
                          <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: "0.8rem" }}>
                            {tag.rfid_code.length > 24
                              ? tag.rfid_code.slice(0, 24) + "..."
                              : tag.rfid_code}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell>{tag.material_code}</TableCell>
                      <TableCell align="right">{tag.quantity}</TableCell>
                      <TableCell>{tag.uom}</TableCell>
                      <TableCell>{tag.storage_location ?? "-"}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={tag.status}
                          color={
                            tag.status === "active"
                              ? "success"
                              : tag.status === "damaged"
                                ? "warning"
                                : "default"
                          }
                          sx={{ textTransform: "capitalize", fontSize: "0.7rem" }}
                        />
                      </TableCell>
                      <TableCell>
                        {new Date(tag.created_at).toLocaleDateString("en-IN")}
                      </TableCell>
                      <TableCell align="center">
                        <IconButton size="small" onClick={() => openEditDialog(tag)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => setDeleteTarget(tag)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}

      {/* ============================================================ */}
      {/*  TAB 2: BULK IMPORT                                          */}
      {/* ============================================================ */}
      {activeTab === TAB_BULK_IMPORT && (
        <Card sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="h6" sx={{ mb: 1, fontWeight: 700 }}>
            Bulk Import RFID Tags
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Upload an Excel/CSV file with columns: <strong>rfid_code</strong>,{" "}
            <strong>material_code</strong>, <strong>quantity</strong>,{" "}
            <strong>uom</strong>, <strong>storage_location</strong> (optional),{" "}
            <strong>notes</strong> (optional). Duplicate RFID codes will be updated.
          </Typography>

          <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
            <Button
              variant="outlined"
              size="small"
              onClick={downloadTemplate}
              sx={{ textTransform: "none" }}
            >
              Download Template
            </Button>

            <Button
              variant="contained"
              component="label"
              startIcon={<CloudUploadIcon />}
              disabled={importing}
              sx={{ textTransform: "none" }}
            >
              Select File
              <input
                type="file"
                hidden
                accept=".xlsx,.xls,.csv"
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setImportFile(file);
                    setImportResult(null);
                  }
                }}
              />
            </Button>

            {importFile && (
              <Button
                variant="contained"
                color="success"
                startIcon={<UploadFileIcon />}
                onClick={() => {
                  setImporting(true);
                  handleImportPreview();
                }}
                disabled={importing}
                sx={{ textTransform: "none" }}
              >
                Import Now
              </Button>
            )}
          </Box>

          {importFile && (
            <Typography variant="body2" sx={{ mb: 1 }}>
              Selected: <strong>{importFile.name}</strong>
            </Typography>
          )}

          {importing && (
            <Box sx={{ mb: 2 }}>
              <LinearProgress variant="determinate" value={importProgress} />
            </Box>
          )}

          {importResult && (
            <Box sx={{ mt: 2 }}>
              <Alert severity={importResult.errors.length === 0 ? "success" : "warning"}>
                Imported: <strong>{importResult.imported}</strong> tag(s)
                {importResult.errors.length > 0 && (
                  <> &middot; Errors: <strong>{importResult.errors.length}</strong></>
                )}
              </Alert>

              {importResult.errors.length > 0 && (
                <Box sx={{ mt: 1, maxHeight: 200, overflow: "auto" }}>
                  {importResult.errors.map((err, i) => (
                    <Typography key={i} variant="body2" color="error">
                      Row {err.row}: {err.message}
                    </Typography>
                  ))}
                </Box>
              )}
            </Box>
          )}
        </Card>
      )}

      {/* ============================================================ */}
      {/*  TAB 3: RFID STOCK SUMMARY                                   */}
      {/* ============================================================ */}
      {activeTab === TAB_STOCK && (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Active RFID stock grouped by material code. Total:{" "}
            <strong>
              {stockRows.reduce((s, r) => s + r.total_tags, 0)} tags
            </strong>{" "}
            across <strong>{stockRows.length} materials</strong>
          </Typography>

          {stockLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress />
            </Box>
          ) : stockRows.length === 0 ? (
            <Card sx={{ textAlign: "center", py: 6 }}>
              <CardContent>
                <Inventory2Icon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
                <Typography color="text.secondary">
                  No active RFID tags to display.
                </Typography>
              </CardContent>
            </Card>
          ) : mobile ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              {stockRows.map((row) => (
                <Card key={row.material_code} variant="outlined" sx={{ p: 1.5 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        {row.material_code}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {row.short_description}
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: "right" }}>
                      <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                        {row.total_quantity} {row.uom}
                      </Typography>
                      <Chip size="small" label={`${row.total_tags} tags`} sx={{ fontSize: "0.7rem" }} />
                    </Box>
                  </Box>
                </Card>
              ))}
            </Box>
          ) : (
            <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: "grey.50" }}>
                    <TableCell sx={{ fontWeight: 700 }}>Material Code</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Total Qty</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>UOM</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Tags</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stockRows.map((row) => (
                    <TableRow key={row.material_code} hover>
                      <TableCell>{row.material_code}</TableCell>
                      <TableCell>{row.short_description}</TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {row.total_quantity}
                        </Typography>
                      </TableCell>
                      <TableCell>{row.uom}</TableCell>
                      <TableCell align="right">{row.total_tags}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}

      {/* ============================================================ */}
      {/*  ADD / EDIT DIALOG                                          */}
      {/* ============================================================ */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        fullWidth
        maxWidth="sm"
        fullScreen={mobile}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          {editingTag ? "Edit RFID Tag" : "Register RFID Tag"}
        </DialogTitle>
        <DialogContent sx={{ pt: "16px !important" }}>
          {formError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {formError}
            </Alert>
          )}

          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              label="RFID Code (EPC/TID)"
              size="small"
              fullWidth
              value={form.rfid_code}
              onChange={(e) => updateField("rfid_code", e.target.value)}
              placeholder="e.g. E2801160C00000000000001A"
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            />

            {/* Material code with search */}
            <TextField
              label="Material Code"
              size="small"
              fullWidth
              value={form.material_code}
              onChange={(e) => {
                updateField("material_code", e.target.value);
                setMatQuery(e.target.value);
              }}
              placeholder="Search material code..."
              slotProps={{
                input: {
                  endAdornment: matSearching ? (
                    <CircularProgress size={16} />
                  ) : null,
                },
              }}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            />
            {matOptions.length > 0 && (
              <Box
                sx={{
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                  maxHeight: 150,
                  overflow: "auto",
                }}
              >
                {matOptions.map((m) => (
                  <Box
                    key={m.material_code}
                    sx={{
                      px: 1.5,
                      py: 0.75,
                      cursor: "pointer",
                      "&:hover": { bgcolor: "action.hover" },
                    }}
                    onClick={() => {
                      updateField("material_code", m.material_code);
                      updateField("uom", m.uom);
                      setMatQuery(m.material_code);
                      setMatOptions([]);
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {m.material_code}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {m.short_description} &middot; {m.uom}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}

            <Box sx={{ display: "flex", gap: 2 }}>
              <TextField
                label="Quantity (per tag)"
                size="small"
                type="number"
                fullWidth
                value={form.quantity}
                onChange={(e) => updateField("quantity", Number(e.target.value))}
                slotProps={{ htmlInput: { min: 0 } }}
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
              />
              <TextField
                label="UOM"
                size="small"
                fullWidth
                value={form.uom}
                onChange={(e) => updateField("uom", e.target.value)}
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
              />
            </Box>

            <TextField
              label="Storage Location"
              size="small"
              fullWidth
              value={form.storage_location}
              onChange={(e) => updateField("storage_location", e.target.value)}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            />

            <TextField
              label="Status"
              size="small"
              fullWidth
              select
              value={form.status}
              onChange={(e) => updateField("status", e.target.value as RfidTagInput["status"])}
              slotProps={{ select: { native: true } }}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            >
              <option value="active">Active</option>
              <option value="damaged">Damaged</option>
              <option value="decommissioned">Decommissioned</option>
            </TextField>

            <TextField
              label="Notes"
              size="small"
              fullWidth
              multiline
              minRows={2}
              value={form.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)} sx={{ textTransform: "none" }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            sx={{ textTransform: "none" }}
          >
            {saving ? <CircularProgress size={20} /> : editingTag ? "Update" : "Register"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ============================================================ */}
      {/*  SCAN MODE OVERLAY                                          */}
      {/* ============================================================ */}
      {scanMode && (
        <Box
          sx={{
            position: "fixed",
            inset: 0,
            bgcolor: "rgba(0,0,0,0.7)",
            zIndex: 1300,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
          }}
          onClick={() => {
            setScanMode(false);
            setScanBuffer("");
          }}
        >
          <QrCodeScannerIcon sx={{ fontSize: 64, color: "white" }} />
          <Typography variant="h5" color="white" sx={{ fontWeight: 700 }}>
            Scan RFID Tag
          </Typography>
          <Typography variant="body2" color="rgba(255,255,255,0.7)">
            Point your RFID reader and scan. Press Enter when done.
          </Typography>
          {scanBuffer && (
            <Typography
              variant="body1"
              color="white"
              sx={{ fontFamily: "monospace", bgcolor: "rgba(255,255,255,0.15)", px: 2, py: 1, borderRadius: 1 }}
            >
              {scanBuffer}
            </Typography>
          )}
          <Button
            variant="outlined"
            color="inherit"
            onClick={() => {
              setScanMode(false);
              setScanBuffer("");
            }}
            sx={{ mt: 2, color: "white", borderColor: "rgba(255,255,255,0.4)" }}
          >
            Cancel
          </Button>
          <input ref={scanInputRef} type="text" style={{ position: "absolute", opacity: 0 }} />
        </Box>
      )}

      {/* ============================================================ */}
      {/*  DELETE CONFIRM DIALOG                                      */}
      {/* ============================================================ */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete RFID Tag</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete tag <strong>{deleteTarget?.rfid_code}</strong>?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteTarget(null)} sx={{ textTransform: "none" }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={confirmDelete}
            sx={{ textTransform: "none" }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          sx={{ width: "100%" }}
        >
          {snackbar.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
