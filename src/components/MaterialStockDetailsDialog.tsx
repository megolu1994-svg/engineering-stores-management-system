import { useEffect, useState } from "react";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";

import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CloseIcon from "@mui/icons-material/Close";
import HistoryIcon from "@mui/icons-material/History";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import MonitorIcon from "@mui/icons-material/Monitor";
import PendingActionsIcon from "@mui/icons-material/PendingActions";
import StorageIcon from "@mui/icons-material/Storage";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

import { useNavigate } from "react-router-dom";

import { searchMaterials } from "../services/materialService";
import { getAllocations } from "../services/materialAllocationService";
import {
  getMaterialAppMovements,
  type MaterialMovementRow,
} from "../services/inventoryTransactionService";
import { getSapStockForMaterial } from "../services/sapHistoryService";
import { getLocations } from "../services/locationService";
import type { Material } from "../types/material";
import type { MaterialAllocation } from "../types/materialAllocation";
import type { Location } from "../types/location";

const UNALLOCATED_LOCATION = "UNALLOCATED";
const HISTORY_LIMIT = 15;

/* Enterprise palette (blue/navy/green/orange - no purple) */
const NAVY = "#172554";
const SLATE = "#64748B";
const BORDER = "#E2E8F0";
const BLUE = "#2563EB";
const GREEN = "#15803D";
const GREEN_BG = "#DCFCE7";
const GREEN_LIGHT_BORDER = "#BBF7D0";
const ORANGE = "#EA580C";

