import { useState } from "react";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Snackbar,
  TextField,
  Typography,
} from "@mui/material";

import PlaylistAddIcon from "@mui/icons-material/PlaylistAdd";

import MaterialSearch from "./MaterialSearch";
import LocationSearch from "./LocationSearch";
import SapHistoryImportCard from "./SapHistoryImportCard";

import { usePersistentState } from "../hooks/usePersistentState";

import type { Material } from "../types/material";
import type { Location } from "../types/location";

import { applyOpeningStock } from "../services/materialAllocationService";

type SnackbarSeverity = "success" | "error" | "warning" | "info";

const UNALLOCATED_LOCATION = "UNALLOCATED";

export interface StockUpdateTabProps {
  onImportComplete?: () => void;
}

export default function StockUpdateTab({ onImportComplete }: StockUpdateTabProps) {
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: SnackbarSeverity;
  }>({ open: false, message: "", severity: "info" });

  function showSnackbar(message: string, severity: SnackbarSeverity) {
    setSnackbar({ open: true, message, severity });
  }

  // ---------------- Manual entry ----------------
  const [manualMaterial, setManualMaterial] = usePersistentState<
    Material | null
  >("stockUpdate.manualMaterial", null);
  const [manualLocation, setManualLocation] = usePersistentState<
    Location | null
  >("stockUpdate.manualLocation", null);
  const [manualQuantity, setManualQuantity] = usePersistentState(
    "stockUpdate.manualQuantity",
    ""
  );
  const [savingManual, setSavingManual] = useState(false);

  async function handleManualSubmit() {
    if (!manualMaterial) {
      showSnackbar("Please select a material.", "warning");
      return;
    }

    const quantity = Number(manualQuantity);

    if (!manualQuantity || Number.isNaN(quantity) || quantity <= 0) {
      showSnackbar("Please enter a valid quantity.", "warning");
      return;
    }

    const locationCode = manualLocation?.location_code ?? UNALLOCATED_LOCATION;

    setSavingManual(true);

    try {
      await applyOpeningStock(
        manualMaterial.material_code,
        locationCode,
        quantity,
        "Manual entry"
      );

      showSnackbar(
        manualLocation
          ? `${quantity} added for ${manualMaterial.material_code} at ${manualLocation.location_code}.`
          : `${quantity} added for ${manualMaterial.material_code} (Unallocated).`,
        "success"
      );

      setManualMaterial(null);
      setManualLocation(null);
      setManualQuantity("");

      onImportComplete?.();
    } catch {
      showSnackbar("Something went wrong while saving the stock entry.", "error");
    } finally {
      setSavingManual(false);
    }
  }

  return (
    <Box sx={{ mt: 1.5, display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Alert severity="info" sx={{ borderRadius: 2, py: 0.5 }}>
        Stock updates are done in one place - the SAP import below. Upload
        the MB52 Current Stock sheet to set the SAP distribution and
        reconcile it against the app: new materials are created with their
        stock in Unallocated, matching totals are left untouched, and
        differences create reviews under Inventory &gt; Adjust. Use Manual
        Stock Entry below for one-off additions or a single physical count.
      </Alert>

      {/* ---- SAP imports (MB52 = bulk stock update, MB51 = history) ---- */}
      <SapHistoryImportCard onImportComplete={onImportComplete} />

      {/* ---- Manual entry ---- */}
      <Card elevation={0} sx={{ borderRadius: 2, boxShadow: "0 2px 10px rgba(15, 23, 42, 0.06)" }}>
        <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
          <Typography sx={{ fontWeight: 700, fontSize: "0.9rem", mb: 1 }}>
            Manual Stock Entry
          </Typography>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <MaterialSearch value={manualMaterial} onChange={setManualMaterial} />

            <LocationSearch
              value={manualLocation}
              onChange={setManualLocation}
              label="Search Location (optional - leave blank for Unallocated)"
            />

            <TextField
              label="Quantity"
              type="number"
              size="small"
              fullWidth
              value={manualQuantity}
              onChange={(e) => setManualQuantity(e.target.value)}
              slotProps={{ htmlInput: { inputMode: "numeric" } }}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            />

            <Button
              variant="contained"
              fullWidth
              startIcon={
                savingManual ? (
                  <CircularProgress size={18} color="inherit" />
                ) : (
                  <PlaylistAddIcon fontSize="small" />
                )
              }
              onClick={handleManualSubmit}
              disabled={savingManual}
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
