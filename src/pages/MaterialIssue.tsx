import { useCallback, useEffect, useRef, useState } from "react";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";

import { useTheme } from "@mui/material/styles";

import AddIcon from "@mui/icons-material/Add";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import HistoryIcon from "@mui/icons-material/History";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import PlaceIcon from "@mui/icons-material/Place";
import RefreshIcon from "@mui/icons-material/Refresh";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import SearchIcon from "@mui/icons-material/Search";
import SendIcon from "@mui/icons-material/Send";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import VisibilityIcon from "@mui/icons-material/Visibility";

import MaterialSearch from "../components/MaterialSearch";
import PaginationControls from "../components/PaginationControls";

import {
  createIssue,
  getIssues,
  getIssueWithItems,
  getMaterialStockLocations,
  summarizeIssue,
  uploadReservationPhoto,
  validateIssue,
  DEPARTMENTS,
  type IssueMaterialInput,
  type IssueLocationInput,
  type IssueHeader,
  type IssueWithItems,
} from "../services/issueService";

import { BOTTOM_NAV_OFFSET, CONTENT_MAX_WIDTH, DRAWER_WIDTH } from "../components/AppLayout";

import type { Material } from "../types/material";
import type { MaterialAllocation } from "../types/materialAllocation";
import { usePersistentState } from "../hooks/usePersistentState";
import { useSwipeOpenDrawer } from "../hooks/useSwipeTabs";

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

function formatIssueDate(isoString: string | null | undefined): string {
  if (!isoString) return "-";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  department: "",
  user_section: "",
  sap_reservation_number: "",
  reservation_created_by: "",
  reservation_photo_url: "",
  work_order_number: "",
  cost_center: "",
  issued_by: "",
  received_by: "",
  remarks: "",
};

