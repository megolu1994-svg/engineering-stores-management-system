import { useEffect, useState } from "react";

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
import SendIcon from "@mui/icons-material/Send";
import RestartAltIcon from "@mui/icons-material/RestartAlt";

import MaterialSearch from "../components/MaterialSearch";

import {
  createIssue,
  getMaterialStockLocations,
  summarizeIssue,
  validateIssue,
  ISSUE_TYPES,
  type IssueType,
  type IssueMaterialInput,
  type IssueLocationInput,
} from "../services/issueService";

import { BOTTOM_NAV_OFFSET, CONTENT_MAX_WIDTH, DRAWER_WIDTH } from "../components/AppLayout";

import type { Material } from "../types/material";
import type { MaterialAllocation } from "../types/materialAllocation";
import { usePersistentState } from "../hooks/usePersistentState";

type SnackbarSeverity = "success" | "error" | "warning" | "info";

interface LocationRowState {
  rowKey: string;
  location_code: string;
  availableQty: number;
  allocationId: number;
  issueQty: string;
}

interface MaterialRowState {
  rowKey: string;
  material: Material | null;
  stockLocations: MaterialAllocation[];
  totalAvailableQty: number;
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
    totalAvailableQty: 0,
    locations: [],
    loadingStock: false,
  };
}

const emptyHeader = {
  issue_type: "Normal" as IssueType,
  department: "",
  user_section: "",
  sap_reservation_number: "",
  work_order_number: "",
  cost_center: "",
  issued_by: "",
  received_by: "",
  remarks: "",
};