function safeNumber(value: number | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function movementLabel(row: MaterialMovementRow): string {
  return row.transaction_type.replace(/_/g, " ");
}

/** Signed difference for display: 0, +7 or -3. */
function signedDiff(value: number): string {
  if (value === 0) return "0";
  return value > 0 ? `+${value}` : `${value}`;
}

interface Props {
  /** Material code to show, or null to close the dialog. */
  materialCode: string | null;
  onClose: () => void;
}

/**
 * Material stock-detail box opened by the global search bar (and the
 * Dashboard's inventory search). UI-only presentation layer: all figures
 * come from the existing queries/calculations (allocations, app
 * movements, SAP MB52 distribution + reconciliation review) and are never
 * recomputed differently here.
 */
export default function MaterialStockDetailsDialog({
  materialCode,
  onClose,
}: Props) {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [data, setData] = useState<{
    material: Material | null;
    allocations: MaterialAllocation[];
    history: MaterialMovementRow[];
    sapTotal: number | null;
    sapDiff: number | null;
    sapAppTotal: number | null;
    sapLocations: { storage_location: string; quantity: number }[];
  } | null>(null);
  // The code whose data currently lives in `data` - loading is derived from
  // it so the effect below only ever calls setState inside async callbacks.
  const [loadedForCode, setLoadedForCode] = useState<string | null>(null);
  // Location code -> description, for the Allocated Locations table.
  const [locationMap, setLocationMap] = useState<Record<string, string>>({});

  const loading = materialCode !== null && loadedForCode !== materialCode;

  useEffect(() => {
    if (!materialCode) return;

    let cancelled = false;

    Promise.all([
      searchMaterials(materialCode, 0, 1),
      getAllocations(materialCode),
      getMaterialAppMovements(materialCode, HISTORY_LIMIT),
      getSapStockForMaterial(materialCode),
    ])
      .then(([materials, allocations, history, sapInfo]) => {
        if (cancelled) return;
        const exact =
          materials.find((m) => m.material_code === materialCode) ??
          materials[0] ??
          null;
        setData({
          material: exact,
          allocations,
          history,
          sapTotal: sapInfo ? sapInfo.total : null,
          sapDiff: sapInfo?.review ? sapInfo.review.difference : null,
          sapAppTotal: sapInfo?.review ? sapInfo.review.app_total : null,
          sapLocations: sapInfo?.locations ?? [],
        });
        setLoadedForCode(materialCode);
      })
      .catch(() => {
        // Missing/errored rows - show the dialog with whatever we have
        // rather than blocking on a lookup that failed.
        if (cancelled) return;
        setData({
          material: null,
          allocations: [],
          history: [],
          sapTotal: null,
          sapDiff: null,
          sapAppTotal: null,
          sapLocations: [],
        });
        setLoadedForCode(materialCode);
      });

    return () => {
      cancelled = true;
    };
  }, [materialCode]);

  // Location descriptions are a display-only enhancement - if the lookup
  // fails the table still shows the location codes.
  useEffect(() => {
    let mounted = true;

    getLocations()
      .then((locations) => {
        if (!mounted) return;
        const map: Record<string, string> = {};
        locations.forEach((loc: Location) => {
          map[loc.location_code] = loc.location_description;
        });
        setLocationMap(map);
      })
      .catch(() => {
        // Ignore - codes are still shown without descriptions.
      });

    return () => {
      mounted = false;
    };
  }, []);

  const allocations = data?.allocations ?? [];
  const history = data?.history ?? [];
  const material = data?.material ?? null;
  const uom = material?.uom ?? "";

  const totalStock = safeNumber(
    allocations.reduce((sum, a) => sum + safeNumber(a.quantity), 0)
  );
  const unallocatedQty = safeNumber(
    allocations
      .filter((a) => a.location_code === UNALLOCATED_LOCATION)
      .reduce((sum, a) => sum + safeNumber(a.quantity), 0)
  );
  const allocatedQty = safeNumber(totalStock - unallocatedQty);
  const allocatedPercent =
    totalStock > 0 ? Math.min((allocatedQty / totalStock) * 100, 100) : 0;

  const allocatedLocations = allocations.filter(
    (a) => a.location_code !== UNALLOCATED_LOCATION
  );

  // Existing SAP-vs-App comparison values (MB52 distribution total + the
  // open reconciliation review, when one exists). When there is no review
  // the totals matched at import time, so the comparison shows "matching".
  const sapComparison =
    data && data.sapTotal !== null
      ? {
          sap: data.sapTotal,
          app:
            data.sapAppTotal !== null ? data.sapAppTotal : data.sapTotal,
          diff: data.sapDiff ?? 0,
          locations: data.sapLocations,
        }
      : null;

  const openSapHistory = () => {
    onClose();
    navigate(`/sap-history?material=${materialCode}`);
  };

  return (
    <Dialog
      open={!!materialCode}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      fullScreen={isMobile}
      scroll="paper"
      slotProps={{
        paper: {
          sx: {
            borderRadius: isMobile ? 0 : 3,
            width: isMobile ? "100%" : 840,
            maxWidth: "calc(100vw - 24px)",
            maxHeight: isMobile ? "100%" : "calc(100dvh - 48px)",
            boxShadow: isMobile
              ? "none"
              : "0 8px 32px rgba(15, 23, 42, 0.12)",
            bgcolor: "#FFFFFF",
          },
        },
      }}
    >
      {/* ---------------- Header ---------------- */}
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: { xs: 2, sm: 3 },
          pt: { xs: 1.5, sm: 2.5 },
          pb: 1.5,
        }}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2,
            bgcolor: GREEN_BG,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Inventory2Icon sx={{ color: GREEN, fontSize: 22 }} />
        </Box>
        <Typography
          sx={{ fontSize: { xs: 18, sm: 20 }, fontWeight: 700, color: NAVY }}
        >
          Material Details
        </Typography>
        <IconButton
          onClick={onClose}
          aria-label="Close"
          sx={{ ml: "auto", color: SLATE }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <Divider sx={{ borderColor: BORDER }} />

      <DialogContent sx={{ px: { xs: 2, sm: 3 }, pt: 2.5, pb: 1 }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 5 }}>
            <CircularProgress size={30} sx={{ color: BLUE }} />
          </Box>
        ) : (
          <>
            {/* ---------------- Material Information ---------------- */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2.5 }}>
              <Box
                sx={{
                  width: 56,
                  height: 56,
                  borderRadius: 2.5,
                  bgcolor: GREEN_BG,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Inventory2Icon sx={{ color: GREEN, fontSize: 32 }} />
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  sx={{ fontSize: { xs: 17, sm: 19 }, fontWeight: 700, color: NAVY }}
                  noWrap
                >
                  {material?.material_code ?? materialCode}
                </Typography>
                <Typography
                  sx={{
                    fontSize: 13.5,
                    color: SLATE,
                    mt: 0.25,
                    overflowWrap: "break-word",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {material?.short_description || "Not available in Material Master."}
                </Typography>
              </Box>
              {uom ? (
                <Chip
                  label={uom}
                  size="small"
                  sx={{
                    bgcolor: GREEN_BG,
                    color: GREEN,
                    fontWeight: 700,
                    fontSize: 12,
                    borderRadius: 1.5,
                    height: 28,
                    flexShrink: 0,
                  }}
                />
              ) : null}
            </Box>

            {/* ---------------- Stock Summary ---------------- */}
            <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <Box
                  sx={{
                    border: `1px solid ${BORDER}`,
                    borderRadius: 2,
                    bgcolor: "#F8FAFC",
                    p: 1.75,
                    height: "100%",
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 1 }}>
                    <Box
                      sx={{
                        width: 34,
                        height: 34,
                        borderRadius: 1.5,
                        bgcolor: GREEN_BG,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Inventory2Icon sx={{ color: GREEN, fontSize: 19 }} />
                    </Box>
                    <Typography
                      sx={{ fontSize: 12.5, fontWeight: 600, color: SLATE }}
                    >
                      Total Stock
                    </Typography>
                  </Box>
                  <Typography sx={{ fontSize: 22, fontWeight: 700, color: NAVY }}>
                    {totalStock}{" "}
                    <Box component="span" sx={{ fontSize: 13, fontWeight: 500, color: SLATE }}>
                      {uom}
                    </Box>
                  </Typography>
                </Box>
              </Grid>

              <Grid size={{ xs: 12, sm: 4 }}>
                <Box
                  sx={{
                    border: `1px solid ${BORDER}`,
                    borderRadius: 2,
                    bgcolor: "#F8FAFC",
                    p: 1.75,
                    height: "100%",
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 1 }}>
                    <Box
                      sx={{
                        width: 34,
                        height: 34,
                        borderRadius: 1.5,
                        bgcolor: "#DBEAFE",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <AssignmentTurnedInIcon sx={{ color: BLUE, fontSize: 19 }} />
                    </Box>
                    <Typography
                      sx={{ fontSize: 12.5, fontWeight: 600, color: SLATE }}
                    >
                      Allocated Stock
                    </Typography>
                  </Box>
                  <Typography sx={{ fontSize: 22, fontWeight: 700, color: NAVY }}>
                    {allocatedQty}{" "}
                    <Box component="span" sx={{ fontSize: 13, fontWeight: 500, color: SLATE }}>
                      {uom}
                    </Box>
                  </Typography>
                </Box>
              </Grid>

              <Grid size={{ xs: 12, sm: 4 }}>
                <Box
                  sx={{
                    border: `1px solid ${BORDER}`,
                    borderRadius: 2,
                    bgcolor: "#F8FAFC",
                    p: 1.75,
                    height: "100%",
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 1 }}>
                    <Box
                      sx={{
                        width: 34,
                        height: 34,
                        borderRadius: 1.5,
                        bgcolor: "#FFEDD5",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <PendingActionsIcon sx={{ color: ORANGE, fontSize: 19 }} />
                    </Box>
                    <Typography
                      sx={{ fontSize: 12.5, fontWeight: 600, color: SLATE }}
                    >
                      Unallocated Stock
                    </Typography>
                  </Box>
                  <Typography sx={{ fontSize: 22, fontWeight: 700, color: NAVY }}>
                    {unallocatedQty}{" "}
                    <Box component="span" sx={{ fontSize: 13, fontWeight: 500, color: SLATE }}>
                      {uom}
                    </Box>
                  </Typography>
                </Box>
              </Grid>
            </Grid>

            {/* ---------------- Allocation Summary ---------------- */}
            <Box
              sx={{
                border: `1px solid ${BORDER}`,
                borderRadius: 2,
                p: 2,
                mb: 2.5,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  mb: 1,
                  gap: 1,
                  flexWrap: "wrap",
                }}
              >
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: NAVY }}>
                  Allocation Summary
                </Typography>
                <Typography
                  sx={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: allocatedPercent >= 100 ? GREEN : BLUE,
                  }}
                >
                  {allocatedPercent.toFixed(0)}% Allocated
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={allocatedPercent}
                sx={{
                  height: 8,
                  borderRadius: 4,
                  bgcolor: BORDER,
                  "& .MuiLinearProgress-bar": {
                    bgcolor: allocatedPercent >= 100 ? "#16A34A" : BLUE,
                  },
                }}
              />
            </Box>

            {/* ---------------- Stock Comparison (SAP vs App) ---------------- */}
            {sapComparison && (
              <Box
                sx={{
                  border: `1px solid ${BORDER}`,
                  borderRadius: 2,
                  p: 2,
                  mb: 2.5,
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 1,
                    mb: 1.5,
                  }}
                >
                  <Box>
                    <Typography sx={{ fontSize: 14, fontWeight: 700, color: NAVY }}>
                      Stock Comparison
                    </Typography>
                    <Typography
                      sx={{ fontSize: 12, fontWeight: 600, color: SLATE, mt: 0.25 }}
                    >
                      SAP vs App
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<HistoryIcon sx={{ fontSize: 16 }} />}
                    onClick={openSapHistory}
                    sx={{
                      ml: "auto",
                      textTransform: "none",
                      color: BLUE,
                      borderColor: "#BFDBFE",
                      bgcolor: "#EFF6FF",
                      borderRadius: 2,
                      fontWeight: 600,
                      px: 1.5,
                      py: 0.5,
                      "&:hover": {
                        bgcolor: "#DBEAFE",
                        borderColor: "#93C5FD",
                      },
                    }}
                  >
                    SAP History
                  </Button>
                </Box>

                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <Box
                      sx={{
                        border: `1px solid ${BORDER}`,
                        borderRadius: 2,
                        bgcolor: "#F8FAFC",
                        p: 1.5,
                        display: "flex",
                        alignItems: "center",
                        gap: 1.25,
                      }}
                    >
                      <Box
                        sx={{
                          width: 36,
                          height: 36,
                          borderRadius: 1.5,
                          bgcolor: GREEN_BG,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <StorageIcon sx={{ color: GREEN, fontSize: 20 }} />
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          sx={{ fontSize: 11.5, fontWeight: 600, color: SLATE }}
                        >
                          SAP Stock
                        </Typography>
                        <Typography
                          sx={{ fontSize: 16, fontWeight: 700, color: NAVY }}
                          noWrap
                        >
                          {sapComparison.sap}{" "}
                          <Box
                            component="span"
                            sx={{ fontSize: 12, fontWeight: 500, color: SLATE }}
                          >
                            {uom}
                          </Box>
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 4 }}>
                    <Box
                      sx={{
                        border: `1px solid ${BORDER}`,
                        borderRadius: 2,
                        bgcolor: "#F8FAFC",
                        p: 1.5,
                        display: "flex",
                        alignItems: "center",
                        gap: 1.25,
                      }}
                    >
                      <Box
                        sx={{
                          width: 36,
                          height: 36,
                          borderRadius: 1.5,
                          bgcolor: "#DBEAFE",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <MonitorIcon sx={{ color: BLUE, fontSize: 20 }} />
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          sx={{ fontSize: 11.5, fontWeight: 600, color: SLATE }}
                        >
                          App Stock
                        </Typography>
                        <Typography
                          sx={{ fontSize: 16, fontWeight: 700, color: NAVY }}
                          noWrap
                        >
                          {sapComparison.app}{" "}
                          <Box
                            component="span"
                            sx={{ fontSize: 12, fontWeight: 500, color: SLATE }}
                          >
                            {uom}
                          </Box>
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 4 }}>
                    <Box
                      sx={{
                        border: `1px solid ${BORDER}`,
                        borderRadius: 2,
                        bgcolor: "#F8FAFC",
                        p: 1.5,
                        display: "flex",
                        alignItems: "center",
                        gap: 1.25,
                      }}
                    >
                      <Box
                        sx={{
                          width: 36,
                          height: 36,
                          borderRadius: 1.5,
                          bgcolor:
                            sapComparison.diff === 0 ? GREEN_BG : "#FFEDD5",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {sapComparison.diff === 0 ? (
                          <CheckCircleIcon sx={{ color: GREEN, fontSize: 20 }} />
                        ) : (
                          <WarningAmberIcon sx={{ color: ORANGE, fontSize: 20 }} />
                        )}
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          sx={{ fontSize: 11.5, fontWeight: 600, color: SLATE }}
                        >
                          Difference
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: 16,
                            fontWeight: 700,
                            color:
                              sapComparison.diff === 0 ? GREEN : ORANGE,
                          }}
                          noWrap
                        >
                          {signedDiff(sapComparison.diff)}{" "}
                          <Box
                            component="span"
                            sx={{ fontSize: 12, fontWeight: 500, color: SLATE }}
                          >
                            {uom}
                          </Box>
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
                </Grid>

                {sapComparison.diff === 0 ? (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.25,
                      bgcolor: "#F0FDF4",
                      border: `1px solid ${GREEN_LIGHT_BORDER}`,
                      borderRadius: 2,
                      px: 1.5,
                      py: 1.25,
                      mt: 1.5,
                    }}
                  >
                    <CheckCircleIcon
                      sx={{ color: "#16A34A", fontSize: 20, flexShrink: 0 }}
                    />
                    <Box>
                      <Typography
                        sx={{ fontSize: 13, fontWeight: 700, color: GREEN }}
                      >
                        Stock is matching
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: "#166534" }}>
                        Your app stock is in sync with SAP.
                      </Typography>
                    </Box>
                  </Box>
                ) : (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.25,
                      bgcolor: "#FFF7ED",
                      border: "1px solid #FED7AA",
                      borderRadius: 2,
                      px: 1.5,
                      py: 1.25,
                      mt: 1.5,
                    }}
                  >
                    <WarningAmberIcon
                      sx={{ color: ORANGE, fontSize: 20, flexShrink: 0 }}
                    />
                    <Box>
                      <Typography
                        sx={{ fontSize: 13, fontWeight: 700, color: "#C2410C" }}
                      >
                        Stock variance detected
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: "#9A3412" }}>
                        {sapComparison.diff > 0
                          ? "SAP stock is higher than app stock"
                          : "App stock is higher than SAP"}{" "}
                        by {Math.abs(sapComparison.diff)} {uom}.
                      </Typography>
                    </Box>
                  </Box>
                )}
              </Box>
            )}

            {/* ---------------- Allocated Locations ---------------- */}
            <Box
              sx={{
                border: `1px solid ${BORDER}`,
                borderRadius: 2,
                mb: 2.5,
                overflow: "hidden",
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  px: 2,
                  py: 1.5,
                  bgcolor: "#F8FAFC",
                  borderBottom: `1px solid ${BORDER}`,
                }}
              >
                <LocationOnIcon sx={{ color: BLUE, fontSize: 18 }} />
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: NAVY }}>
                  Allocated Locations
                </Typography>
              </Box>

              {allocatedLocations.length === 0 ? (
                <Box sx={{ py: 4, px: 2, textAlign: "center" }}>
                  <Inventory2OutlinedIcon
                    sx={{ fontSize: 40, color: "#CBD5E1", mb: 1 }}
                  />
                  <Typography sx={{ fontSize: 13.5, color: SLATE }}>
                    No allocations yet for this material.
                  </Typography>
                </Box>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: "#F8FAFC" }}>
                        <TableCell
                          sx={{
                            color: SLATE,
                            fontWeight: 600,
                            fontSize: 12,
                            borderColor: BORDER,
                            py: 1,
                            pl: 2,
                          }}
                        >
                          Location Code
                        </TableCell>
                        <TableCell
                          sx={{
                            color: SLATE,
                            fontWeight: 600,
                            fontSize: 12,
                            borderColor: BORDER,
                            py: 1,
                          }}
                        >
                          Location Description
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{
                            color: SLATE,
                            fontWeight: 600,
                            fontSize: 12,
                            borderColor: BORDER,
                            py: 1,
                            pr: 2,
                            whiteSpace: "nowrap",
                          }}
                        >
                          Allocated Qty ({uom || "EA"})
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {allocatedLocations.map((allocation) => (
                        <TableRow
                          key={allocation.id ?? `${allocation.location_code}-${allocation.quantity}`}
                          sx={{
                            "&:last-child td": { borderBottom: "none" },
                            "& td": { borderColor: "#F1F5F9" },
                          }}
                        >
                          <TableCell
                            sx={{
                              color: NAVY,
                              fontWeight: 600,
                              fontSize: 13,
                              py: 1,
                              pl: 2,
                            }}
                          >
                            {allocation.location_code}
                          </TableCell>
                          <TableCell
                            sx={{
                              color: SLATE,
                              fontSize: 13,
                              py: 1,
                              maxWidth: 260,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {locationMap[allocation.location_code] ?? "—"}
                          </TableCell>
                          <TableCell
                            align="right"
                            sx={{
                              color: BLUE,
                              fontWeight: 700,
                              fontSize: 13,
                              py: 1,
                              pr: 2,
                            }}
                          >
                            {safeNumber(allocation.quantity)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>

            {/* ---------------- Recent Movements (App) ---------------- */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                mb: 1,
              }}
            >
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: NAVY }}>
                Recent Movements (App)
              </Typography>
              <Typography sx={{ fontSize: 12, color: SLATE }}>
                Latest {Math.min(history.length, HISTORY_LIMIT)}
              </Typography>
            </Box>

            {history.length === 0 ? (
              <Typography sx={{ fontSize: 13.5, color: SLATE, py: 1 }}>
                No movements recorded yet.
              </Typography>
            ) : (
              <Stack spacing={0.75} sx={{ maxHeight: 320, overflowY: "auto", pr: 0.5, pb: 1 }}>
                {history.map((row) => {
                  const negative = row.movement === "OUT";
                  return (
                    <Box
                      key={row.id}
                      sx={{
                        border: `1px solid ${BORDER}`,
                        borderRadius: 2,
                        px: 1.5,
                        py: 1,
                        bgcolor: "#FFFFFF",
                      }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 1,
                        }}
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Typography
                            sx={{
                              display: "block",
                              fontWeight: 600,
                              fontSize: 11.5,
                              color: SLATE,
                            }}
                          >
                            {(row.created_at ?? "").slice(0, 10)} ·{" "}
                            {row.location_code}
                          </Typography>
                          <Typography
                            sx={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: NAVY,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={movementLabel(row)}
                          >
                            {movementLabel(row)}
                            {row.reference_number
                              ? ` · ${row.reference_number}`
                              : ""}
                          </Typography>
                        </Box>
                        <Typography
                          sx={{
                            fontWeight: 800,
                            color: negative ? "#DC2626" : GREEN,
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                          }}
                        >
                          {negative ? "-" : "+"}
                          {safeNumber(row.quantity)}
                        </Typography>
                      </Box>
                    </Box>
                  );
                })}
              </Stack>
            )}
          </>
        )}
      </DialogContent>

      {/* ---------------- Footer ---------------- */}
      <DialogActions sx={{ px: { xs: 2, sm: 3 }, pb: { xs: 2, sm: 2.5 }, pt: 1 }}>
        <Button
          variant="outlined"
          onClick={onClose}
          sx={{
            color: NAVY,
            borderColor: BORDER,
            textTransform: "none",
            fontWeight: 600,
            borderRadius: 2,
            px: 3,
            py: 0.75,
            "&:hover": { borderColor: "#CBD5E1", bgcolor: "#F8FAFC" },
          }}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
