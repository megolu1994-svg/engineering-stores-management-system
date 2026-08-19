import { useCallback, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  Menu,
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
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";

import GridOnOutlinedIcon from "@mui/icons-material/GridOnOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SearchIcon from "@mui/icons-material/Search";
import ReplayOutlinedIcon from "@mui/icons-material/ReplayOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import HistoryIcon from "@mui/icons-material/History";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import FirstPageIcon from "@mui/icons-material/FirstPage";
import KeyboardArrowLeftIcon from "@mui/icons-material/KeyboardArrowLeft";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import LastPageIcon from "@mui/icons-material/LastPage";
import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";

import { useNavigate } from "react-router-dom";

import {
  getOpenSapReviewCount,
  getSapStockPage,
  getSapStorageLocations,
  type SapStockReview,
  type SapStockRow,
} from "../services/sapHistoryService";
import SapReviewDialog from "../components/SapReviewDialog";

type SnackbarSeverity = "success" | "error" | "warning" | "info";

const ROWS_PER_PAGE_OPTIONS = [25, 50, 100];
/** Rows fetched at once when the user exports Excel / PDF. */
const EXPORT_LIMIT = 50000;

/* ------------------------------------------------------------------ */
/* Reference palette (teal/green enterprise, no purple)                */
/* ------------------------------------------------------------------ */

const C = {
  teal: "#0D9488",
  tealDark: "#0F766E",
  tealBg: "#F0FDFA",
  tealBorder: "#99F6E4",
  navy: "#172554",
  slate: "#64748B",
  border: "#E2E8F0",
  headerBg: "#F8FAFC",
  blue: "#1D4ED8",
  blueBg: "#DBEAFE",
  green: "#15803D",
  orange: "#EA580C",
  orangeBorder: "#FED7AA",
  orangeBg: "#FFF7ED",
  red: "#DC2626",
  redBg: "#FEE2E2",
};

/* ------------------------------------------------------------------ */
/* Presentation helpers                                                */
/* ------------------------------------------------------------------ */

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_") || "SAP_Stock";
}

/* ------------------------------------------------------------------ */
/* Mobile stock card (below the `sm` breakpoint only)                  */
/* ------------------------------------------------------------------ */

