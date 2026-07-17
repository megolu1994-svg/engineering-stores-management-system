import { useCallback, useEffect, useState } from "react";

import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  InputAdornment,
  Snackbar,
  TextField,
  Typography,
} from "@mui/material";

import SearchIcon from "@mui/icons-material/Search";
import HistoryIcon from "@mui/icons-material/History";
import PlaceIcon from "@mui/icons-material/Place";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";

import {
  getRecentActivity,
  searchInventory,
  type InventoryOverviewRow,
  type InventorySearchResult,
} from "../services/inventoryOverviewService";
import type { InventoryTransactionType } from "../services/inventoryTransactionService";
import { getAllocations } from "../services/materialAllocationService";
import {
  applyPendingDecreaseFromUnallocated,
  applyPendingIncreaseToUnallocated,
  dismissPendingStockUpdate,
  getPendingStockUpdates,
  type PendingStockUpdate,
} from "../services/stockUpdateService";
import StockReconcileDialog from "./StockReconcileDialog";

interface Props {
  /** Called when the user taps a material card, so the parent (Inventory
   * page) can load that material into the other tabs without another
   * search. */
  onSelectMaterial: (materialCode: string) => void;
}

const UNALLOCATED_LOCATION = "UNALLOCATED";
const SEARCH_DEBOUNCE_MS = 300;

const TRANSACTION_BADGE: Record<
  InventoryTransactionType,
  { label: string; color: string; bg: string }
> = {
  MATERIAL_RECEIPT: { label: "Receipt", color: "#1b5e20", bg: "#e8f5e9" },
  ALLOCATION: { label: "Allocation", color: "#0d47a1", bg: "#e3f2fd" },
  LOCATION_TRANSFER: { label: "Transfer", color: "#e65100", bg: "#fff3e0" },
  MATERIAL_ISSUE: { label: "Issue", color: "#b71c1c", bg: "#ffebee" },
  ADJUSTMENT: { label: "Adjustment", color: "#4a148c", bg: "#f3e5f5" },
  OPENING_STOCK: { label: "Opening Stock", color: "#424242", bg: "#f5f5f5" },
};

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

/** Compact variant used inline on reconciliation cards, where the sentence
 * form previously wrapped across lines and dominated the card's height. */
function formatDateTimeShort(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface PendingRow extends PendingStockUpdate {
  unallocatedQty: number;
}

type SnackbarSeverity = "success" | "error" | "warning" | "info";

/** Shared mismatch summary + resolution actions for a single flagged
 * material, used both in the standing "Needs Review" panel and inline on a
 * search/recent-activity card that happens to match a flagged material. */
function ReconcileActions({
  row,
  busy,
  onApply,
  onDismiss,
  onAdjust,
}: {
  row: PendingRow;
  busy: boolean;
  onApply: (row: PendingRow) => void;
  onDismiss: (row: PendingRow) => void;
  onAdjust: (row: PendingRow) => void;
}) {
  const isIncrease = row.difference > 0;
  const shortfall = Math.abs(row.difference);
  const canAutoDecrease = !isIncrease && shortfall <= row.unallocatedQty;
  const diffColor = isIncrease ? "success.main" : "error.main";

  return (
    <Box
      sx={{
        mt: 0.75,
        p: 0.75,
        px: 1,
        borderRadius: 1.5,
        bgcolor: "warning.50",
        border: "1px solid",
        borderColor: "warning.light",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
        }}
      >
        <Typography variant="caption" sx={{ fontWeight: 600 }} noWrap>
          Found {row.uploaded_qty} · System {row.system_qty_at_upload}
        </Typography>
        <Chip
          size="small"
          label={`${isIncrease ? "+" : ""}${row.difference}`}
          sx={{
            height: 20,
            fontWeight: 700,
            bgcolor: "transparent",
            color: diffColor,
            border: "1px solid",
            borderColor: diffColor,
          }}
        />
      </Box>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mt: 0.25 }}
      >
        Bulk upload · {formatDateTimeShort(row.uploaded_at)}
      </Typography>

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 0.75 }}>
        {isIncrease && (
          <Button
            size="small"
            variant="contained"
            color="warning"
            disabled={busy}
            onClick={() => onApply(row)}
            sx={{ borderRadius: 2, fontWeight: 700 }}
          >
            {busy ? <CircularProgress size={16} color="inherit" /> : "Apply to Unallocated"}
          </Button>
        )}

        {!isIncrease && canAutoDecrease && (
          <Button
            size="small"
            variant="contained"
            color="warning"
            disabled={busy}
            onClick={() => onApply(row)}
            sx={{ borderRadius: 2, fontWeight: 700 }}
          >
            {busy ? <CircularProgress size={16} color="inherit" /> : "Apply (Reduce Unallocated)"}
          </Button>
        )}

        {!isIncrease && !canAutoDecrease && (
          <Button
            size="small"
            variant="contained"
            color="warning"
            disabled={busy}
            onClick={() => onAdjust(row)}
            sx={{ borderRadius: 2, fontWeight: 700 }}
          >
            Adjust Allocation
          </Button>
        )}

        <Button
          size="small"
          variant="text"
          color="inherit"
          disabled={busy}
          onClick={() => onDismiss(row)}
          sx={{ borderRadius: 2, fontWeight: 600 }}
        >
          Dismiss
        </Button>
      </Box>
    </Box>
  );
}

