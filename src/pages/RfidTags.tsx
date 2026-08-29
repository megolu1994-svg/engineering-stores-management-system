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
  DialogTitle,
  IconButton,
  InputAdornment,
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
import LinkIcon from "@mui/icons-material/Link";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import LocationOnIcon from "@mui/icons-material/LocationOn";

import {
  getRfidTags,
  addRfidTag,
  updateRfidTag,
  deleteRfidTag,
  linkTagToMaterial,
  unlinkTag,
  locateByScan,
  bulkImportRfidTags,
  getRfidStockSummary,
  type RfidTag,
  type RfidTagMasterInput,
  type RfidLinkInput,
  type RfidScanResult,
  type RfidStockRow,
  type BulkRfidRow,
} from "../services/rfidTagService";
import { searchMaterials } from "../services/materialService";
import type { Material as MaterialType } from "../types/material";
import { BOTTOM_NAV_OFFSET } from "../components/AppLayout";

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const TAB_MASTER = 0;
const TAB_LOCATE = 1;

const TAG_TYPE_OPTIONS = ["paper", "adhesive", "metal", "ceramic"];

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function downloadTemplate() {
  const headers = [
    "rfid_code",
    "tag_type",
    "tag_description",
    "material_code",
    "quantity",
    "uom",
    "storage_location",
    "notes",
  ];
  const rows = [
    ["E2801160C00000000000001A", "paper", "Drum tag - Batch 1", "219", 50, "KG", "Ware House", ""],
    ["E2801160C00000000000002B", "paper", "Drum tag - Batch 2", "220", 25, "LTR", "Drum Filling Yard", ""],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = headers.map(() => ({ wch: 28 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "RFID Tags");
  XLSX.writeFile(wb, "rfid_master_template.xlsx");
}

/* ------------------------------------------------------------------ */
/*  Empty forms                                                       */
/* ------------------------------------------------------------------ */

const emptyMasterForm: RfidTagMasterInput = {
  rfid_code: "",
  tag_type: "paper",
  tag_description: "",
  notes: "",
};

const emptyLinkForm: RfidLinkInput = {
  material_code: "",
  quantity: 1,
  uom: "NOS",
  storage_location: "",
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function RfidTags() {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("sm"));

  /* ---- state ---- */
  const [activeTab, setActiveTab] = useState(TAB_MASTER);

  // Master list
  const [tags, setTags] = useState<RfidTag[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Add / Edit master dialog
  const [masterDialogOpen, setMasterDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<RfidTag | null>(null);
  const [masterForm, setMasterForm] = useState<RfidTagMasterInput>(emptyMasterForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Link dialog
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkingTag, setLinkingTag] = useState<RfidTag | null>(null);
  const [linkForm, setLinkForm] = useState<RfidLinkInput>(emptyLinkForm);
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkError, setLinkError] = useState("");

  // Material search for link dialog
  const [matQuery, setMatQuery] = useState("");
  const [matOptions, setMatOptions] = useState<MaterialType[]>([]);
  const [matSearching, setMatSearching] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<RfidTag | null>(null);

  // Bulk import
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    linked: number;
    errors: Array<{ row: number; message: string }>;
  } | null>(null);
  const [showImport, setShowImport] = useState(false);

  // Locate tab
  const [locateInput, setLocateInput] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<RfidScanResult | null>(null);
  const [scanHistory, setScanHistory] = useState<
    Array<{ code: string; time: string; result: RfidScanResult }>
  >([]);
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
      setSnackbar({ open: true, msg: "Failed to load tags.", severity: "error" });
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
      /* silent */
    } finally {
      setStockLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === TAB_MASTER) loadTags();
    if (activeTab === TAB_LOCATE) loadStock();
  }, [activeTab, loadTags, loadStock]);

  /* ---- search debounce ---- */

  function handleSearchChange(value: string) {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {}, 300);
  }

  /* ---- material search (for link dialog) ---- */

  useEffect(() => {
    if (!matQuery.trim()) {
      setMatOptions([]);
      return;
    }
    let cancelled = false;
    setMatSearching(true);
    searchMaterials(matQuery, 0, 10)
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

  /* ---- MASTER: Add / Edit ---- */

  function openAddMaster() {
    setEditingTag(null);
    setMasterForm({ ...emptyMasterForm });
    setFormError("");
    setMasterDialogOpen(true);
  }

  function openEditMaster(tag: RfidTag) {
    setEditingTag(tag);
    setMasterForm({
      rfid_code: tag.rfid_code,
      tag_type: tag.tag_type,
      tag_description: tag.tag_description ?? "",
      notes: tag.notes ?? "",
    });
    setFormError("");
    setMasterDialogOpen(true);
  }

  async function handleMasterSave() {
    if (!masterForm.rfid_code.trim()) {
      setFormError("RFID code is required.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      if (editingTag) {
        await updateRfidTag(editingTag.id, masterForm);
        setSnackbar({ open: true, msg: "Tag updated.", severity: "success" });
      } else {
        await addRfidTag(masterForm);
        setSnackbar({ open: true, msg: "Tag registered.", severity: "success" });
      }
      setMasterDialogOpen(false);
      loadTags();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Save failed.";
      setFormError(
        msg.includes("duplicate") || msg.includes("unique")
          ? "This RFID code already exists."
          : msg
      );
    } finally {
      setSaving(false);
    }
  }

  /* ---- MASTER: Link to Material ---- */

  function openLinkDialog(tag: RfidTag) {
    setLinkingTag(tag);
    setLinkForm({
      material_code: tag.material_code ?? "",
      quantity: tag.quantity ?? 1,
      uom: tag.uom ?? "NOS",
      storage_location: tag.storage_location ?? "",
    });
    setMatQuery(tag.material_code ?? "");
    setLinkError("");
    setLinkDialogOpen(true);
  }

  async function handleLinkSave() {
    if (!linkForm.material_code.trim()) {
      setLinkError("Material code is required.");
      return;
    }
    if (!linkForm.quantity || linkForm.quantity <= 0) {
      setLinkError("Quantity must be greater than 0.");
      return;
    }
    if (!linkingTag) return;

    setLinkSaving(true);
    setLinkError("");
    try {
      await linkTagToMaterial(linkingTag.id, linkForm);
      setSnackbar({ open: true, msg: "Tag linked to material.", severity: "success" });
      setLinkDialogOpen(false);
      loadTags();
    } catch (err: unknown) {
      setLinkError(err instanceof Error ? err.message : "Link failed.");
    } finally {
      setLinkSaving(false);
    }
  }

  async function handleUnlink(tag: RfidTag) {
    try {
      await unlinkTag(tag.id);
      setSnackbar({ open: true, msg: "Tag unlinked.", severity: "success" });
      loadTags();
    } catch {
      setSnackbar({ open: true, msg: "Unlink failed.", severity: "error" });
    }
  }

  /* ---- MASTER: Delete ---- */

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

  /* ---- LOCATE: Scan ---- */

  async function handleLocate() {
    const code = locateInput.trim();
    if (!code) return;

    setScanning(true);
    setScanResult(null);
    try {
      const result = await locateByScan(code);
      setScanResult(result);
      setScanHistory((prev) => [
        { code, time: new Date().toLocaleTimeString(), result },
        ...prev.slice(0, 19),
      ]);
    } catch {
      setScanResult({
        tag: null as unknown as RfidTag,
        material_description: "",
        material_uom: "",
        found: false,
      });
    } finally {
      setScanning(false);
      setLocateInput("");
      scanInputRef.current?.focus();
    }
  }

  /* ---- Bulk import ---- */

  async function handleBulkImport() {
    if (!importFile) return;
    setImporting(true);
    try {
      const buffer = await importFile.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

      const mapped: BulkRfidRow[] = rows.map((r) => ({
        rfid_code: String(r.rfid_code ?? r["RFID Code"] ?? "").trim(),
        tag_type: String(r.tag_type ?? r["Tag Type"] ?? "paper").trim(),
        tag_description: String(r.tag_description ?? r["Description"] ?? "").trim() || undefined,
        material_code: String(r.material_code ?? r["Material Code"] ?? "").trim() || undefined,
        quantity: r.quantity ? Number(r.quantity) : undefined,
        uom: String(r.uom ?? "").trim() || undefined,
        storage_location: String(r.storage_location ?? r["Location"] ?? "").trim() || undefined,
        notes: String(r.notes ?? "").trim() || undefined,
      }));

      const result = await bulkImportRfidTags(mapped);
      setImportResult(result);

      if (result.errors.length === 0) {
        setSnackbar({
          open: true,
          msg: `${result.imported} tag(s) imported, ${result.linked} linked to materials.`,
          severity: "success",
        });
      } else {
        setSnackbar({
          open: true,
          msg: `Imported: ${result.imported}, Errors: ${result.errors.length}`,
          severity: result.imported > 0 ? "warning" : "error",
        });
      }

      if (result.imported > 0) loadTags();
    } catch {
      setSnackbar({ open: true, msg: "Failed to read file.", severity: "error" });
    } finally {
      setImporting(false);
    }
  }

  /* ---- Keyboard shortcut: Enter to scan ---- */

  useEffect(() => {
    if (activeTab !== TAB_LOCATE) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Enter" && locateInput.trim() && !scanning) {
        handleLocate();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  });

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
          icon={<Inventory2Icon />}
          iconPosition="start"
          label="RFID Master"
          sx={{ minHeight: 44, textTransform: "none", fontWeight: 600 }}
        />
        <Tab
          icon={<QrCodeScannerIcon />}
          iconPosition="start"
          label="Locate Material"
          sx={{ minHeight: 44, textTransform: "none", fontWeight: 600 }}
        />
      </Tabs>

      {/* ============================================================ */}
      {/*  TAB 1: RFID MASTER                                          */}
      {/* ============================================================ */}
      {activeTab === TAB_MASTER && (
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
              placeholder="Search by RFID code, description, material..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              sx={{ flex: 1, minWidth: 220 }}
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
              sx={{ minWidth: 130 }}
              slotProps={{ select: { native: true } }}
            >
              <option value="all">All Status</option>
              <option value="unlinked">Unlinked</option>
              <option value="active">Active</option>
              <option value="damaged">Damaged</option>
              <option value="decommissioned">Decommissioned</option>
            </TextField>

            <Button
              variant="outlined"
              size="small"
              startIcon={<UploadFileIcon />}
              onClick={() => setShowImport(!showImport)}
              sx={{ textTransform: "none" }}
            >
              Import
            </Button>

            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={openAddMaster}
              sx={{ textTransform: "none" }}
            >
              Add Tag
            </Button>
          </Box>

          {/* Bulk import panel */}
          <Collapse in={showImport}>
            <Card sx={{ p: 2, mb: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                Bulk Import RFID Tags
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Upload Excel with columns: rfid_code, tag_type, tag_description, material_code, quantity, uom, storage_location, notes.
                Tags with material_code will be auto-linked.
              </Typography>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button size="small" onClick={downloadTemplate} sx={{ textTransform: "none" }}>
                  Download Template
                </Button>
                <Button
                  variant="contained"
                  component="label"
                  size="small"
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
                      const f = e.target.files?.[0];
                      if (f) {
                        setImportFile(f);
                        setImportResult(null);
                      }
                    }}
                  />
                </Button>
                {importFile && (
                  <Button
                    variant="contained"
                    color="success"
                    size="small"
                    onClick={handleBulkImport}
                    disabled={importing}
                    sx={{ textTransform: "none" }}
                  >
                    {importing ? <CircularProgress size={18} /> : "Import"}
                  </Button>
                )}
              </Box>
              {importFile && (
                <Typography variant="body2" sx={{ mt: 1 }}>
                  File: <strong>{importFile.name}</strong>
                </Typography>
              )}
              {importResult && (
                <Alert
                  severity={importResult.errors.length === 0 ? "success" : "warning"}
                  sx={{ mt: 1 }}
                >
                  Imported: <strong>{importResult.imported}</strong> &middot; Linked:{" "}
                  <strong>{importResult.linked}</strong> &middot; Errors:{" "}
                  <strong>{importResult.errors.length}</strong>
                </Alert>
              )}
            </Card>
          </Collapse>

          {/* Tag count */}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {tags.length} tag(s) &middot;{" "}
            {tags.filter((t) => t.status === "unlinked").length} unlinked &middot;{" "}
            {tags.filter((t) => t.status === "active").length} active
          </Typography>

          {/* Table / Cards */}
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress />
            </Box>
          ) : tags.length === 0 ? (
            <Card sx={{ textAlign: "center", py: 6 }}>
              <CardContent>
                <Inventory2Icon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
                <Typography color="text.secondary">
                  No RFID tags registered. Click "Add Tag" to begin.
                </Typography>
              </CardContent>
            </Card>
          ) : mobile ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              {tags.map((tag) => (
                <Card key={tag.id} variant="outlined" sx={{ p: 1.5 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1 }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, wordBreak: "break-all", fontFamily: "monospace", fontSize: "0.8rem" }}>
                        {tag.rfid_code}
                      </Typography>
                      {tag.tag_description && (
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {tag.tag_description}
                        </Typography>
                      )}
                      {tag.material_code ? (
                        <Typography variant="body2" sx={{ mt: 0.5 }}>
                          <strong>{tag.material_code}</strong> &middot; {tag.quantity} {tag.uom}
                          {tag.storage_location && <> &middot; {tag.storage_location}</>}
                        </Typography>
                      ) : (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontStyle: "italic" }}>
                          Not linked to any material
                        </Typography>
                      )}
                    </Box>
                    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.5 }}>
                      <Chip
                        size="small"
                        label={tag.status}
                        color={
                          tag.status === "active"
                            ? "success"
                            : tag.status === "unlinked"
                              ? "warning"
                              : tag.status === "damaged"
                                ? "error"
                                : "default"
                        }
                        sx={{ textTransform: "capitalize", fontSize: "0.65rem" }}
                      />
                      <Box sx={{ display: "flex", gap: 0 }}>
                        <IconButton size="small" onClick={() => openEditMaster(tag)} title="Edit">
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => openLinkDialog(tag)} title="Link to Material">
                          <LinkIcon fontSize="small" color={tag.material_code ? "success" : "action"} />
                        </IconButton>
                        {tag.material_code && (
                          <IconButton size="small" onClick={() => handleUnlink(tag)} title="Unlink">
                            <LinkOffIcon fontSize="small" color="warning" />
                          </IconButton>
                        )}
                        <IconButton size="small" onClick={() => setDeleteTarget(tag)} title="Delete">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
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
                    <TableCell sx={{ fontWeight: 700 }}>RFID Code</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Material</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Qty</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Location</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tags.map((tag) => (
                    <TableRow key={tag.id} hover>
                      <TableCell>
                        <Tooltip title={tag.rfid_code}>
                          <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: "0.78rem" }}>
                            {tag.rfid_code.length > 22 ? tag.rfid_code.slice(0, 22) + "..." : tag.rfid_code}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell sx={{ textTransform: "capitalize" }}>{tag.tag_type}</TableCell>
                      <TableCell>{tag.tag_description ?? "-"}</TableCell>
                      <TableCell>
                        {tag.material_code ? (
                          <Typography sx={{ fontWeight: 600 }}>{tag.material_code}</Typography>
                        ) : (
                          <Typography color="text.secondary" sx={{ fontStyle: "italic" }}>
                            unlinked
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">{tag.quantity ?? "-"}</TableCell>
                      <TableCell>{tag.storage_location ?? "-"}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={tag.status}
                          color={
                            tag.status === "active"
                              ? "success"
                              : tag.status === "unlinked"
                                ? "warning"
                                : tag.status === "damaged"
                                  ? "error"
                                  : "default"
                          }
                          sx={{ textTransform: "capitalize", fontSize: "0.65rem" }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <IconButton size="small" onClick={() => openEditMaster(tag)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => openLinkDialog(tag)}>
                          <LinkIcon fontSize="small" color={tag.material_code ? "success" : "action"} />
                        </IconButton>
                        {tag.material_code && (
                          <IconButton size="small" onClick={() => handleUnlink(tag)}>
                            <LinkOffIcon fontSize="small" color="warning" />
                          </IconButton>
                        )}
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
      {/*  TAB 2: LOCATE MATERIAL                                      */}
      {/* ============================================================ */}
      {activeTab === TAB_LOCATE && (
        <Box>
          {/* Scan input area */}
          <Card
            sx={{
              p: { xs: 3, sm: 4 },
              mb: 3,
              textAlign: "center",
              bgcolor: "primary.soft",
              border: 2,
              borderColor: "primary.main",
            }}
          >
            <QrCodeScannerIcon sx={{ fontSize: 56, color: "primary.main", mb: 1 }} />
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
              Scan RFID Tag to Locate Material
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Point your RFID reader at a tag. The scanned code will appear below.
            </Typography>

            <Box
              sx={{
                display: "flex",
                gap: 1,
                maxWidth: 500,
                mx: "auto",
              }}
            >
              <TextField
                inputRef={scanInputRef}
                size="medium"
                fullWidth
                autoFocus
                placeholder="Scan or type RFID code..."
                value={locateInput}
                onChange={(e) => setLocateInput(e.target.value)}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <QrCodeScannerIcon />
                      </InputAdornment>
                    ),
                  },
                }}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 3,
                    fontSize: "1.1rem",
                  },
                }}
              />
              <Button
                variant="contained"
                size="large"
                onClick={handleLocate}
                disabled={!locateInput.trim() || scanning}
                sx={{ minWidth: 100, borderRadius: 3, textTransform: "none", fontWeight: 700 }}
              >
                {scanning ? <CircularProgress size={24} /> : "Locate"}
              </Button>
            </Box>
          </Card>

          {/* Scan result */}
          {scanResult && (
            <Card
              sx={{
                p: 3,
                mb: 3,
                border: 2,
                borderColor: scanResult.found ? "success.main" : "error.main",
                bgcolor: scanResult.found ? "success.soft" : "error.soft",
              }}
            >
              {scanResult.found ? (
                <Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                    <CheckCircleIcon color="success" sx={{ fontSize: 32 }} />
                    <Typography variant="h6" sx={{ fontWeight: 700, color: "success.dark" }}>
                      Material Found
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                      gap: 2,
                    }}
                  >
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        RFID Code
                      </Typography>
                      <Typography variant="body1" sx={{ fontFamily: "monospace", fontWeight: 600 }}>
                        {scanResult.tag.rfid_code}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Tag Type
                      </Typography>
                      <Typography variant="body1" sx={{ textTransform: "capitalize", fontWeight: 600 }}>
                        {scanResult.tag.tag_type}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Material Code
                      </Typography>
                      <Typography variant="h5" sx={{ fontWeight: 800, color: "primary.main" }}>
                        {scanResult.tag.material_code}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Description
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 600 }}>
                        {scanResult.material_description || "-"}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Quantity
                      </Typography>
                      <Typography variant="h5" sx={{ fontWeight: 800 }}>
                        {scanResult.tag.quantity} {scanResult.tag.uom}
                      </Typography>
                    </Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      <LocationOnIcon color="action" sx={{ fontSize: 20 }} />
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Storage Location
                        </Typography>
                        <Typography variant="body1" sx={{ fontWeight: 600 }}>
                          {scanResult.tag.storage_location || "Not specified"}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </Box>
              ) : (
                <Box sx={{ textAlign: "center" }}>
                  <ErrorIcon color="error" sx={{ fontSize: 48, mb: 1 }} />
                  <Typography variant="h6" sx={{ fontWeight: 700, color: "error.dark" }}>
                    Tag Not Found
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    No RFID tag with code "<strong>{locateInput || scanHistory[0]?.code}</strong>" exists in the system.
                    Register it in RFID Master first.
                  </Typography>
                </Box>
              )}
            </Card>
          )}

          {/* Scan history */}
          {scanHistory.length > 0 && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                Recent Scans
              </Typography>
              <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: "grey.50" }}>
                      <TableCell sx={{ fontWeight: 700 }}>Time</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>RFID Code</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Material</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Qty</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Location</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {scanHistory.map((entry, i) => (
                      <TableRow key={i}>
                        <TableCell>{entry.time}</TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                            {entry.code}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {entry.result.found ? entry.result.tag.material_code ?? "-" : "-"}
                        </TableCell>
                        <TableCell>
                          {entry.result.found ? `${entry.result.tag.quantity ?? "-"} ${entry.result.tag.uom ?? ""}` : "-"}
                        </TableCell>
                        <TableCell>
                          {entry.result.found ? entry.result.tag.storage_location ?? "-" : "-"}
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={entry.result.found ? "Found" : "Not Found"}
                            color={entry.result.found ? "success" : "error"}
                            sx={{ fontSize: "0.65rem" }}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}

          {/* RFID Stock Summary */}
          <Box sx={{ mt: 4 }}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
              Linked RFID Stock by Material
            </Typography>
            {stockLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                <CircularProgress size={24} />
              </Box>
            ) : stockRows.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No linked RFID tags found.
              </Typography>
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
                        <TableCell sx={{ fontWeight: 600 }}>{row.material_code}</TableCell>
                        <TableCell>{row.short_description}</TableCell>
                        <TableCell align="right">
                          <Typography sx={{ fontWeight: 700 }}>{row.total_quantity}</Typography>
                        </TableCell>
                        <TableCell>{row.uom}</TableCell>
                        <TableCell align="right">{row.total_tags}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        </Box>
      )}

      {/* ============================================================ */}
      {/*  ADD / EDIT MASTER DIALOG                                   */}
      {/* ============================================================ */}
      <Dialog
        open={masterDialogOpen}
        onClose={() => setMasterDialogOpen(false)}
        fullWidth
        maxWidth="sm"
        fullScreen={mobile}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          {editingTag ? "Edit RFID Tag" : "Register New RFID Tag"}
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
              value={masterForm.rfid_code}
              onChange={(e) => setMasterForm((p) => ({ ...p, rfid_code: e.target.value }))}
              placeholder="e.g. E2801160C00000000000001A"
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            />
            <TextField
              label="Tag Type"
              size="small"
              fullWidth
              select
              value={masterForm.tag_type}
              onChange={(e) => setMasterForm((p) => ({ ...p, tag_type: e.target.value }))}
              slotProps={{ select: { native: true } }}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            >
              {TAG_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </TextField>
            <TextField
              label="Description (optional)"
              size="small"
              fullWidth
              value={masterForm.tag_description}
              onChange={(e) => setMasterForm((p) => ({ ...p, tag_description: e.target.value }))}
              placeholder="e.g. Drum tag - Batch 1"
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            />
            <TextField
              label="Notes (optional)"
              size="small"
              fullWidth
              multiline
              minRows={2}
              value={masterForm.notes}
              onChange={(e) => setMasterForm((p) => ({ ...p, notes: e.target.value }))}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            />
            {!editingTag && (
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                After registering, use the <strong>Link</strong> button to associate this tag with a material code and quantity.
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setMasterDialogOpen(false)} sx={{ textTransform: "none" }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleMasterSave}
            disabled={saving}
            sx={{ textTransform: "none" }}
          >
            {saving ? <CircularProgress size={20} /> : editingTag ? "Update" : "Register"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ============================================================ */}
      {/*  LINK TO MATERIAL DIALOG                                     */}
      {/* ============================================================ */}
      <Dialog
        open={linkDialogOpen}
        onClose={() => setLinkDialogOpen(false)}
        fullWidth
        maxWidth="sm"
        fullScreen={mobile}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          Link Tag to Material
        </DialogTitle>
        <DialogContent sx={{ pt: "16px !important" }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Tag: <strong style={{ fontFamily: "monospace" }}>{linkingTag?.rfid_code}</strong>
          </Typography>

          {linkError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {linkError}
            </Alert>
          )}

          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              label="Material Code"
              size="small"
              fullWidth
              value={linkForm.material_code}
              onChange={(e) => {
                setLinkForm((p) => ({ ...p, material_code: e.target.value }));
                setMatQuery(e.target.value);
              }}
              placeholder="Search material code..."
              slotProps={{
                input: {
                  endAdornment: matSearching ? <CircularProgress size={16} /> : null,
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
                      setLinkForm((p) => ({
                        ...p,
                        material_code: m.material_code,
                        uom: m.uom,
                      }));
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
                value={linkForm.quantity}
                onChange={(e) => setLinkForm((p) => ({ ...p, quantity: Number(e.target.value) }))}
                slotProps={{ htmlInput: { min: 0 } }}
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
              />
              <TextField
                label="UOM"
                size="small"
                fullWidth
                value={linkForm.uom}
                onChange={(e) => setLinkForm((p) => ({ ...p, uom: e.target.value }))}
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
              />
            </Box>

            <TextField
              label="Storage Location"
              size="small"
              fullWidth
              value={linkForm.storage_location}
              onChange={(e) => setLinkForm((p) => ({ ...p, storage_location: e.target.value }))}
              placeholder="e.g. Ware House, Drum Filling Yard"
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setLinkDialogOpen(false)} sx={{ textTransform: "none" }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleLinkSave}
            disabled={linkSaving}
            sx={{ textTransform: "none" }}
          >
            {linkSaving ? <CircularProgress size={20} /> : "Link Tag"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ============================================================ */}
      {/*  DELETE CONFIRM DIALOG                                      */}
      {/* ============================================================ */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete RFID Tag</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete tag{" "}
            <strong style={{ fontFamily: "monospace" }}>{deleteTarget?.rfid_code}</strong>?
          </Typography>
          {deleteTarget?.material_code && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              This tag is linked to material <strong>{deleteTarget.material_code}</strong>. Deleting will remove the linkage.
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteTarget(null)} sx={{ textTransform: "none" }}>
            Cancel
          </Button>
          <Button variant="contained" color="error" onClick={confirmDelete} sx={{ textTransform: "none" }}>
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