function MobileStockCard({
  row,
  onReview,
  onHistory,
}: {
  row: SapStockRow;
  onReview: () => void;
  onHistory: () => void;
}) {
  const hasReview = Boolean(row.review);

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: "12px",
        border: `1px solid ${C.border}`,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        overflow: "hidden",
        width: "100%",
      }}
    >
      <Box sx={{ p: 1.25 }}>
        {/* Row 1: Material code + Total Stock */}
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: 0.25 }}>
          <Typography
            sx={{ fontSize: "16px", fontWeight: 700, color: C.teal, wordBreak: "break-word" }}
          >
            {row.material_code}
          </Typography>
          <Box
            sx={{
              flexShrink: 0,
              bgcolor: C.headerBg,
              border: `1px solid ${C.border}`,
              borderRadius: "8px",
              px: 1,
              py: 0.35,
              textAlign: "center",
            }}
          >
            <Typography sx={{ fontSize: "15px", fontWeight: 800, color: C.navy, lineHeight: 1.2 }}>
              {row.total}
            </Typography>
            {row.uom ? (
              <Typography sx={{ fontSize: "10px", color: C.slate, fontWeight: 500, lineHeight: 1.2 }}>
                {row.uom}
              </Typography>
            ) : null}
          </Box>
        </Box>

        {/* Row 2: Description (2-line clamp) */}
        {row.short_description ? (
          <Typography
            sx={{
              fontSize: "13px",
              color: C.navy,
              lineHeight: 1.35,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              mb: 0.75,
            }}
          >
            {row.short_description}
          </Typography>
        ) : null}

        {/* Row 3: SLoc pills */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap", mb: 0.75 }}>
          {row.locations.length === 0 ? (
            <Typography sx={{ fontSize: "12px", color: C.slate }}>No SLoc data</Typography>
          ) : (
            row.locations.map((loc) => (
              <Box
                key={loc.storage_location}
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0.4,
                  bgcolor: C.tealBg,
                  color: C.tealDark,
                  border: `1px solid ${C.tealBorder}`,
                  borderRadius: "6px",
                  px: 0.85,
                  py: 0.3,
                  fontSize: "11px",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                <LocationOnOutlinedIcon sx={{ fontSize: 12 }} />
                {loc.storage_location}: {loc.quantity}
              </Box>
            ))
          )}
        </Box>

        {/* Row 4: Status badge */}
        <Box sx={{ mb: 0.75 }}>
          <StatusBadge row={row} />
        </Box>

        {/* Row 5: Action buttons */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          {hasReview ? (
            <Button
              size="small"
              variant="outlined"
              startIcon={<VisibilityOutlinedIcon sx={{ fontSize: 16 }} />}
              onClick={onReview}
              sx={{
                flex: 1,
                textTransform: "none",
                color: C.tealDark,
                borderColor: C.tealBorder,
                bgcolor: C.tealBg,
                borderRadius: "8px",
                fontWeight: 600,
                py: 0.75,
                "&:hover": { bgcolor: "#CCFBF1", borderColor: "#2DD4BF" },
              }}
            >
              Review
            </Button>
          ) : null}
          <Button
            size="small"
            variant="outlined"
            startIcon={<HistoryIcon sx={{ fontSize: 16 }} />}
            onClick={onHistory}
            sx={{
              flex: 1,
              textTransform: "none",
              color: C.navy,
              borderColor: C.border,
              bgcolor: "#FFFFFF",
              borderRadius: "8px",
              fontWeight: 600,
              py: 0.75,
              "&:hover": { bgcolor: C.headerBg },
            }}
          >
            History
          </Button>
        </Box>
      </Box>
    </Paper>
  );
}

/* ------------------------------------------------------------------ */
/* Status badge                                                        */
/* ------------------------------------------------------------------ */

/** Compact status text for a row (exports + status badge). */
function statusText(row: SapStockRow): string {
  if (!row.hasSapData && row.review) return "No SAP stock";
  if (!row.review) return "✓ Match";
  const diff = row.review.difference;
  return diff > 0 ? `App ${diff} below SAP` : `App ${-diff} above SAP`;
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
/* Exports (reuse the app's existing xlsx / jsPDF setup)               */
/* ------------------------------------------------------------------ */

function downloadExcel(rows: SapStockRow[], label: string): void {
  const header = [
    "Material",
    "Description",
    "UoM",
    "Storage Location (SLoc)",
    "Total Stock",
    "Status",
  ];

  const body = rows.map((row) => [
    row.material_code,
    row.short_description,
    row.uom,
    row.locations.map((l) => `${l.storage_location}: ${l.quantity}`).join(", "),
    row.total,
    statusText(row),
  ]);

  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "SAP Stock");

  XLSX.writeFile(wb, `${safeFileName(label)}_SAP_Stock.xlsx`);
}

function downloadPdf(rows: SapStockRow[], label: string): void {
  const doc = new jsPDF({ orientation: "landscape" });

  doc.setFontSize(12);
  doc.text(`SAP Stock - ${label}`, 14, 12);

  autoTable(doc, {
    startY: 18,
    head: [
      ["Material", "Description", "Storage Location (SLoc)", "Total", "Status"],
    ],
    body: rows.map((row) => [
      row.material_code,
      row.short_description,
      row.locations.map((l) => `${l.storage_location}: ${l.quantity}`).join(", "),
      row.uom ? `${row.total} ${row.uom}` : String(row.total),
      statusText(row),
    ]),
    styles: { fontSize: 7.5 },
    headStyles: { fillColor: [13, 148, 136] },
  });

  doc.save(`${safeFileName(label)}_SAP_Stock.pdf`);
}

/* ------------------------------------------------------------------ */
/* Status badge                                                        */
/* ------------------------------------------------------------------ */

