import { useCallback, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  Paper,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";

import DownloadIcon from "@mui/icons-material/Download";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import SearchIcon from "@mui/icons-material/Search";

import { useSearchParams } from "react-router-dom";

import MaterialSearch from "../components/MaterialSearch";
import {
  getSapDistinctValues,
  getSapHistoryPage,
  type SapDocument,
} from "../services/sapHistoryService";
import { getMovementTypeDescription } from "../utils/sapMovementTypes";
import type { Material } from "../types/material";

type SnackbarSeverity = "success" | "error" | "warning" | "info";

const ROWS_PER_PAGE_OPTIONS = [25, 50, 100];
/** Rows fetched at once when the user exports Excel / PDF. */
const EXPORT_LIMIT = 50000;

function movementLabel(row: SapDocument): string {
  if (!row.movement_type) return "Movement";
  const description = getMovementTypeDescription(row.movement_type);
  return description
    ? `${row.movement_type} - ${description}`
    : `Mvt ${row.movement_type}`;
}

function downloadExcel(
  docs: SapDocument[],
  materialLabel: string
): void {
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

  const safeName = materialLabel.replace(/[^a-zA-Z0-9_-]/g, "_") || "SAP_History";
  XLSX.writeFile(wb, `${safeName}_SAP_History.xlsx`);
}

function downloadPdf(docs: SapDocument[], materialLabel: string): void {
  const doc = new jsPDF({ orientation: "landscape" });

  doc.setFontSize(12);
  doc.text(`SAP Material History - ${materialLabel}`, 14, 12);

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

  const safeName = materialLabel.replace(/[^a-zA-Z0-9_-]/g, "_") || "SAP_History";
  doc.save(`${safeName}_SAP_History.pdf`);
}

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
  // the material picker from the URL on first mount.
  const initialCode = searchParams.get("material");
  const [material, setMaterial] = useState<Material | null>(() =>
    initialCode
      ? ({ material_code: initialCode, short_description: "", uom: "" } as Material)
      : null
  );
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [movementType, setMovementType] = useState("");
  const [sloc, setSloc] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [docs, setDocs] = useState<SapDocument[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [movementTypes, setMovementTypes] = useState<string[]>([]);
  const [slocs, setSlocs] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  // The filter combination whose data currently lives in `docs` - loading
  // is derived from it so the effect below only calls setState inside
  // async callbacks.
  const [loadedForKey, setLoadedForKey] = useState<string | null>(null);

  const materialCode = material?.material_code ?? null;
  const filterKey = `${materialCode ?? ""}|${from}|${to}|${movementType}|${sloc}|${debouncedSearch}|${page}|${pageSize}`;
  const loading = docs === null || loadedForKey !== filterKey;

  // Debounce the free-text search so we don't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    return getSapHistoryPage({
      materialCode,
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
  }, [materialCode, from, to, movementType, sloc, debouncedSearch, page, pageSize]);

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

  // Dropdown lists for the movement-type / storage-location filters -
  // scoped to the selected material (or all materials in browse mode).
  useEffect(() => {
    let cancelled = false;
    getSapDistinctValues("movement_type", materialCode).then((values) => {
      if (!cancelled) setMovementTypes(values);
    });
    getSapDistinctValues("storage_location", materialCode).then((values) => {
      if (!cancelled) setSlocs(values);
    });
    return () => {
      cancelled = true;
    };
  }, [materialCode]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  function resetFilters(next: Partial<{ page: number }> = {}) {
    setPage(next.page ?? 0);
  }

  function handleMaterialChange(next: Material | null) {
    setMaterial(next);
    resetFilters();
  }

  async function fetchFullResultSet(): Promise<SapDocument[]> {
    const result = await getSapHistoryPage({
      materialCode,
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
      downloadExcel(all, materialCode ?? "Recent");
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
      downloadPdf(all, materialCode ?? "Recent");
      showSnackbar(`${all.length} movements exported.`, "success");
    } catch {
      showSnackbar("PDF export failed.", "error");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Box sx={{ pb: 3 }}>
      <Typography
        sx={{ mb: 0.5, fontWeight: 700, fontSize: { xs: "1.05rem", sm: "1.25rem" } }}
      >
        SAP Material History
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        MB51 movements imported from SAP. Pick a material to see its full
        timeline, or browse the most recent movements across all materials.
        Search looks through the whole dataset - material code, document,
        description, PO, vendor and more.
      </Typography>

      <Paper
        elevation={0}
        sx={{ p: 1.5, borderRadius: 2, boxShadow: "0 2px 10px rgba(15,23,42,0.06)", mb: 1.5 }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <MaterialSearch value={material} onChange={handleMaterialChange} />

          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            <TextField
              label="Search all data"
              size="small"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                resetFilters();
              }}
              placeholder="Material, document, PO, vendor…"
              slotProps={{ input: { startAdornment: <SearchIcon fontSize="small" sx={{ mr: 0.5, color: "text.secondary" }} /> } }}
              sx={{ flexGrow: 1, minWidth: 220, "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            />
            <TextField
              label="From"
              type="date"
              size="small"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                resetFilters();
              }}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            />
            <TextField
              label="To"
              type="date"
              size="small"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                resetFilters();
              }}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            />
            <TextField
              select
              label="Movement type"
              size="small"
              value={movementType}
              onChange={(e) => {
                setMovementType(e.target.value);
                resetFilters();
              }}
              sx={{ minWidth: 180, "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
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
              value={sloc}
              onChange={(e) => {
                setSloc(e.target.value);
                resetFilters();
              }}
              sx={{ minWidth: 140, "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            >
              <MenuItem value="">All</MenuItem>
              {slocs.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </TextField>
            <Box sx={{ flexGrow: 1 }} />
            <Button
              size="small"
              variant="outlined"
              startIcon={<DownloadIcon fontSize="small" />}
              onClick={handleExportExcel}
              disabled={exporting || !docs || docs.length === 0}
              sx={{ borderRadius: 2, fontWeight: 600 }}
            >
              Excel
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<PictureAsPdfIcon fontSize="small" />}
              onClick={handleExportPdf}
              disabled={exporting || !docs || docs.length === 0}
              sx={{ borderRadius: 2, fontWeight: 600 }}
            >
              PDF
            </Button>
          </Box>
        </Box>
      </Paper>

      {loadError && (
        <Alert severity="error" sx={{ mb: 1.5, borderRadius: 2 }}>
          Could not load SAP history: {loadError}. If this just appeared, run
          migration{" "}
          <strong>0011_sap_read_views.sql</strong> in the Supabase SQL Editor.
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : total === 0 ? (
        <Paper elevation={0} sx={{ p: 3, borderRadius: 2, textAlign: "center" }}>
          <Typography color="text.secondary">
            {!loadError
              ? debouncedSearch.trim() || from || to || movementType || sloc
                ? "No movements match the filters."
                : materialCode
                  ? "No SAP history for this material yet. Import the MB51 sheet from Inventory → Stock Update."
                  : "No SAP movements yet. Import the MB51 sheet from Inventory → Stock Update."
              : "Nothing to show."}
          </Typography>
        </Paper>
      ) : (
        <Paper
          elevation={0}
          sx={{ borderRadius: 2, boxShadow: "0 2px 10px rgba(15,23,42,0.06)", overflow: "hidden" }}
        >
          <TableContainer sx={{ maxHeight: 560 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Posting Date</TableCell>
                  <TableCell>Movement</TableCell>
                  <TableCell>Material</TableCell>
                  <TableCell>SLoc</TableCell>
                  <TableCell align="right">Qty</TableCell>
                  <TableCell align="right">Balance</TableCell>
                  <TableCell>Doc</TableCell>
                  <TableCell>Doc Header Text</TableCell>
                  <TableCell>PO</TableCell>
                  <TableCell>Vendor / Invoice / User</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {docs.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {row.posting_date ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={movementLabel(row)}
                        title={movementLabel(row)}
                        sx={{ maxWidth: 200 }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{row.material_code}</TableCell>
                    <TableCell>{row.storage_location || "—"}</TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        fontWeight: 800,
                        color: row.quantity < 0 ? "error.main" : "success.main",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.quantity > 0 ? "+" : ""}
                      {row.quantity}
                    </TableCell>
                    <TableCell align="right">{row.running_balance}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {row.material_document ?? "—"}
                      {row.material_doc_item ? ` / ${row.material_doc_item}` : ""}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 160 }}>
                      <Typography variant="body2" noWrap title={row.document_header_text ?? ""}>
                        {row.document_header_text || "—"}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {row.purchase_order || "—"}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 180 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }} noWrap>
                        {[row.vendor, row.invoice_number, row.user_name]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              flexWrap: "wrap",
              gap: 1,
              px: 1,
            }}
          >
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
              sx={{ width: 90, "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            />
            <TablePagination
              component="div"
              count={total}
              page={page}
              rowsPerPage={pageSize}
              rowsPerPageOptions={ROWS_PER_PAGE_OPTIONS}
              onPageChange={(_event, newPage) => setPage(newPage)}
              onRowsPerPageChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(0);
              }}
              showFirstButton
              showLastButton
            />
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
