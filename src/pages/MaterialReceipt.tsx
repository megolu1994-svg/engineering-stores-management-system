import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import * as XLSX from "xlsx";

import {
  Alert,
  Autocomplete,
  Avatar,
  Box,
  Button,
  Card,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  InputAdornment,
  LinearProgress,
  Menu,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  FormControlLabel,
  Snackbar,
  Switch,
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

import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import VisibilityIcon from "@mui/icons-material/Visibility";
import EditIcon from "@mui/icons-material/Edit";
import PrintIcon from "@mui/icons-material/Print";
import CloseIcon from "@mui/icons-material/Close";
import PendingActionsIcon from "@mui/icons-material/PendingActions";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import AddPhotoAlternateIcon from "@mui/icons-material/AddPhotoAlternate";
import DeleteIcon from "@mui/icons-material/Delete";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import DownloadIcon from "@mui/icons-material/Download";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import HistoryIcon from "@mui/icons-material/History";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import PhotoLibraryIcon from "@mui/icons-material/PhotoLibrary";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import DescriptionIcon from "@mui/icons-material/Description";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import TaskAltOutlinedIcon from "@mui/icons-material/TaskAltOutlined";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";
import BusinessIcon from "@mui/icons-material/Business";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import ScaleIcon from "@mui/icons-material/Scale";
import NoteAddIcon from "@mui/icons-material/NoteAdd";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import DriveFileRenameOutlineIcon from "@mui/icons-material/DriveFileRenameOutline";
import SyncIcon from "@mui/icons-material/Sync";
import WarehouseIcon from "@mui/icons-material/Warehouse";
import { supabase } from "../config/supabase";
import { DrcSapLookupModal } from "../components/DrcSapLookupModal";
import { DrcBinAllocationModal } from "../components/DrcBinAllocationModal";
import {
  findSapDocumentsForDrc,
  convertSapItemsToPackageDetails,
  syncAllDrcsWithSap,
  type DrcSapLookupResult,
  type SapMatchedLineItem,
} from "../services/drcSapSyncService";

import {
  createReceipt,
  updateReceipt,
  getReceipts,
  getReceiptSummary,
  uploadReceiptPhotos,
  getNextDrcNumberSuggestion,
  getDrcDisplayStatus,
  separateAndRecoverPackageDetails,
  cleanPhysicalPackageDetails,
  // Sprint 2
  submitInspection,
  getInspectionHistory,
  parseGrnExcelRows,
  validateGrnMaterials,
  importGrn,
  downloadGrnImportReport,
  getGrnHistory,
  // Documents
  addReceiptDocument,
  removeReceiptDocument,
  DOCUMENT_TYPES,
  // Mail
  generateAiMail,
  type ReceiptHeader,
  type ReceiptFormInput,
  type ReceiptSummary,
  type ReceiptMode,
  type InspectionStatus,
  type InspectionHistoryEntry,
  type GrnImportRow,
  type GrnFormatInvalidRow,
  type GrnHistoryEntry,
  type DrcMailType,
  type DocumentType,
  type DocumentUpload,
  // Sprint 3
  type PackageDetailRow,
  type AttachmentFile,
} from "../services/receiptService";
import { useSwipeOpenDrawer } from "../hooks/useSwipeTabs";
import { usePersistentState } from "../hooks/usePersistentState";
import { DrcFileStrapDialog } from "../components/DrcFileStrapDialog";
import { BulkDrcStrapDialog } from "../components/BulkDrcStrapDialog";
import {
  buildStrapPrintDocument,
  buildBulkEdgeStrapPrintDocument,
  buildFullDrcDocumentHtml,
  executePrint,
} from "../utils/drcPrintUtils";
import { exportStyledTemplate } from "../utils/styledExcelExport";

type SnackbarSeverity = "success" | "error" | "warning" | "info";

const emptyPackageRow: PackageDetailRow = {
  quantity: "1",
  package_type: "",
  description: "",
};

const emptyForm: ReceiptFormInput = {
  receipt_mode: "Vehicle",
  vehicle_number: "",
  package_details: [{ ...emptyPackageRow }],
  sap_items: [],
  vendor_name: "",
  sap_po_number: "",
  sap_po_date: "",
  gem_order_number: "",
  gem_order_date: "",
  invoice_number: "",
  invoice_date: "",
  challan_number: "",
  challan_date: "",
  eway_bill_number: "",
  eway_bill_date: "",
  lorry_receipt_number: "",
  lorry_receipt_date: "",
  weightment_slip_number: "",
  gross_weight: "",
  tare_weight: "",
  net_weight: "",
  purpose: "",
  driver_name: "",
  tax_invoice_value: "",
  msme_type: "",
  important_note: "",
  delivery_location: "",
  vim_approval: "",
  remarks: "",
};

function formatDate(value: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Renders the 3 distinct DRC inspection / lifecycle status chips:
 * 1. Pending Inspection (Amber #d97706) - Created, awaiting inspection
 * 2. Inspection on hold (Red #dc2626) - Held by department, with comments/remarks
 * 3. Inspection cleared (Green #16a34a) - Cleared by department, with comments/remarks
 * (plus Closed for completed GRN)
 */
function DrcStatusChip({
  receipt,
}: {
  receipt: ReceiptHeader;
  showRemarks?: boolean;
}) {
  const statusInfo = getDrcDisplayStatus(receipt);

  let iconNode = <PendingActionsIcon sx={{ fontSize: "14px !important" }} />;
  if (statusInfo.key === "on_hold") {
    iconNode = <ReportProblemIcon sx={{ fontSize: "14px !important" }} />;
  } else if (statusInfo.key === "cleared") {
    iconNode = <TaskAltOutlinedIcon sx={{ fontSize: "14px !important" }} />;
  } else if (statusInfo.key === "closed") {
    iconNode = <TaskAltIcon sx={{ fontSize: "14px !important" }} />;
  }

  const chipElement = (
    <Chip
      size="small"
      label={statusInfo.label}
      icon={iconNode}
      sx={{
        fontWeight: 700,
        fontSize: "0.75rem",
        bgcolor: statusInfo.chipBg,
        color: statusInfo.chipColor,
        border: `1px solid ${statusInfo.chipBorder}`,
        "& .MuiChip-icon": { color: "inherit", ml: 0.5 },
      }}
    />
  );

  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      {statusInfo.remarks ? (
        <Tooltip
          title={
            <Box sx={{ p: 0.5, maxWidth: 320 }}>
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, display: "block", color: "common.white" }}
              >
                Department Comments
                {statusInfo.inspectedBy ? ` (${statusInfo.inspectedBy})` : ""}:
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: "grey.200", whiteSpace: "pre-wrap" }}
              >
                {statusInfo.remarks}
              </Typography>
            </Box>
          }
          arrow
          placement="top"
        >
          {chipElement}
        </Tooltip>
      ) : (
        chipElement
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------
// Manual date entry: DD.MM.YYYY via the numeric keyboard, no calendar
// picker. Digits are auto-formatted with dots as the user types, and the
// value is stored/exchanged with the rest of the form as an ISO
// yyyy-mm-dd string (same shape the database columns already use).
// ---------------------------------------------------------------------

function isoToDigits(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d}${m}${y}`;
}

function digitsToDisplay(digits: string): string {
  const d = digits.slice(0, 2);
  const m = digits.slice(2, 4);
  const y = digits.slice(4, 8);
  let out = d;
  if (m) out += "." + m;
  if (y) out += "." + y;
  return out;
}

function digitsToIso(digits: string): string | null {
  if (digits.length !== 8) return null;

  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));

  if (month < 1 || month > 12) return null;
  if (year < 1900 || year > 2100) return null;

  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) return null;

  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

interface DateTextFieldProps {
  label: string;
  value: string;
  onChange: (isoValue: string) => void;
  required?: boolean;
  disabled?: boolean;
}

function DateTextField({ label, value, onChange, required, disabled }: DateTextFieldProps) {
  const [digits, setDigits] = useState(() => isoToDigits(value));
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    setDigits(isoToDigits(value));
    setTouched(false);
  }, [value]);

  const isIncomplete = digits.length > 0 && digits.length < 8;
  const isInvalid = digits.length === 8 && digitsToIso(digits) === null;
  const showError = touched && (isIncomplete || isInvalid);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 8);
    setDigits(raw);

    if (raw.length === 0) {
      onChange("");
      return;
    }

    if (raw.length === 8) {
      const iso = digitsToIso(raw);
      if (iso) {
        onChange(iso);
      }
    }
  }

  return (
    <TextField
      label={label}
      size="small"
      fullWidth
      required={required}
      disabled={disabled}
      value={digitsToDisplay(digits)}
      onChange={handleChange}
      onBlur={() => setTouched(true)}
      error={showError}
      helperText={showError ? "Enter a valid date (DD.MM.YYYY)" : undefined}
      placeholder="DD.MM.YYYY"
      slotProps={{ htmlInput: { inputMode: "numeric", maxLength: 10 } }}
      sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
    />
  );
}

// ---------------------------------------------------------------------
// DRC No. / DRC Date - "Manual" toggle at the top of Create DRC. Off by
// default: DRC No. previews the auto-generated "previous + 1" value and
// DRC Date previews today, both read-only, matching what the database
// trigger will actually assign on save. Toggling Manual on unlocks both
// fields for hand entry.
// ---------------------------------------------------------------------

function todayIso(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Combines a manually-chosen calendar date with the current time of
 * day, so a manual DRC Date still sorts/behaves like a normal
 * timestamp rather than always landing on midnight. */
function combineDateWithNow(dateStr: string): string {
  if (!dateStr || typeof dateStr !== "string") {
    return new Date().toISOString();
  }
  const clean = dateStr.trim();
  let y = 0, m = 0, d = 0;
  if (clean.includes("-")) {
    const parts = clean.split("-").map(Number);
    if (parts[0] > 1000) {
      [y, m, d] = parts;
    } else {
      [d, m, y] = parts;
    }
  } else if (clean.includes(".")) {
    const parts = clean.split(".").map(Number);
    if (parts[0] > 1000) {
      [y, m, d] = parts;
    } else {
      [d, m, y] = parts;
    }
  } else if (clean.includes("/")) {
    const parts = clean.split("/").map(Number);
    if (parts[0] > 1000) {
      [y, m, d] = parts;
    } else {
      [d, m, y] = parts;
    }
  }
  const now = new Date();
  if (y && m && d && !isNaN(y) && !isNaN(m) && !isNaN(d)) {
    const dt = new Date(
      y,
      m - 1,
      d,
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      now.getMilliseconds()
    );
    if (!isNaN(dt.getTime())) {
      return dt.toISOString();
    }
  }
  return new Date().toISOString();
}

export default function MaterialReceipt() {
  useSwipeOpenDrawer();

  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: SnackbarSeverity;
  }>({ open: false, message: "", severity: "info" });

  function showSnackbar(message: string, severity: SnackbarSeverity) {
    setSnackbar({ open: true, message, severity });
  }

  // ---------------- Register + summary ----------------
  const [summary, setSummary] = useState<ReceiptSummary>({
    pendingInspection: 0,
    inspectionOnHold: 0,
    inspectionCleared: 0,
    pendingGrn: 0,
    closed: 0,
    total: 0,
  });

  const [receipts, setReceipts] = useState<ReceiptHeader[]>([]);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "pending" | "on_hold" | "cleared" | "closed"
  >("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const filteredReceipts = useMemo(() => {
    if (statusFilter === "all") return receipts;
    return receipts.filter((r) => {
      const info = getDrcDisplayStatus(r);
      return info.key === statusFilter;
    });
  }, [receipts, statusFilter]);

  const loadReceipts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getReceipts({
        search,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      });
      // Automatically recover physical package details for any DRCs whose package data was previously overwritten
      const { updatedReceipts } = await separateAndRecoverPackageDetails(data);
      setReceipts(updatedReceipts);
    } catch {
      showSnackbar("Failed to load the receipt register.", "error");
    } finally {
      setLoading(false);
    }
  }, [search, fromDate, toDate]);

  const loadSummary = useCallback(async () => {
    const data = await getReceiptSummary();
    setSummary(data);
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadReceipts();
    }, 300);

    return () => clearTimeout(timer);
  }, [loadReceipts]);

  async function refreshAll() {
    await Promise.all([loadReceipts(), loadSummary()]);
  }

  // ---------------- Create / Edit DRC form ----------------
  // Persisted to sessionStorage so an in-progress DRC survives the user
  // navigating to another screen and back, instead of being lost.
  const [formOpen, setFormOpen] = usePersistentState(
    "materialReceipt.formOpen",
    false
  );
  const [editingReceipt, setEditingReceipt] = usePersistentState<
    ReceiptHeader | null
  >("materialReceipt.editingReceipt", null);
  const [form, setForm] = usePersistentState<ReceiptFormInput>(
    "materialReceipt.form",
    emptyForm
  );
  const [saving, setSaving] = useState(false);

  // ---- DRC No. / DRC Date (manual override toggle, create-only) ----
  const [manualDrcEntry, setManualDrcEntry] = usePersistentState(
    "materialReceipt.manualDrcEntry",
    false
  );
  const [drcNumber, setDrcNumber] = usePersistentState(
    "materialReceipt.drcNumber",
    ""
  );
  const [drcDate, setDrcDate] = usePersistentState(
    "materialReceipt.drcDate",
    todayIso()
  );
  const [loadingDrcSuggestion, setLoadingDrcSuggestion] = useState(false);

  // Previous DRCs for the "Suggest from Previous DRC" feature
  const [previousDrcs, setPreviousDrcs] = useState<ReceiptHeader[]>([]);

  async function loadPreviousDrcs() {
    try {
      const receipts = await getReceipts();
      setPreviousDrcs(receipts);
    } catch {
      // ignore - best effort
    }
  }



  // Extract unique suggestions from previous DRCs for each field
  const vehicleSuggestions = useMemo(() => {
    const values = previousDrcs
      .map((r) => r.vehicle_number)
      .filter((v): v is string => !!v && v.trim() !== '');
    return [...new Set(values)];
  }, [previousDrcs]);

  const driverSuggestions = useMemo(() => {
    const values = previousDrcs
      .map((r) => r.driver_name)
      .filter((v): v is string => !!v && v.trim() !== '');
    return [...new Set(values)];
  }, [previousDrcs]);

  const vendorSuggestions = useMemo(() => {
    const values = previousDrcs
      .map((r) => r.vendor_name)
      .filter((v): v is string => !!v && v.trim() !== '');
    return [...new Set(values)];
  }, [previousDrcs]);

  const packageTypeSuggestions = useMemo(() => {
    const defaults = [
      "C/Box",
      "W/Box",
      "Wooden Box",
      "Corrugated Box",
      "Container",
      "Drum",
      "Bag",
      "Bundle",
      "Pallet",
      "Crate",
      "Loose",
      "Other",
    ];
    const values = previousDrcs
      .flatMap((r) => r.package_details ?? [])
      .map((p) => p.package_type)
      .filter((v): v is string => !!v && v.trim() !== '');
    return [...new Set([...defaults, ...values])];
  }, [previousDrcs]);

  // Compute the next DRC number from already-loaded previousDrcs data.
  // This is the primary source — no RPC or extra DB query needed.
  const computedNextDrc = useMemo(() => {
    if (previousDrcs.length === 0) return "";
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const fyStart = month >= 4 ? year : year - 1;
    const fyEnd = month >= 4 ? year + 1 : year;
    const prefix = `DRC/${String(fyStart).slice(-2)}-${String(fyEnd).slice(-2)}/`;
    let maxNum = 0;
    for (const r of previousDrcs) {
      const dn = r.drc_number ?? "";
      if (!dn.startsWith(prefix)) continue;
      const numStr = dn.slice(prefix.length).replace(/[^0-9].*$/, "");
      const n = parseInt(numStr, 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    }
    return maxNum > 0 ? prefix + (maxNum + 1) : prefix + "1";
  }, [previousDrcs]);

  // When previousDrcs finish loading, update the DRC number suggestion.
  useEffect(() => {
    if (!manualDrcEntry && computedNextDrc) {
      setDrcNumber(computedNextDrc);
    }
  }, [computedNextDrc, manualDrcEntry]);

  async function loadDrcSuggestion() {
    setLoadingDrcSuggestion(true);
    try {
      // Primary: use computed value from loaded data
      if (computedNextDrc) {
        setDrcNumber(computedNextDrc);
      } else {
        // Fallback: RPC or DB query (data not loaded yet)
        const suggestion = await getNextDrcNumberSuggestion();
        setDrcNumber(suggestion);
      }
    } finally {
      setLoadingDrcSuggestion(false);
    }
  }

  function handleManualDrcToggle(e: ChangeEvent<HTMLInputElement>) {
    const manual = e.target.checked;
    setManualDrcEntry(manual);

    if (!manual) {
      setDrcDate(todayIso());
      loadDrcSuggestion();
    }
  }

  // If a "Create DRC" draft was left open (formOpen restored true from a
  // previous visit) in auto-date mode, refresh the date/suggested number
  // once on mount - otherwise a draft resumed on a later day would keep
  // showing the day it was originally opened.
  useEffect(() => {
    if (formOpen && !editingReceipt && !manualDrcEntry) {
      setDrcDate(todayIso());
      loadDrcSuggestion();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Newly-picked files can't be persisted (File objects aren't
  // serializable), but the references to already-uploaded photos/
  // attachments are plain data and are worth keeping.
  const [newPhotoFiles, setNewPhotoFiles] = useState<File[]>([]);
  const [newPhotoPreviews, setNewPhotoPreviews] = useState<string[]>([]);
  const [keptPhotoUrls, setKeptPhotoUrls] = usePersistentState<string[]>(
    "materialReceipt.keptPhotoUrls",
    []
  );
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [photoMenuAnchor, setPhotoMenuAnchor] = useState<HTMLElement | null>(
    null
  );
  const [capturingPhoto, setCapturingPhoto] = useState(false);

  const documentInputRef = useRef<HTMLInputElement | null>(null);
  const [newDocumentUploads, setNewDocumentUploads] = useState<
    DocumentUpload[]
  >([]);
  const [documentTypeSelection, setDocumentTypeSelection] =
    useState<DocumentType>("Invoice");
  const [keptAttachments, setKeptAttachments] = usePersistentState<
    AttachmentFile[]
  >("materialReceipt.keptAttachments", []);

  function updateField<K extends keyof ReceiptFormInput>(
    field: K,
    value: ReceiptFormInput[K]
  ) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function updatePackageRow(
    index: number,
    field: keyof PackageDetailRow,
    value: string
  ) {
    setForm((prev) => {
      const rows = [...prev.package_details];
      rows[index] = { ...rows[index], [field]: value };
      return { ...prev, package_details: rows };
    });
  }

  function addPackageRow() {
    setForm((prev) => ({
      ...prev,
      package_details: [...prev.package_details, { ...emptyPackageRow }],
    }));
  }

  function removePackageRow(index: number) {
    setForm((prev) => {
      const rows = prev.package_details.filter((_, i) => i !== index);
      // At least one row must always exist.
      return {
        ...prev,
        package_details: rows.length > 0 ? rows : [{ ...emptyPackageRow }],
      };
    });
  }

  function openCreateForm() {
    setEditingReceipt(null);
    setForm(emptyForm);
    setNewPhotoFiles([]);
    setNewPhotoPreviews([]);
    setKeptPhotoUrls([]);
    setNewDocumentUploads([]);
    setKeptAttachments([]);
    setManualDrcEntry(false);
    setDrcDate(todayIso());
    setDrcNumber("");
    loadDrcSuggestion();
    loadPreviousDrcs();
    setFormOpen(true);
  }

  function openEditForm(receipt: ReceiptHeader) {
    setEditingReceipt(receipt);

    // Extract physical packages, restoring them if previously overwritten
    const physicalPkgs = cleanPhysicalPackageDetails(receipt.package_details);
    const restoredPhysicalPkgs =
      physicalPkgs.length > 0
        ? physicalPkgs
        : [
            {
              quantity: String(receipt.package_count || 1),
              package_type: receipt.package_type || "C/Box",
              description: "",
            },
          ];

    // Extract SAP material items
    const existingSapItems =
      receipt.sap_items && receipt.sap_items.length > 0
        ? receipt.sap_items
        : (receipt.package_details || []).filter((p) => Boolean(p.material_code && p.material_code.trim()));

    setForm({
      receipt_mode: receipt.receipt_mode,
      vehicle_number: receipt.vehicle_number ?? "",
      package_details: restoredPhysicalPkgs,
      sap_items: existingSapItems,
      vendor_name: receipt.vendor_name,
      sap_po_number: receipt.sap_po_number ?? "",
      sap_po_date: receipt.sap_po_date ?? "",
      gem_order_number: receipt.gem_order_number ?? "",
      gem_order_date: receipt.gem_order_date ?? "",
      invoice_number: receipt.invoice_number ?? "",
      invoice_date: receipt.invoice_date ?? "",
      challan_number: receipt.challan_number ?? "",
      challan_date: receipt.challan_date ?? "",
      eway_bill_number: receipt.eway_bill_number ?? "",
      eway_bill_date: receipt.eway_bill_date ?? "",
      lorry_receipt_number: receipt.lorry_receipt_number ?? "",
      lorry_receipt_date: receipt.lorry_receipt_date ?? "",
      weightment_slip_number: receipt.weightment_slip_number ?? "",
      gross_weight:
        receipt.gross_weight !== null ? String(receipt.gross_weight) : "",
      tare_weight:
        receipt.tare_weight !== null ? String(receipt.tare_weight) : "",
      net_weight:
        receipt.net_weight !== null ? String(receipt.net_weight) : "",
      purpose: receipt.purpose ?? receipt.remarks ?? "",
      driver_name: receipt.driver_name ?? "",
      tax_invoice_value: receipt.tax_invoice_value !== null ? String(receipt.tax_invoice_value) : "",
      msme_type: receipt.msme_type ?? "",
      important_note: receipt.important_note ?? "",
      delivery_location: receipt.delivery_location ?? "",
      vim_approval: receipt.vim_approval ?? "",
      remarks: receipt.remarks ?? "",
    });
    setNewPhotoFiles([]);
    setNewPhotoPreviews([]);
    setKeptPhotoUrls(receipt.photo_urls ?? []);
    setNewDocumentUploads([]);
    setKeptAttachments(receipt.attachment_paths ?? []);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingReceipt(null);
  }

  function handleReset() {
    setForm(emptyForm);
    setNewPhotoFiles([]);
    setNewPhotoPreviews([]);
    setNewDocumentUploads([]);
    if (editingReceipt) {
      setKeptPhotoUrls(editingReceipt.photo_urls ?? []);
      setKeptAttachments(editingReceipt.attachment_paths ?? []);
    } else {
      setKeptPhotoUrls([]);
      setKeptAttachments([]);
    }
  }

  // ---- Photo capture: Take Photo (camera, uploads immediately) or
  // Choose From Gallery (staged, uploaded together with the DRC on Save,
  // same as before). On desktop, both options simply open the normal
  // file picker since the browser ignores the camera "capture" hint.
  function openPhotoMenu(e: MouseEvent<HTMLElement>) {
    setPhotoMenuAnchor(e.currentTarget);
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
    photoInputRef.current?.click();
  }

  async function handleCameraCapture(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file) return;

    setCapturingPhoto(true);

    try {
      const urls = await uploadReceiptPhotos([file]);
      if (urls.length > 0) {
        setKeptPhotoUrls((prev) => [...prev, ...urls]);
        showSnackbar("Photo captured and uploaded.", "success");
      } else {
        showSnackbar("Photo upload failed.", "error");
      }
    } catch {
      showSnackbar("Photo upload failed.", "error");
    } finally {
      setCapturingPhoto(false);
    }
  }

  function handlePhotoSelect(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    setNewPhotoFiles((prev) => [...prev, ...files]);
    setNewPhotoPreviews((prev) => [
      ...prev,
      ...files.map((f) => URL.createObjectURL(f)),
    ]);
    e.target.value = "";
  }

  function removeNewPhoto(index: number) {
    setNewPhotoFiles((prev) => prev.filter((_, i) => i !== index));
    setNewPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  function removeKeptPhoto(index: number) {
    setKeptPhotoUrls((prev) => prev.filter((_, i) => i !== index));
  }

  // ---- Document attachments (each file tagged with the document type
  // selected in the dropdown at the time it was chosen) ----
  function handleDocumentSelect(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    setNewDocumentUploads((prev) => [
      ...prev,
      ...files.map((file) => ({ file, documentType: documentTypeSelection })),
    ]);
    e.target.value = "";
  }

  function removeNewDocument(index: number) {
    setNewDocumentUploads((prev) => prev.filter((_, i) => i !== index));
  }

  function removeKeptAttachment(index: number) {
    setKeptAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  function validateForm(): string | null {
    if (!form.vendor_name.trim()) return "Vendor Name is required.";
    if (form.receipt_mode === "Vehicle" && !form.vehicle_number.trim()) {
      return "Vehicle Number is required for receipt by vehicle.";
    }
    const validPackageRows = form.package_details.filter(
      (row) => row.quantity.trim() && row.package_type.trim()
    );
    if (validPackageRows.length === 0) {
      return "Please enter at least one Package Details row with a Quantity and Package Type.";
    }
    if (!editingReceipt && manualDrcEntry) {
      if (!drcNumber.trim()) return "Please enter a DRC No.";
      if (!drcDate) return "Please enter a valid DRC Date.";
    }
    return null;
  }

  async function handleSave() {
    const validationError = validateForm();
    if (validationError) {
      showSnackbar(validationError, "warning");
      return;
    }

    setSaving(true);

    try {
      let createdReceipt: ReceiptHeader | null = null;

      if (editingReceipt) {
        const updated = await updateReceipt(
          editingReceipt.id,
          form,
          newPhotoFiles,
          keptPhotoUrls,
          newDocumentUploads,
          keptAttachments
        );
        showSnackbar(`DRC ${updated.drc_number} updated.`, "success");
      } else {
        const finalReceiptDatetime = combineDateWithNow(drcDate || todayIso());
        const created = await createReceipt(
          form,
          newPhotoFiles,
          newDocumentUploads,
          {
            drc_number: manualDrcEntry && drcNumber.trim() ? drcNumber.trim() : undefined,
            receipt_datetime: finalReceiptDatetime,
          }
        );
        showSnackbar(`DRC ${created.drc_number} created.`, "success");
        createdReceipt = created;
      }

      closeForm();
      await refreshAll();

      // Auto-open the Security Gate Entry mail draft so the operator can
      // copy it and send to security for material gate entry.
      if (createdReceipt) {
        openMailDialog(createdReceipt, "Security Gate Entry");
      }
    } catch (err: unknown) {
      console.error("DRC save error:", err);
      const isDuplicateDrcNumber =
        !editingReceipt &&
        typeof err === "object" &&
        err !== null &&
        (("code" in err && (err as { code?: string }).code === "23505") ||
          ("message" in err &&
            typeof (err as { message?: string }).message === "string" &&
            ((err as { message: string }).message.includes("idx_receipt_header_drc_number") ||
              (err as { message: string }).message.includes("duplicate key value"))));

      const errMsg =
        typeof err === "object" && err !== null && "message" in err && typeof (err as { message?: unknown }).message === "string"
          ? (err as { message: string }).message
          : "Something went wrong while saving the DRC.";

      showSnackbar(
        isDuplicateDrcNumber
          ? `DRC No. "${drcNumber.trim()}" already exists. Please use a different number.`
          : errMsg,
        "error"
      );
    } finally {
      setSaving(false);
    }
  }

  // ---------------- View DRC ----------------
  const [viewReceipt, setViewReceipt] = useState<ReceiptHeader | null>(null);

  // ---- Documents: upload straight from the View DRC dialog, any time
  // after DRC creation (persists immediately - no Save step). ----
  const viewDocumentInputRef = useRef<HTMLInputElement | null>(null);
  const [viewDocumentTypeSelection, setViewDocumentTypeSelection] =
    useState<DocumentType>("Invoice");
  const [uploadingViewDocument, setUploadingViewDocument] = useState(false);

  function handleViewDocumentSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file || !viewReceipt) return;

    setUploadingViewDocument(true);
    addReceiptDocument(viewReceipt.id, file, viewDocumentTypeSelection)
      .then((updated) => {
        setViewReceipt(updated);
        showSnackbar(`${viewDocumentTypeSelection} uploaded.`, "success");
      })
      .catch(() => showSnackbar("Document upload failed.", "error"))
      .finally(() => setUploadingViewDocument(false));
  }

  function handleRemoveViewDocument(index: number) {
    if (!viewReceipt) return;

    removeReceiptDocument(viewReceipt.id, index)
      .then((updated) => setViewReceipt(updated))
      .catch(() => showSnackbar("Failed to remove document.", "error"));
  }

  // ---------------- SAP MB51 Lookup & Sync Modal State ----------------
  const [sapLookupModalOpen, setSapLookupModalOpen] = useState(false);
  const [sapLookupInitialPo, setSapLookupInitialPo] = useState("");
  const [sapLookupInitialInv, setSapLookupInitialInv] = useState("");
  const [sapLookupTargetReceipt, setSapLookupTargetReceipt] =
    useState<ReceiptHeader | null>(null);

  // ---------------- Bin Location Allocation Modal State ----------------
  const [binAllocationModalOpen, setBinAllocationModalOpen] = useState(false);
  const [binAllocationTargetReceipt, setBinAllocationTargetReceipt] =
    useState<ReceiptHeader | null>(null);

  // ---------------- Live SAP Status for View Dialog ----------------
  const [viewSapLookup, setViewSapLookup] = useState<DrcSapLookupResult | null>(null);
  const [viewSapLoading, setViewSapLoading] = useState(false);

  const checkSapForView = useCallback(async (receipt: ReceiptHeader) => {
    const poToSearch = receipt.sap_po_number || receipt.po_number || "";
    if (!poToSearch && !receipt.invoice_number) {
      setViewSapLookup(null);
      return;
    }
    setViewSapLoading(true);
    try {
      const res = await findSapDocumentsForDrc(
        poToSearch,
        receipt.invoice_number
      );
      setViewSapLookup(res);

      // If 105 GRN is found in MB51, or if receipt already has grn_number / 105 doc,
      // ensure the database header has status "Closed" and inspection_status "GRN created"
      const doc105 = res.primary105Doc || receipt.grn_number || receipt.sap_105_doc;
      if (
        doc105 &&
        (receipt.status !== "Closed" ||
          receipt.inspection_status !== "GRN created" ||
          !receipt.grn_number ||
          !receipt.sap_105_doc)
      ) {
        const dateToUse = res.primary105Date || receipt.grn_date || todayIso();
        const { data: updatedHeader, error } = await supabase
          .from("receipt_header")
          .update({
            grn_number: doc105,
            grn_date: dateToUse,
            sap_105_doc: doc105,
            sap_105_date: dateToUse,
            status: "Closed",
            inspection_status: "GRN created",
            closed_date: receipt.closed_date || new Date().toISOString(),
          })
          .eq("id", receipt.id)
          .select()
          .single();

        if (!error && updatedHeader) {
          setViewReceipt(updatedHeader as ReceiptHeader);
          setReceipts((prev) =>
            prev.map((r) =>
              r.id === updatedHeader.id ? (updatedHeader as ReceiptHeader) : r
            )
          );
        }
      }
    } catch (err) {
      console.warn("checkSapForView error:", err);
      setViewSapLookup(null);
    } finally {
      setViewSapLoading(false);
    }
  }, []);

  useEffect(() => {
    if (viewReceipt) {
      checkSapForView(viewReceipt);
    } else {
      setViewSapLookup(null);
    }
  }, [viewReceipt, checkSapForView]);

  // Open SAP Lookup for an existing DRC (view or table)
  function handleOpenSapLookupForReceipt(receipt: ReceiptHeader) {
    setSapLookupInitialPo(receipt.sap_po_number || receipt.po_number || "");
    setSapLookupInitialInv(receipt.invoice_number || "");
    setSapLookupTargetReceipt(receipt);
    setSapLookupModalOpen(true);
  }

  // Open Bin Allocation Modal for a DRC
  function handleOpenBinAllocation(receipt: ReceiptHeader) {
    setBinAllocationTargetReceipt(receipt);
    setBinAllocationModalOpen(true);
  }

  // Apply fetched SAP items to Create/Edit DRC form
  function handleApplySapItemsToForm(
    items: SapMatchedLineItem[],
    meta: {
      vendor?: string;
      poDate?: string;
      po?: string;
      invoice?: string;
      doc103?: string;
      doc105?: string;
    }
  ) {
    const convertedRows = convertSapItemsToPackageDetails(items);
    setForm((prev) => ({
      ...prev,
      sap_items: convertedRows, // Keep strictly in sap_items, leave physical package_details intact!
      vendor_name: prev.vendor_name || meta.vendor || "",
      sap_po_date: prev.sap_po_date || meta.poDate || "",
      sap_po_number: prev.sap_po_number || meta.po || "",
      invoice_number: prev.invoice_number || meta.invoice || "",
    }));
    showSnackbar(
      `Successfully mapped ${items.length} material(s) from SAP MB51 into SAP Material Items. Physical Package Details kept separate.`,
      "success"
    );
  }

  // Apply fetched SAP items to an existing DRC in database
  async function handleApplySapItemsToReceipt(
    receipt: ReceiptHeader,
    items: SapMatchedLineItem[],
    lookupResult: DrcSapLookupResult
  ) {
    try {
      const convertedRows = convertSapItemsToPackageDetails(items);
      const discoveredPo = lookupResult.poNumber || "";
      const currentSapPo = (receipt.sap_po_number || "").trim();
      const currentPo = (receipt.po_number || "").trim();
      const shouldUpdateSapPo =
        discoveredPo && (!currentSapPo || /^gem/i.test(currentSapPo) || currentSapPo !== discoveredPo);
      const finalSapPo = shouldUpdateSapPo ? discoveredPo : (currentSapPo || discoveredPo);
      const isCurrentPoGem = /^gem/i.test(currentPo) || /^gem/i.test(currentSapPo);
      const finalGemOrder =
        receipt.gem_order_number ||
        (isCurrentPoGem ? (receipt.gem_order_number || currentSapPo || currentPo) : "");

      // Extract physical packages, restoring them if previously overwritten
      const physicalPkgs = cleanPhysicalPackageDetails(receipt.package_details);
      const restoredPackageDetails =
        physicalPkgs.length > 0
          ? physicalPkgs
          : [
              {
                quantity: String(receipt.package_count || 1),
                package_type: receipt.package_type || "C/Box",
                description: "",
              },
            ];

      const updateData: ReceiptFormInput = {
        receipt_mode: receipt.receipt_mode || "Vehicle",
        vehicle_number: receipt.vehicle_number || "",
        package_details: restoredPackageDetails,
        sap_items: convertedRows,
        vendor_name: receipt.vendor_name || lookupResult.vendorName || "Unknown Vendor",
        sap_po_number: finalSapPo,
        sap_po_date: receipt.sap_po_date || lookupResult.primary103Date || "",
        gem_order_number: finalGemOrder,
        gem_order_date: receipt.gem_order_date || "",
        invoice_number: receipt.invoice_number || lookupResult.invoiceNumber || "",
        invoice_date: receipt.invoice_date || "",
        challan_number: receipt.challan_number || "",
        challan_date: receipt.challan_date || "",
        eway_bill_number: receipt.eway_bill_number || "",
        eway_bill_date: receipt.eway_bill_date || "",
        lorry_receipt_number: receipt.lorry_receipt_number || "",
        lorry_receipt_date: receipt.lorry_receipt_date || "",
        weightment_slip_number: receipt.weightment_slip_number || "",
        gross_weight: receipt.gross_weight !== null ? String(receipt.gross_weight) : "",
        tare_weight: receipt.tare_weight !== null ? String(receipt.tare_weight) : "",
        net_weight: receipt.net_weight !== null ? String(receipt.net_weight) : "",
        purpose: receipt.purpose || "",
        driver_name: receipt.driver_name || "",
        tax_invoice_value: receipt.tax_invoice_value !== null ? String(receipt.tax_invoice_value) : "",
        msme_type: receipt.msme_type || "",
        important_note: receipt.important_note || "",
        delivery_location: receipt.delivery_location || "",
        vim_approval: receipt.vim_approval || "",
        remarks: receipt.remarks || "",
      };

      const updated = await updateReceipt(
        receipt.id,
        updateData,
        [],
        receipt.photo_urls,
        [],
        receipt.attachment_paths || []
      );

      // Link SAP 103 / 105 documents to receipt header
      const doc103 =
        lookupResult.primary103Doc ||
        items.find((it) => it.sap_103_doc)?.sap_103_doc ||
        null;
      const doc103Date = lookupResult.primary103Date || null;
      const doc105 =
        lookupResult.primary105Doc ||
        items.find((it) => it.sap_105_doc)?.sap_105_doc ||
        null;
      const doc105Date = lookupResult.primary105Date || null;

      const headerUpdate: Record<string, unknown> = {};
      if (doc103) {
        headerUpdate.sap_103_doc = doc103;
        if (doc103Date) headerUpdate.sap_103_date = doc103Date;
      }
      if (doc105) {
        headerUpdate.sap_105_doc = doc105;
        headerUpdate.grn_number = doc105;
        if (doc105Date) {
          headerUpdate.sap_105_date = doc105Date;
          headerUpdate.grn_date = doc105Date.split("T")[0];
        }
        headerUpdate.status = "Closed";
        headerUpdate.inspection_status = "GRN created";
        headerUpdate.closed_date = new Date().toISOString();
      }

      let finalReceipt = updated;
      if (Object.keys(headerUpdate).length > 0) {
        const { data: updatedHeader } = await supabase
          .from("receipt_header")
          .update(headerUpdate)
          .eq("id", receipt.id)
          .select()
          .single();
        if (updatedHeader) {
          finalReceipt = updatedHeader as ReceiptHeader;
        }
      }

      setViewReceipt(finalReceipt);
      await refreshAll();
      showSnackbar(
        `Linked ${items.length} material(s) from SAP MB51 to ${receipt.drc_number}.${doc105 ? " DRC marked GRN created." : ""}`,
        "success"
      );
    } catch (err) {
      console.error("Failed to link SAP items to receipt:", err);
      showSnackbar("Failed to link SAP items to DRC.", "error");
    }
  }

  // ---------------- Mail (AI-assisted draft - copy only, never sent from
  // this app; the operator pastes it into whatever mail client they use) ----------------
  const [mailDialogOpen, setMailDialogOpen] = useState(false);
  const [mailDialogReceipt, setMailDialogReceipt] = useState<ReceiptHeader | null>(
    null
  );
  const [mailType, setMailType] = useState<DrcMailType>("Inspection Request");
  const [mailDiscrepancyRemarks, setMailDiscrepancyRemarks] = useState("");
  const [mailSubject, setMailSubject] = useState("");
  const [mailBody, setMailBody] = useState("");
  const [mailBodyHtml, setMailBodyHtml] = useState("");
  const [generatingMail, setGeneratingMail] = useState(false);
  const [mailAiGenerated, setMailAiGenerated] = useState(false);

  async function regenerateMail(
    receipt: ReceiptHeader,
    type: DrcMailType,
    discrepancyRemarks: string
  ) {
    setGeneratingMail(true);
    try {
      const draft = await generateAiMail(
        receipt,
        type,
        discrepancyRemarks || undefined
      );
      setMailSubject(draft.subject);
      setMailBody(draft.body);
      setMailBodyHtml(draft.html ?? draft.body);
      setMailAiGenerated(draft.aiGenerated);
    } finally {
      setGeneratingMail(false);
    }
  }

  async function openMailDialog(
    receipt: ReceiptHeader,
    type: DrcMailType,
    discrepancyRemarks = ""
  ) {
    setMailDialogReceipt(receipt);
    setMailType(type);
    setMailDiscrepancyRemarks(discrepancyRemarks);
    setMailSubject("");
    setMailBody("");
    setMailBodyHtml("");
    setMailAiGenerated(false);
    setMailDialogOpen(true);
    await regenerateMail(receipt, type, discrepancyRemarks);
  }

  async function handleCopyMail() {
    try {
      const htmlBlob = new Blob(
        [
          `<html><body>`,
          `<p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;"><b>Subject:</b> ${mailSubject}</p>`,
          mailBodyHtml,
          `</body></html>`,
        ],
        { type: "text/html" }
      );
      const plainText = `Subject: ${mailSubject}\n\n${mailBody.replace(/<[^>]+>/g, "").replace(/<\/br>/g, "\n").replace(/<br\s*\/?>/g, "\n")}`;
      await navigator.clipboard.write([
        new ClipboardItem({
          [htmlBlob.type]: htmlBlob,
          ["text/plain"]: new Blob([plainText], { type: "text/plain" }),
        }),
      ]);
      showSnackbar("Mail content copied to clipboard.", "success");
    } catch {
      // Fallback: plain text copy
      try {
        await navigator.clipboard.writeText(`Subject: ${mailSubject}\n\n${mailBody}`);
        showSnackbar("Mail content copied (plain text).", "success");
      } catch {
        showSnackbar("Could not copy to clipboard.", "error");
      }
    }
  }

  // ---------------- Sprint 2: Inspection ----------------
  const [inspectionStatusInput, setInspectionStatusInput] =
    useState<InspectionStatus>("Inspection Cleared");
  const [inspectionRemarksInput, setInspectionRemarksInput] = useState("");
  const [inspectionByInput, setInspectionByInput] = useState("");
  const [submittingInspection, setSubmittingInspection] = useState(false);
  const [inspectionHistory, setInspectionHistory] = useState<
    InspectionHistoryEntry[]
  >([]);

  // ---------------- Sprint 2: GRN Upload (+ counting check) ----------------
  const [grnNumber, setGrnNumber] = useState("");
  const [grnDate, setGrnDate] = useState("");
  const [uploadedBy, setUploadedBy] = useState("");
  const grnFileInputRef = useRef<HTMLInputElement | null>(null);
  const [grnFile, setGrnFile] = useState<File | null>(null);
  const [grnPreviewLoading, setGrnPreviewLoading] = useState(false);
  const [grnTotalRecords, setGrnTotalRecords] = useState(0);
  const [grnMergedRows, setGrnMergedRows] = useState<GrnImportRow[]>([]);
  const [grnFormatInvalidRows, setGrnFormatInvalidRows] = useState<
    GrnFormatInvalidRow[]
  >([]);
  const [grnUnknownMaterials, setGrnUnknownMaterials] = useState<
    GrnImportRow[]
  >([]);
  const [grnKnownRows, setGrnKnownRows] = useState<GrnImportRow[]>([]);
  const [grnImporting, setGrnImporting] = useState(false);
  const [grnHistory, setGrnHistory] = useState<GrnHistoryEntry[]>([]);
  const [countingChecked, setCountingChecked] = useState(false);
  const [discrepancyFound, setDiscrepancyFound] = useState(false);
  const [discrepancyRemarksInput, setDiscrepancyRemarksInput] = useState("");

  function resetGrnForm() {
    setGrnNumber("");
    setGrnDate("");
    setUploadedBy("");
    setGrnFile(null);
    setGrnTotalRecords(0);
    setGrnMergedRows([]);
    setGrnFormatInvalidRows([]);
    setGrnUnknownMaterials([]);
    setGrnKnownRows([]);
    setCountingChecked(false);
    setDiscrepancyFound(false);
    setDiscrepancyRemarksInput("");
  }

  // Load Inspection + GRN history whenever a DRC is opened for viewing.
  useEffect(() => {
    if (!viewReceipt) {
      setInspectionHistory([]);
      setGrnHistory([]);
      return;
    }

    const isAlreadyHold = (viewReceipt.inspection_status || "").toLowerCase().includes("hold");
    setInspectionStatusInput(
      isAlreadyHold ? "Inspection on hold" : "Inspection cleared"
    );
    setInspectionRemarksInput(viewReceipt.inspection_remarks || "");
    setInspectionByInput(viewReceipt.inspection_by || "");
    resetGrnForm();

    let cancelled = false;

    Promise.all([
      getInspectionHistory(viewReceipt.id),
      getGrnHistory(viewReceipt.id),
    ]).then(([inspections, grns]) => {
      if (cancelled) return;
      setInspectionHistory(inspections);
      setGrnHistory(grns);
    });

    return () => {
      cancelled = true;
    };
  }, [viewReceipt?.id]);

  async function handleSubmitInspection() {
    if (!viewReceipt) return;

    const isHoldAction = inspectionStatusInput.toLowerCase().includes("hold");

    if (isHoldAction && !inspectionRemarksInput.trim()) {
      showSnackbar(
        "Please enter remarks explaining why inspection is on hold.",
        "warning"
      );
      return;
    }

    if (!inspectionByInput.trim()) {
      showSnackbar("Please enter Inspection By.", "warning");
      return;
    }

    setSubmittingInspection(true);

    try {
      const updated = await submitInspection(
        viewReceipt.id,
        inspectionStatusInput,
        inspectionRemarksInput,
        inspectionByInput
      );

      setViewReceipt(updated);
      setInspectionRemarksInput("");
      setInspectionByInput("");

      const history = await getInspectionHistory(viewReceipt.id);
      setInspectionHistory(history);

      showSnackbar(
        `Inspection recorded: ${inspectionStatusInput}.`,
        "success"
      );

      await refreshAll();

      // An on-hold outcome needs the relevant team notified with the hold
      // reason so the DRC can be moved forward once it's resolved.
      if (isHoldAction) {
        openMailDialog(updated, "Inspection On Hold");
      }
    } catch (err: unknown) {
      console.error("Inspection submit error:", err);
      const errObj = err as { message?: string; details?: string; hint?: string };
      const msg =
        errObj?.message ||
        errObj?.details ||
        "Something went wrong while saving the inspection.";
      showSnackbar(msg, "error");
    } finally {
      setSubmittingInspection(false);
    }
  }

  function handleDownloadGrnTemplate() {
    exportStyledTemplate({
      filename: "GRN_Import_Template.xlsx",
      sheetName: "GRN Template",
      columns: [
        { header: "Material Code", required: true, headerColor: "1E3A8A", width: 22 },
        { header: "Quantity", required: true, headerColor: "0F766E", width: 16, align: "right" },
      ],
      sampleRows: [
        ["9000000001", 10],
        ["9000000002", 25],
      ],
    });
    showSnackbar("GRN import template downloaded with styled columns.", "success");
  }

  function handleGrnFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setGrnFile(file);
    setGrnTotalRecords(0);
    setGrnMergedRows([]);
    setGrnFormatInvalidRows([]);
    setGrnUnknownMaterials([]);
    setGrnKnownRows([]);
    e.target.value = "";
  }

  async function handleGrnPreview() {
    if (!grnFile) {
      showSnackbar("Please choose a GRN Excel file first.", "warning");
      return;
    }

    setGrnPreviewLoading(true);

    try {
      const buffer = await grnFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(sheet, {
        defval: "",
      }) as Record<string, unknown>[];

      const parsed = parseGrnExcelRows(rawRows);
      setGrnTotalRecords(parsed.totalRecords);
      setGrnFormatInvalidRows(parsed.invalidRows);
      setGrnMergedRows(parsed.mergedRows);

      const validation = await validateGrnMaterials(parsed.mergedRows);
      setGrnKnownRows(validation.knownRows);
      setGrnUnknownMaterials(validation.unknownMaterials);

      if (validation.knownRows.length === 0) {
        showSnackbar(
          "No valid, known materials found in this file.",
          "error"
        );
      } else {
        showSnackbar(
          `Preview ready. ${validation.knownRows.length} material(s) ready to import.`,
          "success"
        );
      }
    } catch {
      showSnackbar("Failed to read the GRN Excel file.", "error");
    } finally {
      setGrnPreviewLoading(false);
    }
  }

  async function handleGrnImport() {
    if (!viewReceipt) return;

    if (!grnNumber.trim()) {
      showSnackbar("Please enter the GRN Number.", "warning");
      return;
    }

    if (!grnDate) {
      showSnackbar("Please enter the GRN Date.", "warning");
      return;
    }

    if (!uploadedBy.trim()) {
      showSnackbar("Please enter Uploaded By.", "warning");
      return;
    }

    if (grnKnownRows.length === 0) {
      showSnackbar("Please preview a file with valid materials first.", "warning");
      return;
    }

    if (!countingChecked) {
      showSnackbar(
        "Please confirm the material counting check before submitting the GRN.",
        "warning"
      );
      return;
    }

    if (discrepancyFound && !discrepancyRemarksInput.trim()) {
      showSnackbar(
        "Please enter the counting discrepancy remarks.",
        "warning"
      );
      return;
    }

    setGrnImporting(true);

    try {
      const summary = await importGrn(
        viewReceipt.id,
        grnNumber.trim(),
        grnDate,
        uploadedBy,
        grnKnownRows,
        countingChecked,
        discrepancyFound,
        discrepancyRemarksInput
      );

      if (summary.receipt) {
        setViewReceipt(summary.receipt);
      }

      const grns = await getGrnHistory(viewReceipt.id);
      setGrnHistory(grns);

      await downloadGrnImportReport(
        grnTotalRecords,
        grnFormatInvalidRows,
        grnMergedRows,
        grnUnknownMaterials,
        summary,
        grnFile?.name
      );

      resetGrnForm();

      showSnackbar(
        summary.closed
          ? `GRN imported. ${summary.imported} material(s), ${summary.totalQuantity} total quantity. DRC closed. Result report downloaded.`
          : `GRN import failed for all materials (${summary.failed} failure(s)). Result report downloaded.`,
        summary.closed ? "success" : "error"
      );

      await refreshAll();
    } catch {
      showSnackbar("Something went wrong while importing the GRN.", "error");
    } finally {
      setGrnImporting(false);
    }
  }

  // ---------------- Print DRC & File Strap ----------------
  const [strapDialogReceipt, setStrapDialogReceipt] = useState<ReceiptHeader | null>(null);
  const [strapDialogTab, setStrapDialogTab] = useState<"strap" | "full">("strap");
  const [printMenuAnchor, setPrintMenuAnchor] = useState<{
    anchorEl: HTMLElement;
    receipt: ReceiptHeader;
  } | null>(null);

  // ---------------- Bulk DRC Edge Strap Selection & Print ----------------
  const [selectedReceiptIds, setSelectedReceiptIds] = useState<number[]>([]);
  const [bulkStrapDialogOpen, setBulkStrapDialogOpen] = useState(false);

  function handleToggleSelectAll() {
    if (filteredReceipts.length === 0) return;
    const allFilteredSelected = filteredReceipts.every((r) =>
      selectedReceiptIds.includes(r.id)
    );
    if (allFilteredSelected) {
      const filteredIdSet = new Set(filteredReceipts.map((r) => r.id));
      setSelectedReceiptIds((prev) => prev.filter((id) => !filteredIdSet.has(id)));
    } else {
      const newIds = Array.from(
        new Set([...selectedReceiptIds, ...filteredReceipts.map((r) => r.id)])
      );
      setSelectedReceiptIds(newIds);
    }
  }

  function handleToggleSelectReceipt(id: number) {
    setSelectedReceiptIds((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    );
  }

  function handleRemoveFromBulk(id: number) {
    setSelectedReceiptIds((prev) => prev.filter((itemId) => itemId !== id));
  }

  function handleBulkDirectPrint() {
    const selected = receipts.filter((r) => selectedReceiptIds.includes(r.id));
    if (selected.length === 0) return;
    const html = buildBulkEdgeStrapPrintDocument(selected);
    executePrint(html, `DRC_Bulk_Edge_Straps_${selected.length}_items`);
  }

  function handleOpenBulkDialog() {
    setBulkStrapDialogOpen(true);
  }

  // ---------------- Common SAP 103 / 105 Fetch & Status Update ----------------
  const [syncingSap, setSyncingSap] = useState(false);

  const handleFetchSapAll = useCallback(async () => {
    setSyncingSap(true);
    try {
      const targetReceipts =
        selectedReceiptIds.length > 0
          ? receipts.filter((r) => selectedReceiptIds.includes(r.id))
          : undefined;

      const result = await syncAllDrcsWithSap(targetReceipts);

      await refreshAll();

      if (result.updatedCount > 0) {
        const parts: string[] = [];
        if (result.grnClosedCount > 0) {
          parts.push(`${result.grnClosedCount} marked GRN created (105)`);
        }
        if (result.doc103Count > 0) {
          parts.push(`${result.doc103Count} linked with SAP 103`);
        }
        showSnackbar(
          `Updated ${result.updatedCount} DRC(s) from SAP MB51${
            parts.length > 0 ? `: ${parts.join(", ")}` : "."
          }`,
          "success"
        );
      } else if (result.alreadySyncedCount > 0 && result.noMatchCount === 0) {
        showSnackbar(
          "All DRCs are already up to date with uploaded SAP MB51 history.",
          "info"
        );
      } else if (result.totalProcessed === 0) {
        showSnackbar(
          "No DRCs with PO or Invoice found to match against MB51.",
          "info"
        );
      } else {
        showSnackbar(
          `Checked ${result.totalProcessed} DRC(s). No new 103/105 records matched both PO and Invoice in MB51 history.`,
          "info"
        );
      }
    } catch (err: any) {
      console.error("Fetch SAP error:", err);
      showSnackbar(
        "Failed to fetch SAP documents: " + (err?.message || "Unknown error"),
        "error"
      );
    } finally {
      setSyncingSap(false);
    }
  }, [receipts, selectedReceiptIds, refreshAll]);

  function handleOpenPrintMenu(e: MouseEvent<HTMLElement>, receipt: ReceiptHeader) {
    e.stopPropagation();
    setPrintMenuAnchor({ anchorEl: e.currentTarget, receipt });
  }

  function handleClosePrintMenu() {
    setPrintMenuAnchor(null);
  }

  function handleOpenStrapDialog(receipt: ReceiptHeader, tab: "strap" | "full" = "strap") {
    setStrapDialogReceipt(receipt);
    setStrapDialogTab(tab);
    handleClosePrintMenu();
  }

  function handleDirectPrintStrap(receipt: ReceiptHeader) {
    handleClosePrintMenu();
    const strapHtml = buildStrapPrintDocument(receipt, {
      format: "horizontal_edge_strap",
      stripCount: 1,
      edgeFontSize: "large",
    });
    executePrint(strapHtml, `DRC_Edge_Strap_${receipt.drc_number}`);
  }

  function handleDirectPrintFull(receipt: ReceiptHeader) {
    handleClosePrintMenu();
    const fullHtml = buildFullDrcDocumentHtml(receipt);
    executePrint(fullHtml, `DRC_${receipt.drc_number}`);
  }

  // ---------------- Summary cards ----------------
  const summaryCards = [
    {
      key: "pending" as const,
      label: "Pending Inspection",
      value: summary.pendingInspection,
      icon: <PendingActionsIcon />,
      color: "#d97706",
      bg: "#fffbeb",
      border: "#fde68a",
      description: "Awaiting physical check",
    },
    {
      key: "on_hold" as const,
      label: "Inspection on hold",
      value: summary.inspectionOnHold,
      icon: <ReportProblemIcon />,
      color: "#dc2626",
      bg: "#fef2f2",
      border: "#fecaca",
      description: "Held with comments",
    },
    {
      key: "cleared" as const,
      label: "Inspection cleared",
      value: summary.inspectionCleared,
      icon: <TaskAltOutlinedIcon />,
      color: "#16a34a",
      bg: "#f0fdf4",
      border: "#bbf7d0",
      description: "Cleared by user dept",
    },
    {
      key: "closed" as const,
      label: "GRN created",
      value: summary.closed,
      icon: <TaskAltIcon />,
      color: "#16a34a",
      bg: "#f0fdf4",
      border: "#86efac",
      description: "105 GRN complete (Closed)",
    },
    {
      key: "all" as const,
      label: "Total DRC",
      value: summary.total,
      icon: <Inventory2Icon />,
      color: "#2563eb",
      bg: "#eff6ff",
      border: "#bfdbfe",
      description: "All records",
    },
  ];

  return (
    <Box sx={{ pb: 4 }}>
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { xs: "stretch", sm: "center" },
          justifyContent: "space-between",
          gap: 1.5,
          mb: 2,
        }}
      >
        <Typography
          sx={{
            fontWeight: 800,
            fontSize: { xs: "1.2rem", sm: "1.5rem" },
          }}
        >
          Material Receipt
        </Typography>

        <Box sx={{ display: "flex", gap: 1, alignItems: "center", width: { xs: "100%", sm: "auto" }, flexWrap: "wrap" }}>
          {selectedReceiptIds.length > 0 && (
            <Button
              variant="outlined"
              color="primary"
              startIcon={<ContentCutIcon />}
              onClick={handleOpenBulkDialog}
              sx={{
                minHeight: 48,
                borderRadius: 2.5,
                fontWeight: 700,
                flex: { xs: 1, sm: "none" },
              }}
            >
              Bulk Straps ({selectedReceiptIds.length})
            </Button>
          )}
          <Tooltip title="Automatically fetch 103 and 105 SAP documents from MB51 history matching strictly by PO and Invoice">
            <span>
              <Button
                variant="outlined"
                color="info"
                disabled={syncingSap}
                startIcon={
                  syncingSap ? (
                    <CircularProgress size={18} color="inherit" />
                  ) : (
                    <SyncIcon />
                  )
                }
                onClick={handleFetchSapAll}
                sx={{
                  minHeight: 48,
                  borderRadius: 2.5,
                  fontWeight: 700,
                  bgcolor: "info.50",
                  borderColor: "info.300",
                  "&:hover": {
                    bgcolor: "info.100",
                    borderColor: "info.main",
                  },
                  width: { xs: selectedReceiptIds.length > 0 ? "auto" : "100%", sm: "auto" },
                  flex: { xs: 1, sm: "none" },
                }}
              >
                {syncingSap
                  ? "Fetching SAP..."
                  : selectedReceiptIds.length > 0
                  ? `Fetch SAP (${selectedReceiptIds.length})`
                  : "Fetch SAP 103/105"}
              </Button>
            </span>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={openCreateForm}
            sx={{
              minHeight: 48,
              borderRadius: 2.5,
              fontWeight: 700,
              width: { xs: selectedReceiptIds.length > 0 ? "auto" : "100%", sm: "auto" },
              flex: { xs: 1, sm: "none" },
            }}
          >
            Create DRC
          </Button>
        </Box>
      </Box>

      {/* ---- Summary cards ---- */}
      <Grid container spacing={{ xs: 1.25, md: 1.5 }} sx={{ mb: 2 }}>
        {summaryCards.map((card) => {
          const isSelected =
            statusFilter === card.key ||
            (statusFilter === "all" && card.key === "all");
          return (
            <Grid key={card.label} size={{ xs: 6, sm: 4, md: 2.4 }}>
              <Paper
                elevation={0}
                onClick={() =>
                  setStatusFilter((prev) =>
                    prev === card.key ? "all" : card.key
                  )
                }
                sx={{
                  p: { xs: 1.25, md: 1.5 },
                  borderRadius: 2.5,
                  boxShadow: isSelected
                    ? `0 0 0 2px ${card.color}, 0 4px 12px rgba(15, 23, 42, 0.08)`
                    : "0 2px 10px rgba(15, 23, 42, 0.06)",
                  display: "flex",
                  alignItems: "center",
                  gap: { xs: 1, md: 1.25 },
                  cursor: "pointer",
                  transition: "all 0.15s ease-in-out",
                  border: isSelected
                    ? `1px solid ${card.color}`
                    : "1px solid rgba(0,0,0,0.06)",
                  bgcolor: isSelected ? card.bg : "background.paper",
                  "&:hover": {
                    transform: "translateY(-1px)",
                    boxShadow: "0 4px 14px rgba(15, 23, 42, 0.1)",
                  },
                }}
              >
                <Avatar
                  sx={{
                    bgcolor: card.color,
                    color: "#fff",
                    width: { xs: 36, md: 44 },
                    height: { xs: 36, md: 44 },
                    "& svg": { fontSize: { xs: 20, md: 22 } },
                  }}
                >
                  {card.icon}
                </Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: 800,
                      lineHeight: 1.1,
                      fontSize: { xs: "1.2rem", md: "1.4rem" },
                      color: isSelected ? card.color : "text.primary",
                    }}
                  >
                    {card.value}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      fontSize: { xs: "0.68rem", md: "0.78rem" },
                      fontWeight: isSelected ? 700 : 500,
                      display: "block",
                    }}
                    noWrap
                  >
                    {card.label}
                  </Typography>
                </Box>
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      {/* ---- Search & filter ---- */}
      <Paper
        elevation={0}
        sx={{
          p: 1.5,
          mb: 2,
          borderRadius: 2.5,
          boxShadow: "0 2px 10px rgba(15, 23, 42, 0.06)",
          position: "sticky",
          top: 0,
          zIndex: 4,
        }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
          <TextField
            size="small"
            placeholder="Search DRC No, Vendor, PO No, Invoice No or Vehicle No"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            fullWidth
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
          />

          <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 1 }}>
            <TextField
              size="small"
              type="date"
              label="From"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            />
            <TextField
              size="small"
              type="date"
              label="To"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            />
          </Box>

          {/* Quick status filter pills */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap", pt: 0.25 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary", mr: 0.25 }}>
              Status Filter:
            </Typography>
            {[
              { key: "all", label: `All (${summary.total})`, color: "default" },
              {
                key: "pending",
                label: `Pending Inspection (${summary.pendingInspection})`,
                color: "warning",
              },
              {
                key: "on_hold",
                label: `Inspection on hold (${summary.inspectionOnHold})`,
                color: "error",
              },
              {
                key: "cleared",
                label: `Inspection cleared (${summary.inspectionCleared})`,
                color: "success",
              },
              {
                key: "closed",
                label: `GRN created (${summary.closed})`,
                color: "success",
              },
            ].map((pill) => (
              <Chip
                key={pill.key}
                size="small"
                label={pill.label}
                clickable
                onClick={() => setStatusFilter(pill.key as typeof statusFilter)}
                color={statusFilter === pill.key ? (pill.color as any) : "default"}
                variant={statusFilter === pill.key ? "filled" : "outlined"}
                sx={{
                  fontWeight: statusFilter === pill.key ? 700 : 500,
                  fontSize: "0.75rem",
                  cursor: "pointer",
                }}
              />
            ))}
            {statusFilter !== "all" && (
              <Button
                size="small"
                onClick={() => setStatusFilter("all")}
                sx={{ fontSize: "0.72rem", py: 0, minHeight: 24, textTransform: "none" }}
              >
                Reset Filter
              </Button>
            )}
            <Box sx={{ ml: "auto", display: "flex", alignItems: "center" }}>
              <Tooltip title="Automatically fetch SAP 103 and 105 documents by matching PO and Invoice">
                <span>
                  <Button
                    size="small"
                    variant="outlined"
                    color="info"
                    disabled={syncingSap}
                    startIcon={
                      syncingSap ? (
                        <CircularProgress size={14} color="inherit" />
                      ) : (
                        <SyncIcon sx={{ fontSize: 16 }} />
                      )
                    }
                    onClick={handleFetchSapAll}
                    sx={{
                      fontSize: "0.75rem",
                      py: 0.25,
                      px: 1.25,
                      minHeight: 28,
                      fontWeight: 700,
                      textTransform: "none",
                      borderRadius: 1.5,
                      bgcolor: "info.50",
                      borderColor: "info.200",
                    }}
                  >
                    {syncingSap ? "Fetching SAP..." : "Fetch SAP 103 / 105"}
                  </Button>
                </span>
              </Tooltip>
            </Box>
          </Box>
        </Box>
      </Paper>

      {/* ---- Register ---- */}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : receipts.length === 0 ? (
        <Card variant="outlined" sx={{ p: 3, textAlign: "center", borderRadius: 2.5 }}>
          <Typography variant="body2" color="text.secondary">
            No DRCs found. Tap "Create DRC" to add the first one.
          </Typography>
        </Card>
      ) : filteredReceipts.length === 0 ? (
        <Card variant="outlined" sx={{ p: 3, textAlign: "center", borderRadius: 2.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            No DRCs match the selected filter ({statusFilter.replace("_", " ")}).
          </Typography>
          <Button size="small" variant="outlined" onClick={() => setStatusFilter("all")}>
            Show All DRCs
          </Button>
        </Card>
      ) : (
        <>
          {/* ---- Bulk Selection Action Banner ---- */}
          {selectedReceiptIds.length > 0 && (
            <Paper
              elevation={2}
              sx={{
                p: 1.5,
                px: 2,
                mb: 1.5,
                borderRadius: 2.5,
                bgcolor: "primary.50",
                border: "1px solid",
                borderColor: "primary.200",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 1.25,
                boxShadow: "0 2px 8px rgba(15,23,42,0.08)",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, flexWrap: "wrap" }}>
                <Chip
                  icon={<ContentCutIcon />}
                  label={`${selectedReceiptIds.length} DRC${selectedReceiptIds.length > 1 ? "s" : ""} Selected`}
                  color="primary"
                  sx={{ fontWeight: 800, fontSize: "0.85rem" }}
                />
                <Typography variant="body2" sx={{ fontWeight: 600, color: "primary.900" }}>
                  Ready for bulk edge strap printing (fits ~6 straps per single A4 page)
                </Typography>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                <Button
                  variant="outlined"
                  size="small"
                  color="info"
                  disabled={syncingSap}
                  startIcon={
                    syncingSap ? (
                      <CircularProgress size={14} color="inherit" />
                    ) : (
                      <SyncIcon sx={{ fontSize: 16 }} />
                    )
                  }
                  onClick={handleFetchSapAll}
                  sx={{
                    borderRadius: 2,
                    fontWeight: 700,
                    textTransform: "none",
                    bgcolor: "background.paper",
                  }}
                >
                  {syncingSap ? "Fetching..." : `Fetch SAP (${selectedReceiptIds.length})`}
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<PrintIcon />}
                  onClick={handleBulkDirectPrint}
                  sx={{ borderRadius: 2, fontWeight: 700, textTransform: "none", px: 2 }}
                >
                  Quick Print ({selectedReceiptIds.length})
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<VisibilityIcon />}
                  onClick={handleOpenBulkDialog}
                  sx={{
                    borderRadius: 2,
                    fontWeight: 700,
                    textTransform: "none",
                    bgcolor: "background.paper",
                  }}
                >
                  Preview & Print
                </Button>
                <Button
                  size="small"
                  onClick={() => setSelectedReceiptIds([])}
                  sx={{ textTransform: "none", color: "text.secondary", fontWeight: 600 }}
                >
                  Clear Selection
                </Button>
              </Box>
            </Paper>
          )}

          {/* ---- Mobile/tablet: card list ---- */}
          <Box sx={{ display: { xs: "flex", md: "none" }, flexDirection: "column", gap: 1 }}>
            {filteredReceipts.map((r) => {
              const isSelected = selectedReceiptIds.includes(r.id);
              return (
                <Card
                  key={r.id}
                  variant="outlined"
                  onClick={() => setViewReceipt(r)}
                  sx={{
                    borderRadius: 2.5,
                    px: 1.5,
                    py: 1.25,
                    cursor: "pointer",
                    transition: "background-color 0.15s ease",
                    bgcolor: isSelected ? "rgba(25, 118, 210, 0.05)" : "background.paper",
                    borderColor: isSelected ? "primary.main" : "divider",
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, alignItems: "flex-start" }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
                      <Checkbox
                        size="small"
                        checked={isSelected}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => handleToggleSelectReceipt(r.id)}
                        sx={{ p: 0.25 }}
                      />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: "0.9rem" }} noWrap>
                          {r.drc_number}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {r.vendor_name}
                        </Typography>
                      </Box>
                    </Box>
                    <DrcStatusChip receipt={r} />
                  </Box>

                  <Grid container spacing={0.5} sx={{ mt: 0.5 }}>
                    <Grid size={6}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: "0.65rem" }}>
                        PO Number
                      </Typography>
                      <Typography variant="body2" noWrap>{r.po_number ?? "-"}</Typography>
                    </Grid>
                    <Grid size={6}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: "0.65rem" }}>
                        Invoice Number
                      </Typography>
                      <Typography variant="body2" noWrap>{r.invoice_number ?? "-"}</Typography>
                    </Grid>
                    <Grid size={6}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: "0.65rem" }}>
                        Receipt Date
                      </Typography>
                      <Typography variant="body2" noWrap>{formatDate(r.receipt_datetime)}</Typography>
                    </Grid>
                    <Grid size={6}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: "0.65rem" }}>
                        Vehicle Number
                      </Typography>
                      <Typography variant="body2" noWrap>{r.vehicle_number ?? "-"}</Typography>
                    </Grid>
                  </Grid>

                  <Box
                    sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 0.75, pt: 0.5, borderTop: "1px solid", borderColor: "divider" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Box>
                      {r.package_details && r.package_details.length > 0 && r.package_details.every((p) => p.bin_allocated) ? (
                        <Chip size="small" color="success" icon={<WarehouseIcon fontSize="small" />} label="Bins Done" sx={{ height: 20, fontSize: "0.65rem", fontWeight: 700 }} />
                      ) : r.sap_105_doc || r.grn_number ? (
                        <Chip size="small" color="success" variant="outlined" icon={<TaskAltIcon fontSize="small" />} label="105 GRN" sx={{ height: 20, fontSize: "0.65rem", fontWeight: 600 }} />
                      ) : r.sap_103_doc || (r.package_details && r.package_details.some((p) => p.material_code)) ? (
                        <Chip size="small" color="info" variant="outlined" icon={<SyncIcon fontSize="small" />} label="103 Synced" sx={{ height: 20, fontSize: "0.65rem", fontWeight: 600 }} />
                      ) : null}
                    </Box>
                    <Box sx={{ display: "flex", gap: 0.5 }}>
                      <Tooltip title="Edit DRC">
                        <IconButton
                          size="small"
                          onClick={() => openEditForm(r)}
                          aria-label="Edit DRC"
                          sx={{ color: "primary.main" }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>
                </Card>
              );
            })}
          </Box>

          {/* ---- Desktop: proper table ---- */}
          <TableContainer
            component={Card}
            elevation={0}
            sx={{ display: { xs: "none", md: "block" }, borderRadius: 2.5, boxShadow: "0 2px 10px rgba(15,23,42,0.06)" }}
          >
            <Table sx={{ "& td, & th": { borderColor: "divider" } }}>
              <TableHead>
                <TableRow sx={{ "& th": { bgcolor: "grey.50", fontWeight: 700, color: "text.secondary" } }}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      color="primary"
                      indeterminate={
                        selectedReceiptIds.length > 0 &&
                        filteredReceipts.some((r) => selectedReceiptIds.includes(r.id)) &&
                        !filteredReceipts.every((r) => selectedReceiptIds.includes(r.id))
                      }
                      checked={
                        filteredReceipts.length > 0 &&
                        filteredReceipts.every((r) => selectedReceiptIds.includes(r.id))
                      }
                      onChange={handleToggleSelectAll}
                    />
                  </TableCell>
                  <TableCell>DRC Number</TableCell>
                  <TableCell>Vendor</TableCell>
                  <TableCell>PO Number</TableCell>
                  <TableCell>Invoice Number</TableCell>
                  <TableCell>Vehicle Number</TableCell>
                  <TableCell>Receipt Date</TableCell>
                  <TableCell>Status & Remarks</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredReceipts.map((r) => {
                  const isSelected = selectedReceiptIds.includes(r.id);
                  return (
                    <TableRow
                      key={r.id}
                      hover
                      selected={isSelected}
                      onClick={() => setViewReceipt(r)}
                      sx={{
                        height: 60,
                        cursor: "pointer",
                        "&:hover": {
                          bgcolor: "action.hover",
                        },
                      }}
                    >
                      <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          size="small"
                          color="primary"
                          checked={isSelected}
                          onChange={() => handleToggleSelectReceipt(r.id)}
                        />
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>{r.drc_number}</TableCell>
                      <TableCell>{r.vendor_name}</TableCell>
                      <TableCell>{r.sap_po_number || r.po_number || "-"}</TableCell>
                      <TableCell>{r.invoice_number ?? "-"}</TableCell>
                      <TableCell>{r.vehicle_number ?? "-"}</TableCell>
                      <TableCell>{formatDate(r.receipt_datetime)}</TableCell>
                      <TableCell>
                        <DrcStatusChip receipt={r} />
                      </TableCell>
                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                          <Tooltip title="Edit DRC">
                            <IconButton
                              size="small"
                              onClick={() => openEditForm(r)}
                              aria-label="Edit DRC"
                              sx={{ color: "primary.main" }}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {/* ================= Create / Edit DRC ================= */}
      <Dialog
        open={formOpen}
        onClose={closeForm}
        fullScreen={mobile}
        fullWidth
        maxWidth={mobile ? "sm" : "xl"}
        sx={{
          "& .MuiDialog-paper": {
            maxHeight: "97vh",
            m: { xs: 0.5, sm: 1 },
            borderRadius: 2,
          },
        }}
      >
        <DialogTitle
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontWeight: 800,
            fontSize: "0.95rem",
            letterSpacing: 0.5,
            py: 0.75,
            px: 2,
            background: "linear-gradient(135deg, #6C2BD9 0%, #8B5CF6 100%)",
            color: "#FFFFFF",
          }}
        >
          {editingReceipt ? `Edit DRC - ${editingReceipt.drc_number}` : "CREATE DRC"}
          <IconButton onClick={closeForm} size="small" sx={{ color: "#FFFFFF", p: 0.5 }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent
          dividers
          sx={{
            py: 1,
            px: { xs: 1, sm: 1.5 },
            overflowY: "auto",
            "& .MuiInputBase-root": {
              fontSize: "0.8125rem",
              borderRadius: 1.5,
            },
            "& .MuiInputBase-input": {
              py: "5.5px !important",
              fontSize: "0.8125rem",
            },
            "& .MuiInputLabel-root": {
              fontSize: "0.8125rem",
            },
          }}
        >
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "3fr 1.15fr" }, gap: 1.25, alignItems: "start" }}>

            {/* ====== LEFT AREA: COLUMNS 1, 2, 3 (GENERAL INFO, TRANSPORT, PURCHASE, WEIGHBRIDGE, INVOICE & CHALLAN, PACKAGE DETAILS) ====== */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>

              {/* Top Row: Column 1 and Columns 2 & 3 */}
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 2fr" }, gap: 1.25, alignItems: "start" }}>

                {/* ====== COLUMN 1 (GENERAL INFO & TRANSPORT) ====== */}
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>

              {/* --- General Info --- */}
              <Card elevation={0} sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, px: 1.25, py: 0.5, borderBottom: "1px solid", borderColor: "divider" }}>
                  <BusinessIcon fontSize="small" sx={{ color: "primary.main" }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1, fontSize: "0.78rem" }}>GENERAL INFO</Typography>
                  <InfoOutlinedIcon sx={{ color: "text.secondary", fontSize: 16 }} />
                </Box>
                <Box sx={{ p: 1, display: "flex", flexDirection: "column", gap: 0.85 }}>
                  {/* DRC No. & Date */}
                  {!editingReceipt && (
                    <Box>
                      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.25 }}>
                        <Typography variant="caption" sx={{ fontWeight: 600, fontSize: "0.72rem" }}>DRC No.</Typography>
                        <FormControlLabel
                          sx={{ mr: 0 }}
                          control={<Switch size="small" checked={manualDrcEntry} onChange={handleManualDrcToggle} />}
                          label={<Typography variant="caption" sx={{ fontWeight: 600, fontSize: "0.72rem" }}>Manual</Typography>}
                        />
                      </Box>
                      <TextField
                        label="DRC No."
                        size="small"
                        fullWidth
                        required={manualDrcEntry}
                        disabled={!manualDrcEntry}
                        value={drcNumber}
                        onChange={(e) => setDrcNumber(e.target.value)}
                        slotProps={{
                          input: {
                            endAdornment: loadingDrcSuggestion ? (
                              <InputAdornment position="end"><CircularProgress size={16} /></InputAdornment>
                            ) : undefined,
                          },
                        }}
                        helperText={manualDrcEntry ? undefined : "Auto - previous DRC No. + 1"}
                        sx={{ "& .MuiOutlinedInput-root": { borderRadius: 1.5 } }}
                      />
                      <Box sx={{ display: "flex", gap: 1, mt: 0.75 }}>
                        <DateTextField label="Date" value={drcDate} onChange={setDrcDate} required={manualDrcEntry} disabled={!manualDrcEntry} />
                      </Box>
                    </Box>
                  )}
                  {editingReceipt && (
                    <Box>
                      <Typography variant="caption" sx={{ fontWeight: 600, fontSize: "0.72rem" }}>DRC No.</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, fontSize: "0.82rem" }}>{editingReceipt.drc_number}</Typography>
                    </Box>
                  )}

                  {/* Vendor Name */}
                  <Autocomplete
                    freeSolo
                    options={vendorSuggestions}
                    inputValue={form.vendor_name}
                    onInputChange={(_e, value) => updateField("vendor_name", value ?? "")}
                    renderInput={(params) => (
                      <TextField {...params} label="Vendor Name (Supplier) *" size="small" required sx={{ "& .MuiOutlinedInput-root": { borderRadius: 1.5 } }} />
                    )}
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 1.5 } }}
                  />
                </Box>
              </Card>

              {/* --- Transport --- */}
              <Card elevation={0} sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, px: 1.25, py: 0.5, borderBottom: "1px solid", borderColor: "divider" }}>
                  <LocalShippingIcon fontSize="small" sx={{ color: "primary.main" }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: "0.78rem" }}>TRANSPORT</Typography>
                </Box>
                <Box sx={{ p: 1, display: "flex", flexDirection: "column", gap: 0.75 }}>
                  <RadioGroup
                    row
                    value={form.receipt_mode}
                    onChange={(e) => updateField("receipt_mode", e.target.value as ReceiptMode)}
                    sx={{ my: -0.25 }}
                  >
                    <FormControlLabel value="Vehicle" control={<Radio size="small" />} label={<Typography variant="body2" sx={{ fontSize: "0.8rem" }}>By Vehicle</Typography>} />
                    <FormControlLabel value="Hand" control={<Radio size="small" />} label={<Typography variant="body2" sx={{ fontSize: "0.8rem" }}>By Hand</Typography>} />
                  </RadioGroup>
                  {form.receipt_mode === "Vehicle" && (
                    <Autocomplete
                      freeSolo
                      options={vehicleSuggestions}
                      inputValue={form.vehicle_number}
                      onInputChange={(_e, value) => updateField("vehicle_number", value ?? "")}
                      renderInput={(params) => (
                        <TextField {...params} label="Vehicle Number" size="small" required sx={{ "& .MuiOutlinedInput-root": { borderRadius: 1.5 } }} />
                      )}
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: 1.5 } }}
                    />
                  )}
                  <Autocomplete
                    freeSolo
                    options={driverSuggestions}
                    inputValue={form.driver_name}
                    onInputChange={(_e, value) => updateField("driver_name", value ?? "")}
                    renderInput={(params) => (
                      <TextField {...params} label={form.receipt_mode === "Vehicle" ? "Driver Name" : "Person Name (carrying by hand)"} size="small" required sx={{ "& .MuiOutlinedInput-root": { borderRadius: 1.5 } }} />
                    )}
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 1.5 } }}
                  />
                </Box>
              </Card>

            </Box>

                {/* ====== COLUMNS 2 & 3 (PURCHASE DETAILS, WEIGHBRIDGE DATA & COMPRESSED INVOICE & CHALLAN) ====== */}
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>

              {/* Top Row: Purchase Details & Weighbridge Data side by side */}
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.25, alignItems: "stretch" }}>
                {/* --- Purchase Details --- */}
                <Card elevation={0} sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider", height: "100%" }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, px: 1.25, py: 0.5, borderBottom: "1px solid", borderColor: "divider" }}>
                    <LocalOfferIcon fontSize="small" sx={{ color: "primary.main" }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: "0.78rem" }}>PURCHASE DETAILS</Typography>
                  </Box>
                  <Box sx={{ p: 1, display: "flex", flexDirection: "column", gap: 0.75 }}>
                    <TextField label="SAP PO Number" size="small" fullWidth value={form.sap_po_number} onChange={(e) => updateField("sap_po_number", e.target.value)} sx={{ "& .MuiOutlinedInput-root": { borderRadius: 1.5 } }} />
                    <DateTextField label="SAP PO Date" value={form.sap_po_date} onChange={(iso) => updateField("sap_po_date", iso)} />
                    <TextField label="GeM Order Number" size="small" fullWidth value={form.gem_order_number} onChange={(e) => updateField("gem_order_number", e.target.value)} sx={{ "& .MuiOutlinedInput-root": { borderRadius: 1.5 } }} />
                    <DateTextField label="GeM Order Date" value={form.gem_order_date} onChange={(iso) => updateField("gem_order_date", iso)} />
                  </Box>
                </Card>

                {/* --- Weighbridge Data --- */}
                <Card elevation={0} sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider", height: "100%" }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, px: 1.25, py: 0.5, borderBottom: "1px solid", borderColor: "divider" }}>
                    <ScaleIcon fontSize="small" sx={{ color: "primary.main" }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: "0.78rem" }}>WEIGHBRIDGE DATA</Typography>
                  </Box>
                  <Box sx={{ p: 1, display: "flex", flexDirection: "column", gap: 0.75 }}>
                    <TextField label="Weightment Slip Number" size="small" fullWidth value={form.weightment_slip_number} onChange={(e) => updateField("weightment_slip_number", e.target.value)} sx={{ "& .MuiOutlinedInput-root": { borderRadius: 1.5 } }} />
                    <TextField label="Gross Weight" type="number" size="small" fullWidth value={form.gross_weight} onChange={(e) => updateField("gross_weight", e.target.value)} slotProps={{ htmlInput: { inputMode: "decimal" } }} sx={{ "& .MuiOutlinedInput-root": { borderRadius: 1.5 } }} />
                    <TextField label="Tare Weight" type="number" size="small" fullWidth value={form.tare_weight} onChange={(e) => updateField("tare_weight", e.target.value)} slotProps={{ htmlInput: { inputMode: "decimal" } }} sx={{ "& .MuiOutlinedInput-root": { borderRadius: 1.5 } }} />
                    <TextField label="Net Weight" type="number" size="small" fullWidth value={form.net_weight} onChange={(e) => updateField("net_weight", e.target.value)} slotProps={{ htmlInput: { inputMode: "decimal" } }} sx={{ "& .MuiOutlinedInput-root": { borderRadius: 1.5 } }} />
                  </Box>
                </Card>
              </Box>

              {/* --- Invoice & Challan --- */}
              <Card elevation={0} sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider", height: "fit-content" }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, px: 1.25, py: 0.5, borderBottom: "1px solid", borderColor: "divider" }}>
                  <ReceiptLongIcon fontSize="small" sx={{ color: "primary.main" }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: "0.78rem" }}>INVOICE & CHALLAN</Typography>
                </Box>
                <Box sx={{ p: 1, display: "flex", flexDirection: "column", gap: 0.75 }}>
                  {/* Row 1: Invoice number - invoice date - invoice amount */}
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" }, gap: 1 }}>
                    <TextField label="Invoice Number" size="small" fullWidth value={form.invoice_number} onChange={(e) => updateField("invoice_number", e.target.value)} sx={{ "& .MuiOutlinedInput-root": { borderRadius: 1.5 } }} />
                    <DateTextField label="Invoice Date" value={form.invoice_date} onChange={(iso) => updateField("invoice_date", iso)} />
                    <TextField label="Invoice Amount" size="small" fullWidth type="number" placeholder="Enter Amount" value={form.tax_invoice_value} onChange={(e) => updateField("tax_invoice_value", e.target.value)} sx={{ "& .MuiOutlinedInput-root": { borderRadius: 1.5 } }} />
                  </Box>
                  {/* Row 2: Challan number - challan date */}
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1 }}>
                    <TextField label="Challan Number" size="small" fullWidth value={form.challan_number} onChange={(e) => updateField("challan_number", e.target.value)} sx={{ "& .MuiOutlinedInput-root": { borderRadius: 1.5 } }} />
                    <DateTextField label="Challan Date" value={form.challan_date} onChange={(iso) => updateField("challan_date", iso)} />
                  </Box>
                  {/* Row 3: E-way bill number - E-way bill date */}
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1 }}>
                    <TextField label="E-way Bill Number" size="small" fullWidth value={form.eway_bill_number} onChange={(e) => updateField("eway_bill_number", e.target.value)} sx={{ "& .MuiOutlinedInput-root": { borderRadius: 1.5 } }} />
                    <DateTextField label="E-way Bill Date" value={form.eway_bill_date} onChange={(iso) => updateField("eway_bill_date", iso)} />
                  </Box>
                  {/* Row 4: LR number - LR date */}
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1 }}>
                    <TextField label="LR Number" size="small" fullWidth value={form.lorry_receipt_number} onChange={(e) => updateField("lorry_receipt_number", e.target.value)} sx={{ "& .MuiOutlinedInput-root": { borderRadius: 1.5 } }} />
                    <DateTextField label="LR Date" value={form.lorry_receipt_date} onChange={(iso) => updateField("lorry_receipt_date", iso)} />
                  </Box>
                </Box>
              </Card>

            </Box>

          </Box>

          {/* ====== EXTENDED PACKAGE DETAILS (BELOW TRANSPORT AND INVOICE & CHALLAN ACROSS ALL 3 COLUMNS) ====== */}
          <Card elevation={0} sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 1.25, py: 0.5, borderBottom: "1px solid", borderColor: "divider" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <Inventory2Icon fontSize="small" sx={{ color: "primary.main" }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: "0.78rem" }}>
                  PACKAGE DETAILS
                </Typography>
              </Box>
              <Button size="small" startIcon={<AddIcon fontSize="small" />} onClick={addPackageRow} sx={{ fontWeight: 600, textTransform: "none", py: 0.25, fontSize: "0.75rem" }}>
                Add Package
              </Button>
            </Box>
            <Box sx={{ p: 0.75, display: "flex", flexDirection: "column", gap: 0.5 }}>
              {form.package_details.map((row, index) => (
                <Box key={index} sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, alignItems: { xs: "stretch", sm: "center" }, gap: 0.75, p: 0.75, borderRadius: 1.5, bgcolor: "grey.50" }}>
                  <TextField
                    label="No. of Pkgs"
                    placeholder="e.g. 1"
                    size="small"
                    value={row.quantity}
                    onChange={(e) => updatePackageRow(index, "quantity", e.target.value)}
                    sx={{ width: { xs: "100%", sm: 100 }, flexShrink: 0, "& .MuiOutlinedInput-root": { borderRadius: 1.5 } }}
                  />
                  <Autocomplete
                    freeSolo
                    options={packageTypeSuggestions}
                    inputValue={row.package_type}
                    onInputChange={(_e, value) => updatePackageRow(index, "package_type", value ?? "")}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Package Type"
                        placeholder="e.g. C/Box, W/Box"
                        size="small"
                        sx={{ "& .MuiOutlinedInput-root": { borderRadius: 1.5 }, minWidth: { sm: 170 } }}
                      />
                    )}
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 1.5 }, width: { xs: "100%", sm: 190 }, flexShrink: 0 }}
                  />
                  <TextField
                    label="Package Remarks / Content Description"
                    placeholder="Optional details (e.g. Valves, hardware, bearings)"
                    size="small"
                    fullWidth
                    value={row.description}
                    onChange={(e) => updatePackageRow(index, "description", e.target.value)}
                    sx={{ flex: 1, "& .MuiOutlinedInput-root": { borderRadius: 1.5 } }}
                  />
                  <IconButton
                    size="small"
                    onClick={() => removePackageRow(index)}
                    aria-label="Delete package row"
                    disabled={form.package_details.length <= 1}
                    sx={{ flexShrink: 0, p: 0.5 }}
                  >
                    <DeleteIcon fontSize="small" color={form.package_details.length <= 1 ? "disabled" : "error"} />
                  </IconButton>
                </Box>
              ))}
            </Box>
          </Card>

          {/* ====== SAP 103 / 105 MATERIAL ITEMS (SPANS ACROSS ALL 3 COLUMNS IF PRESENT) ====== */}
          {form.sap_items && form.sap_items.length > 0 && (
            <Card elevation={0} sx={{ borderRadius: 2, border: "1px solid", borderColor: "info.light", bgcolor: "info.50" }}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 1.5, py: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                  <TaskAltIcon fontSize="small" color="info" />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "info.dark" }}>
                    SAP 103 / 105 MATERIAL ITEMS ({form.sap_items.length} Materials)
                  </Typography>
                </Box>
                <Chip
                  size="small"
                  color="info"
                  label="SAP MB51 Synced"
                  sx={{ fontWeight: 700, fontSize: "0.7rem", height: 22 }}
                />
              </Box>
              <Box sx={{ px: 1.5, pt: 1, pb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  Actual material codes and quantities received inside the physical packages above.
                </Typography>
              </Box>
              <Box sx={{ p: 1.5, pt: 0.5 }}>
                <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 1.5, border: "1px solid", borderColor: "divider" }}>
                  <Table size="small">
                    <TableHead sx={{ bgcolor: "grey.100" }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Material Code</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Description</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }} align="right">Qty</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>UoM</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>SAP Movements</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Bin Location</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {form.sap_items.map((item, idx) => (
                        <TableRow key={idx} hover>
                          <TableCell sx={{ fontWeight: 700, fontFamily: "monospace", fontSize: "0.75rem" }}>
                            {item.material_code || "-"}
                          </TableCell>
                          <TableCell sx={{ fontSize: "0.75rem" }}>{item.description || "-"}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.75rem" }}>
                            {item.quantity}
                          </TableCell>
                          <TableCell sx={{ fontSize: "0.75rem" }}>{item.uom || item.package_type || "NOS"}</TableCell>
                          <TableCell sx={{ fontSize: "0.75rem" }}>
                            {item.sap_103_doc && `103: ${item.sap_103_doc}`}
                            {item.sap_105_doc && ` 105: ${item.sap_105_doc}`}
                            {!item.sap_103_doc && !item.sap_105_doc && "-"}
                          </TableCell>
                          <TableCell sx={{ fontSize: "0.75rem" }}>
                            {item.bin_location ? (
                              <Chip size="small" label={item.bin_location} color="success" sx={{ height: 20, fontSize: "0.7rem", fontWeight: 700 }} />
                            ) : (
                              <Typography variant="caption" color="text.secondary">Unallocated</Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            </Card>
          )}

        </Box>

        {/* ====== COLUMN 4: REMARKS & ATTACHMENTS, DOCUMENTS (LAST IN SEQUENCE) ====== */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>

          {/* --- Remarks & Attachments --- */}
          <Card elevation={0} sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, px: 1.25, py: 0.5, borderBottom: "1px solid", borderColor: "divider" }}>
              <DriveFileRenameOutlineIcon fontSize="small" sx={{ color: "primary.main" }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: "0.78rem" }}>REMARKS & ATTACHMENTS</Typography>
            </Box>
            <Box sx={{ p: 1, display: "flex", flexDirection: "column", gap: 0.75 }}>
              <TextField label="Purpose" size="small" fullWidth multiline minRows={2} placeholder="Enter Purpose" value={form.purpose} onChange={(e) => updateField("purpose", e.target.value)} sx={{ "& .MuiOutlinedInput-root": { borderRadius: 1.5 } }} />
              <TextField select label="MSME / Non MSME" size="small" fullWidth value={form.msme_type} onChange={(e) => updateField("msme_type", e.target.value)} sx={{ "& .MuiOutlinedInput-root": { borderRadius: 1.5 } }}>
                <MenuItem value="">None</MenuItem>
                <MenuItem value="MSME">MSME</MenuItem>
                <MenuItem value="General">General</MenuItem>
              </TextField>
              <TextField label="Location" size="small" fullWidth placeholder="e.g. Ware House" value={form.delivery_location} onChange={(e) => updateField("delivery_location", e.target.value)} sx={{ "& .MuiOutlinedInput-root": { borderRadius: 1.5 } }} />
              <TextField label="Important Note" size="small" fullWidth value={form.important_note} onChange={(e) => updateField("important_note", e.target.value)} sx={{ "& .MuiOutlinedInput-root": { borderRadius: 1.5 } }} />
              <TextField label="VIM Approval" size="small" fullWidth value={form.vim_approval} onChange={(e) => updateField("vim_approval", e.target.value)} sx={{ "& .MuiOutlinedInput-root": { borderRadius: 1.5 } }} />

              {/* Photo upload */}
              <Box>
                <input ref={photoInputRef} type="file" accept="image/*" multiple hidden onChange={handlePhotoSelect} />
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={handleCameraCapture} />
                <Button variant="contained" startIcon={capturingPhoto ? <CircularProgress size={14} color="inherit" /> : <AddPhotoAlternateIcon sx={{ fontSize: 16 }} />} onClick={openPhotoMenu} disabled={capturingPhoto} sx={{ minHeight: 32, py: 0.5, borderRadius: 1.5, fontWeight: 600, fontSize: "0.8rem", width: "100%" }}>
                  Add Photo
                </Button>
                <Menu anchorEl={photoMenuAnchor} open={!!photoMenuAnchor} onClose={closePhotoMenu}>
                  <MenuItem onClick={handleTakePhoto}><PhotoCameraIcon fontSize="small" sx={{ mr: 1 }} />Take Photo</MenuItem>
                  <MenuItem onClick={handleChooseFromGallery}><PhotoLibraryIcon fontSize="small" sx={{ mr: 1 }} />Choose From Gallery</MenuItem>
                </Menu>
                {(keptPhotoUrls.length > 0 || newPhotoPreviews.length > 0) && (
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 0.75 }}>
                    {keptPhotoUrls.map((url, index) => (
                      <Box key={`kept-${index}`} sx={{ position: "relative" }}>
                        <Avatar src={url} variant="rounded" sx={{ width: 44, height: 44 }} />
                        <IconButton size="small" onClick={() => removeKeptPhoto(index)} sx={{ position: "absolute", top: -6, right: -6, bgcolor: "background.paper", boxShadow: 1, width: 18, height: 18 }}>
                          <DeleteIcon sx={{ fontSize: 12 }} color="error" />
                        </IconButton>
                      </Box>
                    ))}
                    {newPhotoPreviews.map((url, index) => (
                      <Box key={`new-${index}`} sx={{ position: "relative" }}>
                        <Avatar src={url} variant="rounded" sx={{ width: 44, height: 44 }} />
                        <IconButton size="small" onClick={() => removeNewPhoto(index)} sx={{ position: "absolute", top: -6, right: -6, bgcolor: "background.paper", boxShadow: 1, width: 18, height: 18 }}>
                          <DeleteIcon sx={{ fontSize: 12 }} color="error" />
                        </IconButton>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            </Box>
          </Card>

          {/* --- Documents --- */}
          <Card elevation={0} sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, px: 1.25, py: 0.5, borderBottom: "1px solid", borderColor: "divider" }}>
              <NoteAddIcon fontSize="small" sx={{ color: "primary.main" }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: "0.78rem" }}>DOCUMENTS</Typography>
            </Box>
            <Box sx={{ p: 1, display: "flex", flexDirection: "column", gap: 0.75 }}>
              <Box sx={{ display: "flex", gap: 0.75, alignItems: "center" }}>
                <TextField select label="Type" size="small" value={documentTypeSelection} onChange={(e) => setDocumentTypeSelection(e.target.value as DocumentType)} sx={{ flex: 1, minWidth: 90, "& .MuiOutlinedInput-root": { borderRadius: 1.5 } }}>
                  {DOCUMENT_TYPES.map((type) => (
                    <MenuItem key={type} value={type}>{type}</MenuItem>
                  ))}
                </TextField>
                <input ref={documentInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" multiple hidden onChange={handleDocumentSelect} />
                <Button variant="contained" startIcon={<AttachFileIcon sx={{ fontSize: 16 }} />} onClick={() => documentInputRef.current?.click()} sx={{ minHeight: 32, py: 0.5, borderRadius: 1.5, fontWeight: 600, fontSize: "0.78rem", whiteSpace: "nowrap" }}>
                  Upload
                </Button>
              </Box>
              {(keptAttachments.length > 0 || newDocumentUploads.length > 0) && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                  {keptAttachments.map((doc, index) => (
                    <Box key={`kept-doc-${index}`} sx={{ display: "flex", alignItems: "center", gap: 0.75, p: 0.5, borderRadius: 1.5, bgcolor: "grey.50" }}>
                      <DescriptionIcon fontSize="small" color="action" />
                      <Chip size="small" label={doc.document_type ?? "Other"} sx={{ fontWeight: 600, flexShrink: 0, height: 18, fontSize: "0.68rem" }} />
                      <Typography variant="caption" sx={{ flex: 1, minWidth: 0, fontSize: "0.72rem" }} noWrap component="a" href={doc.url} target="_blank" rel="noreferrer">{doc.name}</Typography>
                      <IconButton size="small" onClick={() => removeKeptAttachment(index)} aria-label="Remove document" sx={{ p: 0.25 }}><DeleteIcon sx={{ fontSize: 14 }} color="error" /></IconButton>
                    </Box>
                  ))}
                  {newDocumentUploads.map((upload, index) => (
                    <Box key={`new-doc-${index}`} sx={{ display: "flex", alignItems: "center", gap: 0.75, p: 0.5, borderRadius: 1.5, bgcolor: "grey.50" }}>
                      <DescriptionIcon fontSize="small" color="action" />
                      <Chip size="small" label={upload.documentType} sx={{ fontWeight: 600, flexShrink: 0, height: 18, fontSize: "0.68rem" }} />
                      <Typography variant="caption" sx={{ flex: 1, minWidth: 0, fontSize: "0.72rem" }} noWrap>{upload.file.name}</Typography>
                      <IconButton size="small" onClick={() => removeNewDocument(index)} aria-label="Remove document" sx={{ p: 0.25 }}><DeleteIcon sx={{ fontSize: 14 }} color="error" /></IconButton>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </Card>

        </Box>

          </Box>
        </DialogContent>

        <DialogActions
          sx={{
            py: 0.75,
            px: { xs: 1.5, sm: 2 },
            gap: 1,
            position: mobile ? "sticky" : "static",
            bottom: 0,
            bgcolor: "background.paper",
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          <Button
            onClick={closeForm}
            disabled={saving}
            size="small"
            sx={{ minHeight: 34, py: 0.5, borderRadius: 1.5, fontSize: "0.82rem" }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleReset}
            disabled={saving}
            size="small"
            sx={{ minHeight: 34, py: 0.5, borderRadius: 1.5, fontSize: "0.82rem" }}
          >
            Reset
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            size="small"
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
            sx={{ minHeight: 34, py: 0.5, borderRadius: 1.5, fontWeight: 700, fontSize: "0.85rem", flex: 1 }}
          >
            Save DRC
          </Button>
        </DialogActions>
      </Dialog>

      {/* ================= View DRC ================= */}
      <Dialog
        open={!!viewReceipt}
        onClose={() => setViewReceipt(null)}
        fullWidth
        maxWidth="md"
        fullScreen={mobile}
      >
        {viewReceipt && (
          <>
            <DialogTitle
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontWeight: 700,
                borderBottom: "1px solid",
                borderColor: "divider",
                pb: 1.5,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  {viewReceipt.drc_number}
                </Typography>
                <DrcStatusChip receipt={viewReceipt} showRemarks={false} />
              </Box>
              <IconButton onClick={() => setViewReceipt(null)} size="small">
                <CloseIcon fontSize="small" />
              </IconButton>
            </DialogTitle>

            <DialogContent dividers sx={{ p: { xs: 1.5, sm: 2 } }}>
              {/* ---- SAP Movement Status (103 & 105) ---- */}
              {(() => {
                const has103 = Boolean(
                  viewReceipt.sap_103_doc ||
                    viewSapLookup?.has103 ||
                    viewSapLookup?.primary103Doc
                );
                const doc103 =
                  viewReceipt.sap_103_doc ||
                  viewSapLookup?.primary103Doc ||
                  "-";
                const date103 = formatDate(
                  viewReceipt.sap_103_date ||
                    viewSapLookup?.primary103Date ||
                    null
                );

                const has105 = Boolean(
                  viewReceipt.sap_105_doc ||
                    viewReceipt.grn_number ||
                    viewSapLookup?.has105 ||
                    viewSapLookup?.primary105Doc
                );
                const doc105 =
                  viewReceipt.sap_105_doc ||
                  viewReceipt.grn_number ||
                  viewSapLookup?.primary105Doc ||
                  "-";
                const date105 = formatDate(
                  viewReceipt.sap_105_date ||
                    viewReceipt.grn_date ||
                    viewSapLookup?.primary105Date ||
                    null
                );

                return (
                  <Paper
                    elevation={0}
                    sx={{
                      p: 2,
                      mb: 2,
                      borderRadius: 2,
                      border: "1px solid",
                      borderColor: "divider",
                      bgcolor: "grey.50",
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        mb: 1.5,
                      }}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <SyncIcon color="primary" fontSize="small" />
                        <Typography
                          variant="subtitle2"
                          sx={{ fontWeight: 700, color: "text.primary" }}
                        >
                          SAP MB51 Status
                        </Typography>
                      </Box>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={
                          viewSapLoading ? (
                            <CircularProgress size={12} />
                          ) : (
                            <SyncIcon fontSize="small" />
                          )
                        }
                        onClick={() => checkSapForView(viewReceipt)}
                        disabled={viewSapLoading}
                        sx={{
                          textTransform: "none",
                          fontWeight: 600,
                          fontSize: "0.75rem",
                          borderRadius: 1.5,
                          py: 0.25,
                          px: 1.25,
                        }}
                      >
                        {viewSapLoading ? "Checking..." : "Re-check SAP"}
                      </Button>
                    </Box>

                    <Grid container spacing={1.5}>
                      {/* 103 Movement Status */}
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <Paper
                          elevation={0}
                          sx={{
                            p: 1.5,
                            borderRadius: 1.5,
                            bgcolor: "background.paper",
                            border: "1px solid",
                            borderColor: has103 ? "info.light" : "divider",
                          }}
                        >
                          <Box
                            sx={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              mb: 1,
                            }}
                          >
                            <Typography
                              variant="caption"
                              sx={{ fontWeight: 700, color: "info.dark" }}
                            >
                              103 MOVEMENT
                            </Typography>
                            <Chip
                              size="small"
                              color={has103 ? "success" : "default"}
                              variant={has103 ? "filled" : "outlined"}
                              label={
                                has103
                                  ? "103 Fetched Successfully"
                                  : "103 Not Fetched"
                              }
                              sx={{
                                height: 22,
                                fontSize: "0.7rem",
                                fontWeight: 700,
                              }}
                            />
                          </Box>
                          <Box
                            sx={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 0.5,
                            }}
                          >
                            <Box
                              sx={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                              }}
                            >
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                Material Document No.:
                              </Typography>
                              <Typography
                                variant="body2"
                                sx={{
                                  fontWeight: 700,
                                  fontFamily: "monospace",
                                }}
                              >
                                {doc103}
                              </Typography>
                            </Box>
                            <Box
                              sx={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                              }}
                            >
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                Document Date:
                              </Typography>
                              <Typography
                                variant="body2"
                                sx={{ fontWeight: 600 }}
                              >
                                {date103}
                              </Typography>
                            </Box>
                          </Box>
                        </Paper>
                      </Grid>

                      {/* 105 Movement Status (GRN completed) */}
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <Paper
                          elevation={0}
                          sx={{
                            p: 1.5,
                            borderRadius: 1.5,
                            bgcolor: "background.paper",
                            border: "1px solid",
                            borderColor: has105 ? "success.light" : "divider",
                          }}
                        >
                          <Box
                            sx={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              mb: 1,
                            }}
                          >
                            <Typography
                              variant="caption"
                              sx={{ fontWeight: 700, color: "success.dark" }}
                            >
                              105 MOVEMENT
                            </Typography>
                            <Chip
                              size="small"
                              color={has105 ? "success" : "default"}
                              variant={has105 ? "filled" : "outlined"}
                              label={
                                has105
                                  ? "105 Fetched Successfully (GRN completed)"
                                  : "105 Not Fetched"
                              }
                              sx={{
                                height: 22,
                                fontSize: "0.7rem",
                                fontWeight: 700,
                              }}
                            />
                          </Box>
                          <Box
                            sx={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 0.5,
                            }}
                          >
                            <Box
                              sx={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                              }}
                            >
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                Material Document No.:
                              </Typography>
                              <Typography
                                variant="body2"
                                sx={{
                                  fontWeight: 700,
                                  fontFamily: "monospace",
                                }}
                              >
                                {doc105}
                              </Typography>
                            </Box>
                            <Box
                              sx={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                              }}
                            >
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                Document Date:
                              </Typography>
                              <Typography
                                variant="body2"
                                sx={{ fontWeight: 600 }}
                              >
                                {date105}
                              </Typography>
                            </Box>
                          </Box>
                        </Paper>
                      </Grid>
                    </Grid>
                  </Paper>
                );
              })()}

              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5, alignItems: "center" }}>
                {viewReceipt.inspection_by && (
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`Inspector: ${viewReceipt.inspection_by}`}
                    sx={{ fontWeight: 600 }}
                  />
                )}
                {viewReceipt.inspection_date && (
                  <Chip
                    size="small"
                    variant="outlined"
                    label={formatDate(viewReceipt.inspection_date)}
                    sx={{ fontWeight: 500 }}
                  />
                )}
              </Box>

              {viewReceipt.inspection_remarks && (
                <Alert
                  severity={getDrcDisplayStatus(viewReceipt).key === "on_hold" ? "error" : "success"}
                  sx={{ mb: 1.5, borderRadius: 2 }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 700, display: "block" }}>
                    Department Inspection Comments ({getDrcDisplayStatus(viewReceipt).label}):
                  </Typography>
                  <Typography variant="body2">{viewReceipt.inspection_remarks}</Typography>
                </Alert>
              )}

              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
                {[
                  ["Receipt Date/Time", formatDateTime(viewReceipt.receipt_datetime)],
                  ["Receipt Mode", viewReceipt.receipt_mode],
                  ["Vehicle Number", viewReceipt.vehicle_number ?? "-"],
                  ["Vendor Name", viewReceipt.vendor_name],
                  ["SAP PO Number", viewReceipt.sap_po_number ?? "-"],
                  ["SAP PO Date", formatDate(viewReceipt.sap_po_date)],
                  ["GeM Order Number", viewReceipt.gem_order_number ?? "-"],
                  ["GeM Order Date", formatDate(viewReceipt.gem_order_date)],
                  ["Invoice Number", viewReceipt.invoice_number ?? "-"],
                  ["Invoice Date", formatDate(viewReceipt.invoice_date)],
                  ["Challan Number", viewReceipt.challan_number ?? "-"],
                  ["Challan Date", formatDate(viewReceipt.challan_date)],
                  ["E-Way Bill Number", viewReceipt.eway_bill_number ?? "-"],
                  ["E-Way Bill Date", formatDate(viewReceipt.eway_bill_date)],
                  ["Lorry Receipt Number", viewReceipt.lorry_receipt_number ?? "-"],
                  ["Lorry Receipt Date", formatDate(viewReceipt.lorry_receipt_date)],
                  ["Weightment Slip Number", viewReceipt.weightment_slip_number ?? "-"],
                  ["Gross Weight", viewReceipt.gross_weight !== null ? String(viewReceipt.gross_weight) : "-"],
                  ["Tare Weight", viewReceipt.tare_weight !== null ? String(viewReceipt.tare_weight) : "-"],
                  ["Net Weight", viewReceipt.net_weight !== null ? String(viewReceipt.net_weight) : "-"],
                  ["Purpose", viewReceipt.purpose ?? viewReceipt.remarks ?? "-"],
                  [viewReceipt.receipt_mode === "Vehicle" ? "Driver Name" : "Person Name", viewReceipt.driver_name ?? "-"],
                  ["Tax Invoice Value", viewReceipt.tax_invoice_value !== null ? String(viewReceipt.tax_invoice_value) : "-"],
                  ["MSME / Non MSME", viewReceipt.msme_type ?? "-"],
                  ["Location", viewReceipt.delivery_location ?? "-"],
                  ["Important Note", viewReceipt.important_note ?? "-"],
                  ["VIM Approval", viewReceipt.vim_approval ?? "-"],
                ].map(([label, value]) => (
                  <Box
                    key={label}
                    sx={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {label}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 600, textAlign: "right", minWidth: 0, wordBreak: "break-word" }}
                    >
                      {value}
                    </Typography>
                  </Box>
                ))}
              </Box>

              {/* --- 1. PHYSICAL PACKAGE DETAILS (At Gate Receipt) --- */}
              {(() => {
                const physicalPkgs = cleanPhysicalPackageDetails(viewReceipt.package_details);
                const displayPkgs =
                  physicalPkgs.length > 0
                    ? physicalPkgs
                    : viewReceipt.package_count || viewReceipt.package_type
                    ? [
                        {
                          quantity: String(viewReceipt.package_count || 1),
                          package_type: viewReceipt.package_type || "C/Box",
                          description: "",
                        },
                      ]
                    : [];

                if (displayPkgs.length === 0) return null;

                return (
                  <>
                    <Divider sx={{ my: 1.5 }} />
                    <Box sx={{ mb: 0.75, display: "flex", alignItems: "center", gap: 1 }}>
                      <Inventory2Icon fontSize="small" color="primary" />
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        Physical Package Details (At Gate Receipt)
                      </Typography>
                    </Box>
                    <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider", mb: 1.5 }}>
                      <Table size="small">
                        <TableHead sx={{ bgcolor: "grey.100" }}>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>#</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>No. of Packages (Qty)</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Package Type</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Package Remarks / Content Description</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {displayPkgs.map((row, index) => (
                            <TableRow key={index} hover>
                              <TableCell>{index + 1}</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>{row.quantity}</TableCell>
                              <TableCell>
                                <Chip size="small" variant="outlined" label={row.package_type || "Package"} sx={{ fontWeight: 600 }} />
                              </TableCell>
                              <TableCell>{row.description || "-"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </>
                );
              })()}

              {/* --- 2. SAP 103 / 105 MATERIAL ITEMS & BIN ALLOCATIONS --- */}
              {(() => {
                const sapItems =
                  viewReceipt.sap_items && viewReceipt.sap_items.length > 0
                    ? viewReceipt.sap_items
                    : (viewReceipt.package_details || []).filter((p) => Boolean(p.material_code && p.material_code.trim()));

                if (sapItems.length === 0) return null;

                return (
                  <>
                    <Divider sx={{ my: 1.5 }} />
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.75 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <TaskAltIcon fontSize="small" color="info" />
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                          SAP 103 / 105 Material Items & Bin Allocations ({sapItems.length} Items)
                        </Typography>
                      </Box>
                      <Button
                        size="small"
                        startIcon={<WarehouseIcon fontSize="small" />}
                        onClick={() => handleOpenBinAllocation(viewReceipt)}
                        sx={{ textTransform: "none", fontWeight: 600, fontSize: "0.75rem" }}
                      >
                        Update Bins
                      </Button>
                    </Box>
                    <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
                      <Table size="small">
                        <TableHead sx={{ bgcolor: "grey.100" }}>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>Material Code</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
                            <TableCell sx={{ fontWeight: 700 }} align="right">Qty</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>UoM</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>SAP Movements</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Bin Location</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {sapItems.map((row, index) => (
                            <TableRow key={index} hover>
                              <TableCell sx={{ fontWeight: 700, fontFamily: "monospace" }}>
                                {row.material_code || "-"}
                              </TableCell>
                              <TableCell>{row.description || "-"}</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 700 }}>{row.quantity}</TableCell>
                              <TableCell>{row.uom || row.package_type || "NOS"}</TableCell>
                              <TableCell>
                                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
                                  {row.sap_103_doc && (
                                    <Typography variant="caption" color="text.secondary">
                                      103: {row.sap_103_doc}
                                    </Typography>
                                  )}
                                  {(row.sap_105_doc || viewReceipt.grn_number) && (
                                    <Typography variant="caption" color="success.main" sx={{ fontWeight: 600 }}>
                                      105: {row.sap_105_doc || viewReceipt.grn_number}
                                    </Typography>
                                  )}
                                  {!row.sap_103_doc && !row.sap_105_doc && !viewReceipt.grn_number && (
                                    <Typography variant="caption" color="text.secondary">-</Typography>
                                  )}
                                </Box>
                              </TableCell>
                              <TableCell>
                                {row.bin_allocated && row.bin_location ? (
                                  <Chip
                                    size="small"
                                    color="success"
                                    icon={<WarehouseIcon fontSize="small" />}
                                    label={row.bin_location}
                                    sx={{ fontWeight: 700, height: 24, fontSize: "0.75rem" }}
                                  />
                                ) : row.bin_location ? (
                                  <Chip
                                    size="small"
                                    variant="outlined"
                                    color="primary"
                                    label={row.bin_location}
                                    sx={{ fontWeight: 600, height: 24, fontSize: "0.75rem" }}
                                  />
                                ) : (
                                  <Chip
                                    size="small"
                                    variant="outlined"
                                    label="Unallocated"
                                    onClick={() => handleOpenBinAllocation(viewReceipt)}
                                    sx={{ cursor: "pointer", height: 24, fontSize: "0.75rem" }}
                                  />
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </>
                );
              })()}

              {viewReceipt.photo_urls.length > 0 && (
                <>
                  <Divider sx={{ my: 1.5 }} />
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                    Photos
                  </Typography>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                    {viewReceipt.photo_urls.map((url, index) => (
                      <Avatar
                        key={index}
                        src={url}
                        variant="rounded"
                        sx={{ width: 64, height: 64 }}
                      />
                    ))}
                  </Box>
                </>
              )}

              <Divider sx={{ my: 1.5 }} />
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                Documents
              </Typography>

              <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 1, mb: 1 }}>
                <TextField
                  select
                  label="Document Type"
                  size="small"
                  value={viewDocumentTypeSelection}
                  onChange={(e) =>
                    setViewDocumentTypeSelection(e.target.value as DocumentType)
                  }
                  sx={{
                    minWidth: { sm: 170 },
                    "& .MuiOutlinedInput-root": { borderRadius: 2 },
                  }}
                >
                  {DOCUMENT_TYPES.map((type) => (
                    <MenuItem key={type} value={type}>
                      {type}
                    </MenuItem>
                  ))}
                </TextField>

                <input
                  ref={viewDocumentInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                  hidden
                  onChange={handleViewDocumentSelect}
                />

                <Button
                  variant="outlined"
                  startIcon={
                    uploadingViewDocument ? (
                      <CircularProgress size={16} />
                    ) : (
                      <AttachFileIcon fontSize="small" />
                    )
                  }
                  disabled={uploadingViewDocument}
                  onClick={() => viewDocumentInputRef.current?.click()}
                  sx={{ minHeight: 42, borderRadius: 2, fontWeight: 600 }}
                >
                  Upload {viewDocumentTypeSelection}
                </Button>
              </Box>

              {viewReceipt.attachment_paths && viewReceipt.attachment_paths.length > 0 ? (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                  {viewReceipt.attachment_paths.map((doc, index) => (
                    <Box
                      key={index}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        p: 0.75,
                        borderRadius: 2,
                        bgcolor: "grey.50",
                      }}
                    >
                      <DescriptionIcon fontSize="small" color="action" />
                      <Chip
                        size="small"
                        label={doc.document_type ?? "Other"}
                        sx={{ fontWeight: 600, flexShrink: 0 }}
                      />
                      <Typography
                        variant="body2"
                        component="a"
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer"
                        sx={{ flex: 1, minWidth: 0 }}
                        noWrap
                      >
                        {doc.name}
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={() => handleRemoveViewDocument(index)}
                        aria-label="Remove document"
                      >
                        <DeleteIcon sx={{ fontSize: 16 }} color="error" />
                      </IconButton>
                    </Box>
                  ))}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No documents uploaded yet.
                </Typography>
              )}

              {/* ---- Sprint 2: Inspection ---- */}
              <Divider sx={{ my: 1.5 }} />
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1 }}>
                <FactCheckIcon fontSize="small" color="action" />
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Inspection
                </Typography>
              </Box>

              {viewReceipt.status === "Pending Inspection" ? (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <Button
                    variant="outlined"
                    fullWidth
                    startIcon={<AutoAwesomeIcon fontSize="small" />}
                    onClick={() =>
                      openMailDialog(viewReceipt, "Inspection Request")
                    }
                    sx={{ minHeight: 42, borderRadius: 2, fontWeight: 600 }}
                  >
                    Generate Inspection Mail
                  </Button>

                  {getDrcDisplayStatus(viewReceipt).key === "on_hold" && (
                    <Button
                      variant="outlined"
                      color="warning"
                      fullWidth
                      startIcon={<AutoAwesomeIcon fontSize="small" />}
                      onClick={() =>
                        openMailDialog(viewReceipt, "Inspection On Hold")
                      }
                      sx={{ minHeight: 42, borderRadius: 2, fontWeight: 600 }}
                    >
                      Regenerate On Hold Mail
                    </Button>
                  )}

                  <Box sx={{ display: "flex", gap: 1 }}>
                    <Button
                      variant={
                        inspectionStatusInput.toLowerCase().includes("clear")
                          ? "contained"
                          : "outlined"
                      }
                      color="success"
                      fullWidth
                      startIcon={<TaskAltOutlinedIcon fontSize="small" />}
                      onClick={() => setInspectionStatusInput("Inspection cleared")}
                      sx={{ minHeight: 44, borderRadius: 2, fontWeight: 700 }}
                    >
                      Inspection Cleared
                    </Button>
                    <Button
                      variant={
                        inspectionStatusInput.toLowerCase().includes("hold")
                          ? "contained"
                          : "outlined"
                      }
                      color="error"
                      fullWidth
                      startIcon={<ReportProblemIcon fontSize="small" />}
                      onClick={() => setInspectionStatusInput("Inspection on hold")}
                      sx={{ minHeight: 44, borderRadius: 2, fontWeight: 700 }}
                    >
                      Inspection On Hold
                    </Button>
                  </Box>

                  <TextField
                    label={
                      inspectionStatusInput.toLowerCase().includes("hold")
                        ? "Remarks - reason for hold"
                        : "Remarks (optional)"
                    }
                    size="small"
                    fullWidth
                    multiline
                    minRows={2}
                    required={inspectionStatusInput.toLowerCase().includes("hold")}
                    value={inspectionRemarksInput}
                    onChange={(e) => setInspectionRemarksInput(e.target.value)}
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                  />

                  <TextField
                    label="Inspection By"
                    size="small"
                    fullWidth
                    value={inspectionByInput}
                    onChange={(e) => setInspectionByInput(e.target.value)}
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                  />

                  <Button
                    variant="contained"
                    fullWidth
                    startIcon={
                      submittingInspection ? (
                        <CircularProgress size={18} color="inherit" />
                      ) : (
                        <FactCheckIcon fontSize="small" />
                      )
                    }
                    onClick={handleSubmitInspection}
                    disabled={submittingInspection}
                    sx={{ minHeight: 42, borderRadius: 2, fontWeight: 700 }}
                  >
                    Submit Inspection
                  </Button>
                </Box>
              ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Status
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 0, wordBreak: "break-word" }}>
                      {getDrcDisplayStatus(viewReceipt).label}
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Inspected By
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 0, wordBreak: "break-word" }}>
                      {viewReceipt.inspection_by ?? "-"}
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Inspection Date
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 0, wordBreak: "break-word" }}>
                      {viewReceipt.inspection_date
                        ? formatDateTime(viewReceipt.inspection_date)
                        : "-"}
                    </Typography>
                  </Box>
                  {viewReceipt.inspection_remarks && (
                    <Box sx={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        Remarks
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, textAlign: "right", minWidth: 0, wordBreak: "break-word" }}
                      >
                        {viewReceipt.inspection_remarks}
                      </Typography>
                    </Box>
                  )}
                </Box>
              )}

              {/* ---- Sprint 2: GRN Upload ---- */}
              {viewReceipt.status === "Pending GRN" && (
                <>
                  <Divider sx={{ my: 1.5 }} />
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1 }}>
                    <CloudUploadIcon fontSize="small" color="action" />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      GRN Upload
                    </Typography>
                  </Box>

                  <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 1 }}>
                      <TextField
                        label="GRN Number"
                        size="small"
                        fullWidth
                        value={grnNumber}
                        onChange={(e) => setGrnNumber(e.target.value)}
                        sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                      />
                      <DateTextField
                        label="GRN Date"
                        value={grnDate}
                        onChange={setGrnDate}
                      />
                    </Box>

                    <TextField
                      label="Uploaded By"
                      size="small"
                      fullWidth
                      value={uploadedBy}
                      onChange={(e) => setUploadedBy(e.target.value)}
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                    />

                    <Button
                      variant="outlined"
                      fullWidth
                      startIcon={<DownloadIcon fontSize="small" />}
                      onClick={handleDownloadGrnTemplate}
                      sx={{ minHeight: 42, borderRadius: 2, fontWeight: 600 }}
                    >
                      Download Excel Template
                    </Button>

                    <input
                      ref={grnFileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      hidden
                      onChange={handleGrnFileChange}
                    />

                    <Button
                      variant="outlined"
                      fullWidth
                      startIcon={<UploadFileIcon fontSize="small" />}
                      onClick={() => grnFileInputRef.current?.click()}
                      sx={{ minHeight: 42, borderRadius: 2, fontWeight: 600 }}
                    >
                      Choose GRN Excel File
                    </Button>

                    <Typography variant="caption" color="text.secondary" noWrap>
                      {grnFile ? grnFile.name : "No file selected"}
                    </Typography>

                    <Button
                      variant="contained"
                      fullWidth
                      startIcon={
                        grnPreviewLoading ? (
                          <CircularProgress size={18} color="inherit" />
                        ) : (
                          <VisibilityIcon fontSize="small" />
                        )
                      }
                      onClick={handleGrnPreview}
                      disabled={!grnFile || grnPreviewLoading}
                      sx={{ minHeight: 42, borderRadius: 2, fontWeight: 700 }}
                    >
                      Preview
                    </Button>

                    {(grnMergedRows.length > 0 || grnFormatInvalidRows.length > 0) && (
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                        <Chip size="small" label={`Parsed: ${grnMergedRows.length}`} />
                        <Chip
                          size="small"
                          label={`Known: ${grnKnownRows.length}`}
                          color="success"
                        />
                        <Chip
                          size="small"
                          label={`Unknown: ${grnUnknownMaterials.length}`}
                          color="error"
                        />
                        <Chip
                          size="small"
                          label={`Format errors: ${grnFormatInvalidRows.length}`}
                          color="warning"
                        />
                      </Box>
                    )}

                    {grnUnknownMaterials.length > 0 && (
                      <TableContainer sx={{ maxHeight: 200, overflowX: "auto", borderRadius: 2 }}>
                        <Table size="small" stickyHeader>
                          <TableHead>
                            <TableRow>
                              <TableCell>Unknown Material Code</TableCell>
                              <TableCell align="right">Quantity</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {grnUnknownMaterials.map((row) => (
                              <TableRow key={row.material_code}>
                                <TableCell>{row.material_code}</TableCell>
                                <TableCell align="right">{row.quantity}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}

                    {grnFormatInvalidRows.length > 0 && (
                      <TableContainer sx={{ maxHeight: 200, overflowX: "auto", borderRadius: 2 }}>
                        <Table size="small" stickyHeader>
                          <TableHead>
                            <TableRow>
                              <TableCell>Row</TableCell>
                              <TableCell>Material Code</TableCell>
                              <TableCell>Reason</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {grnFormatInvalidRows.map((row) => (
                              <TableRow key={row.rowNumber}>
                                <TableCell>{row.rowNumber}</TableCell>
                                <TableCell>{row.material_code || "-"}</TableCell>
                                <TableCell>{row.errors.join(", ")}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}

                    <Divider sx={{ my: 0.5 }} />

                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                      <TaskAltOutlinedIcon fontSize="small" color="action" />
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        Counting Check
                      </Typography>
                    </Box>

                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={countingChecked}
                          onChange={(e) => setCountingChecked(e.target.checked)}
                        />
                      }
                      label="Material counting verified against the DRC"
                    />

                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={discrepancyFound}
                          onChange={(e) => setDiscrepancyFound(e.target.checked)}
                        />
                      }
                      label="Discrepancy found while counting"
                    />

                    {discrepancyFound && (
                      <>
                        <TextField
                          label="Discrepancy Remarks"
                          size="small"
                          fullWidth
                          required
                          multiline
                          minRows={2}
                          value={discrepancyRemarksInput}
                          onChange={(e) => setDiscrepancyRemarksInput(e.target.value)}
                          sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                        />

                        <Button
                          variant="outlined"
                          color="warning"
                          fullWidth
                          startIcon={<AutoAwesomeIcon fontSize="small" />}
                          onClick={() =>
                            openMailDialog(
                              viewReceipt,
                              "Counting Discrepancy",
                              discrepancyRemarksInput
                            )
                          }
                          sx={{ minHeight: 42, borderRadius: 2, fontWeight: 600 }}
                        >
                          Generate Mail to Supplier
                        </Button>
                      </>
                    )}

                    <Button
                      variant="contained"
                      color="primary"
                      fullWidth
                      startIcon={
                        grnImporting ? (
                          <CircularProgress size={18} color="inherit" />
                        ) : (
                          <CloudUploadIcon fontSize="small" />
                        )
                      }
                      onClick={handleGrnImport}
                      disabled={
                        grnKnownRows.length === 0 ||
                        grnImporting ||
                        !countingChecked ||
                        (discrepancyFound && !discrepancyRemarksInput.trim())
                      }
                      sx={{ minHeight: 44, borderRadius: 2, fontWeight: 700 }}
                    >
                      Import GRN &amp; Close DRC
                    </Button>

                    {grnImporting && (
                      <LinearProgress sx={{ height: 6, borderRadius: 3 }} />
                    )}
                  </Box>
                </>
              )}

              {/* ---- Sprint 2: History ---- */}
              <Divider sx={{ my: 1.5 }} />
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1 }}>
                <HistoryIcon fontSize="small" color="action" />
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  History
                </Typography>
              </Box>

              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                Inspection History
              </Typography>
              {inspectionHistory.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  No inspections recorded yet.
                </Typography>
              ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, mb: 1.5 }}>
                  {inspectionHistory.map((h) => (
                    <Box
                      key={h.id}
                      sx={{
                        p: 1,
                        borderRadius: 2,
                        bgcolor: "grey.50",
                        display: "flex",
                        flexDirection: "column",
                        gap: 0.25,
                      }}
                    >
                      <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                        <Chip
                          size="small"
                          label={
                            (h.inspection_status || "").toLowerCase().includes("hold")
                              ? "Inspection on hold"
                              : "Inspection cleared"
                          }
                          color={
                            (h.inspection_status || "").toLowerCase().includes("hold")
                              ? "error"
                              : "success"
                          }
                          variant="outlined"
                          sx={{ fontWeight: 600 }}
                        />
                        <Typography variant="caption" color="text.secondary">
                          {formatDateTime(h.inspection_date)}
                        </Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        By: {h.inspection_by ?? "-"}
                      </Typography>
                      {h.inspection_remarks && (
                        <Typography variant="body2">{h.inspection_remarks}</Typography>
                      )}
                    </Box>
                  ))}
                </Box>
              )}

              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                GRN History
              </Typography>
              {grnHistory.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No GRN imported yet.
                </Typography>
              ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                  {grnHistory.map((g) => (
                    <Box
                      key={g.id}
                      sx={{
                        p: 1,
                        borderRadius: 2,
                        bgcolor: "grey.50",
                        display: "flex",
                        flexDirection: "column",
                        gap: 0.25,
                      }}
                    >
                      <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {g.grn_number}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatDate(g.grn_date)}
                        </Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        Uploaded by {g.uploaded_by ?? "-"} on {formatDateTime(g.upload_date)}
                      </Typography>
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>
                        {g.material_count} material(s) imported - total quantity {g.total_quantity}
                      </Typography>
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.25 }}>
                        <Chip
                          size="small"
                          icon={<TaskAltOutlinedIcon sx={{ fontSize: 14 }} />}
                          label={g.counting_checked ? "Counting Verified" : "Counting Not Recorded"}
                          color={g.counting_checked ? "success" : "default"}
                          sx={{ fontWeight: 600 }}
                        />
                        {g.discrepancy_found && (
                          <Chip
                            size="small"
                            icon={<ReportProblemIcon sx={{ fontSize: 14 }} />}
                            label="Counting Discrepancy"
                            color="warning"
                            sx={{ fontWeight: 600 }}
                          />
                        )}
                      </Box>
                      {g.discrepancy_remarks && (
                        <Typography variant="caption" color="text.secondary">
                          Discrepancy: {g.discrepancy_remarks}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Box>
              )}
            </DialogContent>

            <DialogActions sx={{ p: 1.5, px: 2, display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "space-between" }}>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button
                  variant="outlined"
                  startIcon={<SyncIcon fontSize="small" />}
                  onClick={() => handleOpenSapLookupForReceipt(viewReceipt)}
                  sx={{ borderRadius: 2, fontWeight: 600, textTransform: "none" }}
                >
                  Fetch SAP MB51
                </Button>
                <Button
                  variant="outlined"
                  color="primary"
                  startIcon={<WarehouseIcon fontSize="small" />}
                  onClick={() => handleOpenBinAllocation(viewReceipt)}
                  sx={{ borderRadius: 2, fontWeight: 700, textTransform: "none" }}
                >
                  Allocate Bins
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<PrintIcon fontSize="small" />}
                  onClick={(e) => handleOpenPrintMenu(e, viewReceipt)}
                  sx={{ borderRadius: 2, fontWeight: 600, textTransform: "none" }}
                >
                  Print DRC / Strap
                </Button>
              </Box>
              <Button
                variant="contained"
                startIcon={<EditIcon fontSize="small" />}
                onClick={() => {
                  const r = viewReceipt;
                  setViewReceipt(null);
                  openEditForm(r);
                }}
                sx={{ minHeight: 40, borderRadius: 2, fontWeight: 700, px: 3 }}
              >
                Edit DRC
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <Dialog
        open={mailDialogOpen}
        onClose={() => setMailDialogOpen(false)}
        fullWidth
        maxWidth="sm"
        fullScreen={mobile}
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, fontWeight: 700 }}>
          <AutoAwesomeIcon fontSize="small" />
          {mailType === "Inspection Request"
            ? "Inspection Mail"
            : mailType === "Inspection On Hold"
            ? "Inspection On Hold - Mail"
            : "Counting Discrepancy - Supplier Mail"}
        </DialogTitle>
        <DialogContent dividers sx={{ p: 1.5, display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Alert severity="info" variant="outlined" sx={{ borderRadius: 2 }}>
            This app never sends mail. Copy the content below and paste it into your
            own mail app to send it.
          </Alert>

          {generatingMail ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          ) : (
            <>
              <Chip
                size="small"
                icon={<AutoAwesomeIcon sx={{ fontSize: 14 }} />}
                label={mailAiGenerated ? "AI Generated" : "Template (AI unavailable)"}
                color={mailAiGenerated ? "primary" : "default"}
                sx={{ alignSelf: "flex-start", fontWeight: 600 }}
              />

              <TextField
                label="Subject"
                size="small"
                fullWidth
                value={mailSubject}
                onChange={(e) => setMailSubject(e.target.value)}
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
              />

              {mailType === "Security Gate Entry" && mailBodyHtml ? (
                <Box>
                  <Typography variant="caption" sx={{ color: "text.secondary", mb: 0.5, display: "block" }}>
                    Mail Preview (HTML)
                  </Typography>
                  <Box
                    sx={{
                      border: 1,
                      borderColor: "divider",
                      borderRadius: 2,
                      p: 2,
                      fontFamily: "Arial, Helvetica, sans-serif",
                      fontSize: "14px",
                      lineHeight: 1.6,
                      color: "text.primary",
                      bgcolor: "background.paper",
                      overflowX: "auto",
                    }}
                    dangerouslySetInnerHTML={{ __html: mailBodyHtml }}
                  />
                </Box>
              ) : (
                <TextField
                  label="Body"
                  size="small"
                  fullWidth
                  multiline
                  minRows={10}
                  value={mailBody}
                  onChange={(e) => setMailBody(e.target.value)}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2,
                      fontFamily: "monospace",
                      fontSize: "0.85rem",
                    },
                  }}
                />
              )}
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 1.5, flexWrap: "wrap", gap: 1 }}>
          <Button onClick={() => setMailDialogOpen(false)}>Close</Button>
          <Button
            startIcon={<AutoAwesomeIcon fontSize="small" />}
            disabled={generatingMail || !mailDialogReceipt}
            onClick={() =>
              mailDialogReceipt &&
              regenerateMail(mailDialogReceipt, mailType, mailDiscrepancyRemarks)
            }
            sx={{ minHeight: 42, borderRadius: 2, fontWeight: 600 }}
          >
            Regenerate with AI
          </Button>
          <Button
            variant="contained"
            startIcon={<ContentCopyIcon fontSize="small" />}
            disabled={generatingMail}
            onClick={handleCopyMail}
            sx={{ minHeight: 42, borderRadius: 2, fontWeight: 700 }}
          >
            Copy Mail
          </Button>
        </DialogActions>
      </Dialog>

      {/* Print Options Dropdown Menu */}
      <Menu
        anchorEl={printMenuAnchor?.anchorEl}
        open={Boolean(printMenuAnchor)}
        onClose={handleClosePrintMenu}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        slotProps={{
          paper: {
            sx: {
              borderRadius: 2.5,
              boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)",
              minWidth: 270,
              py: 0.5,
            },
          },
        }}
      >
        <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: "divider" }}>
          <Typography variant="caption" sx={{ fontWeight: 800, textTransform: "uppercase", color: "text.secondary" }}>
            Print DRC Options
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 800, fontFamily: "monospace", color: "text.primary" }}>
            {printMenuAnchor?.receipt.drc_number}
          </Typography>
        </Box>

        <MenuItem
          onClick={() => {
            if (printMenuAnchor) handleOpenStrapDialog(printMenuAnchor.receipt, "strap");
          }}
          sx={{ py: 1.25, gap: 1.5 }}
        >
          <ContentCutIcon fontSize="small" color="primary" />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              Print File Edge Strap (DRC • PO • Vendor)...
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Single horizontal line strap to identify & retrieve stacked files
            </Typography>
          </Box>
        </MenuItem>

        <MenuItem
          onClick={() => {
            if (printMenuAnchor) handleDirectPrintStrap(printMenuAnchor.receipt);
          }}
          sx={{ py: 1, gap: 1.5 }}
        >
          <PrintIcon fontSize="small" sx={{ color: "success.main" }} />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Quick Print Edge Strap (1 Strip)
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Direct 1-click single line strap (paper-saving)
            </Typography>
          </Box>
        </MenuItem>

        <Divider sx={{ my: 0.5 }} />

        <MenuItem
          onClick={() => {
            if (printMenuAnchor) handleOpenStrapDialog(printMenuAnchor.receipt, "full");
          }}
          sx={{ py: 1.25, gap: 1.5 }}
        >
          <DescriptionIcon fontSize="small" color="action" />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Full DRC Document (A4)...
            </Typography>
            <Typography variant="caption" color="text.secondary">
              View & print complete challan document
            </Typography>
          </Box>
        </MenuItem>

        <MenuItem
          onClick={() => {
            if (printMenuAnchor) handleDirectPrintFull(printMenuAnchor.receipt);
          }}
          sx={{ py: 1, gap: 1.5 }}
        >
          <PrintIcon fontSize="small" color="action" />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Quick Print Full DRC
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Direct 1-click full A4 sheet print
            </Typography>
          </Box>
        </MenuItem>

        <Divider sx={{ my: 0.5 }} />

        <MenuItem
          onClick={() => {
            if (printMenuAnchor) {
              handleToggleSelectReceipt(printMenuAnchor.receipt.id);
              handleClosePrintMenu();
            }
          }}
          sx={{ py: 1, gap: 1.5 }}
        >
          <ContentCutIcon fontSize="small" sx={{ color: "primary.main" }} />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {printMenuAnchor && selectedReceiptIds.includes(printMenuAnchor.receipt.id)
                ? "Deselect from Bulk Straps"
                : "Select for Bulk Strap Print"}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Combine onto single page to cut with scissors
            </Typography>
          </Box>
        </MenuItem>
      </Menu>

      {/* DRC File Strap & Document Dialog */}
      <DrcFileStrapDialog
        open={Boolean(strapDialogReceipt)}
        receipt={strapDialogReceipt}
        onClose={() => setStrapDialogReceipt(null)}
        defaultTab={strapDialogTab}
      />

      {/* Bulk DRC Edge Strap Dialog */}
      <BulkDrcStrapDialog
        open={bulkStrapDialogOpen}
        onClose={() => setBulkStrapDialogOpen(false)}
        receipts={receipts.filter((r) => selectedReceiptIds.includes(r.id))}
        onRemoveReceipt={handleRemoveFromBulk}
        onClearAll={() => {
          setSelectedReceiptIds([]);
          setBulkStrapDialogOpen(false);
        }}
      />

      {/* DRC SAP MB51 Lookup Modal */}
      <DrcSapLookupModal
        open={sapLookupModalOpen}
        onClose={() => {
          setSapLookupModalOpen(false);
          setSapLookupTargetReceipt(null);
        }}
        initialPo={sapLookupInitialPo}
        initialInvoice={sapLookupInitialInv}
        targetReceipt={sapLookupTargetReceipt}
        onApplyToForm={handleApplySapItemsToForm}
        onApplyToReceipt={handleApplySapItemsToReceipt}
      />

      {/* Direct Bin Location Allocation Modal */}
      {binAllocationTargetReceipt && (
        <DrcBinAllocationModal
          open={binAllocationModalOpen}
          onClose={() => {
            setBinAllocationModalOpen(false);
            setBinAllocationTargetReceipt(null);
          }}
          receipt={binAllocationTargetReceipt}
          onSuccess={(updatedReceipt) => {
            if (viewReceipt && viewReceipt.id === updatedReceipt.id) {
              setViewReceipt(updatedReceipt);
            }
            refreshAll();
            showSnackbar(
              `Bin locations allocated & stock updated for ${updatedReceipt.drc_number}.`,
              "success"
            );
          }}
        />
      )}

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