export default function CurrentStockTab({ onSelectMaterial }: Props) {
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<InventorySearchResult[]>(
    []
  );

  const [recentActivity, setRecentActivity] = useState<InventoryOverviewRow[]>(
    []
  );
  const [loadingRecent, setLoadingRecent] = useState(false);

  const [pendingRows, setPendingRows] = useState<PendingRow[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [pendingCollapsed, setPendingCollapsed] = useState(false);
  const [busyMaterial, setBusyMaterial] = useState<string | null>(null);
  const [reconcileTarget, setReconcileTarget] = useState<PendingRow | null>(
    null
  );

  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: SnackbarSeverity;
  }>({ open: false, message: "", severity: "info" });

  function showSnackbar(message: string, severity: SnackbarSeverity) {
    setSnackbar({ open: true, message, severity });
  }

  const loadPending = useCallback(async () => {
    setLoadingPending(true);

    try {
      const pending = await getPendingStockUpdates();

      const withUnallocated = await Promise.all(
        pending.map(async (p) => {
          const allocations = await getAllocations(p.material_code);
          const unallocatedRow = allocations.find(
            (a) => a.location_code === UNALLOCATED_LOCATION
          );
          return { ...p, unallocatedQty: unallocatedRow?.quantity ?? 0 };
        })
      );

      setPendingRows(withUnallocated);
    } finally {
      setLoadingPending(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingRecent(true);

    getRecentActivity()
      .then((data) => {
        if (!cancelled) setRecentActivity(data);
      })
      .finally(() => {
        if (!cancelled) setLoadingRecent(false);
      });

    loadPending();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const trimmed = search.trim();

    if (trimmed.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(() => {
      setSearching(true);

      searchInventory(trimmed)
        .then((results) => setSearchResults(results))
        .finally(() => setSearching(false));
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [search]);

  const isSearchMode = search.trim().length >= 2;
  const pendingByMaterial = new Map(pendingRows.map((p) => [p.material_code, p]));

  async function handleApply(row: PendingRow) {
    setBusyMaterial(row.material_code);

    try {
      if (row.difference > 0) {
        await applyPendingIncreaseToUnallocated(row);
      } else {
        await applyPendingDecreaseFromUnallocated(row);
      }

      showSnackbar(`Stock reconciled for ${row.material_code}.`, "success");
      await loadPending();
    } catch (err) {
      showSnackbar(
        err instanceof Error ? err.message : "Something went wrong.",
        "error"
      );
    } finally {
      setBusyMaterial(null);
    }
  }

  async function handleDismiss(row: PendingRow) {
    setBusyMaterial(row.material_code);

    try {
      await dismissPendingStockUpdate(row.material_code);
      showSnackbar(`Dismissed for ${row.material_code}.`, "info");
      await loadPending();
    } catch {
      showSnackbar("Failed to dismiss.", "error");
    } finally {
      setBusyMaterial(null);
    }
  }

  async function handleReconciled() {
    if (!reconcileTarget) return;
    showSnackbar(`Stock reconciled for ${reconcileTarget.material_code}.`, "success");
    setReconcileTarget(null);
    await loadPending();
  }

  return (
    <Box sx={{ mt: 1.5 }}>
      <TextField
        size="small"
        placeholder="Search Material Code, Description or Location Code"
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
        sx={{
          mb: 2,
          "& .MuiOutlinedInput-root": {
            borderRadius: 2,
            bgcolor: "background.paper",
          },
        }}
      />

      {!loadingPending && pendingRows.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Box
            onClick={() => setPendingCollapsed((prev) => !prev)}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 0.75,
              mb: pendingCollapsed ? 0 : 1,
              cursor: "pointer",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <WarningAmberIcon fontSize="small" color="warning" />
              <Typography sx={{ fontWeight: 700, fontSize: "0.9rem" }}>
                Stock Reconciliation Needed ({pendingRows.length})
              </Typography>
            </Box>
            <IconButton size="small">
              {pendingCollapsed ? (
                <ExpandMoreIcon fontSize="small" />
              ) : (
                <ExpandLessIcon fontSize="small" />
              )}
            </IconButton>
          </Box>

          <Collapse in={!pendingCollapsed} timeout="auto" unmountOnExit>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
              {pendingRows.map((row) => (
                <Card key={row.material_code} variant="outlined" sx={{ borderRadius: 2 }}>
                  <CardActionArea
                    onClick={() => onSelectMaterial(row.material_code)}
                    sx={{ p: 1, pb: 0.5 }}
                  >
                    <Typography sx={{ fontWeight: 700, fontSize: "0.85rem" }} noWrap>
                      {row.material_code}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                      {row.short_description}
                    </Typography>
                  </CardActionArea>

                  <Box sx={{ px: 1, pb: 1 }}>
                    <ReconcileActions
                      row={row}
                      busy={busyMaterial === row.material_code}
                      onApply={handleApply}
                      onDismiss={handleDismiss}
                      onAdjust={setReconcileTarget}
                    />
                  </Box>
                </Card>
              ))}
            </Box>
          </Collapse>
        </Box>
      )}

      {isSearchMode ? (
        searching ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : searchResults.length === 0 ? (
          <Card variant="outlined" sx={{ p: 3, textAlign: "center", borderRadius: 2 }}>
            <Typography variant="body2" color="text.secondary">
              No materials found.
            </Typography>
          </Card>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {searchResults.map((row) => {
              const pending = pendingByMaterial.get(row.material_code);

              return (
                <Card
                  key={row.material_code}
                  variant="outlined"
                  sx={{ borderRadius: 2 }}
                >
                  <CardActionArea
                    onClick={() => onSelectMaterial(row.material_code)}
                    sx={{ p: 1.25 }}
                  >
                    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: "0.9rem" }} noWrap>
                          {row.material_code}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {row.short_description}
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                        <Typography sx={{ fontWeight: 800 }} color="primary.main">
                          {row.currentStock}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {row.uom}
                        </Typography>
                      </Box>
                    </Box>
                  </CardActionArea>

                  {pending && (
                    <Box sx={{ px: 1.25, pb: 1.25 }}>
                      <ReconcileActions
                        row={pending}
                        busy={busyMaterial === pending.material_code}
                        onApply={handleApply}
                        onDismiss={handleDismiss}
                        onAdjust={setReconcileTarget}
                      />
                    </Box>
                  )}
                </Card>
              );
            })}
          </Box>
        )
      ) : (
        <>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1 }}>
            <HistoryIcon fontSize="small" color="action" />
            <Typography sx={{ fontWeight: 700, fontSize: "0.9rem" }}>
              Recent Activity
            </Typography>
          </Box>

          {loadingRecent ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress size={24} />
            </Box>
          ) : recentActivity.length === 0 ? (
            <Card variant="outlined" sx={{ p: 3, textAlign: "center", borderRadius: 2 }}>
              <Typography variant="body2" color="text.secondary">
                No inventory transactions recorded yet.
              </Typography>
            </Card>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {recentActivity.map((row) => {
                const badge =
                  TRANSACTION_BADGE[row.lastTransactionType] ??
                  TRANSACTION_BADGE.OPENING_STOCK;
                const pending = pendingByMaterial.get(row.material_code);

                return (
                  <Card
                    key={row.material_code}
                    variant="outlined"
                    sx={{ borderRadius: 2 }}
                  >
                    <CardActionArea
                      onClick={() => onSelectMaterial(row.material_code)}
                      sx={{ p: 1.25 }}
                    >
                      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 700, fontSize: "0.9rem" }} noWrap>
                            {row.material_code}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" noWrap>
                            {row.short_description}
                          </Typography>
                        </Box>
                        <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                          <Typography sx={{ fontWeight: 800 }} color="primary.main">
                            {row.currentStock}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {row.uom}
                          </Typography>
                        </Box>
                      </Box>

                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          mt: 0.75,
                        }}
                      >
                        <Chip
                          size="small"
                          label={badge.label}
                          sx={{
                            fontWeight: 700,
                            bgcolor: badge.bg,
                            color: badge.color,
                          }}
                        />
                        <Typography variant="caption" color="text.secondary">
                          {formatDateTime(row.lastTransactionTime)}
                        </Typography>
                      </Box>

                      {row.locationDisplay && (
                        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 0.4, mt: 0.5 }}>
                          <PlaceIcon sx={{ fontSize: 14, mt: "1px" }} color="action" />
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ minWidth: 0, flex: 1, overflowWrap: "break-word" }}
                          >
                            {row.locationDisplay}
                          </Typography>
                        </Box>
                      )}
                    </CardActionArea>

                    {pending && (
                      <Box sx={{ px: 1.25, pb: 1.25 }}>
                        <ReconcileActions
                          row={pending}
                          busy={busyMaterial === pending.material_code}
                          onApply={handleApply}
                          onDismiss={handleDismiss}
                          onAdjust={setReconcileTarget}
                        />
                      </Box>
                    )}
                  </Card>
                );
              })}
            </Box>
          )}
        </>
      )}

      <StockReconcileDialog
        pending={reconcileTarget}
        onClose={() => setReconcileTarget(null)}
        onResolved={handleReconciled}
        onError={(message) => showSnackbar(message, "error")}
      />

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
