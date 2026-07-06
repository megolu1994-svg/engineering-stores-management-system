import { useCallback, useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import * as XLSX from "xlsx";

import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
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
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
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

import {
  createReceipt,
  updateReceipt,
  getReceipts,
  getReceiptSummary,
  uploadReceiptPhotos,
  getNextDrcNumberSuggestion,
  // Sprint 2
  submitInspection,
  getInspectionHistory,
  parseGrnExcelRows,
  validateGrnMaterials,
  importGrn,
  getGrnHistory,
  buildGrnTemplateRows,
  type ReceiptHeader,
  type ReceiptFormInput,
  type ReceiptSummary,
  type ReceiptMode,
  type InspectionStatus,
  type InspectionHistoryEntry,
  type GrnImportRow,
  type GrnFormatInvalidRow,
  type GrnHistoryEntry,
  // Sprint 3
  type PackageDetailRow,
  type AttachmentFile,
} from "../services/receiptService";
import { useSwipeOpenDrawer } from "../hooks/useSwipeTabs";

type SnackbarSeverity = "success" | "error" | "warning" | "info";

const INSPECTION_STATUSES: InspectionStatus[] = [
  "Pending Inspection",
  "Accepted",
  "Rejected",
  "Accepted with Remarks",
];

const emptyPackageRow: PackageDetailRow = {
  quantity: 1,
  package_type: "",
  description: "",
};

const emptyForm: ReceiptFormInput = {
  receipt_mode: "Vehicle",
  vehicle_number: "",
  package_details: [{ ...emptyPackageRow }],
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

function statusColor(
  status: string
): "warning" | "info" | "success" | "default" {
  if (status === "Pending Inspection") return "warning";
  if (status === "Pending GRN") return "info";
  if (status === "Closed") return "success";
  return "default";
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
      helperText={showError ? "Enter a valid date (DD.MM.YYYY)" : " "}
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
function combineDateWithNow(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const now = new Date();
  return new Date(
    y,
    m - 1,
    d,
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds()
  ).toISOString();
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
    pendingGrn: 0,
    closed: 0,
    total: 0,
  });

  const [receipts, setReceipts] = useState<ReceiptHeader[]>([]);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const loadReceipts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getReceipts({
        search,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      });
      setReceipts(data);
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
  const [formOpen, setFormOpen] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState<ReceiptHeader | null>(
    null
  );
  const [form, setForm] = useState<ReceiptFormInput>(emptyForm);
  const [saving, setSaving] = useState(false);

  // ---- DRC No. / DRC Date (manual override toggle, create-only) ----
  const [manualDrcEntry, setManualDrcEntry] = useState(false);
  const [drcNumber, setDrcNumber] = useState("");
  const [drcDate, setDrcDate] = useState(todayIso());
  const [loadingDrcSuggestion, setLoadingDrcSuggestion] = useState(false);

  async function loadDrcSuggestion() {
    setLoadingDrcSuggestion(true);
    try {
      const suggestion = await getNextDrcNumberSuggestion();
      setDrcNumber(suggestion);
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

  const [newPhotoFiles, setNewPhotoFiles] = useState<File[]>([]);
  const [newPhotoPreviews, setNewPhotoPreviews] = useState<string[]>([]);
  const [keptPhotoUrls, setKeptPhotoUrls] = useState<string[]>([]);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [photoMenuAnchor, setPhotoMenuAnchor] = useState<HTMLElement | null>(
    null
  );
  const [capturingPhoto, setCapturingPhoto] = useState(false);

  const documentInputRef = useRef<HTMLInputElement | null>(null);
  const [newDocumentFiles, setNewDocumentFiles] = useState<File[]>([]);
  const [keptAttachments, setKeptAttachments] = useState<AttachmentFile[]>(
    []
  );

  function updateField<K extends keyof ReceiptFormInput>(
    field: K,
    value: ReceiptFormInput[K]
  ) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function updatePackageRow(
    index: number,
    field: keyof PackageDetailRow,
    value: string | number
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
    setNewDocumentFiles([]);
    setKeptAttachments([]);
    setManualDrcEntry(false);
    setDrcDate(todayIso());
    setDrcNumber("");
    loadDrcSuggestion();
    setFormOpen(true);
  }

  function openEditForm(receipt: ReceiptHeader) {
    setEditingReceipt(receipt);
    setForm({
      receipt_mode: receipt.receipt_mode,
      vehicle_number: receipt.vehicle_number ?? "",
      package_details:
        receipt.package_details && receipt.package_details.length > 0
          ? receipt.package_details
          : [{ ...emptyPackageRow }],
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
      remarks: receipt.remarks ?? "",
    });
    setNewPhotoFiles([]);
    setNewPhotoPreviews([]);
    setKeptPhotoUrls(receipt.photo_urls ?? []);
    setNewDocumentFiles([]);
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
    setNewDocumentFiles([]);
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

  // ---- Document attachments ----
  function handleDocumentSelect(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    setNewDocumentFiles((prev) => [...prev, ...files]);
    e.target.value = "";
  }

  function removeNewDocument(index: number) {
    setNewDocumentFiles((prev) => prev.filter((_, i) => i !== index));
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
      (row) => row.quantity > 0 && row.package_type.trim()
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
      if (editingReceipt) {
        const updated = await updateReceipt(
          editingReceipt.id,
          form,
          newPhotoFiles,
          keptPhotoUrls,
          newDocumentFiles,
          keptAttachments
        );
        showSnackbar(`DRC ${updated.drc_number} updated.`, "success");
      } else {
        const created = await createReceipt(
          form,
          newPhotoFiles,
          newDocumentFiles,
          manualDrcEntry
            ? {
                drc_number: drcNumber.trim(),
                receipt_datetime: combineDateWithNow(drcDate),
              }
            : undefined
        );
        showSnackbar(`DRC ${created.drc_number} created.`, "success");
      }

      closeForm();
      await refreshAll();
    } catch (err) {
      const isDuplicateDrcNumber =
        manualDrcEntry &&
        !editingReceipt &&
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === "23505";

      showSnackbar(
        isDuplicateDrcNumber
          ? `DRC No. "${drcNumber.trim()}" already exists. Please use a different number.`
          : "Something went wrong while saving the DRC.",
        "error"
      );
    } finally {
      setSaving(false);
    }
  }

  // ---------------- View DRC ----------------
  const [viewReceipt, setViewReceipt] = useState<ReceiptHeader | null>(null);

  // ---------------- Sprint 2: Inspection ----------------
  const [inspectionStatusInput, setInspectionStatusInput] =
    useState<InspectionStatus>("Accepted");
  const [inspectionRemarksInput, setInspectionRemarksInput] = useState("");
  const [inspectionByInput, setInspectionByInput] = useState("");
  const [submittingInspection, setSubmittingInspection] = useState(false);
  const [inspectionHistory, setInspectionHistory] = useState<
    InspectionHistoryEntry[]
  >([]);

  // ---------------- Sprint 2: GRN Upload ----------------
  const [grnNumber, setGrnNumber] = useState("");
  const [grnDate, setGrnDate] = useState("");
  const [uploadedBy, setUploadedBy] = useState("");
  const grnFileInputRef = useRef<HTMLInputElement | null>(null);
  const [grnFile, setGrnFile] = useState<File | null>(null);
  const [grnPreviewLoading, setGrnPreviewLoading] = useState(false);
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

  function resetGrnForm() {
    setGrnNumber("");
    setGrnDate("");
    setUploadedBy("");
    setGrnFile(null);
    setGrnMergedRows([]);
    setGrnFormatInvalidRows([]);
    setGrnUnknownMaterials([]);
    setGrnKnownRows([]);
  }

  // Load Inspection + GRN history whenever a DRC is opened for viewing.
  useEffect(() => {
    if (!viewReceipt) {
      setInspectionHistory([]);
      setGrnHistory([]);
      return;
    }

    setInspectionStatusInput("Accepted");
    setInspectionRemarksInput("");
    setInspectionByInput("");
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

    if (
      (inspectionStatusInput === "Rejected" ||
        inspectionStatusInput === "Accepted with Remarks") &&
      !inspectionRemarksInput.trim()
    ) {
      showSnackbar(
        "Please enter Inspection Remarks for this outcome.",
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
    } catch {
      showSnackbar("Something went wrong while saving the inspection.", "error");
    } finally {
      setSubmittingInspection(false);
    }
  }

  function handleDownloadGrnTemplate() {
    const { headers, rows } = buildGrnTemplateRows();
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    worksheet["!cols"] = headers.map(() => ({ wch: 22 }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "GRN Template");
    XLSX.writeFile(workbook, "GRN_Import_Template.xlsx");
  }

  function handleGrnFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setGrnFile(file);
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

    setGrnImporting(true);

    try {
      const summary = await importGrn(
        viewReceipt.id,
        grnNumber.trim(),
        grnDate,
        uploadedBy,
        grnKnownRows
      );

      if (summary.receipt) {
        setViewReceipt(summary.receipt);
      }

      const grns = await getGrnHistory(viewReceipt.id);
      setGrnHistory(grns);

      resetGrnForm();

      showSnackbar(
        summary.closed
          ? `GRN imported. ${summary.imported} material(s), ${summary.totalQuantity} total quantity. DRC closed.`
          : `GRN import failed for all materials (${summary.failed} failure(s)).`,
        summary.closed ? "success" : "error"
      );

      await refreshAll();
    } catch {
      showSnackbar("Something went wrong while importing the GRN.", "error");
    } finally {
      setGrnImporting(false);
    }
  }

  // ---------------- Print DRC ----------------
  function handlePrint(receipt: ReceiptHeader) {
    const printWindow = window.open("", "_blank", "width=700,height=900");
    if (!printWindow) return;

    const packageSummary =
      receipt.package_details && receipt.package_details.length > 0
        ? receipt.package_details
            .map((p) => `${p.quantity} x ${p.package_type}${p.description ? ` (${p.description})` : ""}`)
            .join("; ")
        : receipt.package_count && receipt.package_type
        ? `${receipt.package_count} x ${receipt.package_type}`
        : "-";

    const rows: [string, string][] = [
      ["DRC Number", receipt.drc_number],
      ["Status", receipt.status],
      ["Receipt Date/Time", formatDateTime(receipt.receipt_datetime)],
      ["Receipt Mode", receipt.receipt_mode],
      ["Vehicle Number", receipt.vehicle_number ?? "-"],
      ["Package Details", packageSummary],
      ["Vendor Name", receipt.vendor_name],
      ["SAP PO Number", receipt.sap_po_number ?? "-"],
      ["SAP PO Date", formatDate(receipt.sap_po_date)],
      ["GeM Order Number", receipt.gem_order_number ?? "-"],
      ["GeM Order Date", formatDate(receipt.gem_order_date)],
      ["Invoice Number", receipt.invoice_number ?? "-"],
      ["Invoice Date", formatDate(receipt.invoice_date)],
      ["Challan Number", receipt.challan_number ?? "-"],
      ["Challan Date", formatDate(receipt.challan_date)],
      ["E-Way Bill Number", receipt.eway_bill_number ?? "-"],
      ["E-Way Bill Date", formatDate(receipt.eway_bill_date)],
      ["Lorry Receipt Number", receipt.lorry_receipt_number ?? "-"],
      ["Lorry Receipt Date", formatDate(receipt.lorry_receipt_date)],
      ["Weightment Slip Number", receipt.weightment_slip_number ?? "-"],
      ["Gross Weight", receipt.gross_weight !== null ? String(receipt.gross_weight) : "-"],
      ["Tare Weight", receipt.tare_weight !== null ? String(receipt.tare_weight) : "-"],
      ["Net Weight", receipt.net_weight !== null ? String(receipt.net_weight) : "-"],
      ["Remarks", receipt.remarks ?? "-"],
    ];

    const rowsHtml = rows
      .map(
        ([label, value]) =>
          `<tr><td style="padding:6px 10px;font-weight:600;border:1px solid #ddd;word-break:break-word;">${label}</td><td style="padding:6px 10px;border:1px solid #ddd;word-break:break-word;">${value}</td></tr>`
      )
      .join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>${receipt.drc_number}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
        </head>
        <body style="font-family: Arial, sans-serif; padding: 24px;">
          <h2 style="margin-bottom: 4px;">Delivery Receipt Challan</h2>
          <p style="margin-top: 0; color: #555;">${receipt.drc_number}</p>
          <table style="border-collapse: collapse; width: 100%; table-layout: fixed;">${rowsHtml}</table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  // ---------------- Summary cards ----------------
  const summaryCards = [
    {
      label: "Pending Inspection",
      value: summary.pendingInspection,
      icon: <PendingActionsIcon />,
      color: "warning.main",
    },
    {
      label: "Pending GRN",
      value: summary.pendingGrn,
      icon: <AssignmentTurnedInIcon />,
      color: "info.main",
    },
    {
      label: "Closed",
      value: summary.closed,
      icon: <TaskAltIcon />,
      color: "success.main",
    },
    {
      label: "Total DRC",
      value: summary.total,
      icon: <Inventory2Icon />,
      color: "primary.main",
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

        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={openCreateForm}
          sx={{
            minHeight: 48,
            borderRadius: 2.5,
            fontWeight: 700,
            width: { xs: "100%", sm: "auto" },
          }}
        >
          Create DRC
        </Button>
      </Box>

      {/* ---- Summary cards ---- */}
      <Grid container spacing={{ xs: 1.25, md: 2 }} sx={{ mb: 2 }}>
        {summaryCards.map((card) => (
          <Grid key={card.label} size={{ xs: 6, sm: 3 }}>
            <Paper
              elevation={0}
              sx={{
                p: { xs: 1.25, md: 2 },
                borderRadius: 2.5,
                boxShadow: "0 2px 10px rgba(15, 23, 42, 0.06)",
                display: "flex",
                alignItems: "center",
                gap: { xs: 1, md: 1.5 },
              }}
            >
              <Avatar
                sx={{
                  bgcolor: card.color,
                  width: { xs: 36, md: 48 },
                  height: { xs: 36, md: 48 },
                  "& svg": { fontSize: { xs: 20, md: 24 } },
                }}
              >
                {card.icon}
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  variant="h6"
                  sx={{ fontWeight: 800, lineHeight: 1.1, fontSize: { xs: "1.25rem", md: "1.5rem" } }}
                >
                  {card.value}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontSize: { xs: "0.68rem", md: "0.8rem" } }}
                  noWrap
                >
                  {card.label}
                </Typography>
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* ---- Search & filter ---- */}
      <Paper
        elevation={0}
        sx={{
          p: 1.25,
          mb: 2,
          borderRadius: 2.5,
          boxShadow: "0 2px 10px rgba(15, 23, 42, 0.06)",
          position: "sticky",
          top: 0,
          zIndex: 4,
        }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
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
      ) : (
        <>
          {/* ---- Mobile/tablet: card list (unchanged) ---- */}
          <Box sx={{ display: { xs: "flex", md: "none" }, flexDirection: "column", gap: 1 }}>
            {receipts.map((r) => (
              <Card key={r.id} variant="outlined" sx={{ borderRadius: 2.5, px: 1.5, py: 1.25 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: "0.9rem" }} noWrap>
                      {r.drc_number}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {r.vendor_name}
                    </Typography>
                  </Box>
                  <Chip
                    size="small"
                    label={r.status}
                    color={statusColor(r.status)}
                    sx={{ fontWeight: 700, fontSize: "0.65rem" }}
                  />
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

                <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 0.5, mt: 0.75 }}>
                  <IconButton size="small" onClick={() => setViewReceipt(r)} aria-label="View DRC">
                    <VisibilityIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => openEditForm(r)} aria-label="Edit DRC">
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => handlePrint(r)} aria-label="Print DRC">
                    <PrintIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Card>
            ))}
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
                  <TableCell>DRC Number</TableCell>
                  <TableCell>Vendor</TableCell>
                  <TableCell>PO Number</TableCell>
                  <TableCell>Invoice Number</TableCell>
                  <TableCell>Vehicle Number</TableCell>
                  <TableCell>Receipt Date</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {receipts.map((r) => (
                  <TableRow key={r.id} hover sx={{ height: 60 }}>
                    <TableCell sx={{ fontWeight: 700 }}>{r.drc_number}</TableCell>
                    <TableCell>{r.vendor_name}</TableCell>
                    <TableCell>{r.po_number ?? "-"}</TableCell>
                    <TableCell>{r.invoice_number ?? "-"}</TableCell>
                    <TableCell>{r.vehicle_number ?? "-"}</TableCell>
                    <TableCell>{formatDate(r.receipt_datetime)}</TableCell>
                    <TableCell>
                      <Chip size="small" label={r.status} color={statusColor(r.status)} sx={{ fontWeight: 700 }} />
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                        <IconButton size="small" onClick={() => setViewReceipt(r)} aria-label="View DRC">
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => openEditForm(r)} aria-label="Edit DRC">
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => handlePrint(r)} aria-label="Print DRC">
                          <PrintIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
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
        maxWidth="sm"
      >
        <DialogTitle
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontWeight: 700,
          }}
        >
          {editingReceipt ? `Edit DRC - ${editingReceipt.drc_number}` : "Create DRC"}
          <IconButton onClick={closeForm} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ p: 1.5 }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {/* DRC No. & Date (create-only; fixed once a DRC exists) */}
            {!editingReceipt && (
              <Box>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    mb: 0.75,
                  }}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    DRC No. &amp; Date
                  </Typography>
                  <FormControlLabel
                    sx={{ mr: 0 }}
                    control={
                      <Switch
                        size="small"
                        checked={manualDrcEntry}
                        onChange={handleManualDrcToggle}
                      />
                    }
                    label={
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>
                        Manual
                      </Typography>
                    }
                  />
                </Box>

                <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 1 }}>
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
                          <InputAdornment position="end">
                            <CircularProgress size={16} />
                          </InputAdornment>
                        ) : undefined,
                      },
                    }}
                    helperText={
                      manualDrcEntry
                        ? " "
                        : "Auto - previous DRC No. + 1"
                    }
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                  />

                  <DateTextField
                    label="DRC Date"
                    value={drcDate}
                    onChange={setDrcDate}
                    required={manualDrcEntry}
                    disabled={!manualDrcEntry}
                  />
                </Box>
              </Box>
            )}

            {!editingReceipt && <Divider />}

            {/* Transport */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                Transport
              </Typography>
              <RadioGroup
                row
                value={form.receipt_mode}
                onChange={(e) =>
                  updateField("receipt_mode", e.target.value as ReceiptMode)
                }
              >
                <FormControlLabel value="Vehicle" control={<Radio size="small" />} label="By Vehicle" />
                <FormControlLabel value="Hand" control={<Radio size="small" />} label="By Hand" />
              </RadioGroup>

              {form.receipt_mode === "Vehicle" && (
                <TextField
                  label="Vehicle Number"
                  size="small"
                  fullWidth
                  required
                  value={form.vehicle_number}
                  onChange={(e) => updateField("vehicle_number", e.target.value)}
                  sx={{ mt: 1, "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                />
              )}
            </Box>

            <Divider />

            {/* Package Details */}
            <Box>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  mb: 0.75,
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Package Details
                </Typography>
                <Button
                  size="small"
                  startIcon={<AddIcon fontSize="small" />}
                  onClick={addPackageRow}
                  sx={{ fontWeight: 600, textTransform: "none" }}
                >
                  Add Row
                </Button>
              </Box>

              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {form.package_details.map((row, index) => (
                  <Box
                    key={index}
                    sx={{
                      display: "flex",
                      flexDirection: { xs: "column", sm: "row" },
                      alignItems: { xs: "stretch", sm: "center" },
                      gap: 0.75,
                      p: 1,
                      borderRadius: 2,
                      bgcolor: "grey.50",
                    }}
                  >
                    <TextField
                      label="Qty"
                      type="number"
                      size="small"
                      value={row.quantity}
                      onChange={(e) =>
                        updatePackageRow(index, "quantity", Number(e.target.value))
                      }
                      slotProps={{ htmlInput: { inputMode: "numeric", min: 0 } }}
                      sx={{
                        width: { xs: "100%", sm: 84 },
                        flexShrink: 0,
                        "& .MuiOutlinedInput-root": { borderRadius: 2 },
                      }}
                    />
                    <TextField
                      label="Package Type"
                      placeholder="e.g. Boxes, Drums, Tanker"
                      size="small"
                      fullWidth
                      value={row.package_type}
                      onChange={(e) =>
                        updatePackageRow(index, "package_type", e.target.value)
                      }
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                    />
                    <TextField
                      label="Description"
                      placeholder="Optional"
                      size="small"
                      fullWidth
                      value={row.description}
                      onChange={(e) =>
                        updatePackageRow(index, "description", e.target.value)
                      }
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                    />
                    <IconButton
                      size="small"
                      onClick={() => removePackageRow(index)}
                      aria-label="Delete row"
                      sx={{ flexShrink: 0, alignSelf: { xs: "flex-end", sm: "center" } }}
                    >
                      <DeleteIcon fontSize="small" color="error" />
                    </IconButton>
                  </Box>
                ))}
              </Box>
            </Box>

            <Divider />

            {/* Supplier */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
                Supplier
              </Typography>
              <TextField
                label="Vendor Name"
                size="small"
                fullWidth
                required
                value={form.vendor_name}
                onChange={(e) => updateField("vendor_name", e.target.value)}
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
              />
            </Box>

            <Divider />

            {/* Purchase */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
                Purchase
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
                Enter SAP PO, GeM Order, or both.
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 1 }}>
                  <TextField
                    label="SAP PO Number"
                    size="small"
                    fullWidth
                    value={form.sap_po_number}
                    onChange={(e) => updateField("sap_po_number", e.target.value)}
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                  />
                  <DateTextField
                    label="SAP PO Date"
                    value={form.sap_po_date}
                    onChange={(iso) => updateField("sap_po_date", iso)}
                  />
                </Box>
                <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 1 }}>
                  <TextField
                    label="GeM Order Number"
                    size="small"
                    fullWidth
                    value={form.gem_order_number}
                    onChange={(e) => updateField("gem_order_number", e.target.value)}
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                  />
                  <DateTextField
                    label="GeM Order Date"
                    value={form.gem_order_date}
                    onChange={(iso) => updateField("gem_order_date", iso)}
                  />
                </Box>
              </Box>
            </Box>

            <Divider />

            {/* Invoice */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
                Invoice
              </Typography>
              <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 1 }}>
                <TextField
                  label="Invoice Number"
                  size="small"
                  fullWidth
                  value={form.invoice_number}
                  onChange={(e) => updateField("invoice_number", e.target.value)}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                />
                <DateTextField
                  label="Invoice Date"
                  value={form.invoice_date}
                  onChange={(iso) => updateField("invoice_date", iso)}
                />
              </Box>
            </Box>

            <Divider />

            {/* Challan */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
                Challan
              </Typography>
              <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 1 }}>
                <TextField
                  label="Challan Number"
                  size="small"
                  fullWidth
                  value={form.challan_number}
                  onChange={(e) => updateField("challan_number", e.target.value)}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                />
                <DateTextField
                  label="Challan Date"
                  value={form.challan_date}
                  onChange={(iso) => updateField("challan_date", iso)}
                />
              </Box>
            </Box>

            <Divider />

            {/* E-Way Bill */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
                E-Way Bill
              </Typography>
              <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 1 }}>
                <TextField
                  label="E-Way Bill Number"
                  size="small"
                  fullWidth
                  value={form.eway_bill_number}
                  onChange={(e) => updateField("eway_bill_number", e.target.value)}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                />
                <DateTextField
                  label="E-Way Bill Date"
                  value={form.eway_bill_date}
                  onChange={(iso) => updateField("eway_bill_date", iso)}
                />
              </Box>
            </Box>

            <Divider />

            {/* Transport */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
                Transport
              </Typography>
              <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 1 }}>
                <TextField
                  label="Lorry Receipt Number"
                  size="small"
                  fullWidth
                  value={form.lorry_receipt_number}
                  onChange={(e) => updateField("lorry_receipt_number", e.target.value)}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                />
                <DateTextField
                  label="Lorry Receipt Date"
                  value={form.lorry_receipt_date}
                  onChange={(iso) => updateField("lorry_receipt_date", iso)}
                />
              </Box>
            </Box>

            <Divider />

            {/* Weighbridge */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
                Weighbridge
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <TextField
                  label="Weightment Slip Number"
                  size="small"
                  fullWidth
                  value={form.weightment_slip_number}
                  onChange={(e) => updateField("weightment_slip_number", e.target.value)}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                />
                <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 1 }}>
                  <TextField
                    label="Gross Weight"
                    type="number"
                    size="small"
                    fullWidth
                    value={form.gross_weight}
                    onChange={(e) => updateField("gross_weight", e.target.value)}
                    slotProps={{ htmlInput: { inputMode: "decimal" } }}
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                  />
                  <TextField
                    label="Tare Weight"
                    type="number"
                    size="small"
                    fullWidth
                    value={form.tare_weight}
                    onChange={(e) => updateField("tare_weight", e.target.value)}
                    slotProps={{ htmlInput: { inputMode: "decimal" } }}
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                  />
                </Box>
                <TextField
                  label="Net Weight"
                  type="number"
                  size="small"
                  fullWidth
                  value={form.net_weight}
                  onChange={(e) => updateField("net_weight", e.target.value)}
                  slotProps={{ htmlInput: { inputMode: "decimal" } }}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                />
              </Box>
            </Box>

            <Divider />

            {/* Remarks */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
                Remarks
              </Typography>
              <TextField
                size="small"
                fullWidth
                multiline
                minRows={2}
                value={form.remarks}
                onChange={(e) => updateField("remarks", e.target.value)}
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
              />
            </Box>

            <Divider />

            {/* Photo upload */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
                Photos
              </Typography>

              {/* Gallery picker (staged, uploaded on Save - unchanged) */}
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={handlePhotoSelect}
              />

              {/* Camera capture (uploads immediately) */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={handleCameraCapture}
              />

              <Button
                variant="outlined"
                startIcon={
                  capturingPhoto ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : (
                    <AddPhotoAlternateIcon fontSize="small" />
                  )
                }
                onClick={openPhotoMenu}
                disabled={capturingPhoto}
                sx={{ minHeight: 42, borderRadius: 2, fontWeight: 600 }}
              >
                Add Photo
              </Button>

              <Menu
                anchorEl={photoMenuAnchor}
                open={!!photoMenuAnchor}
                onClose={closePhotoMenu}
              >
                <MenuItem onClick={handleTakePhoto}>
                  <PhotoCameraIcon fontSize="small" sx={{ mr: 1 }} />
                  Take Photo
                </MenuItem>
                <MenuItem onClick={handleChooseFromGallery}>
                  <PhotoLibraryIcon fontSize="small" sx={{ mr: 1 }} />
                  Choose From Gallery
                </MenuItem>
              </Menu>

              {(keptPhotoUrls.length > 0 || newPhotoPreviews.length > 0) && (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1 }}>
                  {keptPhotoUrls.map((url, index) => (
                    <Box key={`kept-${index}`} sx={{ position: "relative" }}>
                      <Avatar
                        src={url}
                        variant="rounded"
                        sx={{ width: 64, height: 64 }}
                      />
                      <IconButton
                        size="small"
                        onClick={() => removeKeptPhoto(index)}
                        sx={{
                          position: "absolute",
                          top: -8,
                          right: -8,
                          bgcolor: "background.paper",
                          boxShadow: 1,
                          width: 22,
                          height: 22,
                        }}
                      >
                        <DeleteIcon sx={{ fontSize: 14 }} color="error" />
                      </IconButton>
                    </Box>
                  ))}

                  {newPhotoPreviews.map((url, index) => (
                    <Box key={`new-${index}`} sx={{ position: "relative" }}>
                      <Avatar
                        src={url}
                        variant="rounded"
                        sx={{ width: 64, height: 64 }}
                      />
                      <IconButton
                        size="small"
                        onClick={() => removeNewPhoto(index)}
                        sx={{
                          position: "absolute",
                          top: -8,
                          right: -8,
                          bgcolor: "background.paper",
                          boxShadow: 1,
                          width: 22,
                          height: 22,
                        }}
                      >
                        <DeleteIcon sx={{ fontSize: 14 }} color="error" />
                      </IconButton>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>

            <Divider />

            {/* Attachments */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
                Attachments
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
                Invoice, Challan, E-Way Bill, Inspection Certificate, OEM/Vendor documents, etc. (PDF, DOC, DOCX, XLS, XLSX, JPG, PNG)
              </Typography>

              <input
                ref={documentInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                multiple
                hidden
                onChange={handleDocumentSelect}
              />

              <Button
                variant="outlined"
                startIcon={<AttachFileIcon fontSize="small" />}
                onClick={() => documentInputRef.current?.click()}
                sx={{ minHeight: 42, borderRadius: 2, fontWeight: 600 }}
              >
                Add Document
              </Button>

              {(keptAttachments.length > 0 || newDocumentFiles.length > 0) && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, mt: 1 }}>
                  {keptAttachments.map((doc, index) => (
                    <Box
                      key={`kept-doc-${index}`}
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
                      <Typography
                        variant="body2"
                        sx={{ flex: 1, minWidth: 0 }}
                        noWrap
                        component="a"
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {doc.name}
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={() => removeKeptAttachment(index)}
                        aria-label="Remove document"
                      >
                        <DeleteIcon sx={{ fontSize: 16 }} color="error" />
                      </IconButton>
                    </Box>
                  ))}

                  {newDocumentFiles.map((file, index) => (
                    <Box
                      key={`new-doc-${index}`}
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
                      <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                        {file.name}
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={() => removeNewDocument(index)}
                        aria-label="Remove document"
                      >
                        <DeleteIcon sx={{ fontSize: 16 }} color="error" />
                      </IconButton>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </Box>
        </DialogContent>

        <DialogActions
          sx={{
            p: 1.5,
            gap: 1,
            position: mobile ? "sticky" : "static",
            bottom: 0,
            bgcolor: "background.paper",
          }}
        >
          <Button
            onClick={closeForm}
            disabled={saving}
            sx={{ minHeight: 44, borderRadius: 2 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleReset}
            disabled={saving}
            sx={{ minHeight: 44, borderRadius: 2 }}
          >
            Reset
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={18} color="inherit" /> : null}
            sx={{ minHeight: 44, borderRadius: 2, fontWeight: 700, flex: 1 }}
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
        maxWidth="sm"
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
              }}
            >
              {viewReceipt.drc_number}
              <IconButton onClick={() => setViewReceipt(null)} size="small">
                <CloseIcon fontSize="small" />
              </IconButton>
            </DialogTitle>

            <DialogContent dividers sx={{ p: 1.5 }}>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
                <Chip
                  size="small"
                  label={viewReceipt.status}
                  color={statusColor(viewReceipt.status)}
                  sx={{ fontWeight: 700 }}
                />
                {viewReceipt.inspection_status && (
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`Inspection: ${viewReceipt.inspection_status}`}
                    sx={{ fontWeight: 600 }}
                  />
                )}
              </Box>

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
                  ["Remarks", viewReceipt.remarks ?? "-"],
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

              {viewReceipt.package_details && viewReceipt.package_details.length > 0 && (
                <>
                  <Divider sx={{ my: 1.5 }} />
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                    Package Details
                  </Typography>
                  <TableContainer sx={{ borderRadius: 2 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Qty</TableCell>
                          <TableCell>Package Type</TableCell>
                          <TableCell>Description</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {viewReceipt.package_details.map((row, index) => (
                          <TableRow key={index}>
                            <TableCell>{row.quantity}</TableCell>
                            <TableCell>{row.package_type || "-"}</TableCell>
                            <TableCell>{row.description || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </>
              )}

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

              {viewReceipt.attachment_paths && viewReceipt.attachment_paths.length > 0 && (
                <>
                  <Divider sx={{ my: 1.5 }} />
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                    Attachments
                  </Typography>
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
                      </Box>
                    ))}
                  </Box>
                </>
              )}

              {/* ---- Sprint 2: Inspection ---- */}
              <Divider sx={{ my: 1.5 }} />
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1 }}>
                <FactCheckIcon fontSize="small" color="action" />
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Inspection
                </Typography>
              </Box>

              {viewReceipt.status === "Pending Inspection" ||
              viewReceipt.inspection_status === "Rejected" ? (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <TextField
                    select
                    label="Inspection Status"
                    size="small"
                    fullWidth
                    value={inspectionStatusInput}
                    onChange={(e) =>
                      setInspectionStatusInput(e.target.value as InspectionStatus)
                    }
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                  >
                    {INSPECTION_STATUSES.filter(
                      (s) => s !== "Pending Inspection"
                    ).map((s) => (
                      <MenuItem key={s} value={s}>
                        {s}
                      </MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    label="Inspection Remarks"
                    size="small"
                    fullWidth
                    multiline
                    minRows={2}
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
                      {viewReceipt.inspection_status ?? "-"}
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
                      disabled={grnKnownRows.length === 0 || grnImporting}
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
                          label={h.inspection_status}
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
                    </Box>
                  ))}
                </Box>
              )}
            </DialogContent>

            <DialogActions sx={{ p: 1.5 }}>
              <Button
                variant="outlined"
                startIcon={<EditIcon fontSize="small" />}
                onClick={() => {
                  const r = viewReceipt;
                  setViewReceipt(null);
                  openEditForm(r);
                }}
                sx={{ minHeight: 44, borderRadius: 2 }}
              >
                Edit
              </Button>
              <Button
                variant="contained"
                startIcon={<PrintIcon fontSize="small" />}
                onClick={() => handlePrint(viewReceipt)}
                sx={{ minHeight: 44, borderRadius: 2 }}
              >
                Print
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

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
