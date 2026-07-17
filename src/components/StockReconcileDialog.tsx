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
  MenuItem,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";

import { getAllocations } from "../services/materialAllocationService";
import {
  applyStockReconciliation,
  type PendingStockUpdate,
} from "../services/stockUpdateService";

const UNALLOCATED_LOCATION = "UNALLOCATED";

const ADJUSTMENT_REASONS = [
  "Physical Count Variance",
  "Damage",
  "Loss",
  "Correction",
  "Other",
];

interface LocationRow {
  location_code: string;
  original: number;
  quantity: string;
}

interface Props {
  pending: PendingStockUpdate | null;
  onClose: () => void;
  onResolved: () => void;
  onError: (message: string) => void;
}

/**
 * Shown when a Stock Update shortfall is bigger than the unallocated
 * balance, so the reduction has to come out of one or more real locations -
 * a decision only a person can make. Unallocated is forced to 0 (it's
 * fully consumed first), every real location currently holding the
 * material is listed with its current quantity editable, and the running
 * total must equal the uploaded quantity before Save is enabled.
 */
export default function StockReconcileDialog({
  pending,
  onClose,
  onResolved,
  onError,
}: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));

  const [loading, setLoading] = useState(false);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [unallocatedOriginal, setUnallocatedOriginal] = useState(0);
  const [reason, setReason] = useState("Physical Count Variance");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!pending) return;

    let cancelled = false;
    setLoading(true);

    getAllocations(pending.material_code)
      .then((allocations) => {
        if (cancelled) return;

        const unallocatedRow = allocations.find(
          (a) => a.location_code === UNALLOCATED_LOCATION
        );
        setUnallocatedOriginal(unallocatedRow?.quantity ?? 0);

        const realRows = allocations
          .filter((a) => a.location_code !== UNALLOCATED_LOCATION)
          .map((a) => ({
            location_code: a.location_code,
            original: Number(a.quantity),
            quantity: String(a.quantity),
          }));

        setLocations(realRows);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pending]);

  const runningTotal = useMemo(
    () =>
      locations.reduce((sum, row) => {
        const value = Number(row.quantity);
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0),
    [locations]
  );

  const target = pending?.uploaded_qty ?? 0;
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

  async function handleSave() {
    if (!pending) return;

    if (!totalMatches || hasInvalidValue) {
      return;
    }

    setSaving(true);

    try {
      const locationQuantities = [
        { location_code: UNALLOCATED_LOCATION, quantity: 0 },
        ...locations
          .filter((row) => Number(row.quantity) !== row.original)
          .map((row) => ({
            location_code: row.location_code,
            quantity: Number(row.quantity),
          })),
      ];

      // Unallocated is only worth writing if it actually changes.
      const finalLocationQuantities =
        unallocatedOriginal === 0
          ? locationQuantities.filter(
              (l) => l.location_code !== UNALLOCATED_LOCATION
            )
          : locationQuantities;

      await applyStockReconciliation(
        pending.material_code,
        finalLocationQuantities,
        reason,
        remarks || `Bulk stock update reconciliation (uploaded ${pending.uploaded_qty})`
      );

      onResolved();
    } catch (err) {
      onError(
        err instanceof Error
          ? err.message
          : "Something went wrong while saving the reconciliation."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={!!pending}
      onClose={saving ? undefined : onClose}
      fullWidth
      maxWidth="xs"
      fullScreen={fullScreen}
    >
      <DialogTitle>Adjust Allocation</DialogTitle>

      <DialogContent>
        {pending && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Typography variant="body2" color="text.secondary">
              <strong>{pending.material_code}</strong>
              {pending.short_description ? ` - ${pending.short_description}` : ""}
            </Typography>

            <Alert severity="info" sx={{ py: 0.5 }}>
              Uploaded quantity is {pending.uploaded_qty}, system stock is{" "}
              {pending.system_qty_at_upload}. The shortfall is more than the
              unallocated balance ({unallocatedOriginal}), so pick which
              location(s) the remaining reduction comes from. Unallocated
              will be set to 0.
            </Alert>

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

                {locations.length === 0 && (
                  <Alert severity="warning" sx={{ py: 0.5 }}>
                    No allocated locations found for this material.
                  </Alert>
                )}

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
                    Entered Total (Unallocated: 0)
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
                  select
                  label="Reason"
                  size="small"
                  fullWidth
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                >
                  {ADJUSTMENT_REASONS.map((option) => (
                    <MenuItem key={option} value={option}>
                      {option}
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  label="Remarks"
                  placeholder="Optional additional details"
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

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={saving} sx={{ minHeight: 44 }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || loading || !totalMatches || hasInvalidValue}
          startIcon={saving ? <CircularProgress size={18} color="inherit" /> : undefined}
          sx={{ minHeight: 44 }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
