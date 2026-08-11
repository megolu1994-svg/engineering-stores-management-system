import { useCallback, useEffect, useMemo, useState } from "react";
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
  TableRow,
  TextField,
  Typography,
} from "@mui/material";

import DownloadIcon from "@mui/icons-material/Download";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";

import { useSearchParams } from "react-router-dom";

import MaterialSearch from "../components/MaterialSearch";
import {
  getRecentSapMovements,
  getSapMaterialHistory,
  type SapDocument,
} from "../services/sapHistoryService";
import { getMovementTypeDescription } from "../utils/sapMovementTypes";
import type { Material } from "../types/material";

type SnackbarSeverity = "success" | "error" | "warning" | "info";

const RECENT_LIMIT = 150;
const HISTORY_LIMIT = 500;

function movementLabel(row: SapDocument): string {
  if (!row.movement_type) return "Movement";
  const description = getMovementTypeDescription(row.movement_type);
  return description
    ? `${row.movement_type} - ${description}`
    : `Mvt ${row.movement_type}`;
}

/**
 * Running balance per storage location, keyed by document id: computed
 * from the full (chronological) movement order so each row shows the
 * balance at that point in time.
 */
function computeRunningBalances(docs: SapDocument[]): Map<number, number> {
  const ascending = [...docs].sort(
    (a, b) =>
      (a.posting_date ?? "9999").localeCompare(b.posting_date ?? "9999") ||
      (a.id ?? 0) - (b.id ?? 0)
  );
  const balance = new Map<string, number>();
  const byId = new Map<number, number>();

  for (const doc of ascending) {
    const key = doc.storage_location || "UNALLOCATED";
    const next = (balance.get(key) ?? 0) + doc.quantity;
    balance.set(key, next);
    byId.set(doc.id, next);
  }

  return byId;
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
  const [docs, setDocs] = useState<SapDocument[] | null>(null);
  // The filter combination whose data currently lives in `docs` - loading
  // is derived from it so the effect below only calls setState inside
  // async callbacks.
  const [loadedForKey, setLoadedForKey] = useState<string | null>(null);

  const materialCode = material?.material_code ?? null;
  const filterKey = `${materialCode ?? ""}|${from}|${to}|${movementType}|${sloc}`;
  const loading = docs === null || loadedForKey !== filterKey;

  const load = useCallback(async () => {
    if (materialCode) {
      return getSapMaterialHistory(
        materialCode,
        {
          from: from || null,
          to: to || null,
          movementType: movementType || null,
          storageLocation: sloc || null,
        },
        HISTORY_LIMIT
      );
    }
    return getRecentSapMovements(RECENT_LIMIT);
  }, [materialCode, from, to, movementType, sloc]);

  useEffect(() => {
    let cancelled = false;

    load()
      .then((result) => {
        if (cancelled) return;
        setDocs(result);
        setLoadedForKey(filterKey);
      })
      .catch(() => {
        if (cancelled) return;
        setDocs([]);
        setLoadedForKey(filterKey);
      });

    return () => {
      cancelled = true;
    };
  }, [load, filterKey]);

  const runningBalances = useMemo(
    () => (docs ? computeRunningBalances(docs) : new Map<number, number>()),
    [docs]
  );

  const movementTypes = useMemo(
    () =>
      Array.from(
        new Set(
          (docs ?? [])
            .map((d) => d.movement_type)
            .filter((m): m is string => !!m)
        )
      ).sort(),
    [docs]
  );

  const slocs = useMemo(
    () =>
      Array.from(
        new Set(
          (docs ?? [])
            .map((d) => d.storage_location)
            .filter((s): s is string => !!s)
        )
      ).sort(),
    [docs]
  );

  function handleExportExcel() {
    if (!docs || docs.length === 0) return;
    downloadExcel(docs, materialCode ?? "Recent");
    showSnackbar("Excel exported.", "success");
  }

  function handleExportPdf() {
    if (!docs || docs.length === 0) return;
    downloadPdf(docs, materialCode ?? "Recent");
    showSnackbar("PDF exported.", "success");
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
      </Typography>

      <Paper
        elevation={0}
        sx={{ p: 1.5, borderRadius: 2, boxShadow: "0 2px 10px rgba(15,23,42,0.06)", mb: 1.5 }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <MaterialSearch value={material} onChange={setMaterial} />

          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            <TextField
              label="From"
              type="date"
              size="small"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            />
            <TextField
              label="To"
              type="date"
              size="small"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            />
            <TextField
              select
              label="Movement type"
              size="small"
              value={movementType}
              onChange={(e) => setMovementType(e.target.value)}
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
              onChange={(e) => setSloc(e.target.value)}
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
              disabled={!docs || docs.length === 0}
              sx={{ borderRadius: 2, fontWeight: 600 }}
            >
              Excel
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<PictureAsPdfIcon fontSize="small" />}
              onClick={handleExportPdf}
              disabled={!docs || docs.length === 0}
              sx={{ borderRadius: 2, fontWeight: 600 }}
            >
              PDF
            </Button>
          </Box>
        </Box>
      </Paper>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : (docs ?? []).length === 0 ? (
        <Paper elevation={0} sx={{ p: 3, borderRadius: 2, textAlign: "center" }}>
          <Typography color="text.secondary">
            {materialCode
              ? "No SAP history for this material yet. Import the MB51 sheet from Inventory → Stock Update."
              : "No SAP movements yet. Import the MB51 sheet from Inventory → Stock Update."}
          </Typography>
        </Paper>
      ) : (
        <TableContainer
          component={Paper}
          elevation={0}
          sx={{ borderRadius: 2, boxShadow: "0 2px 10px rgba(15,23,42,0.06)", maxHeight: 560 }}
        >
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
                  <TableCell align="right">
                    {runningBalances.get(row.id) ?? row.quantity}
                  </TableCell>
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
