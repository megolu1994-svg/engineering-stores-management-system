import { useCallback, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Popover,
  Select,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";

import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import SwapHorizOutlinedIcon from "@mui/icons-material/SwapHorizOutlined";
import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";
import BalanceOutlinedIcon from "@mui/icons-material/BalanceOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import SubjectOutlinedIcon from "@mui/icons-material/SubjectOutlined";
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import ReceiptOutlinedIcon from "@mui/icons-material/ReceiptOutlined";
import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined";
import GridOnOutlinedIcon from "@mui/icons-material/GridOnOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SearchIcon from "@mui/icons-material/Search";
import ReplayOutlinedIcon from "@mui/icons-material/ReplayOutlined";
import FirstPageIcon from "@mui/icons-material/FirstPage";
import KeyboardArrowLeftIcon from "@mui/icons-material/KeyboardArrowLeft";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import LastPageIcon from "@mui/icons-material/LastPage";

import { useSearchParams } from "react-router-dom";

import {
  getSapDistinctValues,
  getSapHistoryPage,
  type SapDocument,
} from "../services/sapHistoryService";
import { getMovementTypeDescription } from "../utils/sapMovementTypes";

type SnackbarSeverity = "success" | "error" | "warning" | "info";

const ROWS_PER_PAGE_OPTIONS = [25, 50, 100];
/** Rows fetched at once when the user exports Excel / PDF. */
const EXPORT_LIMIT = 50000;

/* ------------------------------------------------------------------ */
/* Palette (per spec)                                                  */
/* ------------------------------------------------------------------ */

const C = {
  primary: "#2563EB",
  navy: "#172554",
  slate: "#64748B",
  border: "#E2E8F0",
  headerBg: "#F8FAFC",
  headerText: "#1D4ED8",
  green: "#15803D",
  orange: "#EA580C",
  red: "#DC2626",
};

/* ------------------------------------------------------------------ */
/* Presentation helpers                                                */
/* ------------------------------------------------------------------ */

/** ISO "2026-08-11" -> "11-08-2026" for display. */
function formatPostingDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}-${m}-${y}`;
}

function movementLabel(row: SapDocument): string {
  if (!row.movement_type) return "Movement";
  const description = getMovementTypeDescription(row.movement_type);
  return description
    ? `${row.movement_type} - ${description}`
    : `Mvt ${row.movement_type}`;
}

/** Badge colors by movement type: receipts green, issues orange, transfers blue. */
function movementBadgeColors(mvt: string | null): { bg: string; fg: string } {
  const t = (mvt ?? "").trim();
  if (/^[15]/.test(t)) return { bg: "#DCFCE7", fg: C.green };
  if (/^[2789]/.test(t)) return { bg: "#FFEDD5", fg: C.orange };
  return { bg: "#DBEAFE", fg: C.headerText };
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_") || "SAP_History";
}

/** Pages to render in the footer, with ellipses for large ranges. */
function visiblePages(current: number, pageCount: number): (number | "…")[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  const pages: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(pageCount - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let p = start; p <= end; p += 1) pages.push(p);
  if (end < pageCount - 1) pages.push("…");
  pages.push(pageCount);
  return pages;
}

/* ------------------------------------------------------------------ */
/* Exports (logic unchanged)                                           */
/* ------------------------------------------------------------------ */

function downloadExcel(docs: SapDocument[], label: string): void {
  const header = [
    "Posting Date",
    "Movement Type",
    "Material",
    "Storage Location",
    "Quantity",
    "Balance",
    "Unit",
    "Material Document",
    "Doc Item",
    "Doc Header Text",
    "PO",
    "Vendor",
    "Invoice",
    "User",
  ];

  const rows = docs.map((d) => [
    d.posting_date ?? "",
    d.movement_type ?? "",
    d.material_code,
    d.storage_location,
    d.quantity,
    d.running_balance,
    d.unit_of_entry ?? "",
    d.material_document ?? "",
    d.material_doc_item ?? "",
    d.document_header_text ?? "",
    d.purchase_order ?? "",
    d.vendor ?? "",
    d.invoice_number ?? "",
    d.user_name ?? "",
  ]);

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "SAP History");

  XLSX.writeFile(wb, `${safeFileName(label)}_SAP_History.xlsx`);
}

function downloadPdf(docs: SapDocument[], label: string): void {
  const doc = new jsPDF({ orientation: "landscape" });

  doc.setFontSize(12);
  doc.text(`SAP Material History - ${label}`, 14, 12);

  autoTable(doc, {
    startY: 18,
    head: [
      [
        "Date",
        "Mvt",
        "Material",
        "SLoc",
        "Qty",
        "Balance",
        "Doc",
        "Doc Header Text",
        "PO",
        "Vendor",
        "Invoice",
        "User",
      ],
    ],
    body: docs.map((d) => [
      d.posting_date ?? "",
      d.movement_type ?? "",
      d.material_code,
      d.storage_location,
      String(d.quantity),
      String(d.running_balance),
      d.material_document ?? "",
      d.document_header_text ?? "",
      d.purchase_order ?? "",
      d.vendor ?? "",
      d.invoice_number ?? "",
      d.user_name ?? "",
    ]),
    styles: { fontSize: 7 },
    headStyles: { fillColor: [108, 43, 217] },
  });

  doc.save(`${safeFileName(label)}_SAP_History.pdf`);
}

/* ------------------------------------------------------------------ */
/* Column definitions (exact 12-column sequence from the spec)         */
/* ------------------------------------------------------------------ */

interface ColumnDef {
  key: string;
  label: string;
  icon: React.ReactNode;
  align?: "right";
}

const COLUMNS: ColumnDef[] = [
  { key: "posting_date", label: "Posting Date", icon: <CalendarMonthOutlinedIcon fontSize="small" /> },
  { key: "material_code", label: "Material Code", icon: <Inventory2OutlinedIcon fontSize="small" /> },
  { key: "material_description", label: "Material Description", icon: <DescriptionOutlinedIcon fontSize="small" /> },
  { key: "movement_type", label: "Movement Type", icon: <SwapHorizOutlinedIcon fontSize="small" /> },
  { key: "sloc", label: "SLoc", icon: <LocationOnOutlinedIcon fontSize="small" /> },
  { key: "qty", label: "Qty", icon: <BalanceOutlinedIcon fontSize="small" />, align: "right" },
  { key: "doc", label: "Doc", icon: <InsertDriveFileOutlinedIcon fontSize="small" /> },
  { key: "doc_header_text", label: "Doc Header Text", icon: <SubjectOutlinedIcon fontSize="small" /> },
  { key: "po", label: "PO", icon: <ShoppingCartOutlinedIcon fontSize="small" /> },
  { key: "vendor", label: "Vendor", icon: <BusinessOutlinedIcon fontSize="small" /> },
  { key: "invoice", label: "Invoice", icon: <ReceiptOutlinedIcon fontSize="small" /> },
  { key: "user", label: "User", icon: <PersonOutlinedIcon fontSize="small" /> },
];

/* Draggable column widths (px). Drag the handle on any column header to
   resize that column; widths are saved in localStorage so the layout
   sticks between visits. The defaults approximate the old percentage
   layout on a ~1600px-wide table. */
const MIN_COLUMN_WIDTH = 60;
const WIDTHS_STORAGE_KEY = "sap_history_column_widths_v1";

const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  posting_date: 100,
  material_code: 135,
  material_description: 240,
  movement_type: 185,
  sloc: 70,
  qty: 95,
  doc: 155,
  doc_header_text: 185,
  po: 110,
  vendor: 110,
  invoice: 95,
  user: 95,
};

/** Loads the user's saved column widths, validating every value. */
function loadSavedWidths(): Record<string, number> {
  try {
    const raw = localStorage.getItem(WIDTHS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const valid: Record<string, number> = {};
    for (const column of COLUMNS) {
      const value = Number(parsed[column.key]);
      if (Number.isFinite(value) && value >= MIN_COLUMN_WIDTH) {
        valid[column.key] = Math.round(value);
      }
    }
    return valid;
  } catch {
    return {};
  }
}

/** Persists column widths (safe to call during a drag - tiny JSON). */
function persistWidths(next: Record<string, number>): void {
  try {
    localStorage.setItem(WIDTHS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable - resizing still works for this session.
  }
}

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

export default function SapHistory() {
  const [searchParams] = useSearchParams();

  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: SnackbarSeverity;
  }>({ open: false, message: "", severity: "info" });

  function showSnackbar(message: string, severity: SnackbarSeverity) {
    setSnackbar({ open: true, message, severity });
  }

  // Support ?material=<code> deep links (e.g. from SAP Stock) by seeding
  // the search box from the URL on first mount.
  const initialCode = searchParams.get("material") ?? "";
  const [search, setSearch] = useState(initialCode);
  const [debouncedSearch, setDebouncedSearch] = useState(initialCode);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [movementType, setMovementType] = useState("");
  const [sloc, setSloc] = useState("");
  const [docs, setDocs] = useState<SapDocument[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [movementTypes, setMovementTypes] = useState<string[]>([]);
  const [slocs, setSlocs] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [filtersAnchor, setFiltersAnchor] = useState<HTMLElement | null>(null);
  // Draggable column widths (persisted in localStorage) + active drag.
  const [columnWidths, setColumnWidths] =
    useState<Record<string, number>>(loadSavedWidths);
  const [drag, setDrag] = useState<{
    key: string;
    startX: number;
    startWidth: number;
  } | null>(null);
  // The filter combination whose data currently lives in `docs` - loading
  // is derived from it so the effect below only calls setState inside
  // async callbacks.
  const [loadedForKey, setLoadedForKey] = useState<string | null>(null);

  const filterKey = `${from}|${to}|${movementType}|${sloc}|${debouncedSearch}|${page}|${pageSize}`;
  const loading = docs === null || loadedForKey !== filterKey;

  // Debounce the search so we don't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    return getSapHistoryPage({
      filters: {
        from: from || null,
        to: to || null,
        movementType: movementType || null,
        storageLocation: sloc || null,
      },
      search: debouncedSearch,
      page,
      pageSize,
    });
  }, [from, to, movementType, sloc, debouncedSearch, page, pageSize]);

  useEffect(() => {
    let cancelled = false;

    load()
      .then((result) => {
        if (cancelled) return;
        setDocs(result.docs);
        setTotal(result.total);
        setLoadError(result.error);
        setLoadedForKey(filterKey);
      })
      .catch(() => {
        if (cancelled) return;
        setDocs([]);
        setTotal(0);
        setLoadError("Could not load SAP history.");
        setLoadedForKey(filterKey);
      });

    return () => {
      cancelled = true;
    };
  }, [load, filterKey]);

  // Dropdown lists for the movement-type / storage-location filters.
  useEffect(() => {
    let cancelled = false;
    getSapDistinctValues("movement_type", null).then((values) => {
      if (!cancelled) setMovementTypes(values);
    });
    getSapDistinctValues("storage_location", null).then((values) => {
      if (!cancelled) setSlocs(values);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const columnWidth = (key: string) =>
    columnWidths[key] ?? DEFAULT_COLUMN_WIDTHS[key];
  const totalWidth = COLUMNS.reduce(
    (sum, column) => sum + columnWidth(column.key),
    0
  );

  function startResize(key: string, event: React.PointerEvent) {
    event.preventDefault();
    setDrag({ key, startX: event.clientX, startWidth: columnWidth(key) });
  }

  function resetColumnWidth(key: string) {
    setColumnWidths((prev) => {
      const next = { ...prev };
      delete next[key];
      persistWidths(next);
      return next;
    });
    const label = COLUMNS.find((column) => column.key === key)?.label ?? key;
    showSnackbar(
      `${label} column restored to default width.`,
      "info"
    );
  }

  // Window-level pointer listeners while a column is being dragged, so the
  // drag stays smooth even when the cursor leaves the handle.
  useEffect(() => {
    if (!drag) return;
    const activeDrag = drag;

    function onPointerMove(event: PointerEvent) {
      const next = Math.max(
        MIN_COLUMN_WIDTH,
        activeDrag.startWidth + (event.clientX - activeDrag.startX)
      );
      setColumnWidths((prev) => {
        const updated = { ...prev, [activeDrag.key]: Math.round(next) };
        persistWidths(updated);
        return updated;
      });
    }

    function onPointerUp() {
      setDrag(null);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [drag]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const exportLabel = debouncedSearch.trim() || "SAP_History";
  const rangeStart = total === 0 ? 0 : page * pageSize + 1;
  const rangeEnd = Math.min((page + 1) * pageSize, total);

  function resetToFirstPage() {
    setPage(0);
  }

  function handleSearchNow() {
    // Flush the debounce immediately when the Search button is pressed.
    setDebouncedSearch(search);
    resetToFirstPage();
  }

  function handleReset() {
    setSearch("");
    setDebouncedSearch("");
    setFrom("");
    setTo("");
    setMovementType("");
    setSloc("");
    resetToFirstPage();
  }

  async function fetchFullResultSet(): Promise<SapDocument[]> {
    const result = await getSapHistoryPage({
      filters: {
        from: from || null,
        to: to || null,
        movementType: movementType || null,
        storageLocation: sloc || null,
      },
      search: debouncedSearch,
      page: 0,
      pageSize: EXPORT_LIMIT,
    });
    return result.docs;
  }

  async function handleExportExcel() {
    if (exporting) return;
    setExporting(true);
    try {
      const all = await fetchFullResultSet();
      if (all.length === 0) {
        showSnackbar("Nothing to export.", "warning");
        return;
      }
      downloadExcel(all, exportLabel);
      showSnackbar(`${all.length} movements exported.`, "success");
    } catch {
      showSnackbar("Excel export failed.", "error");
    } finally {
      setExporting(false);
    }
  }

  async function handleExportPdf() {
    if (exporting) return;
    setExporting(true);
    try {
      const all = await fetchFullResultSet();
      if (all.length === 0) {
        showSnackbar("Nothing to export.", "warning");
        return;
      }
      downloadPdf(all, exportLabel);
      showSnackbar(`${all.length} movements exported.`, "success");
    } catch {
      showSnackbar("PDF export failed.", "error");
    } finally {
      setExporting(false);
    }
  }

  const toolbarFieldSx = {
    "& .MuiOutlinedInput-root": { height: 56, borderRadius: "10px" },
    "& .MuiOutlinedInput-notchedOutline": { borderColor: C.border },
  };

  const actionButtonSx = {
    height: 48,
    borderRadius: "10px",
    border: `1px solid ${C.border}`,
    bgcolor: "#FFFFFF",
    color: C.navy,
    textTransform: "none",
    fontWeight: 600,
    px: 2.5,
    boxShadow: "none",
    "&:hover": { bgcolor: C.headerBg },
  };

  return (
    <Box sx={{ bgcolor: "#FFFFFF", px: { xs: 1.5, sm: 3 }, py: 2.5, pb: 4 }}>
      {/* A. Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 1.5,
        }}
      >
        <Box>
          <Typography sx={{ fontSize: "30px", fontWeight: 700, color: C.navy, lineHeight: 1.2 }}>
            SAP Material History
          </Typography>
          <Typography sx={{ fontSize: "15px", color: C.slate, mt: 0.25 }}>
            MB51 movements imported from SAP
          </Typography>
        </Box>

        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
          <Button
            onClick={handleExportExcel}
            disabled={exporting || !docs || docs.length === 0}
            startIcon={<GridOnOutlinedIcon sx={{ color: C.green }} />}
            sx={{ ...actionButtonSx, color: C.green }}
          >
            Export Excel
          </Button>
          <Button
            onClick={handleExportPdf}
            disabled={exporting || !docs || docs.length === 0}
            startIcon={<PictureAsPdfOutlinedIcon sx={{ color: C.red }} />}
            sx={{ ...actionButtonSx, color: C.red }}
          >
            Export PDF
          </Button>
          <Button
            onClick={(event) => setFiltersAnchor(event.currentTarget)}
            startIcon={<FilterAltOutlinedIcon sx={{ color: C.primary }} />}
            endIcon={<ExpandMoreIcon />}
            sx={actionButtonSx}
          >
            Filters
          </Button>
        </Box>
      </Box>

      {/* B. Divider */}
      <Divider sx={{ borderColor: C.border, my: 2 }} />

      {/* C. Search / filter toolbar */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 1.25,
          mb: 1.5,
        }}
      >
        <TextField
          size="small"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            resetToFirstPage();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleSearchNow();
          }}
          placeholder="Search material code, description, doc, PO, vendor, invoice, user..."
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" sx={{ color: C.primary }} />
                </InputAdornment>
              ),
            },
            htmlInput: { sx: { fontSize: 14.5, "&::placeholder": { color: C.slate, opacity: 1 } } },
          }}
          sx={{
            flexGrow: 1,
            flexBasis: 380,
            minWidth: 240,
            "& .MuiOutlinedInput-root": { height: 56, borderRadius: "10px" },
            "& .MuiOutlinedInput-notchedOutline": { borderColor: C.border },
          }}
        />
        <TextField
          label="From Date"
          type="date"
          size="small"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            resetToFirstPage();
          }}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{
            flexBasis: "19%",
            minWidth: 170,
            ...toolbarFieldSx,
          }}
        />
        <TextField
          label="To Date"
          type="date"
          size="small"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            resetToFirstPage();
          }}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{
            flexBasis: "19%",
            minWidth: 170,
            ...toolbarFieldSx,
          }}
        />
        <Button
          onClick={handleSearchNow}
          startIcon={<SearchIcon />}
          sx={{
            height: 56,
            width: 135,
            borderRadius: "10px",
            bgcolor: C.primary,
            color: "#FFFFFF",
            textTransform: "none",
            fontWeight: 600,
            boxShadow: "none",
            "&:hover": { bgcolor: "#1D4ED8" },
          }}
        >
          Search
        </Button>
        <Button
          onClick={handleReset}
          startIcon={<ReplayOutlinedIcon sx={{ color: C.primary }} />}
          sx={{
            height: 56,
            borderRadius: "10px",
            border: `1px solid ${C.border}`,
            bgcolor: "#FFFFFF",
            color: C.navy,
            textTransform: "none",
            fontWeight: 600,
            px: 2.5,
            boxShadow: "none",
            "&:hover": { bgcolor: C.headerBg },
          }}
        >
          Reset
        </Button>
      </Box>

      {/* Filters popover (movement type / storage location) */}
      <Popover
        open={Boolean(filtersAnchor)}
        anchorEl={filtersAnchor}
        onClose={() => setFiltersAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { p: 1.5, mt: 0.5, borderRadius: "10px", minWidth: 220 } } }}
      >
        <TextField
          select
          label="Movement type"
          size="small"
          fullWidth
          value={movementType}
          onChange={(e) => {
            setMovementType(e.target.value);
            resetToFirstPage();
          }}
          sx={{ mb: 1.5 }}
        >
          <MenuItem value="">All</MenuItem>
          {movementTypes.map((m) => (
            <MenuItem key={m} value={m}>
              {m} - {getMovementTypeDescription(m)}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Storage location"
          size="small"
          fullWidth
          value={sloc}
          onChange={(e) => {
            setSloc(e.target.value);
            resetToFirstPage();
          }}
        >
          <MenuItem value="">All</MenuItem>
          {slocs.map((s) => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </TextField>
      </Popover>

      {loadError && (
        <Alert severity="error" sx={{ mb: 1.5, borderRadius: 2 }}>
          Could not load SAP history: {loadError}. If this just appeared, run
          migration{" "}
          <strong>0011_sap_read_views.sql</strong> in the Supabase SQL Editor.
        </Alert>
      )}

      {/* D. Data table */}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : total === 0 ? (
        <Paper
          elevation={0}
          sx={{ p: 3, borderRadius: "10px", border: `1px solid ${C.border}`, textAlign: "center" }}
        >
          <Typography color="text.secondary">
            {!loadError
              ? debouncedSearch.trim() || from || to || movementType || sloc
                ? "No movements match the search or filters."
                : "No SAP movements yet. Import the MB51 sheet from Inventory → Stock Update."
              : "Nothing to show."}
          </Typography>
        </Paper>
      ) : (
        <Paper
          elevation={0}
          sx={{
            borderRadius: "10px",
            border: `1px solid ${C.border}`,
            overflow: "hidden",
            userSelect: drag ? "none" : undefined,
            // Keep the resize cursor while a drag is in progress, even
            // when the pointer briefly leaves the handle.
            cursor: drag ? "col-resize" : undefined,
          }}
        >
          <TableContainer sx={{ maxHeight: 620, overflowX: "auto" }}>
            <Table
              size="small"
              stickyHeader
              sx={{
                // Desktop: fixed layout at 100% width using the user's
                // per-column pixel widths. When the combined widths fit
                // the viewport the table fills it (leftover space is
                // spread proportionally, so no gap); when they don't, the
                // table overflows and the container scrolls horizontally.
                // Small screens keep the old auto layout + scroll.
                width: "100%",
                minWidth: { xs: 900, md: totalWidth },
                tableLayout: { xs: "auto", md: "fixed" },
              }}
            >
              <TableHead>
                <TableRow>
                  {COLUMNS.map((column) => (
                    <TableCell
                      key={column.key}
                      align={column.align}
                      sx={{
                        width: columnWidth(column.key),
                        position: "relative",
                        bgcolor: C.headerBg,
                        color: C.headerText,
                        fontWeight: 600,
                        fontSize: "13px",
                        borderBottom: `1px solid ${C.border}`,
                        py: 1.25,
                        px: 1.5,
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 0.5,
                          justifyContent: column.align === "right" ? "flex-end" : "flex-start",
                          pr: 0.5,
                        }}
                      >
                        <Box sx={{ display: "flex", alignItems: "center", fontSize: "17px" }}>
                          {column.icon}
                        </Box>
                        {column.label}
                      </Box>
                      {/* Column width adjuster: drag to resize this column,
                          double-click to restore its default width. The
                          vertical divider is always visible so the grab
                          point is obvious; it turns blue on hover/drag. */}
                      <Box
                        component="span"
                        onPointerDown={(event) => startResize(column.key, event)}
                        onDoubleClick={() => resetColumnWidth(column.key)}
                        title="Drag to resize · Double-click to restore default width"
                        sx={{
                          position: "absolute",
                          top: 0,
                          right: -6,
                          width: 12,
                          height: "100%",
                          cursor: "col-resize",
                          touchAction: "none",
                          zIndex: 2,
                          "&::after": {
                            content: '""',
                            position: "absolute",
                            top: 0,
                            bottom: 0,
                            left: "50%",
                            transform: "translateX(-50%)",
                            width: 2,
                            borderRadius: 1,
                            bgcolor:
                              drag?.key === column.key
                                ? C.primary
                                : "#CBD5E1",
                            transition:
                              "background-color 0.15s ease, width 0.15s ease",
                          },
                          "&:hover::after": { bgcolor: C.primary, width: 3 },
                        }}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {docs.map((row) => {
                  const badge = movementBadgeColors(row.movement_type);
                  const label = movementLabel(row);
                  return (
                    <TableRow
                      key={row.id}
                      hover
                      sx={{
                        height: 46,
                        "& td": {
                          borderBottom: `1px solid ${C.border}`,
                          fontSize: "13px",
                          py: 0.5,
                          px: 1.5,
                        },
                        "&:last-child td": { borderBottom: "none" },
                      }}
                    >
                      <TableCell
                        sx={{
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          color: C.navy,
                        }}
                      >
                        {formatPostingDate(row.posting_date)}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap", color: C.primary, fontWeight: 600 }}>
                        {row.material_code}
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          noWrap
                          title={row.material_description ?? ""}
                          sx={{ fontSize: "13px", color: C.navy }}
                        >
                          {row.material_description || "—"}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        <Box
                          sx={{
                            display: "inline-block",
                            bgcolor: badge.bg,
                            color: badge.fg,
                            borderRadius: "8px",
                            px: 1,
                            py: 0.5,
                            fontSize: "12px",
                            fontWeight: 600,
                            maxWidth: "100%",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            verticalAlign: "middle",
                          }}
                          title={label}
                        >
                          {label}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap", color: row.storage_location ? C.navy : C.slate }}>
                        {row.storage_location || "—"}
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          whiteSpace: "nowrap",
                          fontWeight: 600,
                          color: row.quantity < 0 ? C.red : C.green,
                        }}
                      >
                        {row.quantity > 0 ? "+" : ""}
                        {row.quantity}
                      </TableCell>
                      <TableCell
                        sx={{
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          color: C.navy,
                        }}
                      >
                        {row.material_document ?? "—"}
                        {row.material_doc_item ? ` / ${row.material_doc_item}` : ""}
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          noWrap
                          title={row.document_header_text ?? ""}
                          sx={{ fontSize: "13px", color: row.document_header_text ? C.navy : C.slate }}
                        >
                          {row.document_header_text || "—"}
                        </Typography>
                      </TableCell>
                      <TableCell
                        sx={{
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          color: row.purchase_order ? C.navy : C.slate,
                        }}
                      >
                        {row.purchase_order || "—"}
                      </TableCell>
                      <TableCell
                        sx={{
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          color: row.vendor ? C.navy : C.slate,
                        }}
                      >
                        {row.vendor || "—"}
                      </TableCell>
                      <TableCell
                        sx={{
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          color: row.invoice_number ? C.navy : C.slate,
                        }}
                      >
                        {row.invoice_number || "—"}
                      </TableCell>
                      <TableCell
                        sx={{
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          color: C.navy,
                        }}
                      >
                        {row.user_name || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          {/* E. Pagination footer */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 1,
              px: 2,
              py: 1,
              borderTop: `1px solid ${C.border}`,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.5 }}>
              <Typography sx={{ fontSize: "13px", color: C.slate }}>Total Records:</Typography>
              <Typography sx={{ fontSize: "13px", fontWeight: 600, color: C.navy }}>
                {total.toLocaleString("en-US")}
              </Typography>
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
              <Typography sx={{ fontSize: "13px", color: C.slate }}>Rows per page:</Typography>
              <Select
                size="small"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(0);
                }}
                sx={{
                  height: 32,
                  fontSize: "13px",
                  borderRadius: "8px",
                  "& .MuiOutlinedInput-notchedOutline": { borderColor: C.border },
                }}
              >
                {ROWS_PER_PAGE_OPTIONS.map((option) => (
                  <MenuItem key={option} value={option}>
                    {option}
                  </MenuItem>
                ))}
              </Select>
              <Typography sx={{ fontSize: "13px", color: C.slate, whiteSpace: "nowrap" }}>
                {rangeStart}–{rangeEnd.toLocaleString("en-US")} of{" "}
                {total.toLocaleString("en-US")}
              </Typography>

              <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
                <IconButton
                  size="small"
                  aria-label="First page"
                  disabled={page === 0}
                  onClick={() => setPage(0)}
                  sx={{ color: C.slate }}
                >
                  <FirstPageIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  aria-label="Previous page"
                  disabled={page === 0}
                  onClick={() => setPage(Math.max(0, page - 1))}
                  sx={{ color: C.slate }}
                >
                  <KeyboardArrowLeftIcon fontSize="small" />
                </IconButton>

                {visiblePages(page + 1, pageCount).map((entry, index) =>
                  entry === "…" ? (
                    <Typography key={`gap-${index}`} sx={{ px: 0.5, color: C.slate, fontSize: "13px" }}>
                      …
                    </Typography>
                  ) : (
                    <Box
                      key={entry}
                      component="button"
                      type="button"
                      onClick={() => setPage(entry - 1)}
                      aria-label={`Go to page ${entry}`}
                      sx={{
                        minWidth: 32,
                        height: 32,
                        px: 0.5,
                        border: "none",
                        borderRadius: "8px",
                        cursor: "pointer",
                        fontSize: "13px",
                        fontWeight: 600,
                        fontFamily: "inherit",
                        bgcolor: entry === page + 1 ? C.primary : "transparent",
                        color: entry === page + 1 ? "#FFFFFF" : C.navy,
                        "&:hover": {
                          bgcolor: entry === page + 1 ? C.primary : C.headerBg,
                        },
                      }}
                    >
                      {entry}
                    </Box>
                  )
                )}

                <IconButton
                  size="small"
                  aria-label="Next page"
                  disabled={page >= pageCount - 1}
                  onClick={() => setPage(Math.min(pageCount - 1, page + 1))}
                  sx={{ color: C.slate }}
                >
                  <KeyboardArrowRightIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  aria-label="Last page"
                  disabled={page >= pageCount - 1}
                  onClick={() => setPage(pageCount - 1)}
                  sx={{ color: C.slate }}
                >
                  <LastPageIcon fontSize="small" />
                </IconButton>
              </Box>
            </Box>
          </Box>
        </Paper>
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
