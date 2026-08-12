import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";

import HistoryIcon from "@mui/icons-material/History";
import { useNavigate } from "react-router-dom";

import { getAllocations } from "../services/materialAllocationService";
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
}: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const navigate = useNavigate();

  const [loadedForReview, setLoadedForReview] = useState<number | null>(null);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
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

  const totalMatches = runningTotal === target;
  const hasInvalidValue = locations.some((row) => {
    const value = Number(row.quantity);
    return row.quantity === "" || Number.isNaN(value) || value < 0;
  });

  function updateLocationQuantity(locationCode: string, value: string) {
    setLocations((prev) =>
      prev.map((row) =>
        row.location_code === locationCode ? { ...row, quantity: value } : row
      )
    );
  }

  async function handleApply() {
    if (!review || !totalMatches || hasInvalidValue) return;

    setSaving(true);

    try {
      const locationQuantities = locations
        .filter((row) => Number(row.quantity) !== row.original)
        .map((row) => ({
          location_code: row.location_code,
          quantity: Number(row.quantity),
        }));

      // If nothing changed in a bin, there's nothing to write for it.
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

  async function handleDismiss() {
    if (!review) return;

    setDismissing(true);

    try {
      await dismissSapReconciliation(
        review.id,
        remarks || "Dismissed by user."
      );
      onResolved();
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

  return (
    <Dialog
      open={!!review}
      onClose={saving || dismissing ? undefined : onClose}
      fullWidth
      maxWidth="xs"
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
        Apply SAP Reconciliation
        <Button
          variant="outlined"
          size="small"
          startIcon={<HistoryIcon />}
          disabled={!review || saving || dismissing}
          onClick={() =>
            review && navigate(`/sap-history?material=${review.material_code}`)
          }
          sx={{ borderRadius: 2, fontWeight: 600 }}
        >
          SAP History
        </Button>
      </DialogTitle>

      <DialogContent>
        {review && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Typography variant="body2" color="text.secondary">
              <strong>{review.material_code}</strong>
              {review.short_description ? ` - ${review.short_description}` : ""}
            </Typography>

            <Alert severity="info" sx={{ py: 0.5 }}>
              SAP total is {review.sap_total}, app stock is {review.app_total}{" "}
              (difference {review.difference > 0 ? "+" : ""}
              {review.difference}). The SAP split is for reference only -
              choose which bin(s) the change comes from. The entered total
              must equal the SAP total.
            </Alert>

            {breakdown.length > 0 && (
              <Box
                sx={{
                  px: 1.25,
                  py: 0.75,
                  borderRadius: 2,
                  bgcolor: "grey.50",
                }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  SAP storage locations (read-only):
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {breakdown
                    .map(
                      (b) => `${b.storage_location}: ${b.quantity}`
                    )
                    .join("  ·  ")}
                </Typography>
              </Box>
            )}

            {loading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                <CircularProgress size={24} />
              </Box>
            ) : (
              <>
                {locations.map((row) => (
                  <TextField
                    key={row.location_code}
                    label={row.location_code}
                    type="number"
                    size="small"
                    fullWidth
                    value={row.quantity}
                    onChange={(e) =>
                      updateLocationQuantity(row.location_code, e.target.value)
                    }
                    helperText={`Current: ${row.original}`}
                    slotProps={{ htmlInput: { inputMode: "numeric", min: 0 } }}
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                  />
                ))}

                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    px: 1.25,
                    py: 0.75,
                    borderRadius: 2,
                    bgcolor: totalMatches ? "success.50" : "grey.50",
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    Entered Total
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 700 }}
                    color={totalMatches ? "success.main" : "text.primary"}
                  >
                    {runningTotal} / {target}
                  </Typography>
                </Box>

                <TextField
                  label="Remarks"
                  placeholder="Optional - e.g. review notes"
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

      <DialogActions sx={{ p: 2, flexWrap: "wrap", gap: 1 }}>
        <Button
          onClick={handleDismiss}
          disabled={saving || dismissing || loading}
          sx={{ minHeight: 44 }}
        >
          Dismiss
        </Button>
        <Button onClick={onClose} disabled={saving || dismissing} sx={{ minHeight: 44 }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleApply}
          disabled={saving || dismissing || loading || !totalMatches || hasInvalidValue}
          startIcon={saving ? <CircularProgress size={18} color="inherit" /> : undefined}
          sx={{ minHeight: 44 }}
        >
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
}