export default function MaterialIssue() {
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

  // ---------------- New Issue form ----------------
  const [header, setHeader] = usePersistentState(
    "materialIssue.header",
    emptyHeader
  );
  const [materialRows, setMaterialRows] = usePersistentState<
    MaterialRowState[]
  >("materialIssue.materialRows", [emptyMaterialRow()]);
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
              totalAvailableQty: 0,
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
      const totalAvailableQty = activeAllocations.reduce(
        (sum, a) => sum + Number(a.quantity),
        0
      );

      setMaterialRows((prev) =>
        prev.map((row) =>
          row.rowKey === rowKey
            ? {
                ...row,
                stockLocations: activeAllocations,
                totalAvailableQty,
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

  // A row's stock lookup can be interrupted mid-flight if the user
  // navigates away before it resolves - since materialRows is now
  // persisted, that row would otherwise be restored permanently stuck
  // at "loading" with no way to recover. Re-run the lookup for any row
  // left in that state once, right after mount.
  useEffect(() => {
    materialRows.forEach((row) => {
      if (row.material && row.loadingStock) {
        handleMaterialSelect(row.rowKey, row.material);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
                  location_code: allocation.location_code,
                  availableQty: Number(allocation.quantity),
                  allocationId: allocation.id as number,
                  issueQty: "",
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

  function updateIssueQty(
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
                l.rowKey === locationRowKey ? { ...l, issueQty: value } : l
              ),
            }
          : row
      )
    );
  }

  function buildMaterialInputs(): IssueMaterialInput[] {
    return materialRows
      .filter((row) => row.material)
      .map((row) => ({
        material_code: row.material!.material_code,
        short_description: row.material!.short_description,
        uom: row.material!.uom,
        locations: row.locations.map((l): IssueLocationInput => ({
          location_code: l.location_code,
          availableQty: l.availableQty,
          allocationId: l.allocationId,
          issueQty: Number(l.issueQty) || 0,
        })),
      }));
  }

  const materialInputs = buildMaterialInputs();
  const summary = summarizeIssue(materialInputs);

  async function handleSave() {
    if (!header.department.trim()) {
      showSnackbar("Please enter a Department.", "warning");
      return;
    }
    if (!header.issued_by.trim()) {
      showSnackbar("Please enter Issued By.", "warning");
      return;
    }
    if (!header.received_by.trim()) {
      showSnackbar("Please enter Received By.", "warning");
      return;
    }

    const validation = validateIssue(materialInputs);
    if (!validation.valid) {
      showSnackbar(validation.error ?? "Please review the issue details.", "warning");
      return;
    }

    setSaving(true);

    try {
      const issue = await createIssue(header, materialInputs);
      showSnackbar(`Issue ${issue.issue_number} saved.`, "success");
      resetForm();
    } catch {
      showSnackbar(
        "Something went wrong while saving the issue. Please check stock availability and try again.",
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
        Material Issue
      </Typography>

      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
          pb: mobile ? `calc(80px + ${BOTTOM_NAV_OFFSET})` : 10,
        }}
      >
        {/* ---- Issue Header ---- */}
        <Card elevation={0} sx={{ borderRadius: 2, boxShadow: "0 2px 10px rgba(15,23,42,0.06)" }}>
          <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
            <Typography sx={{ fontWeight: 700, fontSize: "0.9rem", mb: 1 }}>
              Issue Details
            </Typography>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <TextField
                select
                label="Issue Type"
                size="small"
                fullWidth
                value={header.issue_type}
                onChange={(e) => updateHeader("issue_type", e.target.value as IssueType)}
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
              >
                {ISSUE_TYPES.map((type) => (
                  <MenuItem key={type} value={type}>
                    {type}
                  </MenuItem>
                ))}
              </TextField>

              <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 1 }}>
                <TextField
                  label="Department"
                  size="small"
                  fullWidth
                  required
                  value={header.department}
                  onChange={(e) => updateHeader("department", e.target.value)}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                />
                <TextField
                  label="User / Section"
                  size="small"
                  fullWidth
                  value={header.user_section}
                  onChange={(e) => updateHeader("user_section", e.target.value)}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                />
              </Box>

              <TextField
                label="SAP Reservation Number"
                size="small"
                fullWidth
                value={header.sap_reservation_number}
                onChange={(e) => updateHeader("sap_reservation_number", e.target.value)}
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
              />

              <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 1 }}>
                <TextField
                  label="Work Order / Notification"
                  size="small"
                  fullWidth
                  value={header.work_order_number}
                  onChange={(e) => updateHeader("work_order_number", e.target.value)}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                />
                <TextField
                  label="Cost Center"
                  size="small"
                  fullWidth
                  value={header.cost_center}
                  onChange={(e) => updateHeader("cost_center", e.target.value)}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                />
              </Box>

              <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 1 }}>
                <TextField
                  label="Issued By"
                  size="small"
                  fullWidth
                  required
                  value={header.issued_by}
                  onChange={(e) => updateHeader("issued_by", e.target.value)}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                />
                <TextField
                  label="Received By"
                  size="small"
                  fullWidth
                  required
                  value={header.received_by}
                  onChange={(e) => updateHeader("received_by", e.target.value)}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                />
              </Box>

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
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      p: 1,
                      borderRadius: 2,
                      bgcolor: "grey.50",
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                        {row.material.material_code}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                        {row.material.short_description}
                      </Typography>
                    </Box>

                    {row.loadingStock ? (
                      <CircularProgress size={18} />
                    ) : (
                      <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                          Available
                        </Typography>
                        <Typography sx={{ fontWeight: 800 }} color="primary.main">
                          {row.totalAvailableQty} {row.material.uom}
                        </Typography>
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
                      {row.locations.map((loc) => (
                        <Box
                          key={loc.rowKey}
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            p: 1,
                            borderRadius: 2,
                            bgcolor: "background.paper",
                            border: "1px solid",
                            borderColor: "divider",
                          }}
                        >
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.4 }}>
                              <PlaceIcon sx={{ fontSize: 14 }} color="action" />
                              <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                                {loc.location_code}
                              </Typography>
                            </Box>
                            <Typography variant="caption" color="text.secondary">
                              Available: {loc.availableQty}
                            </Typography>
                          </Box>

                          <TextField
                            label="Issue Qty"
                            type="number"
                            size="small"
                            value={loc.issueQty}
                            onChange={(e) =>
                              updateIssueQty(row.rowKey, loc.rowKey, e.target.value)
                            }
                            error={Number(loc.issueQty) > loc.availableQty}
                            slotProps={{ htmlInput: { inputMode: "numeric", min: 0 } }}
                            sx={{
                              width: 110,
                              flexShrink: 0,
                              "& .MuiOutlinedInput-root": { borderRadius: 2 },
                            }}
                          />

                          <IconButton
                            size="small"
                            onClick={() => removeLocationRow(row.rowKey, loc.rowKey)}
                            aria-label="Remove location"
                          >
                            <DeleteIcon fontSize="small" color="error" />
                          </IconButton>
                        </Box>
                      ))}
                    </Box>
                  )}

                  {row.stockLocations.length > 0 && (
                    <TextField
                      select
                      size="small"
                      fullWidth
                      label="Add Location"
                      value=""
                      onChange={(e) => {
                        const allocation = row.stockLocations.find(
                          (a) => a.location_code === e.target.value
                        );
                        if (allocation) addLocationRow(row.rowKey, allocation);
                      }}
                      sx={{ mt: 1, "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                      slotProps={{
                        inputLabel: { shrink: true },
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
                      {row.stockLocations
                        .filter(
                          (a) =>
                            !row.locations.some(
                              (l) => l.location_code === a.location_code
                            )
                        )
                        .map((a) => (
                          <MenuItem key={a.location_code} value={a.location_code}>
                            {a.location_code} (available: {a.quantity})
                          </MenuItem>
                        ))}
                    </TextField>
                  )}
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
            left: { xs: 0, md: DRAWER_WIDTH },
            right: 0,
            bottom: mobile ? BOTTOM_NAV_OFFSET : 0,
            zIndex: 10,
            bgcolor: "background.paper",
            borderTop: "1px solid",
            borderColor: "divider",
            p: 1.25,
          }}
        >
          <Box
            sx={{
              display: "flex",
              gap: 1,
              maxWidth: CONTENT_MAX_WIDTH,
              mx: "auto",
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
                saving ? <CircularProgress size={18} color="inherit" /> : <SendIcon fontSize="small" />
              }
              sx={{ minHeight: 48, borderRadius: 2, fontWeight: 700 }}
            >
              Save Issue
            </Button>
          </Box>
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
