import { useState } from "react";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  IconButton,
  MenuItem,
  Paper,
  Snackbar,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";

import { useTheme } from "@mui/material/styles";

import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import PlaceIcon from "@mui/icons-material/Place";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import FlashOnIcon from "@mui/icons-material/FlashOn";

import MaterialSearch from "../components/MaterialSearch";
import LocationSearch from "../components/LocationSearch";

import {
  createTransfer,
  getMaterialStockLocations,
  summarizeMaterialStock,
  summarizeTransfer,
  validateTransfer,
  type TransferMaterialInput,
  type TransferLocationInput,
  type MaterialStockSummary,
} from "../services/transferService";

import type { Material } from "../types/material";
import type { Location } from "../types/location";
import type { MaterialAllocation } from "../types/materialAllocation";

import { BOTTOM_NAV_OFFSET } from "../components/AppLayout";

type SnackbarSeverity = "success" | "error" | "warning" | "info";

const emptyStockSummary: MaterialStockSummary = {
  totalStock: 0,
  allocatedStock: 0,
  unallocatedStock: 0,
};

interface LocationRowState {
  rowKey: string;
  from_location_code: string;
  fromAvailableQty: number;
  fromAllocationId: number;
  to: Location | null;
  toAvailableQty: number;
  toAllocationId?: number;
  transferQty: string;
}

interface MaterialRowState {
  rowKey: string;
  material: Material | null;
  stockLocations: MaterialAllocation[];
  stockSummary: MaterialStockSummary;
  locations: LocationRowState[];
  loadingStock: boolean;
}

function makeKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyMaterialRow(): MaterialRowState {
  return {
    rowKey: makeKey(),
    material: null,
    stockLocations: [],
    stockSummary: emptyStockSummary,
    locations: [],
    loadingStock: false,
  };
}

const emptyHeader = {
  transfer_by: "",
  reason: "",
  remarks: "",
};

