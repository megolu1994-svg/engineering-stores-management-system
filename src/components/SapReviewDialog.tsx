import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";

import HistoryIcon from "@mui/icons-material/History";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import BalanceIcon from "@mui/icons-material/Balance";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

import { getAllocations } from "../services/materialAllocationService";
import SapMaterialHistoryPopup from "./SapMaterialHistoryPopup";
import {
  applySapReconciliation,
  dismissSapReconciliation,
  type SapStockReview,
} from "../services/sapHistoryService";

const UNALLOCATED_LOCATION = "UNALLOCATED";

interface LocationRow {
  location_code: string;
  original: number;
  quantity: string;
}

interface Props {
  /** Open review to resolve, or null to close. */
  review: (SapStockReview & { material_code: string }) | null;
  onClose: () => void;
  onResolved: () => void;
  onError: (message: string) => void;
  onApplyAndNext?: () => void;
  hasNextReview?: boolean;
  reviewIndex?: number;
  totalOpenReviews?: number;
}

/**
 * Resolves an open SAP reconciliation review. The SAP storage-location
 * split (AFCN / REVN / ...) is read-only reference - the app can't know
 * which physical bin is right, so the user decides where the difference
 * lands by editing the bin quantities. The entered total must equal the
 * SAP total before Apply enables. Applying writes one audited ADJUSTMENT
 * per changed location (reason "SAP Reconciliation"); Dismiss keeps the
 * review as history without touching stock.
 */