function StatusBadge({ row }: { row: SapStockRow }) {
  if (!row.hasSapData && row.review) {
    return (
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.5,
          bgcolor: C.orangeBg,
          color: C.orange,
          borderRadius: "8px",
          px: 1,
          py: 0.5,
          fontSize: "12px",
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        <WarningAmberIcon sx={{ fontSize: 14 }} />
        No SAP stock
      </Box>
    );
  }

  if (!row.review) {
    return (
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.5,
          bgcolor: C.tealBg,
          color: C.tealDark,
          borderRadius: "8px",
          px: 1,
          py: 0.5,
          fontSize: "12px",
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        ✓ Match
      </Box>
    );
  }

  const diff = row.review.difference;
  const below = diff > 0; // App below SAP
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        bgcolor: below ? C.blueBg : C.redBg,
        color: below ? C.blue : C.red,
        borderRadius: "8px",
        px: 1,
        py: 0.5,
        fontSize: "12px",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      <WarningAmberIcon sx={{ fontSize: 14 }} />
      App {Math.abs(diff)} {below ? "below" : "above"} SAP
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

export default function SapStock() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  /** SAP History: open in a new tab on desktop, keep in-app nav on mobile. */
  const openSapHistory = (code: string) => {
    const url = `/sap-history?material=${code}`;
    if (isMobile) {
      navigate(url);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const [rows, setRows] = useState<SapStockRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [slocFilter, setSlocFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("diff");
  const [allSlocs, setAllSlocs] = useState<string[]>([]);
  const [openReviewCount, setOpenReviewCount] = useState(0);
  const [review, setReview] = useState<SapStockReview | null>(null);
  const [filtersAnchor, setFiltersAnchor] = useState<HTMLElement | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{
    element: HTMLElement;
    row: SapStockRow;
  } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: SnackbarSeverity;
  }>({ open: false, message: "", severity: "info" });

  function showSnackbar(message: string, severity: SnackbarSeverity) {
    setSnackbar({ open: true, message, severity });
  }

  // Debounce the free-text search so we don't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    getSapStorageLocations().then(setAllSlocs).catch(() => setAllSlocs([]));
  }, []);

  useEffect(() => {
    getOpenSapReviewCount().then(setOpenReviewCount).catch(() => setOpenReviewCount(0));
  }, []);

  const load = useCallback(() => {
    getSapStockPage({
      query: debouncedQuery,
      storageLocation: slocFilter || undefined,
      status: statusFilter as "all" | "diff" | "match",
      page,
      pageSize,
    })
      .then((result) => {
        setRows(result.rows);
        setTotal(result.total);
        setLoadError(result.error);
      })
      .catch(() => {
        setRows([]);
        setTotal(0);
        setLoadError("Could not load SAP stock.");
      });
  }, [debouncedQuery, slocFilter, statusFilter, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : page * pageSize + 1;
  const rangeEnd = Math.min((page + 1) * pageSize, total);
  const exportLabel = debouncedQuery.trim() || "SAP_Stock";

  function handleQueryChange(value: string) {
    setQuery(value);
    setPage(0);
  }

  function handleSlocChange(value: string) {
    setSlocFilter(value);
    setPage(0);
  }

  function handleStatusChange(value: string) {
    setStatusFilter(value);
    setPage(0);
  }

  function handleRowsPerPageChange(next: number) {
    setPageSize(next);
    setPage(0);
  }

  function handleSearchNow() {
    setDebouncedQuery(query);
    setPage(0);
  }

  function handleReset() {
    setQuery("");
    setDebouncedQuery("");
    setSlocFilter("");
    setStatusFilter("diff");
    setPage(0);
  }

  function refreshReviews() {
    getOpenSapReviewCount().then(setOpenReviewCount).catch(() => setOpenReviewCount(0));
  }

  async function fetchFullResultSet(): Promise<SapStockRow[]> {
    const result = await getSapStockPage({
      query: debouncedQuery,
      storageLocation: slocFilter || undefined,
      status: statusFilter as "all" | "diff" | "match",
      page: 0,
      pageSize: EXPORT_LIMIT,
    });
    return result.rows;
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
      showSnackbar(`${all.length} materials exported.`, "success");
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
      showSnackbar(`${all.length} materials exported.`, "success");
    } catch {
      showSnackbar("PDF export failed.", "error");
    } finally {
      setExporting(false);
    }
  }

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
    <Box sx={{ pb: 3 }}>
      {/* Page title + description + action buttons */}
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 1.5,
          mb: 1.5,
        }}
      >
        <Box sx={{ minWidth: 0, maxWidth: 860 }}>
          <Typography
            sx={{
              fontSize: { xs: 24, sm: 30 },
              fontWeight: 700,
              color: C.navy,
              lineHeight: 1.2,
            }}
          >
            SAP Stock
          </Typography>
          <Typography sx={{ fontSize: 14, color: C.slate, mt: 0.5, lineHeight: 1.5 }}>
            SAP storage locations (AFCN · REVN · ESRN ...) are accounting
            buckets per material, imported from MB52. They are read-only
            here - physical stock lives in bins and is reconciled at the
            total level.
          </Typography>
        </Box>

        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, width: { xs: "100%", sm: "auto" } }}>
          <Button
            onClick={handleExportExcel}
            disabled={exporting || !rows || rows.length === 0}
            startIcon={<GridOnOutlinedIcon sx={{ color: C.green }} />}
            sx={{ ...actionButtonSx, color: C.green, flex: { xs: "1 1 0", sm: "0 0 auto" }, minWidth: 0 }}
          >
            Export Excel
          </Button>
          <Button
            onClick={handleExportPdf}
            disabled={exporting || !rows || rows.length === 0}
            startIcon={<PictureAsPdfOutlinedIcon sx={{ color: C.red }} />}
            sx={{ ...actionButtonSx, color: C.red, flex: { xs: "1 1 0", sm: "0 0 auto" }, minWidth: 0 }}
          >
            Export PDF
          </Button>
          <Button
            onClick={(event) => setFiltersAnchor(event.currentTarget)}
            startIcon={<FilterAltOutlinedIcon sx={{ color: C.blue }} />}
            endIcon={<ExpandMoreIcon />}
            sx={{ ...actionButtonSx, flexBasis: { xs: "100%", sm: "auto" } }}
          >
            Filters
          </Button>
        </Box>
      </Box>

      {/* Reconciliation warning banner */}
      {openReviewCount > 0 && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            flexWrap: "wrap",
            bgcolor: C.orangeBg,
            border: `1px solid ${C.orangeBorder}`,
            borderRadius: 2,
            px: 2,
            py: 1.25,
            mb: 2,
          }}
        >
          <WarningAmberIcon sx={{ color: C.orange, fontSize: 22, flexShrink: 0 }} />
          <Typography sx={{ flex: 1, minWidth: 260, fontSize: 13.5, color: "#9A3412" }}>
            <strong>{openReviewCount.toLocaleString("en-US")}</strong> open
            reconciliation review(s) – SAP total differs from app stock.
            Resolve them under Inventory → Adjust.
          </Typography>
          <Button
            variant="contained"
            onClick={() => navigate("/allocation")}
            sx={{
              bgcolor: C.orange,
              color: "#FFFFFF",
              textTransform: "none",
              fontWeight: 600,
              borderRadius: 2,
              px: 2.5,
              boxShadow: "none",
              "&:hover": { bgcolor: "#C2410C" },
            }}
          >
            Adjust tab
          </Button>
        </Box>
      )}

      {loadError && (
        <Alert severity="error" sx={{ mb: 1.5, borderRadius: 2 }}>
          Could not load SAP stock: {loadError}. If this just appeared, run
          migration{" "}
          <strong>0011_sap_read_views.sql</strong> in the Supabase SQL Editor
          (the SAP screens now read from server-side views for fast
          pagination).
        </Alert>
      )}

      {/* Search / filter bar */}
      <Paper
        variant="outlined"
        sx={{ p: { xs: 1.25, sm: 1.5 }, borderRadius: 2, borderColor: C.border, mb: 2 }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: { xs: 1, sm: 1.25 },
          }}
        >
          <TextField
            size="small"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleSearchNow();
            }}
            placeholder="Search material / description"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" sx={{ color: C.teal }} />
                  </InputAdornment>
                ),
              },
              htmlInput: { sx: { fontSize: 14.5, "&::placeholder": { color: C.slate, opacity: 1 } } },
            }}
            sx={{
              flexGrow: 1,
              flexBasis: { xs: "100%", sm: 280 },
              minWidth: { xs: 0, sm: 220 },
              "& .MuiOutlinedInput-root": { height: 52, borderRadius: "10px" },
              "& .MuiOutlinedInput-notchedOutline": { borderColor: C.border },
            }}
          />
          <TextField
            select
            label="Status"
            size="small"
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
            slotProps={{
              select: {
                IconComponent: ExpandMoreIcon,
              },
            }}
            sx={{
              flexBasis: { xs: "100%", sm: 170 },
              minWidth: { xs: 0, sm: 150 },
              flexGrow: { xs: 0, sm: 0 },
              "& .MuiOutlinedInput-root": { height: 52, borderRadius: "10px" },
              "& .MuiOutlinedInput-notchedOutline": { borderColor: C.border },
            }}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="diff">Differences</MenuItem>
            <MenuItem value="match">Matched</MenuItem>
          </TextField>
          <Button
            onClick={handleSearchNow}
            startIcon={<SearchIcon />}
            sx={{
              height: 52,
              width: { xs: "auto", sm: 135 },
              flex: { xs: "1 1 0", sm: "0 0 auto" },
              minWidth: 0,
              borderRadius: "10px",
              bgcolor: C.teal,
              color: "#FFFFFF",
              textTransform: "none",
              fontWeight: 600,
              boxShadow: "none",
              whiteSpace: "nowrap",
              "&:hover": { bgcolor: C.tealDark },
            }}
          >
            Search
          </Button>
          <Button
            onClick={handleReset}
            startIcon={<ReplayOutlinedIcon sx={{ color: C.teal }} />}
            sx={{
              height: 52,
              flex: { xs: "1 1 0", sm: "0 0 auto" },
              minWidth: 0,
              borderRadius: "10px",
              border: `1px solid ${C.border}`,
              bgcolor: "#FFFFFF",
              color: C.navy,
              textTransform: "none",
              fontWeight: 600,
              px: 2.5,
              boxShadow: "none",
              whiteSpace: "nowrap",
              "&:hover": { bgcolor: C.headerBg },
            }}
          >
            Reset
          </Button>
        </Box>
      </Paper>

      {/* Filters popover (storage location) */}
      <Popover
        open={Boolean(filtersAnchor)}
        anchorEl={filtersAnchor}
        onClose={() => setFiltersAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { p: 1.5, mt: 0.5, borderRadius: "10px", minWidth: 240 } } }}
      >
        <TextField
          select
          label="Storage location"
          size="small"
          fullWidth
          value={slocFilter}
          onChange={(e) => {
            handleSlocChange(e.target.value);
            setFiltersAnchor(null);
          }}
        >
          <MenuItem value="">All</MenuItem>
          {allSlocs.map((sloc) => (
            <MenuItem key={sloc} value={sloc}>
              {sloc}
            </MenuItem>
          ))}
        </TextField>
      </Popover>

      {/* Table */}
      {rows === null ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : total === 0 ? (
        <Paper
          elevation={0}
          sx={{ p: 3, borderRadius: 2, border: `1px solid ${C.border}`, textAlign: "center" }}
        >
          <Inventory2OutlinedIcon sx={{ fontSize: 40, color: "#CBD5E1", mb: 1 }} />
          <Typography color="text.secondary">
            {!loadError
              ? query.trim() || slocFilter || statusFilter !== "all"
                ? "No materials match the filters."
                : "No SAP stock yet. Import an MB52 snapshot from Inventory → Stock Update."
              : "Nothing to show."}
          </Typography>
        </Paper>
      ) : isMobile ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {/* Mobile: Total records + rows per page */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1,
              flexWrap: "wrap",
            }}
          >
            <Typography sx={{ fontSize: "13px", color: C.slate }}>
              Total Records:{" "}
              <Box component="span" sx={{ fontWeight: 600, color: C.navy }}>
                {total.toLocaleString("en-US")}
              </Box>
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography sx={{ fontSize: "12.5px", color: C.slate }}>Rows per page:</Typography>
              <Select
                size="small"
                value={pageSize}
                onChange={(event) => handleRowsPerPageChange(Number(event.target.value))}
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
            </Box>
          </Box>

          {/* Mobile: card list */}
          {rows.map((row) => (
            <MobileStockCard
              key={row.material_code}
              row={row}
              onReview={() => row.review && setReview(row.review)}
              onHistory={() => openSapHistory(row.material_code)}
            />
          ))}

          {/* Mobile: compact pagination */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 0.25,
              pt: 1,
              pb: 1,
            }}
          >
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
            <Box
              sx={{
                minWidth: 32,
                height: 32,
                px: 0.5,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "8px",
                bgcolor: C.teal,
                color: "#FFFFFF",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              {page + 1}
            </Box>
            <Typography sx={{ px: 0.5, color: C.slate, fontSize: "13px" }}>
              of {pageCount.toLocaleString("en-US")}
            </Typography>
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
      ) : (
        <Paper
          elevation={0}
          sx={{ borderRadius: 2, border: `1px solid ${C.border}`, overflow: "hidden" }}
        >
          <TableContainer sx={{ maxHeight: 620 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {[
                    { label: "Material", align: "left" as const },
                    { label: "Description", align: "left" as const },
                    { label: "Storage Location (SLoc)", align: "left" as const },
                    { label: "Total Stock", align: "right" as const },
                    { label: "Status", align: "left" as const },
                    { label: "Actions", align: "right" as const },
                  ].map((column) => (
                    <TableCell
                      key={column.label}
                      align={column.align}
                      sx={{
                        bgcolor: C.headerBg,
                        color: C.navy,
                        fontWeight: 700,
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
                        }}
                      >
                        {column.label}
                        <UnfoldMoreIcon
                          fontSize="small"
                          sx={{ color: C.slate, fontSize: 15 }}
                        />
                      </Box>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.material_code}
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
                        color: C.teal,
                        fontWeight: 700,
                        fontSize: "13px",
                      }}
                    >
                      {row.material_code}
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        noWrap
                        title={row.short_description}
                        sx={{
                          fontSize: "13px",
                          color: C.navy,
                          maxWidth: { xs: 200, md: 380 },
                        }}
                      >
                        {row.short_description || "—"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                        {row.locations.length === 0 ? (
                          <Typography variant="caption" sx={{ color: C.slate }}>
                            —
                          </Typography>
                        ) : (
                          row.locations.map((loc) => (
                            <Box
                              key={loc.storage_location}
                              sx={{
                                bgcolor: C.tealBg,
                                color: C.tealDark,
                                border: `1px solid ${C.tealBorder}`,
                                borderRadius: "8px",
                                px: 1,
                                py: 0.4,
                                fontSize: "12px",
                                fontWeight: 600,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {loc.storage_location}: {loc.quantity}
                            </Box>
                          ))
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        sx={{
                          fontWeight: 800,
                          fontSize: "15px",
                          color: C.navy,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.total}{" "}
                        {row.uom && (
                          <Box
                            component="span"
                            sx={{ fontSize: "12px", fontWeight: 500, color: C.slate }}
                          >
                            {row.uom}
                          </Box>
                        )}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <StatusBadge row={row} />
                    </TableCell>
                    <TableCell align="right">
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "flex-end",
                          gap: 0.75,
                        }}
                      >
                        {row.review && (
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<VisibilityOutlinedIcon sx={{ fontSize: 16 }} />}
                            onClick={() => setReview(row.review)}
                            sx={{
                              textTransform: "none",
                              color: C.tealDark,
                              borderColor: C.tealBorder,
                              bgcolor: C.tealBg,
                              borderRadius: "8px",
                              fontWeight: 600,
                              "&:hover": {
                                bgcolor: "#CCFBF1",
                                borderColor: "#2DD4BF",
                              },
                            }}
                          >
                            Review
                          </Button>
                        )}
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<HistoryIcon sx={{ fontSize: 16 }} />}
                          onClick={() => openSapHistory(row.material_code)}
                          sx={{
                            textTransform: "none",
                            color: C.navy,
                            borderColor: C.border,
                            bgcolor: "#FFFFFF",
                            borderRadius: "8px",
                            fontWeight: 600,
                            "&:hover": { bgcolor: C.headerBg },
                          }}
                        >
                          History
                        </Button>
                        <Tooltip title="More actions">
                          <IconButton
                            size="small"
                            aria-label="More actions"
                            onClick={(event) =>
                              setMenuAnchor({ element: event.currentTarget, row })
                            }
                            sx={{ color: C.slate }}
                          >
                            <MoreVertIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Row actions menu */}
          <Menu
            anchorEl={menuAnchor?.element ?? null}
            open={Boolean(menuAnchor)}
            onClose={() => setMenuAnchor(null)}
            slotProps={{ paper: { sx: { borderRadius: "10px", minWidth: 160 } } }}
          >
            {menuAnchor?.row.review && (
              <MenuItem
                onClick={() => {
                  setReview(menuAnchor.row.review);
                  setMenuAnchor(null);
                }}
              >
                Review
              </MenuItem>
            )}
            <MenuItem
              onClick={() => {
                if (menuAnchor) openSapHistory(menuAnchor.row.material_code);
                setMenuAnchor(null);
              }}
            >
              SAP History
            </MenuItem>
          </Menu>

          {/* Pagination footer */}
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
              <Typography sx={{ fontSize: "13px", color: C.slate }}>
                Total Records:
              </Typography>
              <Typography sx={{ fontSize: "13px", fontWeight: 600, color: C.navy }}>
                {total.toLocaleString("en-US")}
              </Typography>
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
              <Typography sx={{ fontSize: "13px", color: C.slate }}>Rows per page:</Typography>
              <Select
                size="small"
                value={pageSize}
                onChange={(event) => handleRowsPerPageChange(Number(event.target.value))}
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

              <TextField
                label="Page"
                type="number"
                size="small"
                slotProps={{ htmlInput: { min: 1, max: pageCount } }}
                defaultValue={1}
                key={page}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  const target = event.target as HTMLInputElement;
                  const value = Number(target.value);
                  if (!Number.isInteger(value)) return;
                  setPage(Math.min(pageCount, Math.max(1, value)) - 1);
                }}
                sx={{
                  width: 84,
                  "& .MuiOutlinedInput-root": { borderRadius: "8px" },
                  "& .MuiInputLabel-root": { fontSize: "12px" },
                }}
              />

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
                    <Typography
                      key={`gap-${index}`}
                      sx={{ px: 0.5, color: C.slate, fontSize: "13px" }}
                    >
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
                        bgcolor: entry === page + 1 ? C.teal : "transparent",
                        color: entry === page + 1 ? "#FFFFFF" : C.navy,
                        "&:hover": {
                          bgcolor: entry === page + 1 ? C.teal : C.headerBg,
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

      <SapReviewDialog
        review={review}
        onClose={() => setReview(null)}
        onResolved={() => {
          setReview(null);
          load();
          refreshReviews();
          showSnackbar("Reconciliation updated.", "success");
        }}
        onError={(message) => showSnackbar(message, "error")}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
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
