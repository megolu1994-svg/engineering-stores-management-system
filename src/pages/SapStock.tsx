import { useCallback, useEffect, useState } from "react";

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

import HistoryIcon from "@mui/icons-material/History";
import FactCheckIcon from "@mui/icons-material/FactCheck";

import {
  getSapStockDistribution,
  type SapStockRow,
  type SapStockReview,
} from "../services/sapHistoryService";
import SapReviewDialog from "../components/SapReviewDialog";
import { useNavigate } from "react-router-dom";

type SnackbarSeverity = "success" | "error" | "warning" | "info";

function StatusChip({ row }: { row: SapStockRow }) {
  if (!row.hasSapData && row.review) {
    return <Chip size="small" color="warning" label="No SAP stock" />;
  }
  if (!row.review) {
    return <Chip size="small" color="success" label="✓ Match" />;
  }
  const diff = row.review.difference;
  return (
    <Chip
      size="small"
      color={diff > 0 ? "info" : "error"}
      label={diff > 0 ? `⚠ App ${diff} below SAP` : `⚠ App ${-diff} above SAP`}
    />
  );
}

export default function SapStock() {
  const navigate = useNavigate();

  const [rows, setRows] = useState<SapStockRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [slocFilter, setSlocFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [review, setReview] = useState<SapStockReview | null>(null);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: SnackbarSeverity;
  }>({ open: false, message: "", severity: "info" });

  function showSnackbar(message: string, severity: SnackbarSeverity) {
    setSnackbar({ open: true, message, severity });
  }

  const load = useCallback(() => {
    getSapStockDistribution().then(setRows).catch(() => setRows([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const allSlocs = Array.from(
    new Set((rows ?? []).flatMap((r) => r.locations.map((l) => l.storage_location)))
  ).sort();

  const filtered = (rows ?? []).filter((row) => {
    if (query) {
      const q = query.trim().toLowerCase();
      if (
        !row.material_code.toLowerCase().includes(q) &&
        !row.short_description.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    if (slocFilter && !row.locations.some((l) => l.storage_location === slocFilter)) {
      return false;
    }
    if (statusFilter === "diff" && !row.review) return false;
    if (statusFilter === "match" && row.review) return false;
    return true;
  });

  const openReviews = (rows ?? []).filter((r) => r.review);

  return (
    <Box sx={{ pb: 3 }}>
      <Typography
        sx={{ mb: 0.5, fontWeight: 700, fontSize: { xs: "1.05rem", sm: "1.25rem" } }}
      >
        SAP Stock
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        SAP storage locations (AFCN · REVN · ESRN …) are accounting buckets
        per material, imported from MB52. They are read-only here - physical
        stock lives in bins and is reconciled at the total level.
      </Typography>

      {openReviews.length > 0 && (
        <Alert
          severity="warning"
          sx={{ mb: 1.5, borderRadius: 2, py: 0.5 }}
          action={
            <Button size="small" color="inherit" onClick={() => navigate("/allocation")}>
              Adjust tab
            </Button>
          }
        >
          {openReviews.length} open reconciliation review(s) - SAP total
          differs from app stock. Resolve them under Inventory → Adjust.
        </Alert>
      )}

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 1.5 }}>
        <TextField
          label="Search material / description"
          size="small"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          sx={{ flexGrow: 1, minWidth: 200, "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
        />
        <TextField
          select
          label="Storage location"
          size="small"
          value={slocFilter}
          onChange={(e) => setSlocFilter(e.target.value)}
          sx={{ minWidth: 160, "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
        >
          <MenuItem value="">All</MenuItem>
          {allSlocs.map((sloc) => (
            <MenuItem key={sloc} value={sloc}>
              {sloc}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Status"
          size="small"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          sx={{ minWidth: 160, "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
        >
          <MenuItem value="all">All</MenuItem>
          <MenuItem value="diff">Differences</MenuItem>
          <MenuItem value="match">Matched</MenuItem>
        </TextField>
      </Box>

      {rows === null ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : filtered.length === 0 ? (
        <Paper elevation={0} sx={{ p: 3, borderRadius: 2, textAlign: "center" }}>
          <Typography color="text.secondary">
            {rows.length === 0
              ? "No SAP stock yet. Import an MB52 snapshot from Inventory → Stock Update."
              : "No materials match the filters."}
          </Typography>
        </Paper>
      ) : (
        <TableContainer
          component={Paper}
          elevation={0}
          sx={{ borderRadius: 2, boxShadow: "0 2px 10px rgba(15,23,42,0.06)" }}
        >
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Material</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Distribution</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((row) => (
                <TableRow
                  key={row.material_code}
                  hover
                  sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
                >
                  <TableCell sx={{ fontWeight: 700 }}>{row.material_code}</TableCell>
                  <TableCell sx={{ maxWidth: 220 }}>
                    <Typography variant="body2" noWrap title={row.short_description}>
                      {row.short_description || "—"}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                      {row.locations.length === 0 ? (
                        <Typography variant="caption" color="text.secondary">
                          No distribution
                        </Typography>
                      ) : (
                        row.locations.map((l) => (
                          <Chip
                            key={l.storage_location}
                            size="small"
                            variant="outlined"
                            label={`${l.storage_location}: ${l.quantity}`}
                          />
                        ))
                      )}
                    </Box>
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800 }}>
                    {row.total}
                    {row.uom ? ` ${row.uom}` : ""}
                  </TableCell>
                  <TableCell>
                    <StatusChip row={row} />
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: "flex", gap: 0.5, justifyContent: "flex-end" }}>
                      {row.review && (
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<FactCheckIcon fontSize="small" />}
                          onClick={() => setReview(row.review)}
                          sx={{ borderRadius: 2, fontWeight: 700 }}
                        >
                          Review
                        </Button>
                      )}
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<HistoryIcon fontSize="small" />}
                        onClick={() =>
                          navigate(`/sap-history?material=${row.material_code}`)
                        }
                        sx={{ borderRadius: 2, fontWeight: 600 }}
                      >
                        History
                      </Button>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <SapReviewDialog
        review={review}
        onClose={() => setReview(null)}
        onResolved={() => {
          setReview(null);
          load();
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