export default function SapReviewDialog({
  review,
  onClose,
  onResolved,
  onError,
  onApplyAndNext,
  hasNextReview,
  reviewIndex,
  totalOpenReviews,
}: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));

  const [loadedForReview, setLoadedForReview] = useState<number | null>(null);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingAndNext, setSavingAndNext] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  // Loading is derived from the id whose locations are in state, so the
  // effect below only calls setState inside async callbacks.
  const loading = !!review && loadedForReview !== review.id;

  useEffect(() => {
    if (!review) return;

    let cancelled = false;

    getAllocations(review.material_code)
      .then((allocations) => {
        if (cancelled) return;

        const rows = allocations
          .map((a) => ({
            location_code: a.location_code,
            original: Number(a.quantity),
            quantity: String(a.quantity),
          }))
          // Unallocated first, then the rest alphabetically.
          .sort((a, b) => {
            if (a.location_code === UNALLOCATED_LOCATION) return -1;
            if (b.location_code === UNALLOCATED_LOCATION) return 1;
            return a.location_code.localeCompare(b.location_code);
          });

        // A material with no allocations at all still needs somewhere for
        // an increase to land - offer Unallocated at 0.
        if (rows.length === 0) {
          rows.push({
            location_code: UNALLOCATED_LOCATION,
            original: 0,
            quantity: "0",
          });
        }

        setLocations(rows);
        setLoadedForReview(review.id);
      })
      .catch(() => {
        if (cancelled) return;
        setLocations([]);
        setLoadedForReview(review.id);
      });

    return () => {
      cancelled = true;
    };
  }, [review]);

  const target = review?.sap_total ?? 0;

  const runningTotal = useMemo(
    () =>
      locations.reduce((sum, row) => {
        const value = Number(row.quantity);
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0),
    [locations]
  );

  const totalMatches = Math.abs(runningTotal - target) < 0.0001;
  const hasInvalidValue = locations.some((row) => {
    const value = Number(row.quantity);
    return row.quantity === "" || Number.isNaN(value) || value < 0;
  });

  // Identify if this item is single-bin or multi-bin
  const activePhysicalBins = useMemo(
    () =>
      locations.filter(
        (r) => r.location_code !== UNALLOCATED_LOCATION && Number(r.original) > 0
      ),
    [locations]
  );

  const isMultiBin = activePhysicalBins.length > 1;

  function updateLocationQuantity(locationCode: string, value: string) {
    setLocations((prev) =>
      prev.map((row) =>
        row.location_code === locationCode ? { ...row, quantity: value } : row
      )
    );
  }

  /** Quick action: Assign the entire variance into UNALLOCATED */
  function handlePutDeltaInUnallocated() {
    setLocations((prev) => {
      const unallocExists = prev.some(
        (r) => r.location_code === UNALLOCATED_LOCATION
      );
      const list = [...prev];
      if (!unallocExists) {
        list.unshift({
          location_code: UNALLOCATED_LOCATION,
          original: 0,
          quantity: "0",
        });
      }

      // Sum of all other bins as currently set
      const sumOtherBins = list
        .filter((r) => r.location_code !== UNALLOCATED_LOCATION)
        .reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);

      const targetUnalloc = Math.max(0, target - sumOtherBins);

      return list.map((r) =>
        r.location_code === UNALLOCATED_LOCATION
          ? { ...r, quantity: String(targetUnalloc) }
          : r
      );
    });
  }

  /** Quick action: Proportional distribution across existing non-zero bins */
  function handleProportionalBalance() {
    setLocations((prev) => {
      const origSum = prev.reduce((s, r) => s + r.original, 0);
      if (origSum <= 0) {
        // Fallback: put everything into unallocated or first bin
        return prev.map((r, i) => ({
          ...r,
          quantity: i === 0 ? String(target) : "0",
        }));
      }

      let allocatedSoFar = 0;
      const updated = prev.map((r, i) => {
        if (i === prev.length - 1) {
          // Last element gets remainder to guarantee exact match
          const remainder = Math.max(0, Math.round((target - allocatedSoFar) * 100) / 100);
          return { ...r, quantity: String(remainder) };
        }
        const proportion = r.original / origSum;
        const binQty = Math.round(target * proportion * 100) / 100;
        allocatedSoFar += binQty;
        return { ...r, quantity: String(binQty) };
      });

      return updated;
    });
  }

  /** Quick action: Reset all quantities to original */
  function handleReset() {
    setLocations((prev) =>
      prev.map((r) => ({ ...r, quantity: String(r.original) }))
    );
  }

  /** Quick action: Single-Bin Rule (Deficit from single bin, surplus to Unallocated) */
  function handleSingleBinRuleBalance() {
    if (!review) return;
    const origTotal = locations.reduce((s, r) => s + r.original, 0);
    const diff = target - origTotal;

    if (diff > 0) {
      // Surplus -> extra quantity goes to UNALLOCATED; physical bins keep original count
      handlePutDeltaInUnallocated();
    } else {
      // Deficit -> decrease from the single physical bin (or UNALLOCATED if no physical bin)
      const phys = locations.find(
        (r) => r.location_code !== UNALLOCATED_LOCATION
      );
      setLocations((prev) =>
        prev.map((r) => {
          if (phys && r.location_code === phys.location_code) {
            return { ...r, quantity: String(target) };
          }
          if (!phys && r.location_code === UNALLOCATED_LOCATION) {
            return { ...r, quantity: String(target) };
          }
          return { ...r, quantity: "0" };
        })
      );
    }
  }

  async function performApply() {
    if (!review || !totalMatches || hasInvalidValue) return;

    const locationQuantities = locations
      .filter((row) => Number(row.quantity) !== row.original)
      .map((row) => ({
        location_code: row.location_code,
        quantity: Number(row.quantity),
      }));

    // If nothing changed in a bin, write the full locations state
    const changed =
      locationQuantities.length > 0
        ? locationQuantities
        : locations.map((row) => ({
            location_code: row.location_code,
            quantity: Number(row.quantity),
          }));

    await applySapReconciliation(
      review.id,
      review.material_code,
      changed,
      remarks ||
        `SAP reconciliation (SAP ${review.sap_total} vs app ${review.app_total})`
    );
  }

  async function handleApply() {
    setSaving(true);
    try {
      await performApply();
      onResolved();
    } catch (err) {
      onError(
        err instanceof Error
          ? err.message
          : "Something went wrong while applying the reconciliation."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleApplyAndNext() {
    setSavingAndNext(true);
    try {
      await performApply();
      if (onApplyAndNext) {
        onApplyAndNext();
      } else {
        onResolved();
      }
    } catch (err) {
      onError(
        err instanceof Error
          ? err.message
          : "Something went wrong while applying the reconciliation."
      );
    } finally {
      setSavingAndNext(false);
    }
  }

  async function handleDismiss() {
    if (!review) return;

    setDismissing(true);

    try {
      await dismissSapReconciliation(
        review.id,
        remarks || "Dismissed by user."
      );
      if (onApplyAndNext && hasNextReview) {
        onApplyAndNext();
      } else {
        onResolved();
      }
    } catch (err) {
      onError(
        err instanceof Error
          ? err.message
          : "Something went wrong while dismissing the review."
      );
    } finally {
      setDismissing(false);
    }
  }

  const breakdown = review?.sloc_breakdown ?? [];

  const [sapHistoryOpen, setSapHistoryOpen] = useState(false);

  const openSapHistory = () => {
    if (!review) return;
    setSapHistoryOpen(true);
  };

  const isBusy = saving || savingAndNext || dismissing;

  return (
    <>
      <Dialog
        open={!!review}
        onClose={isBusy ? undefined : onClose}
        fullWidth
        maxWidth="sm"
        fullScreen={fullScreen}
      >
        <DialogTitle
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
            pr: 1.5,
            py: 1.5,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="h6" sx={{ fontSize: "1.05rem", fontWeight: 700 }}>
              Apply SAP Reconciliation
            </Typography>
            {reviewIndex !== undefined && totalOpenReviews !== undefined && (
              <Chip
                label={`${reviewIndex + 1} of ${totalOpenReviews}`}
                size="small"
                variant="outlined"
                sx={{ fontWeight: 700, fontSize: "0.75rem" }}
              />
            )}
          </Box>
          <Button
            variant="contained"
            color="primary"
            size="small"
            startIcon={<HistoryIcon />}
            disabled={!review || isBusy}
            onClick={openSapHistory}
            sx={{
              borderRadius: 2,
              fontWeight: 700,
              textTransform: "none",
              boxShadow: "none",
            }}
          >
            SAP History
          </Button>
        </DialogTitle>

        <DialogContent dividers sx={{ py: 2 }}>
          {review && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.75 }}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
                <Box>
                  <Typography variant="body1" sx={{ fontWeight: 800 }}>
                    {review.material_code}
                  </Typography>
                  {review.short_description && (
                    <Typography variant="body2" color="text.secondary">
                      {review.short_description}
                    </Typography>
                  )}
                </Box>
                <Chip
                  icon={isMultiBin ? <BalanceIcon /> : <AutoFixHighIcon />}
                  label={
                    isMultiBin
                      ? `Multi-Bin (${activePhysicalBins.length} locations)`
                      : "Single-Location Item"
                  }
                  color={isMultiBin ? "primary" : "success"}
                  size="small"
                  variant="outlined"
                  sx={{ fontWeight: 700 }}
                />
              </Box>

              <Alert
                severity="info"
                sx={{
                  py: 0.75,
                  fontSize: "0.85rem",
                  "& .MuiAlert-message": { width: "100%" },
                }}
              >
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
                  <span>
                    SAP total: <strong>{review.sap_total}</strong> · App total:{" "}
                    <strong>{review.app_total}</strong>
                  </span>
                  <span style={{ fontWeight: 700 }}>
                    Variance: {review.difference > 0 ? "+" : ""}
                    {review.difference}
                  </span>
                </Box>
              </Alert>

              <Button
                size="small"
                variant="outlined"
                color="primary"
                startIcon={<HistoryIcon sx={{ fontSize: 16 }} />}
                onClick={openSapHistory}
                sx={{
                  alignSelf: "flex-start",
                  textTransform: "none",
                  fontWeight: 700,
                  borderRadius: 1.5,
                  py: 0.5,
                  px: 1.5,
                  mt: -0.75,
                }}
              >
                Inspect SAP History (MB51 Postings) for {review.material_code}
              </Button>

              {breakdown.length > 0 && (
                <Box
                  sx={{
                    px: 1.25,
                    py: 0.75,
                    borderRadius: 2,
                    bgcolor: "grey.50",
                    border: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                    SAP Storage Locations (Accounting reference):
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {breakdown
                      .map((b) => `${b.storage_location}: ${b.quantity}`)
                      .join("  ·  ")}
                  </Typography>
                </Box>
              )}

              {/* Quick Balancing Helper Toolbar */}
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, mr: 0.5 }}>
                  Quick Balance:
                </Typography>

                {!isMultiBin && (
                  <Tooltip
                    title={
                      review.difference > 0
                        ? `Strategy 4: Surplus (+${review.difference}) goes to UNALLOCATED; physical bin remains intact`
                        : `Strategy 4: Deficit is deducted directly from the single bin`
                    }
                  >
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      startIcon={<AutoFixHighIcon />}
                      onClick={handleSingleBinRuleBalance}
                      disabled={loading || isBusy}
                      sx={{
                        textTransform: "none",
                        borderRadius: 1.5,
                        py: 0.25,
                        fontWeight: 700,
                      }}
                    >
                      Single-Bin Rule
                    </Button>
                  </Tooltip>
                )}

                <Tooltip title="Absorbs the discrepancy into the UNALLOCATED bucket without disturbing physical shelf bins">
                  <Button
                    size="small"
                    variant="outlined"
                    color="secondary"
                    startIcon={<AutoFixHighIcon />}
                    onClick={handlePutDeltaInUnallocated}
                    disabled={loading || isBusy}
                    sx={{ textTransform: "none", borderRadius: 1.5, py: 0.25 }}
                  >
                    Delta to Unallocated
                  </Button>
                </Tooltip>

                {isMultiBin && (
                  <Tooltip title="Distributes the SAP total proportionally across all currently allocated bins">
                    <Button
                      size="small"
                      variant="outlined"
                      color="primary"
                      startIcon={<BalanceIcon />}
                      onClick={handleProportionalBalance}
                      disabled={loading || isBusy}
                      sx={{ textTransform: "none", borderRadius: 1.5, py: 0.25 }}
                    >
                      Proportional
                    </Button>
                  </Tooltip>
                )}

                <Tooltip title="Reset quantities back to their original values">
                  <Button
                    size="small"
                    variant="text"
                    color="inherit"
                    startIcon={<RestartAltIcon />}
                    onClick={handleReset}
                    disabled={loading || isBusy}
                    sx={{ textTransform: "none", ml: "auto" }}
                  >
                    Reset
                  </Button>
                </Tooltip>
              </Box>

              {loading ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : (
                <>
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
                    {locations.map((row) => (
                      <TextField
                        key={row.location_code}
                        label={`${row.location_code}${
                          row.location_code === UNALLOCATED_LOCATION
                            ? " (Buffer / Unallocated)"
                            : " (Physical Bin)"
                        }`}
                        type="number"
                        size="small"
                        fullWidth
                        value={row.quantity}
                        onChange={(e) =>
                          updateLocationQuantity(row.location_code, e.target.value)
                        }
                        helperText={`Current Physical Stock: ${row.original}`}
                        slotProps={{ htmlInput: { inputMode: "numeric", min: 0 } }}
                        sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                      />
                    ))}
                  </Box>

                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      px: 1.5,
                      py: 1,
                      borderRadius: 2,
                      bgcolor: totalMatches ? "success.50" : "error.50",
                      border: "1px solid",
                      borderColor: totalMatches ? "success.200" : "error.200",
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 600 }}
                      color={totalMatches ? "success.dark" : "error.dark"}
                    >
                      {totalMatches
                        ? "✓ Entered total matches SAP total"
                        : "Entered total must match SAP total"}
                    </Typography>
                    <Typography
                      variant="body1"
                      sx={{ fontWeight: 800 }}
                      color={totalMatches ? "success.dark" : "error.dark"}
                    >
                      {runningTotal} / {target}
                    </Typography>
                  </Box>

                  <TextField
                    label="Remarks"
                    placeholder="Optional - e.g. review notes or physical count justification"
                    size="small"
                    fullWidth
                    multiline
                    minRows={2}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                  />
                </>
              )}
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 2, flexWrap: "wrap", gap: 1, justifyContent: "space-between" }}>
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button
              onClick={handleDismiss}
              disabled={isBusy || loading}
              color="inherit"
              sx={{ minHeight: 40 }}
            >
              Dismiss
            </Button>
            <Button onClick={onClose} disabled={isBusy} sx={{ minHeight: 40 }}>
              Cancel
            </Button>
          </Box>

          <Box sx={{ display: "flex", gap: 1 }}>
            <Button
              variant="contained"
              onClick={handleApply}
              disabled={isBusy || loading || !totalMatches || hasInvalidValue}
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
              sx={{ minHeight: 40, fontWeight: 700 }}
            >
              Apply
            </Button>

            {onApplyAndNext && hasNextReview && (
              <Button
                variant="contained"
                color="success"
                onClick={handleApplyAndNext}
                disabled={isBusy || loading || !totalMatches || hasInvalidValue}
                startIcon={
                  savingAndNext ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : (
                    <ArrowForwardIcon />
                  )
                }
                sx={{ minHeight: 40, fontWeight: 700 }}
              >
                Apply & Next
              </Button>
            )}
          </Box>
        </DialogActions>
      </Dialog>

      {/* In-app SAP History popup with return to review */}
      <SapMaterialHistoryPopup
        open={sapHistoryOpen}
        onClose={() => setSapHistoryOpen(false)}
        materialCode={review?.material_code ?? ""}
        returnToReviewId={review?.id}
      />
    </>
  );
}
