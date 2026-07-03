import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";

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
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  FormControlLabel,
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

import {
  createReceipt,
  updateReceipt,
  getReceipts,
  getReceiptSummary,
  PACKAGE_TYPES,
  type ReceiptHeader,
  type ReceiptFormInput,
  type ReceiptSummary,
  type ReceiptMode,
  type PackageType,
} from "../services/receiptService";

type SnackbarSeverity = "success" | "error" | "warning" | "info";

const emptyForm: ReceiptFormInput = {
  receipt_mode: "Vehicle",
  vehicle_number: "",
  package_count: 1,
  package_type: "Boxes",
  vendor_name: "",
  po_number: "",
  po_date: "",
  invoice_number: "",
  invoice_date: "",
  challan_number: "",
  challan_date: "",
  eway_bill_number: "",
  eway_bill_date: "",
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

export default function MaterialReceipt() {
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

  const [newPhotoFiles, setNewPhotoFiles] = useState<File[]>([]);
  const [newPhotoPreviews, setNewPhotoPreviews] = useState<string[]>([]);
  const [keptPhotoUrls, setKeptPhotoUrls] = useState<string[]>([]);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  function updateField<K extends keyof ReceiptFormInput>(
    field: K,
    value: ReceiptFormInput[K]
  ) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function openCreateForm() {
    setEditingReceipt(null);
    setForm(emptyForm);
    setNewPhotoFiles([]);
    setNewPhotoPreviews([]);
    setKeptPhotoUrls([]);
    setFormOpen(true);
  }

  function openEditForm(receipt: ReceiptHeader) {
    setEditingReceipt(receipt);
    setForm({
      receipt_mode: receipt.receipt_mode,
      vehicle_number: receipt.vehicle_number ?? "",
      package_count: receipt.package_count,
      package_type: receipt.package_type,
      vendor_name: receipt.vendor_name,
      po_number: receipt.po_number ?? "",
      po_date: receipt.po_date ?? "",
      invoice_number: receipt.invoice_number ?? "",
      invoice_date: receipt.invoice_date ?? "",
      challan_number: receipt.challan_number ?? "",
      challan_date: receipt.challan_date ?? "",
      eway_bill_number: receipt.eway_bill_number ?? "",
      eway_bill_date: receipt.eway_bill_date ?? "",
      remarks: receipt.remarks ?? "",
    });
    setNewPhotoFiles([]);
    setNewPhotoPreviews([]);
    setKeptPhotoUrls(receipt.photo_urls ?? []);
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
    if (editingReceipt) {
      setKeptPhotoUrls(editingReceipt.photo_urls ?? []);
    } else {
      setKeptPhotoUrls([]);
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

  function validateForm(): string | null {
    if (!form.vendor_name.trim()) return "Vendor Name is required.";
    if (form.receipt_mode === "Vehicle" && !form.vehicle_number.trim()) {
      return "Vehicle Number is required for receipt by vehicle.";
    }
    if (!form.package_count || form.package_count <= 0) {
      return "Package Count must be greater than zero.";
    }
    if (!form.package_type) return "Package Type is required.";
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
          keptPhotoUrls
        );
        showSnackbar(`DRC ${updated.drc_number} updated.`, "success");
      } else {
        const created = await createReceipt(form, newPhotoFiles);
        showSnackbar(`DRC ${created.drc_number} created.`, "success");
      }

      closeForm();
      await refreshAll();
    } catch {
      showSnackbar("Something went wrong while saving the DRC.", "error");
    } finally {
      setSaving(false);
    }
  }

  // ---------------- View DRC ----------------
  const [viewReceipt, setViewReceipt] = useState<ReceiptHeader | null>(null);

  // ---------------- Print DRC ----------------
  function handlePrint(receipt: ReceiptHeader) {
    const printWindow = window.open("", "_blank", "width=700,height=900");
    if (!printWindow) return;

    const rows: [string, string][] = [
      ["DRC Number", receipt.drc_number],
      ["Status", receipt.status],
      ["Receipt Date/Time", formatDateTime(receipt.receipt_datetime)],
      ["Receipt Mode", receipt.receipt_mode],
      ["Vehicle Number", receipt.vehicle_number ?? "-"],
      ["Package Count", String(receipt.package_count)],
      ["Package Type", receipt.package_type],
      ["Vendor Name", receipt.vendor_name],
      ["SAP PO / GeM Number", receipt.po_number ?? "-"],
      ["PO Date", formatDate(receipt.po_date)],
      ["Invoice Number", receipt.invoice_number ?? "-"],
      ["Invoice Date", formatDate(receipt.invoice_date)],
      ["Challan Number", receipt.challan_number ?? "-"],
      ["Challan Date", formatDate(receipt.challan_date)],
      ["E-Way Bill Number", receipt.eway_bill_number ?? "-"],
      ["E-Way Bill Date", formatDate(receipt.eway_bill_date)],
      ["Remarks", receipt.remarks ?? "-"],
    ];

    const rowsHtml = rows
      .map(
        ([label, value]) =>
          `<tr><td style="padding:6px 10px;font-weight:600;border:1px solid #ddd;">${label}</td><td style="padding:6px 10px;border:1px solid #ddd;">${value}</td></tr>`
      )
      .join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>${receipt.drc_number}</title>
        </head>
        <body style="font-family: Arial, sans-serif; padding: 24px;">
          <h2 style="margin-bottom: 4px;">Delivery Receipt Challan</h2>
          <p style="margin-top: 0; color: #555;">${receipt.drc_number}</p>
          <table style="border-collapse: collapse; width: 100%;">${rowsHtml}</table>
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
      <Grid container spacing={1.25} sx={{ mb: 2 }}>
        {summaryCards.map((card) => (
          <Grid key={card.label} size={{ xs: 6, sm: 3 }}>
            <Paper
              elevation={0}
              sx={{
                p: 1.25,
                borderRadius: 2.5,
                boxShadow: "0 2px 10px rgba(15, 23, 42, 0.06)",
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <Avatar sx={{ bgcolor: card.color, width: 36, height: 36 }}>
                {card.icon}
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
                  {card.value}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontSize: "0.68rem" }}
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

          <Box sx={{ display: "flex", gap: 1 }}>
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
      ) : mobile ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
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
      ) : (
        <TableContainer
          component={Paper}
          elevation={0}
          sx={{ borderRadius: 2.5, boxShadow: "0 2px 14px rgba(15, 23, 42, 0.06)" }}
        >
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>DRC Number</TableCell>
                <TableCell>Vendor</TableCell>
                <TableCell>PO Number</TableCell>
                <TableCell>Invoice Number</TableCell>
                <TableCell>Receipt Date</TableCell>
                <TableCell>Vehicle Number</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {receipts.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{r.drc_number}</TableCell>
                  <TableCell>{r.vendor_name}</TableCell>
                  <TableCell>{r.po_number ?? "-"}</TableCell>
                  <TableCell>{r.invoice_number ?? "-"}</TableCell>
                  <TableCell>{formatDate(r.receipt_datetime)}</TableCell>
                  <TableCell>{r.vehicle_number ?? "-"}</TableCell>
                  <TableCell>
                    <Chip size="small" label={r.status} color={statusColor(r.status)} sx={{ fontWeight: 700 }} />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => setViewReceipt(r)} aria-label="View DRC">
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => openEditForm(r)} aria-label="Edit DRC">
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => handlePrint(r)} aria-label="Print DRC">
                      <PrintIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
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
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
                Package Details
              </Typography>
              <Box sx={{ display: "flex", gap: 1 }}>
                <TextField
                  label="Package Count"
                  type="number"
                  size="small"
                  fullWidth
                  value={form.package_count}
                  onChange={(e) =>
                    updateField("package_count", Number(e.target.value))
                  }
                  slotProps={{ htmlInput: { inputMode: "numeric", min: 1 } }}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                />
                <TextField
                  select
                  label="Package Type"
                  size="small"
                  fullWidth
                  value={form.package_type}
                  onChange={(e) =>
                    updateField("package_type", e.target.value as PackageType)
                  }
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                >
                  {PACKAGE_TYPES.map((type) => (
                    <MenuItem key={type} value={type}>
                      {type}
                    </MenuItem>
                  ))}
                </TextField>
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
              <Box sx={{ display: "flex", gap: 1 }}>
                <TextField
                  label="SAP PO / GeM Order Number"
                  size="small"
                  fullWidth
                  value={form.po_number}
                  onChange={(e) => updateField("po_number", e.target.value)}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                />
                <TextField
                  label="PO Date"
                  type="date"
                  size="small"
                  fullWidth
                  value={form.po_date}
                  onChange={(e) => updateField("po_date", e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                />
              </Box>
            </Box>

            <Divider />

            {/* Invoice */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
                Invoice
              </Typography>
              <Box sx={{ display: "flex", gap: 1 }}>
                <TextField
                  label="Invoice Number"
                  size="small"
                  fullWidth
                  value={form.invoice_number}
                  onChange={(e) => updateField("invoice_number", e.target.value)}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                />
                <TextField
                  label="Invoice Date"
                  type="date"
                  size="small"
                  fullWidth
                  value={form.invoice_date}
                  onChange={(e) => updateField("invoice_date", e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                />
              </Box>
            </Box>

            <Divider />

            {/* Challan */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
                Challan
              </Typography>
              <Box sx={{ display: "flex", gap: 1 }}>
                <TextField
                  label="Challan Number"
                  size="small"
                  fullWidth
                  value={form.challan_number}
                  onChange={(e) => updateField("challan_number", e.target.value)}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                />
                <TextField
                  label="Challan Date"
                  type="date"
                  size="small"
                  fullWidth
                  value={form.challan_date}
                  onChange={(e) => updateField("challan_date", e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                />
              </Box>
            </Box>

            <Divider />

            {/* E-Way Bill */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
                E-Way Bill
              </Typography>
              <Box sx={{ display: "flex", gap: 1 }}>
                <TextField
                  label="E-Way Bill Number"
                  size="small"
                  fullWidth
                  value={form.eway_bill_number}
                  onChange={(e) => updateField("eway_bill_number", e.target.value)}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                />
                <TextField
                  label="E-Way Bill Date"
                  type="date"
                  size="small"
                  fullWidth
                  value={form.eway_bill_date}
                  onChange={(e) => updateField("eway_bill_date", e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
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

              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={handlePhotoSelect}
              />

              <Button
                variant="outlined"
                startIcon={<AddPhotoAlternateIcon fontSize="small" />}
                onClick={() => photoInputRef.current?.click()}
                sx={{ minHeight: 42, borderRadius: 2, fontWeight: 600 }}
              >
                Add Photos
              </Button>

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
        maxWidth="xs"
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

            <DialogContent dividers>
              <Chip
                size="small"
                label={viewReceipt.status}
                color={statusColor(viewReceipt.status)}
                sx={{ fontWeight: 700, mb: 1.5 }}
              />

              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
                {[
                  ["Receipt Date/Time", formatDateTime(viewReceipt.receipt_datetime)],
                  ["Receipt Mode", viewReceipt.receipt_mode],
                  ["Vehicle Number", viewReceipt.vehicle_number ?? "-"],
                  ["Package Count", String(viewReceipt.package_count)],
                  ["Package Type", viewReceipt.package_type],
                  ["Vendor Name", viewReceipt.vendor_name],
                  ["SAP PO / GeM Number", viewReceipt.po_number ?? "-"],
                  ["PO Date", formatDate(viewReceipt.po_date)],
                  ["Invoice Number", viewReceipt.invoice_number ?? "-"],
                  ["Invoice Date", formatDate(viewReceipt.invoice_date)],
                  ["Challan Number", viewReceipt.challan_number ?? "-"],
                  ["Challan Date", formatDate(viewReceipt.challan_date)],
                  ["E-Way Bill Number", viewReceipt.eway_bill_number ?? "-"],
                  ["E-Way Bill Date", formatDate(viewReceipt.eway_bill_date)],
                  ["Remarks", viewReceipt.remarks ?? "-"],
                ].map(([label, value]) => (
                  <Box
                    key={label}
                    sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {label}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, textAlign: "right" }}>
                      {value}
                    </Typography>
                  </Box>
                ))}
              </Box>

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
