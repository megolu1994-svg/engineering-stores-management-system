import { useEffect, useState } from "react";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  MenuItem,
  Snackbar,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";

import TuneIcon from "@mui/icons-material/Tune";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";

import MaterialSearch from "./MaterialSearch";
import LocationSearch from "./LocationSearch";

import { usePersistentState } from "../hooks/usePersistentState";

import type { Material } from "../types/material";
import type { Location } from "../types/location";

import {
  applyAdjustment,
  getAllocations,
} from "../services/materialAllocationService";

type SnackbarSeverity = "success" | "error" | "warning" | "info";
type Direction = "increase" | "decrease";

const UNALLOCATED_LOCATION = "UNALLOCATED";

const ADJUSTMENT_REASONS = [
  "Physical Count Variance",
  "Damage",
  "Loss",
  "Correction",
  "Other",
];

export default function AdjustmentTab() {
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: SnackbarSeverity;
  }>({ open: false, message: "", severity: "info" });

  function showSnackbar(message: string, severity: SnackbarSeverity) {
    setSnackbar({ open: true, message, severity });
  }

  const [material, setMaterial] = usePersistentState<Material | null>(
    "adjustment.material",
    null
  );
  const [location, setLocation] = usePersistentState<Location | null>(
    "adjustment.location",
    null
  );

  const [currentQuantity, setCurrentQuantity] = useState<number | null>(null);
  const [loadingCurrent, setLoadingCurrent] = useState(false);

  const [direction, setDirection] = usePersistentState<Direction>(
    "adjustment.direction",
    "increase"
  );
  const [amount, setAmount] = usePersistentState("adjustment.amount", "");
  const [reason, setReason] = usePersistentState("adjustment.reason", "");
  const [remarks, setRemarks] = usePersistentState("adjustment.remarks", "");
  const [saving, setSaving] = useState(false);

  // No location means "Unallocated" for both directions - Increase adds
  // to Unallocated to be allocated later, and Decrease (e.g. reversing
  // that same increase) takes it back out of Unallocated. Decreasing
  // stock actually held at a real location still requires picking that
  // location explicitly.
  const effectiveLocationCode = location?.location_code ?? UNALLOCATED_LOCATION;

  useEffect(() => {
    if (!material || !effectiveLocationCode) {
      setCurrentQuantity(null);
      return;
    }

    let cancelled = false;
    setLoadingCurrent(true);

    getAllocations(material.material_code)
      .then((allocations) => {
        if (cancelled) return;

        const existing = allocations.find(
          (a) => a.location_code === effectiveLocationCode
        );

        setCurrentQuantity(existing ? existing.quantity : 0);
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingCurrent(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [material, effectiveLocationCode]);

  // The underlying adjustment mechanism (applyAdjustment) still takes a
  // single absolute "new quantity" - the Increase/Decrease toggle is a
  // friendlier input on top of that, computed here in the UI layer only.
  const amountValue = Number(amount);
  const hasValidAmount = amount !== "" && !Number.isNaN(amountValue) && amountValue > 0;

  const computedNewQuantity =
    currentQuantity !== null && hasValidAmount
      ? direction === "increase"
        ? currentQuantity + amountValue
        : currentQuantity - amountValue
      : null;

  async function handleSubmit() {
    if (!material) {
      showSnackbar("Please select a material.", "warning");
      return;
    }

    if (!hasValidAmount) {
      showSnackbar("Please enter a valid quantity.", "warning");
      return;
    }

    if (computedNewQuantity === null || computedNewQuantity < 0) {
      showSnackbar("Resulting quantity cannot be negative.", "warning");
      return;
    }

    if (!reason) {
      showSnackbar("Please select a reason for this adjustment.", "warning");
      return;
    }

    setSaving(true);

    try {
      await applyAdjustment(
        material.material_code,
        effectiveLocationCode,
        computedNewQuantity,
        reason,
        remarks || undefined
      );

      showSnackbar(
        location
          ? `Stock adjusted to ${computedNewQuantity} for ${material.material_code} at ${location.location_code}.`
          : `Stock adjusted to ${computedNewQuantity} for ${material.material_code} (Unallocated).`,
        "success"
      );

      setCurrentQuantity(computedNewQuantity);
      setAmount("");
      setReason("");
      setRemarks("");
    } catch {
      showSnackbar("Something went wrong while saving the adjustment.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box sx={{ mt: 1.5 }}>
      <Card elevation={0} sx={{ borderRadius: 2, boxShadow: "0 2px 10px rgba(15, 23, 42, 0.06)" }}>
        <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
          <Typography sx={{ fontWeight: 700, fontSize: "0.9rem", mb: 1 }}>
            Manual Stock Adjustment
          </Typography>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <MaterialSearch value={material} onChange={setMaterial} />

            <LocationSearch
              value={location}
              onChange={setLocation}
              label="Search Location (optional - leave blank for Unallocated)"
            />

            {material && effectiveLocationCode && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  px: 1.25,
                  py: 0.75,
                  borderRadius: 2,
                  bgcolor: "grey.50",
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  Current Quantity {location ? `at ${location.location_code}` : "(Unallocated)"}
                </Typography>

                {loadingCurrent ? (
                  <CircularProgress size={16} />
                ) : (
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {currentQuantity ?? 0} {material.uom}
                  </Typography>
                )}
              </Box>
            )}

            <ToggleButtonGroup
              value={direction}
              exclusive
              fullWidth
              size="small"
              onChange={(_, value: Direction | null) => {
                if (value) setDirection(value);
              }}
              sx={{
                "& .MuiToggleButton-root": {
                  minHeight: 40,
                  borderRadius: 2,
                  fontWeight: 700,
                  textTransform: "none",
                  gap: 0.5,
                },
              }}
            >
              <ToggleButton value="increase" color="success">
                <AddIcon fontSize="small" /> Increase
              </ToggleButton>
              <ToggleButton value="decrease" color="error">
                <RemoveIcon fontSize="small" /> Decrease
              </ToggleButton>
            </ToggleButtonGroup>

            <TextField
              label="Quantity"
              type="number"
              size="small"
              fullWidth
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              slotProps={{ htmlInput: { inputMode: "numeric", min: 0 } }}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
              helperText={
                computedNewQuantity !== null
                  ? `New quantity will be: ${computedNewQuantity}`
                  : " "
              }
            />

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

            <Button
              variant="contained"
              fullWidth
              startIcon={
                saving ? (
                  <CircularProgress size={18} color="inherit" />
                ) : (
                  <TuneIcon fontSize="small" />
                )
              }
              onClick={handleSubmit}
              disabled={saving}
              sx={{ minHeight: 42, borderRadius: 2, fontWeight: 700 }}
            >
              Save
            </Button>
          </Box>
        </CardContent>
      </Card>

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
