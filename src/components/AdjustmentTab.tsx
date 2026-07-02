import { useEffect, useState } from "react";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  MenuItem,
  Snackbar,
  TextField,
  Typography,
} from "@mui/material";

import TuneIcon from "@mui/icons-material/Tune";

import MaterialSearch from "./MaterialSearch";
import LocationSearch from "./LocationSearch";

import type { Material } from "../types/material";
import type { Location } from "../types/location";

import {
  applyAdjustment,
  getAllocations,
} from "../services/materialAllocationService";

type SnackbarSeverity = "success" | "error" | "warning" | "info";

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

  const [material, setMaterial] = useState<Material | null>(null);
  const [location, setLocation] = useState<Location | null>(null);

  const [currentQuantity, setCurrentQuantity] = useState<number | null>(null);
  const [loadingCurrent, setLoadingCurrent] = useState(false);

  const [newQuantity, setNewQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!material || !location) {
      setCurrentQuantity(null);
      return;
    }

    let cancelled = false;
    setLoadingCurrent(true);

    getAllocations(material.material_code)
      .then((allocations) => {
        if (cancelled) return;

        const existing = allocations.find(
          (a) => a.location_code === location.location_code
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
  }, [material, location]);

  async function handleSubmit() {
    if (!material) {
      showSnackbar("Please select a material.", "warning");
      return;
    }

    if (!location) {
      showSnackbar("Please select a location.", "warning");
      return;
    }

    const quantity = Number(newQuantity);

    if (!newQuantity || Number.isNaN(quantity) || quantity < 0) {
      showSnackbar("Please enter a valid new quantity.", "warning");
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
        location.location_code,
        quantity,
        reason,
        remarks || undefined
      );

      showSnackbar(
        `Stock adjusted to ${quantity} for ${material.material_code} at ${location.location_code}.`,
        "success"
      );

      setCurrentQuantity(quantity);
      setNewQuantity("");
      setReason("");
      setRemarks("");
    } catch {
      showSnackbar("Something went wrong while saving the adjustment.", "error");
    } finally {
      setSaving(false);
    }
  }

  const delta =
    currentQuantity !== null && newQuantity !== "" && !Number.isNaN(Number(newQuantity))
      ? Number(newQuantity) - currentQuantity
      : null;

  return (
    <Box sx={{ mt: 2.5 }}>
      <Card elevation={0} sx={{ borderRadius: 4, boxShadow: "0 4px 20px rgba(15, 23, 42, 0.07)" }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
            Manual Stock Adjustment
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
            Correct the allocated quantity for a material at a location. A reason is required.
          </Typography>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <MaterialSearch value={material} onChange={setMaterial} />

            <LocationSearch value={location} onChange={setLocation} />

            {material && location && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  p: 2,
                  borderRadius: 2,
                  bgcolor: "grey.50",
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  Current Quantity
                </Typography>

                {loadingCurrent ? (
                  <CircularProgress size={18} />
                ) : (
                  <Typography sx={{ fontWeight: 700 }}>
                    {currentQuantity ?? 0} {material.uom}
                  </Typography>
                )}
              </Box>
            )}

            <TextField
              label="New Quantity"
              type="number"
              fullWidth
              value={newQuantity}
              onChange={(e) => setNewQuantity(e.target.value)}
              slotProps={{ htmlInput: { inputMode: "numeric" } }}
              helperText={
                delta !== null
                  ? `Change: ${delta > 0 ? "+" : ""}${delta}`
                  : " "
              }
            />

            <TextField
              select
              label="Reason"
              fullWidth
              value={reason}
              onChange={(e) => setReason(e.target.value)}
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
              fullWidth
              multiline
              minRows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />

            <Divider />

            <Button
              variant="contained"
              size="large"
              fullWidth
              startIcon={
                saving ? (
                  <CircularProgress size={20} color="inherit" />
                ) : (
                  <TuneIcon />
                )
              }
              onClick={handleSubmit}
              disabled={saving}
              sx={{ minHeight: 52, borderRadius: 2.5, fontWeight: 700 }}
            >
              Apply Adjustment
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