export default function LocationTransfer() {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("md"));

  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: SnackbarSeverity;
  }>({ open: false, message: "", severity: "info" });

  function showSnackbar(message: string, severity: SnackbarSeverity) {
    setSnackbar({ open: true, message, severity });
  }

  // ---------------- New Transfer form ----------------
  const [header, setHeader] = useState(emptyHeader);
  const [materialRows, setMaterialRows] = useState<MaterialRowState[]>([
    emptyMaterialRow(),
  ]);
  const [saving, setSaving] = useState(false);

  function updateHeader<K extends keyof typeof emptyHeader>(
    field: K,
    value: (typeof emptyHeader)[K]
  ) {
    setHeader((prev) => ({ ...prev, [field]: value }));
  }

  function resetForm() {
    setHeader(emptyHeader);
    setMaterialRows([emptyMaterialRow()]);
  }

  function addMaterialRow() {
    setMaterialRows((prev) => [...prev, emptyMaterialRow()]);
  }

  function removeMaterialRow(rowKey: string) {
    setMaterialRows((prev) => {
      const next = prev.filter((r) => r.rowKey !== rowKey);
      return next.length > 0 ? next : [emptyMaterialRow()];
    });
  }

  async function handleMaterialSelect(rowKey: string, material: Material | null) {
    setMaterialRows((prev) =>
      prev.map((row) =>
        row.rowKey === rowKey
          ? {
              ...row,
              material,
              stockLocations: [],
              stockSummary: emptyStockSummary,
              locations: [],
              loadingStock: !!material,
            }
          : row
      )
    );

    if (!material) return;

    try {
      const allocations = await getMaterialStockLocations(material.material_code);
      const activeAllocations = allocations.filter((a) => a.quantity > 0);
      const stockSummary = summarizeMaterialStock(activeAllocations);

      setMaterialRows((prev) =>
        prev.map((row) =>
          row.rowKey === rowKey
            ? {
                ...row,
                stockLocations: activeAllocations,
                stockSummary,
                loadingStock: false,
              }
            : row
        )
      );
    } catch {
      showSnackbar("Failed to load stock locations for this material.", "error");
      setMaterialRows((prev) =>
        prev.map((row) =>
          row.rowKey === rowKey ? { ...row, loadingStock: false } : row
        )
      );
    }
  }

  function addLocationRow(materialRowKey: string, allocation: MaterialAllocation) {
    setMaterialRows((prev) =>
      prev.map((row) =>
        row.rowKey === materialRowKey
          ? {
              ...row,
              locations: [
                ...row.locations,
                {
                  rowKey: makeKey(),
                  from_location_code: allocation.location_code,
                  fromAvailableQty: Number(allocation.quantity),
                  fromAllocationId: allocation.id as number,
                  to: null,
                  toAvailableQty: 0,
                  toAllocationId: undefined,
                  transferQty: "",
                },
              ],
            }
          : row
      )
    );
  }

  function removeLocationRow(materialRowKey: string, locationRowKey: string) {
    setMaterialRows((prev) =>
      prev.map((row) =>
        row.rowKey === materialRowKey
          ? {
              ...row,
              locations: row.locations.filter((l) => l.rowKey !== locationRowKey),
            }
          : row
      )
    );
  }

  function updateToLocation(
    materialRowKey: string,
    locationRowKey: string,
    to: Location | null
  ) {
    setMaterialRows((prev) =>
      prev.map((row) => {
        if (row.rowKey !== materialRowKey) return row;

        return {
          ...row,
          locations: row.locations.map((l) => {
            if (l.rowKey !== locationRowKey) return l;

            // If the material already has stock at the chosen TO
            // location, use that existing allocation's quantity/id so
            // the Inventory Engine updates it instead of creating a
            // duplicate row.
            const existing = to
              ? row.stockLocations.find(
                  (a) => a.location_code === to.location_code
                )
              : undefined;

            return {
              ...l,
              to,
              toAvailableQty: existing ? Number(existing.quantity) : 0,
              toAllocationId: existing?.id as number | undefined,
            };
          }),
        };
      })
    );
  }

  function updateTransferQty(
    materialRowKey: string,
    locationRowKey: string,
    value: string
  ) {
    setMaterialRows((prev) =>
      prev.map((row) =>
        row.rowKey === materialRowKey
          ? {
              ...row,
              locations: row.locations.map((l) =>
                l.rowKey === locationRowKey ? { ...l, transferQty: value } : l
              ),
            }
          : row
      )
    );
  }

  function handleTransferAll(materialRowKey: string, locationRowKey: string) {
    setMaterialRows((prev) =>
      prev.map((row) =>
        row.rowKey === materialRowKey
          ? {
              ...row,
              locations: row.locations.map((l) =>
                l.rowKey === locationRowKey
                  ? { ...l, transferQty: String(l.fromAvailableQty) }
                  : l
              ),
            }
          : row
      )
    );
  }

  function buildMaterialInputs(): TransferMaterialInput[] {
    return materialRows
      .filter((row) => row.material)
      .map((row) => ({
        material_code: row.material!.material_code,
        short_description: row.material!.short_description,
        uom: row.material!.uom,
        locations: row.locations
          .filter((l) => l.to)
          .map((l): TransferLocationInput => ({
            from_location_code: l.from_location_code,
            fromAvailableQty: l.fromAvailableQty,
            fromAllocationId: l.fromAllocationId,
            to_location_code: l.to!.location_code,
            toAvailableQty: l.toAvailableQty,
            toAllocationId: l.toAllocationId,
            transferQty: Number(l.transferQty) || 0,
          })),
      }));
  }

  const materialInputs = buildMaterialInputs();
  const summary = summarizeTransfer(materialInputs);

  async function handleSave() {
    if (!header.transfer_by.trim()) {
      showSnackbar("Please enter Transfer By.", "warning");
      return;
    }

    const validation = validateTransfer(materialInputs);
    if (!validation.valid) {
      showSnackbar(validation.error ?? "Please review the transfer details.", "warning");
      return;
    }

    setSaving(true);

    try {
      const transfer = await createTransfer(header, materialInputs);
      showSnackbar(`Transfer ${transfer.transfer_number} saved.`, "success");
      resetForm();
    } catch {
      showSnackbar(
        "Something went wrong while saving the transfer. Please check stock availability and try again.",
        "error"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box sx={{ pb: 4 }}>
      <Typography
        sx={{
          mb: 1.5,
          fontWeight: 700,
          fontSize: { xs: "1.05rem", sm: "1.25rem" },
        }}
      >
        Location Transfer
      </Typography>

      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
          pb: mobile ? `calc(80px + ${BOTTOM_NAV_OFFSET})` : 10,
        }}
      >
        {/* ---- Transfer Header ---- */}
        <Card elevation={0} sx={{ borderRadius: 2, boxShadow: "0 2px 10px rgba(15,23,42,0.06)" }}>
          <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
            <Typography sx={{ fontWeight: 700, fontSize: "0.9rem", mb: 1 }}>
              Transfer Details
            </Typography>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <TextField
                label="Transfer By"
                size="small"
                fullWidth
                required
                value={header.transfer_by}
                onChange={(e) => updateHeader("transfer_by", e.target.value)}
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
              />

              <TextField
                label="Reason"
                size="small"
                fullWidth
                value={header.reason}
                onChange={(e) => updateHeader("reason", e.target.value)}
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
              />

              <TextField
                label="Remarks"
                size="small"
                fullWidth
                multiline
                minRows={2}
                value={header.remarks}
                onChange={(e) => updateHeader("remarks", e.target.value)}
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
              />
            </Box>
          </CardContent>
        </Card>

        {/* ---- Materials ---- */}
        <Typography sx={{ fontWeight: 700, fontSize: "0.9rem", mt: 0.5 }}>
          Materials
        </Typography>

        {materialRows.map((row) => (
          <Card
            key={row.rowKey}
            elevation={0}
            sx={{ borderRadius: 2, boxShadow: "0 2px 10px rgba(15,23,42,0.06)" }}
          >
            <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
              <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <MaterialSearch
                    value={row.material}
                    onChange={(material) => handleMaterialSelect(row.rowKey, material)}
                  />
                </Box>
                <IconButton
                  size="small"
                  onClick={() => removeMaterialRow(row.rowKey)}
                  aria-label="Remove material"
                  sx={{ mt: 0.5 }}
                >
                  <DeleteIcon fontSize="small" color="error" />
                </IconButton>
              </Box>

              {row.material && (
                <Box sx={{ mt: 1.25 }}>
                  <Box
                    sx={{
                      p: 1,
                      borderRadius: 2,
                      bgcolor: "grey.50",
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                      {row.material.material_code}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", mb: 0.75, overflowWrap: "break-word" }}
                    >
                      {row.material.short_description} ({row.material.uom})
                    </Typography>

                    {row.loadingStock ? (
                      <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
                        <CircularProgress size={18} />
                      </Box>
                    ) : (
                      <Box sx={{ display: "flex", gap: 1 }}>
                        <Box sx={{ flex: 1, textAlign: "center" }}>
                          <Typography sx={{ fontWeight: 800 }}>
                            {row.stockSummary.totalStock}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem" }}>
                            Total Stock
                          </Typography>
                        </Box>
                        <Box sx={{ flex: 1, textAlign: "center" }}>
                          <Typography sx={{ fontWeight: 800 }} color="primary.main">
                            {row.stockSummary.allocatedStock}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem" }}>
                            Allocated
                          </Typography>
                        </Box>
                        <Box sx={{ flex: 1, textAlign: "center" }}>
                          <Typography sx={{ fontWeight: 800 }} color="warning.main">
                            {row.stockSummary.unallocatedStock}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem" }}>
                            Unallocated
                          </Typography>
                        </Box>
                      </Box>
                    )}
                  </Box>

                  {!row.loadingStock && row.stockLocations.length === 0 && (
                    <Alert severity="warning" sx={{ mt: 1, py: 0.25 }}>
                      No stock available for this material at any location.
                    </Alert>
                  )}

                  {row.locations.length > 0 && (
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, mt: 1 }}>
                      {row.locations.map((loc) => {
                        const sameLocation =
                          !!loc.to && loc.to.location_code === loc.from_location_code;
                        const overQty = Number(loc.transferQty) > loc.fromAvailableQty;

                        return (
                          <Box
                            key={loc.rowKey}
                            sx={{
                              p: 1,
                              borderRadius: 2,
                              bgcolor: "background.paper",
                              border: "1px solid",
                              borderColor: "divider",
                            }}
                          >
                            <Box
                              sx={{
                                display: "flex",
                                flexDirection: { xs: "column", sm: "row" },
                                alignItems: { xs: "stretch", sm: "center" },
                                gap: 0.75,
                                mb: 0.75,
                              }}
                            >
                              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.4 }}>
                                    <PlaceIcon sx={{ fontSize: 14 }} color="action" />
                                    <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                                      {loc.from_location_code}
                                    </Typography>
                                  </Box>
                                  <Typography variant="caption" color="text.secondary">
                                    Available: {loc.fromAvailableQty}
                                  </Typography>
                                </Box>

                                <ArrowForwardIcon
                                  fontSize="small"
                                  color="action"
                                  sx={{ display: { xs: "none", sm: "inline-flex" } }}
                                />

                                <IconButton
                                  size="small"
                                  onClick={() => removeLocationRow(row.rowKey, loc.rowKey)}
                                  aria-label="Remove location"
                                  sx={{ display: { xs: "inline-flex", sm: "none" } }}
                                >
                                  <DeleteIcon fontSize="small" color="error" />
                                </IconButton>
                              </Box>

                              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                                <Box sx={{ flex: 1.4, minWidth: 0 }}>
                                  <LocationSearch
                                    value={loc.to}
                                    onChange={(to) =>
                                      updateToLocation(row.rowKey, loc.rowKey, to)
                                    }
                                    label="To Location"
                                  />
                                </Box>

                                <IconButton
                                  size="small"
                                  onClick={() => removeLocationRow(row.rowKey, loc.rowKey)}
                                  aria-label="Remove location"
                                  sx={{ display: { xs: "none", sm: "inline-flex" } }}
                                >
                                  <DeleteIcon fontSize="small" color="error" />
                                </IconButton>
                              </Box>
                            </Box>

                            {sameLocation && (
                              <Alert severity="error" sx={{ py: 0, mb: 0.75 }}>
                                From Location cannot equal To Location.
                              </Alert>
                            )}

                            <Box
                              sx={{
                                display: "flex",
                                flexDirection: { xs: "column", sm: "row" },
                                gap: 1,
                                alignItems: { xs: "stretch", sm: "center" },
                              }}
                            >
                              <TextField
                                label="Transfer Qty"
                                type="number"
                                size="small"
                                fullWidth
                                value={loc.transferQty}
                                onChange={(e) =>
                                  updateTransferQty(row.rowKey, loc.rowKey, e.target.value)
                                }
                                error={overQty}
                                slotProps={{ htmlInput: { inputMode: "numeric", min: 0 } }}
                                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                              />
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={<FlashOnIcon fontSize="small" />}
                                onClick={() => handleTransferAll(row.rowKey, loc.rowKey)}
                                sx={{
                                  flexShrink: 0,
                                  minHeight: 40,
                                  borderRadius: 2,
                                  fontWeight: 700,
                                  textTransform: "none",
                                  whiteSpace: "nowrap",
                                  width: { xs: "100%", sm: "auto" },
                                }}
                              >
                                Transfer All
                              </Button>
                            </Box>
                          </Box>
                        );
                      })}
                    </Box>
                  )}

                  {(() => {
                    const remainingLocations = row.stockLocations.filter(
                      (a) =>
                        !row.locations.some(
                          (l) => l.from_location_code === a.location_code
                        )
                    );

                    if (remainingLocations.length === 0) {
                      return row.locations.length > 0 ? (
                        <Alert severity="info" sx={{ mt: 1, py: 0.25 }}>
                          All locations with stock for this material have been added.
                        </Alert>
                      ) : null;
                    }

                    return (
                      <TextField
                        select
                        size="small"
                        fullWidth
                        label="Add Location"
                        value=""
                        onChange={(e) => {
                          const allocation = remainingLocations.find(
                            (a) => a.location_code === e.target.value
                          );
                          if (allocation) addLocationRow(row.rowKey, allocation);
                        }}
                        sx={{ mt: 1, "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                        slotProps={{
                          select: {
                            displayEmpty: true,
                            renderValue: () => (
                              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: "primary.main" }}>
                                <AddIcon fontSize="small" />
                                <span>Add Location</span>
                              </Box>
                            ),
                          },
                        }}
                      >
                        {remainingLocations.map((a) => (
                          <MenuItem key={a.location_code} value={a.location_code}>
                            {a.location_code} (available: {a.quantity})
                          </MenuItem>
                        ))}
                      </TextField>
                    );
                  })()}
                </Box>
              )}
            </CardContent>
          </Card>
        ))}

        <Button
          variant="outlined"
          startIcon={<AddIcon fontSize="small" />}
          onClick={addMaterialRow}
          sx={{ minHeight: 48, borderRadius: 2, fontWeight: 700 }}
        >
          Add Material
        </Button>

        {/* ---- Summary ---- */}
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            borderRadius: 2,
            boxShadow: "0 2px 10px rgba(15,23,42,0.06)",
            display: "flex",
            justifyContent: "space-around",
            textAlign: "center",
          }}
        >
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              {summary.totalMaterials}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Materials
            </Typography>
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              {summary.totalLocations}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Locations
            </Typography>
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800 }} color="primary.main">
              {summary.totalQuantity}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Total Qty
            </Typography>
          </Box>
        </Paper>

        {/* ---- Sticky Save bar ---- */}
        <Box
          sx={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: mobile ? BOTTOM_NAV_OFFSET : 0,
            zIndex: 10,
            bgcolor: "background.paper",
            borderTop: "1px solid",
            borderColor: "divider",
            p: 1.25,
            display: "flex",
            gap: 1,
          }}
        >
          <Button
            onClick={resetForm}
            disabled={saving}
            startIcon={<RestartAltIcon fontSize="small" />}
            sx={{ minHeight: 48, borderRadius: 2, fontWeight: 600 }}
          >
            Reset
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            fullWidth
            startIcon={
              saving ? <CircularProgress size={18} color="inherit" /> : <SwapHorizIcon fontSize="small" />
            }
            sx={{ minHeight: 48, borderRadius: 2, fontWeight: 700 }}
          >
            Save Transfer
          </Button>
        </Box>
      </Box>

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