export default function MaterialIssue() {
  useSwipeOpenDrawer();

  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("md"));

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: SnackbarSeverity;
  }>({ open: false, message: "", severity: "info" });

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoPreviewOpen, setPhotoPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Tab state: "create" (form) or "history" (saved issues & reservation photos)
  const [activeTab, setActiveTab] = useState<"create" | "history">("create");

  // Saved Issues History state
  const [historyIssues, setHistoryIssues] = useState<IssueHeader[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyPageSize, setHistoryPageSize] = useState(25);
  const [historyTotalCount, setHistoryTotalCount] = useState(0);
  const [historySearch, setHistorySearch] = useState("");
  const [historyDepartment, setHistoryDepartment] = useState("ALL");
  const [historyOnlyWithPhotos, setHistoryOnlyWithPhotos] = useState(false);

  // Modals for History tab
  const [selectedPhotoModal, setSelectedPhotoModal] = useState<{
    url: string;
    title: string;
    reservationNo?: string | null;
    createdBy?: string | null;
    department?: string;
    date?: string;
  } | null>(null);

  const [detailsModalIssue, setDetailsModalIssue] = useState<IssueWithItems | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  function showSnackbar(message: string, severity: SnackbarSeverity) {
    setSnackbar({ open: true, message, severity });
  }

  function copyToClipboard(text: string) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      showSnackbar(`Copied "${text}" to clipboard.`, "info");
    }
  }

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await getIssues({
        search: historySearch,
        department: historyDepartment,
        onlyWithPhotos: historyOnlyWithPhotos,
        page: historyPage,
        pageSize: historyPageSize,
      });
      setHistoryIssues(res.data);
      setHistoryTotalCount(res.totalCount);
    } catch (err) {
      console.error(err);
      showSnackbar("Failed to load issue history.", "error");
    } finally {
      setLoadingHistory(false);
    }
  }, [historySearch, historyDepartment, historyOnlyWithPhotos, historyPage, historyPageSize]);

  useEffect(() => {
    if (activeTab === "history") {
      loadHistory();
    }
  }, [activeTab, loadHistory]);

  async function openIssueDetails(issue: IssueHeader) {
    setLoadingDetails(true);
    try {
      const full = await getIssueWithItems(issue.id);
      setDetailsModalIssue(full || { ...issue, items: [] });
    } catch (err) {
      console.error(err);
      setDetailsModalIssue({ ...issue, items: [] });
    } finally {
      setLoadingDetails(false);
    }
  }

  // ---------------- New Issue form ----------------
  const [header, setHeader] = usePersistentState(
    "materialIssue.header",
    emptyHeader
  );

  const [materialRows, setMaterialRows] = usePersistentState<
    MaterialRowState[]
  >("materialIssue.materialRows", []);

  function updateHeader<K extends keyof typeof emptyHeader>(
    field: K,
    value: (typeof emptyHeader)[K]
  ) {
    setHeader((prev) => ({ ...prev, [field]: value }));
  }

  function resetForm() {
    setHeader(emptyHeader);
    setMaterialRows([]);
  }

  // Photo handlers
  async function handlePhotoFile(file: File) {
    if (!file.type.startsWith("image/")) {
      showSnackbar("Please select an image file.", "warning");
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      showSnackbar("Image size exceeds 15MB limit.", "warning");
      return;
    }

    setUploadingPhoto(true);
    try {
      const publicUrl = await uploadReservationPhoto(file);
      updateHeader("reservation_photo_url", publicUrl);
      showSnackbar("Reservation photograph uploaded.", "success");
    } catch (err: any) {
      console.error(err);
      showSnackbar("Failed to upload photo. Please check connection and try again.", "error");
    } finally {
      setUploadingPhoto(false);
    }
  }

  function handlePhotoInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      handlePhotoFile(file);
    }
    // reset input so same file can be re-selected if needed
    e.target.value = "";
  }

  function removePhoto() {
    updateHeader("reservation_photo_url", "");
    showSnackbar("Photograph removed.", "info");
  }

  // Materials handlers
  function addMaterialRow() {
    setMaterialRows((prev) => [...prev, emptyMaterialRow()]);
  }

  function removeMaterialRow(rowKey: string) {
    setMaterialRows((prev) => prev.filter((r) => r.rowKey !== rowKey));
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
      showSnackbar("Please select a Department from the list.", "warning");
      return;
    }

    if (!header.sap_reservation_number.trim() && !header.reservation_photo_url && materialInputs.length === 0) {
      showSnackbar(
        "Please enter an SAP Reservation Number or capture a Reservation Photograph.",
        "warning"
      );
      return;
    }

    // If materials were added, validate locations and quantities
    const validation = validateIssue(materialInputs);
    if (!validation.valid) {
      showSnackbar(validation.error ?? "Please review the material details.", "warning");
      return;
    }

    setSaving(true);

    try {
      const issue = await createIssue(
        {
          department: header.department,
          sap_reservation_number: header.sap_reservation_number,
          reservation_created_by: header.reservation_created_by,
          reservation_photo_url: header.reservation_photo_url,
          remarks: header.remarks,
        },
        materialInputs
      );

      const successDetail =
        materialInputs.length > 0
          ? `${summary.totalMaterials} materials issued and stock updated.`
          : "Saved with reservation details (stock reconciliation can be done later).";

      showSnackbar(`Issue ${issue.issue_number} recorded. ${successDetail}`, "success");
      resetForm();
    } catch (err: any) {
      console.error(err);
      showSnackbar(
        err?.message || "Something went wrong while saving the issue. Please try again.",
        "error"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box sx={{ pb: 4 }}>
      {/* Hidden file & camera inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={handlePhotoInputChange}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handlePhotoInputChange}
      />

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 2,
          flexWrap: "wrap",
          gap: 1.5,
        }}
      >
        <Typography
          sx={{
            fontWeight: 700,
            fontSize: { xs: "1.1rem", sm: "1.3rem" },
          }}
        >
          Material Issue
        </Typography>

        <Tabs
          value={activeTab}
          onChange={(_, val) => setActiveTab(val)}
          sx={{
            minHeight: 40,
            bgcolor: "background.paper",
            borderRadius: 2,
            p: 0.5,
            border: "1px solid",
            borderColor: "divider",
            "& .MuiTab-root": {
              minHeight: 32,
              py: 0.5,
              px: { xs: 1.5, sm: 2 },
              fontWeight: 700,
              fontSize: "0.85rem",
              borderRadius: 1.5,
              textTransform: "none",
            },
            "& .Mui-selected": {
              bgcolor: "primary.main",
              color: "#fff !important",
            },
            "& .MuiTabs-indicator": {
              display: "none",
            },
          }}
        >
          <Tab
            value="create"
            label="New Issue"
            icon={<AddIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
          />
          <Tab
            value="history"
            label="Saved Issues & Photos"
            icon={<HistoryIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
          />
        </Tabs>
      </Box>

      {activeTab === "create" ? (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 1.5,
            pb: mobile ? `calc(80px + ${BOTTOM_NAV_OFFSET})` : 10,
          }}
        >
        {/* ---- Issue Details ---- */}
        <Card
          elevation={0}
          sx={{
            borderRadius: 2,
            boxShadow: "0 2px 10px rgba(15,23,42,0.06)",
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <CardContent sx={{ p: { xs: 1.75, sm: 2 }, "&:last-child": { pb: { xs: 1.75, sm: 2 } } }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
              <Typography sx={{ fontWeight: 700, fontSize: "0.95rem" }}>
                Issue Details
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Reservation & Department Info
              </Typography>
            </Box>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              {/* Row 1: Top Reservation Section with Camera beside */}
              <Box
                sx={{
                  display: "flex",
                  flexDirection: { xs: "column", sm: "row" },
                  gap: 1.5,
                  alignItems: { xs: "stretch", sm: "flex-start" },
                }}
              >
                {/* Left block: SAP Reservation Number & Reservation Created By */}
                <Box sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 1.25 }}>
                  <TextField
                    label="SAP Reservation Number"
                    placeholder="Enter SAP reservation number"
                    size="small"
                    fullWidth
                    value={header.sap_reservation_number}
                    onChange={(e) => updateHeader("sap_reservation_number", e.target.value)}
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                  />

                  <TextField
                    label="Reservation Created By"
                    placeholder="e.g. Employee name or user ID"
                    size="small"
                    fullWidth
                    value={header.reservation_created_by}
                    onChange={(e) => updateHeader("reservation_created_by", e.target.value)}
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                  />
                </Box>

                {/* Right block: Camera & Reservation Photograph */}
                <Box
                  sx={{
                    width: { xs: "100%", sm: 220, md: 240 },
                    flexShrink: 0,
                    p: 1.25,
                    borderRadius: 2,
                    border: "1px dashed",
                    borderColor: header.reservation_photo_url ? "success.light" : "primary.main",
                    bgcolor: header.reservation_photo_url ? "success.50" : "grey.50",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    minHeight: 110,
                    position: "relative",
                  }}
                >
                  {uploadingPhoto ? (
                    <Box sx={{ py: 2, display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                      <CircularProgress size={24} />
                      <Typography variant="caption" color="text.secondary">
                        Uploading photo...
                      </Typography>
                    </Box>
                  ) : header.reservation_photo_url ? (
                    <Box sx={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                      <Box
                        sx={{
                          position: "relative",
                          width: "100%",
                          height: 72,
                          borderRadius: 1.5,
                          overflow: "hidden",
                          bgcolor: "black",
                          cursor: "pointer",
                        }}
                        onClick={() => setPhotoPreviewOpen(true)}
                      >
                        <Box
                          component="img"
                          src={header.reservation_photo_url}
                          alt="Reservation photograph"
                          sx={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                        <Box
                          sx={{
                            position: "absolute",
                            inset: 0,
                            bgcolor: "rgba(0,0,0,0.35)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "white",
                            opacity: 0,
                            "&:hover": { opacity: 1 },
                            transition: "opacity 0.2s",
                          }}
                        >
                          <VisibilityIcon fontSize="small" />
                        </Box>
                      </Box>

                      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", px: 0.5 }}>
                        <Chip
                          size="small"
                          label="Photo Saved"
                          color="success"
                          variant="filled"
                          sx={{ height: 20, fontSize: "0.68rem", fontWeight: 700 }}
                        />
                        <Box sx={{ display: "flex", gap: 0.5 }}>
                          <Tooltip title="View full photo">
                            <IconButton
                              size="small"
                              onClick={() => setPhotoPreviewOpen(true)}
                              sx={{ p: 0.5 }}
                            >
                              <VisibilityIcon fontSize="small" color="primary" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Retake / Change photo">
                            <IconButton
                              size="small"
                              onClick={() => cameraInputRef.current?.click()}
                              sx={{ p: 0.5 }}
                            >
                              <CameraAltIcon fontSize="small" color="action" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Remove photo">
                            <IconButton
                              size="small"
                              onClick={removePhoto}
                              sx={{ p: 0.5 }}
                            >
                              <DeleteIcon fontSize="small" color="error" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </Box>
                    </Box>
                  ) : (
                    <Box sx={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 0.75 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: "primary.main" }}>
                        <PhotoCameraIcon fontSize="small" />
                        <Typography variant="caption" sx={{ fontWeight: 700 }}>
                          Reservation Photo
                        </Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem", lineHeight: 1.2 }}>
                        Capture slip or upload file
                      </Typography>
                      <Box sx={{ display: "flex", gap: 1, mt: 0.5, width: "100%" }}>
                        <Button
                          variant="contained"
                          size="small"
                          fullWidth
                          startIcon={<CameraAltIcon sx={{ fontSize: 16 }} />}
                          onClick={() => cameraInputRef.current?.click()}
                          sx={{
                            borderRadius: 1.5,
                            fontSize: "0.72rem",
                            py: 0.5,
                            textTransform: "none",
                            fontWeight: 700,
                          }}
                        >
                          Camera
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          fullWidth
                          startIcon={<UploadFileIcon sx={{ fontSize: 16 }} />}
                          onClick={() => fileInputRef.current?.click()}
                          sx={{
                            borderRadius: 1.5,
                            fontSize: "0.72rem",
                            py: 0.5,
                            textTransform: "none",
                            fontWeight: 600,
                          }}
                        >
                          Upload
                        </Button>
                      </Box>
                    </Box>
                  )}
                </Box>
              </Box>

              {/* Row 2: Department Selectable from list */}
              <TextField
                select
                label="Department"
                size="small"
                fullWidth
                required
                value={header.department}
                onChange={(e) => updateHeader("department", e.target.value)}
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
              >
                {DEPARTMENTS.map((dept) => (
                  <MenuItem key={dept} value={dept}>
                    {dept}
                  </MenuItem>
                ))}
              </TextField>

              {/* Row 3: Remarks */}
              <TextField
                label="Remarks"
                placeholder="Optional notes or reference information"
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

        {/* ---- Materials (Optional) ---- */}
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 0.5, px: 0.5 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography sx={{ fontWeight: 700, fontSize: "0.95rem" }}>
              Materials
            </Typography>
            <Chip
              label="Optional"
              size="small"
              color="default"
              variant="outlined"
              sx={{ fontWeight: 600, height: 20, fontSize: "0.7rem" }}
            />
          </Box>
          <Typography variant="caption" color="text.secondary">
            Stock reconciliation can be done later
          </Typography>
        </Box>

        {materialRows.length === 0 ? (
          <Paper
            variant="outlined"
            sx={{
              p: 2.5,
              borderRadius: 2,
              textAlign: "center",
              bgcolor: "grey.50",
              borderStyle: "dashed",
              borderColor: "divider",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1,
            }}
          >
            <Inventory2OutlinedIcon sx={{ fontSize: 36, color: "text.secondary" }} />
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                Direct stock deduction is optional
              </Typography>
              <Typography variant="caption" color="text.secondary">
                You can save this Material Issue record with just the reservation details & photograph.
                Add materials below only if you want immediate stock adjustments.
              </Typography>
            </Box>
            <Button
              variant="outlined"
              size="small"
              startIcon={<AddIcon fontSize="small" />}
              onClick={addMaterialRow}
              sx={{ mt: 0.5, borderRadius: 2, fontWeight: 700, textTransform: "none" }}
            >
              Add Material for Direct Stock Deduction
            </Button>
          </Paper>
        ) : (
          materialRows.map((row) => (
            <Card
              key={row.rowKey}
              elevation={0}
              sx={{ borderRadius: 2, boxShadow: "0 2px 10px rgba(15,23,42,0.06)", border: "1px solid", borderColor: "divider" }}
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
          ))
        )}

        {materialRows.length > 0 && (
          <Button
            variant="outlined"
            startIcon={<AddIcon fontSize="small" />}
            onClick={addMaterialRow}
            sx={{ minHeight: 44, borderRadius: 2, fontWeight: 700 }}
          >
            Add Another Material
          </Button>
        )}

        {/* ---- Summary ---- */}
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            borderRadius: 2,
            boxShadow: "0 2px 10px rgba(15,23,42,0.06)",
            border: "1px solid",
            borderColor: "divider",
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
            <Typography variant="h6" sx={{ fontWeight: 800 }} color={summary.totalQuantity > 0 ? "primary.main" : "text.secondary"}>
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
              disabled={saving || uploadingPhoto}
              fullWidth
              startIcon={
                saving ? <CircularProgress size={18} color="inherit" /> : <SendIcon fontSize="small" />
              }
              sx={{ minHeight: 48, borderRadius: 2, fontWeight: 700 }}
            >
              {saving ? "Saving Issue..." : "Save Issue"}
            </Button>
          </Box>
        </Box>
      </Box>
    ) : (
      /* =========================================================================
       * Saved Issues & Reservation Photos Tab
       * ========================================================================= */
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pb: 6 }}>
        {/* Search & Filter Bar */}
        <Card
          elevation={0}
          sx={{
            p: 2,
            borderRadius: 2,
            border: "1px solid",
            borderColor: "divider",
            boxShadow: "0 2px 10px rgba(15,23,42,0.06)",
          }}
        >
          <Grid container spacing={1.5} sx={{ alignItems: "center" }}>
            <Grid size={{ xs: 12, md: 5 }}>
              <TextField
                fullWidth
                size="small"
                placeholder="Search SAP Reservation No, Created By, Issue No, Remarks..."
                value={historySearch}
                onChange={(e) => {
                  setHistorySearch(e.target.value);
                  setHistoryPage(0);
                }}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" sx={{ color: "text.secondary" }} />
                      </InputAdornment>
                    ),
                    endAdornment: historySearch ? (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setHistorySearch("");
                            setHistoryPage(0);
                          }}
                        >
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </InputAdornment>
                    ) : null,
                  },
                }}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <TextField
                select
                fullWidth
                size="small"
                label="Department"
                value={historyDepartment}
                onChange={(e) => {
                  setHistoryDepartment(e.target.value);
                  setHistoryPage(0);
                }}
              >
                <MenuItem value="ALL">All Departments</MenuItem>
                {DEPARTMENTS.map((dept) => (
                  <MenuItem key={dept} value={dept}>
                    {dept}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 3 }} sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              <Button
                size="small"
                variant={historyOnlyWithPhotos ? "contained" : "outlined"}
                color="primary"
                startIcon={<PhotoCameraIcon fontSize="small" />}
                onClick={() => {
                  setHistoryOnlyWithPhotos((prev) => !prev);
                  setHistoryPage(0);
                }}
                sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600, height: 40, flex: 1 }}
              >
                {historyOnlyWithPhotos ? "With Photos (Filtered)" : "With Photos Only"}
              </Button>
              <IconButton
                onClick={loadHistory}
                disabled={loadingHistory}
                title="Refresh"
                sx={{
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 2,
                  height: 40,
                  width: 40,
                }}
              >
                {loadingHistory ? <CircularProgress size={18} /> : <RefreshIcon fontSize="small" />}
              </IconButton>
            </Grid>
          </Grid>
        </Card>

        {/* Issue List / Table */}
        {loadingHistory ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        ) : historyIssues.length === 0 ? (
          <Card
            variant="outlined"
            sx={{
              p: 5,
              textAlign: "center",
              borderRadius: 2,
              bgcolor: "background.paper",
            }}
          >
            <HistoryIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              No Material Issues Found
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
              {historySearch || historyDepartment !== "ALL" || historyOnlyWithPhotos
                ? "No issues match your current filters. Try resetting search."
                : "Saved material issues and reservation photographs will appear here."}
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setActiveTab("create")}
              sx={{ borderRadius: 2, textTransform: "none", fontWeight: 700 }}
            >
              Create New Issue
            </Button>
          </Card>
        ) : (
          <>
            {/* Mobile Card List */}
            <Box sx={{ display: { xs: "flex", md: "none" }, flexDirection: "column", gap: 1.5 }}>
              {historyIssues.map((issue) => (
                <Card
                  key={issue.id}
                  variant="outlined"
                  sx={{
                    borderRadius: 2,
                    p: 2,
                    bgcolor: "background.paper",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                  }}
                >
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 700, fontSize: "0.95rem" }}>
                        {issue.issue_number}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatIssueDate(issue.issue_datetime)}
                      </Typography>
                    </Box>
                    {issue.total_materials > 0 ? (
                      <Chip
                        size="small"
                        label={`${issue.total_quantity} Qty (${issue.total_materials} materials)`}
                        color="success"
                        variant="outlined"
                        sx={{ fontWeight: 700, fontSize: "0.72rem" }}
                      />
                    ) : (
                      <Chip
                        size="small"
                        label="Pending Reconciliation"
                        color="warning"
                        sx={{ fontWeight: 700, fontSize: "0.68rem" }}
                      />
                    )}
                  </Box>

                  <Divider sx={{ my: 1.25 }} />

                  <Grid container spacing={1}>
                    <Grid size={6}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: "0.7rem" }}>
                        SAP Reservation No.
                      </Typography>
                      {issue.sap_reservation_number ? (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                          <Typography sx={{ fontWeight: 700, fontSize: "0.85rem", color: "primary.main" }}>
                            {issue.sap_reservation_number}
                          </Typography>
                          <IconButton
                            size="small"
                            onClick={() => copyToClipboard(issue.sap_reservation_number!)}
                            sx={{ p: 0.25 }}
                            title="Copy Reservation Number"
                          >
                            <ContentCopyIcon sx={{ fontSize: 13 }} />
                          </IconButton>
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.disabled">-</Typography>
                      )}
                    </Grid>

                    <Grid size={6}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: "0.7rem" }}>
                        Reservation Created By
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                        {issue.reservation_created_by || "-"}
                      </Typography>
                    </Grid>

                    <Grid size={12}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: "0.7rem" }}>
                        Department
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                        {issue.department}
                      </Typography>
                    </Grid>
                  </Grid>

                  {/* Photograph Banner / Thumbnail */}
                  <Box sx={{ mt: 1.5, pt: 1, borderTop: "1px dashed", borderColor: "divider", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    {issue.reservation_photo_url ? (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Box
                          component="img"
                          src={issue.reservation_photo_url}
                          alt="Reservation slip"
                          onClick={() =>
                            setSelectedPhotoModal({
                              url: issue.reservation_photo_url!,
                              title: issue.issue_number,
                              reservationNo: issue.sap_reservation_number,
                              createdBy: issue.reservation_created_by,
                              department: issue.department,
                              date: formatIssueDate(issue.issue_datetime),
                            })
                          }
                          sx={{
                            width: 44,
                            height: 44,
                            objectFit: "cover",
                            borderRadius: 1.5,
                            border: "1px solid",
                            borderColor: "divider",
                            cursor: "pointer",
                          }}
                        />
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<PhotoCameraIcon sx={{ fontSize: 14 }} />}
                          onClick={() =>
                            setSelectedPhotoModal({
                              url: issue.reservation_photo_url!,
                              title: issue.issue_number,
                              reservationNo: issue.sap_reservation_number,
                              createdBy: issue.reservation_created_by,
                              department: issue.department,
                              date: formatIssueDate(issue.issue_datetime),
                            })
                          }
                          sx={{ textTransform: "none", fontSize: "0.75rem", borderRadius: 1.5, height: 30 }}
                        >
                          View Photo
                        </Button>
                      </Box>
                    ) : (
                      <Typography variant="caption" color="text.disabled">
                        No photograph attached
                      </Typography>
                    )}

                    <Button
                      size="small"
                      onClick={() => openIssueDetails(issue)}
                      sx={{ textTransform: "none", fontSize: "0.75rem", fontWeight: 700 }}
                    >
                      Details
                    </Button>
                  </Box>
                </Card>
              ))}
            </Box>

            {/* Desktop Table */}
            <TableContainer
              component={Card}
              elevation={0}
              sx={{
                display: { xs: "none", md: "block" },
                borderRadius: 2,
                boxShadow: "0 2px 10px rgba(15,23,42,0.06)",
                border: "1px solid",
                borderColor: "divider",
              }}
            >
              <Table sx={{ "& td, & th": { borderColor: "divider" } }}>
                <TableHead>
                  <TableRow sx={{ "& th": { bgcolor: "grey.50", fontWeight: 700, color: "text.secondary" } }}>
                    <TableCell>Issue Number</TableCell>
                    <TableCell>SAP Reservation No.</TableCell>
                    <TableCell>Created By</TableCell>
                    <TableCell>Department</TableCell>
                    <TableCell align="center">Reservation Slip Photo</TableCell>
                    <TableCell align="center">Stock Adjustment</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {historyIssues.map((issue) => (
                    <TableRow key={issue.id} hover sx={{ height: 64 }}>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {issue.issue_number}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatIssueDate(issue.issue_datetime)}
                        </Typography>
                      </TableCell>

                      <TableCell>
                        {issue.sap_reservation_number ? (
                          <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                            <Chip
                              size="small"
                              label={issue.sap_reservation_number}
                              sx={{
                                fontWeight: 700,
                                bgcolor: "rgba(59, 130, 246, 0.1)",
                                color: "primary.main",
                                border: "1px solid rgba(59, 130, 246, 0.2)",
                              }}
                            />
                            <IconButton
                              size="small"
                              onClick={() => copyToClipboard(issue.sap_reservation_number!)}
                              title="Copy Reservation Number"
                            >
                              <ContentCopyIcon sx={{ fontSize: 13 }} />
                            </IconButton>
                          </Box>
                        ) : (
                          <Typography variant="body2" color="text.disabled">
                            -
                          </Typography>
                        )}
                      </TableCell>

                      <TableCell>
                        <Typography variant="body2">
                          {issue.reservation_created_by || "-"}
                        </Typography>
                      </TableCell>

                      <TableCell>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 180 }}>
                          {issue.department}
                        </Typography>
                      </TableCell>

                      <TableCell align="center">
                        {issue.reservation_photo_url ? (
                          <Box
                            sx={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 1,
                              cursor: "pointer",
                              p: 0.5,
                              pr: 1.25,
                              borderRadius: 1.5,
                              border: "1px solid",
                              borderColor: "divider",
                              transition: "all 0.15s ease",
                              "&:hover": {
                                borderColor: "primary.main",
                                bgcolor: "action.hover",
                                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                              },
                            }}
                            onClick={() =>
                              setSelectedPhotoModal({
                                url: issue.reservation_photo_url!,
                                title: issue.issue_number,
                                reservationNo: issue.sap_reservation_number,
                                createdBy: issue.reservation_created_by,
                                department: issue.department,
                                date: formatIssueDate(issue.issue_datetime),
                              })
                            }
                          >
                            <Box
                              component="img"
                              src={issue.reservation_photo_url}
                              alt="Slip thumbnail"
                              sx={{
                                width: 36,
                                height: 36,
                                objectFit: "cover",
                                borderRadius: 1,
                              }}
                            />
                            <Box sx={{ textAlign: "left" }}>
                              <Typography variant="caption" sx={{ display: "block", fontWeight: 700, color: "primary.main", lineHeight: 1.1 }}>
                                View Photo
                              </Typography>
                              <Typography variant="caption" sx={{ fontSize: "0.65rem", color: "text.secondary" }}>
                                Click to enlarge
                              </Typography>
                            </Box>
                          </Box>
                        ) : (
                          <Typography variant="caption" color="text.disabled">
                            No photo
                          </Typography>
                        )}
                      </TableCell>

                      <TableCell align="center">
                        {issue.total_materials > 0 ? (
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                              {issue.total_quantity} Qty
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {issue.total_materials} {issue.total_materials === 1 ? "item" : "items"}
                            </Typography>
                          </Box>
                        ) : (
                          <Tooltip title="Stock reconciliation can be done later in app">
                            <Chip
                              size="small"
                              label="Reconciliation Pending"
                              color="warning"
                              variant="outlined"
                              sx={{ fontWeight: 600, fontSize: "0.72rem" }}
                            />
                          </Tooltip>
                        )}
                      </TableCell>

                      <TableCell>
                        <Typography variant="body2">
                          {formatIssueDate(issue.issue_datetime).split(",")[0]}
                        </Typography>
                      </TableCell>

                      <TableCell align="right">
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => openIssueDetails(issue)}
                          sx={{ borderRadius: 1.5, textTransform: "none", fontWeight: 600 }}
                        >
                          Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <PaginationControls
              page={historyPage}
              pageSize={historyPageSize}
              totalCount={historyTotalCount}
              onPageChange={setHistoryPage}
              onPageSizeChange={(newSize) => {
                setHistoryPageSize(newSize);
                setHistoryPage(0);
              }}
              itemLabel="issues"
            />
          </>
        )}
      </Box>
    )}

    {/* Form photo preview lightbox */}
    <Dialog
      open={photoPreviewOpen}
      onClose={() => setPhotoPreviewOpen(false)}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle sx={{ m: 0, p: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography sx={{ fontWeight: 700, fontSize: "1rem" }}>
          Reservation Photograph Preview
        </Typography>
        <IconButton
          aria-label="close"
          onClick={() => setPhotoPreviewOpen(false)}
          sx={{ color: (theme) => theme.palette.grey[500] }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 1, display: "flex", justifyContent: "center", bgcolor: "#111" }}>
        {header.reservation_photo_url && (
          <Box
            component="img"
            src={header.reservation_photo_url}
            alt="Reservation Slip"
            sx={{
              maxWidth: "100%",
              maxHeight: "75vh",
              objectFit: "contain",
              borderRadius: 1,
            }}
          />
        )}
      </DialogContent>
    </Dialog>

    {/* High-resolution Photograph Viewer Modal for Saved Issues */}
    <Dialog
      open={!!selectedPhotoModal}
      onClose={() => setSelectedPhotoModal(null)}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle
        sx={{
          m: 0,
          p: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          bgcolor: "background.paper",
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            SAP Reservation Photograph
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Issue: {selectedPhotoModal?.title}{" "}
            {selectedPhotoModal?.reservationNo ? `| Reservation: ${selectedPhotoModal.reservationNo}` : ""}{" "}
            {selectedPhotoModal?.createdBy ? `| Created By: ${selectedPhotoModal.createdBy}` : ""}{" "}
            {selectedPhotoModal?.department ? `| Dept: ${selectedPhotoModal.department}` : ""}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          {selectedPhotoModal?.url && (
            <IconButton
              size="small"
              component="a"
              href={selectedPhotoModal.url}
              target="_blank"
              rel="noopener noreferrer"
              title="Open image in new tab / download"
            >
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          )}
          <IconButton
            size="small"
            aria-label="close"
            onClick={() => setSelectedPhotoModal(null)}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ p: 2, textAlign: "center", bgcolor: "#0f172a" }}>
        {selectedPhotoModal?.url && (
          <Box
            component="img"
            src={selectedPhotoModal.url}
            alt="Reservation Photograph"
            sx={{
              maxWidth: "100%",
              maxHeight: "75vh",
              objectFit: "contain",
              borderRadius: 1,
              boxShadow: 3,
            }}
          />
        )}
      </DialogContent>
    </Dialog>

    {/* Complete Issue Details Modal */}
    <Dialog
      open={!!detailsModalIssue}
      onClose={() => setDetailsModalIssue(null)}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle
        sx={{
          m: 0,
          p: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Material Issue - {detailsModalIssue?.issue_number}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formatIssueDate(detailsModalIssue?.issue_datetime)}
          </Typography>
        </Box>
        <IconButton size="small" onClick={() => setDetailsModalIssue(null)}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 2.5 }}>
        {loadingDetails ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        ) : detailsModalIssue ? (
          <Stack spacing={2.5}>
            {/* Header Details */}
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" color="text.secondary">SAP Reservation Number</Typography>
                <Typography variant="body1" sx={{ fontWeight: 700, color: "primary.main" }}>
                  {detailsModalIssue.sap_reservation_number || "None"}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" color="text.secondary">Reservation Created By</Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {detailsModalIssue.reservation_created_by || "None"}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" color="text.secondary">Department</Typography>
                <Typography variant="body1">
                  {detailsModalIssue.department}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" color="text.secondary">Total Quantity Issued</Typography>
                <Typography variant="body1" sx={{ fontWeight: 700 }}>
                  {detailsModalIssue.total_quantity}
                </Typography>
              </Grid>
              {detailsModalIssue.remarks && (
                <Grid size={12}>
                  <Typography variant="caption" color="text.secondary">Remarks / Notes</Typography>
                  <Typography variant="body2" sx={{ bgcolor: "action.hover", p: 1, borderRadius: 1 }}>
                    {detailsModalIssue.remarks}
                  </Typography>
                </Grid>
              )}
            </Grid>

            {/* Reservation Photograph section */}
            {detailsModalIssue.reservation_photo_url && (
              <Card variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  Reservation Slip Photograph
                </Typography>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    cursor: "pointer",
                  }}
                  onClick={() =>
                    setSelectedPhotoModal({
                      url: detailsModalIssue.reservation_photo_url!,
                      title: detailsModalIssue.issue_number,
                      reservationNo: detailsModalIssue.sap_reservation_number,
                      createdBy: detailsModalIssue.reservation_created_by,
                      department: detailsModalIssue.department,
                      date: formatIssueDate(detailsModalIssue.issue_datetime),
                    })
                  }
                >
                  <Box
                    component="img"
                    src={detailsModalIssue.reservation_photo_url}
                    alt="Reservation photograph"
                    sx={{
                      width: 80,
                      height: 80,
                      objectFit: "cover",
                      borderRadius: 1.5,
                      border: "1px solid",
                      borderColor: "divider",
                    }}
                  />
                  <Box>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<PhotoCameraIcon fontSize="small" />}
                    >
                      Enlarge Photograph
                    </Button>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                      Click to view full reservation photograph
                    </Typography>
                  </Box>
                </Box>
              </Card>
            )}

            {/* Items Section */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                Issued Materials ({detailsModalIssue.items?.length || 0})
              </Typography>
              {detailsModalIssue.items && detailsModalIssue.items.length > 0 ? (
                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1.5 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: "grey.50" }}>
                        <TableCell sx={{ fontWeight: 700 }}>Material Code</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>UoM</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Quantity</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {detailsModalIssue.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell sx={{ fontWeight: 600 }}>{item.material_code}</TableCell>
                          <TableCell>{item.short_description || "-"}</TableCell>
                          <TableCell>{item.uom || "-"}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>{item.total_issue_qty}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Alert severity="info" variant="outlined" sx={{ borderRadius: 1.5 }}>
                  No materials were linked at time of issue. Stock reconciliation against this SAP reservation photograph can be completed later.
                </Alert>
              )}
            </Box>
          </Stack>
        ) : null}
      </DialogContent>
    </Dialog>

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
