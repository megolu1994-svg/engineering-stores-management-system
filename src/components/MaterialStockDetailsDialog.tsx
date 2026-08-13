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
import Slide from "@mui/material/Slide";
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
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
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
import { getSapStockForMaterial } from "../services/sapHistoryService";
import { getLocations } from "../services/locationService";
import type { Material } from "../types/material";
import type { MaterialAllocation } from "../types/materialAllocation";
import type { Location } from "../types/location";

const UNALLOCATED_LOCATION = "UNALLOCATED";

/* Enterprise palette (blue/navy/green/orange - no purple) */
const NAVY = "#172554";
const SLATE = "#64748B";
const BORDER = "#E2E8F0";
const BLUE = "#2563EB";
const GREEN = "#15803D";
const GREEN_BG = "#DCFCE7";
const ORANGE = "#EA580C";

function safeNumber(value: number | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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
 *
 * Responsive: on desktop it is a centered ~840px modal; below `sm` it
 * becomes a compact bottom sheet (rounded top corners, ~92dvh max height)
 * where only the middle content scrolls and the header + Close footer stay
 * fixed. Desktop styling is intentionally untouched by the mobile rules.
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
      getSapStockForMaterial(materialCode),
    ])
      .then(([materials, allocations, sapInfo]) => {
        if (cancelled) return;
        const exact =
          materials.find((m) => m.material_code === materialCode) ??
          materials[0] ??
          null;
        setData({
          material: exact,
          allocations,
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

  /** Value + UoM shown in the Stock Comparison cells (same on both layouts). */
  const stockValue = (main: React.ReactNode) => (
    <>
      {main}{" "}
      <Box
        component="span"
        sx={{ fontSize: 12, fontWeight: 500, color: SLATE }}
      >
        {uom}
      </Box>
    </>
  );

  return (
    <Dialog
      open={!!materialCode}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      scroll="paper"
      slots={{ transition: isMobile ? Slide : undefined }}
      slotProps={{
        root: {
          sx: { alignItems: { xs: "flex-end", sm: "center" } },
        },
        paper: {
          sx: {
            // Mobile: bottom sheet, rounded top corners, capped height with
            // internal scrolling. Desktop: unchanged centered 840px modal.
            borderRadius: { xs: "16px 16px 0 0", sm: 3 },
            width: { xs: "100%", sm: 840 },
            maxWidth: { xs: "100%", sm: "calc(100vw - 24px)" },
            maxHeight: { xs: "92dvh", sm: "calc(100dvh - 48px)" },
            margin: { xs: 0, sm: undefined },
            boxShadow: {
              xs: "0 -4px 24px rgba(15, 23, 42, 0.16)",
              sm: "0 8px 32px rgba(15, 23, 42, 0.12)",
            },
            bgcolor: "#FFFFFF",
          },
        },
      }}
    >
      {/* ---------------- Header (compact on mobile) ---------------- */}
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: { xs: 2, sm: 3 },
          pt: { xs: 1.25, sm: 2.5 },
          pb: { xs: 1.25, sm: 1.5 },
        }}
      >
        <Box
          sx={{
            width: { xs: 36, sm: 40 },
            height: { xs: 36, sm: 40 },
            borderRadius: 2,
            bgcolor: GREEN_BG,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Inventory2Icon sx={{ color: GREEN, fontSize: { xs: 20, sm: 22 } }} />
        </Box>
        <Typography sx={{ fontSize: 20, fontWeight: 700, color: NAVY }}>
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

      {/* Only this middle area scrolls - header and footer stay fixed. */}
      <DialogContent
        sx={{ px: { xs: 2, sm: 3 }, pt: { xs: 1.5, sm: 2.5 }, pb: 1 }}
      >
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 5 }}>
            <CircularProgress size={30} sx={{ color: BLUE }} />
          </Box>
        ) : (
          <>
            {/* ---------------- Material Information ---------------- */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: { xs: 1.5, sm: 2 },
                mb: { xs: 1.5, sm: 2.5 },
              }}
            >
              <Box
                sx={{
                  width: { xs: 46, sm: 56 },
                  height: { xs: 46, sm: 56 },
                  borderRadius: 2.5,
                  bgcolor: GREEN_BG,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Inventory2Icon sx={{ color: GREEN, fontSize: { xs: 26, sm: 32 } }} />
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  sx={{ fontSize: { xs: 20, sm: 19 }, fontWeight: 700, color: NAVY }}
                  noWrap
                >
                  {material?.material_code ?? materialCode}
                </Typography>
                <Typography
                  sx={{
                    fontSize: { xs: 14, sm: 13.5 },
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
                    height: { xs: 36, sm: 28 },
                    flexShrink: 0,
                  }}
                />
              ) : null}
            </Box>

            {/* ---------------- Stock Summary ---------------- */}
            {/* Mobile: three equal compact cards in a single row (never
                three stacked full-width cards). Desktop: unchanged. */}
            <Grid container spacing={{ xs: 1, sm: 1.5 }} sx={{ mb: { xs: 1.5, sm: 2.5 } }}>
              <Grid size={4}>
                <Box
                  sx={{
                    border: `1px solid ${BORDER}`,
                    borderRadius: 2,
                    bgcolor: "#F8FAFC",
                    p: { xs: 1.25, sm: 1.75 },
                    height: "100%",
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: { xs: "column", sm: "row" },
                      alignItems: { xs: "flex-start", sm: "center" },
                      gap: { xs: 0.75, sm: 1.25 },
                      mb: { xs: 0.75, sm: 1 },
                    }}
                  >
                    <Box
                      sx={{
                        width: { xs: 28, sm: 34 },
                        height: { xs: 28, sm: 34 },
                        borderRadius: 1.5,
                        bgcolor: GREEN_BG,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Inventory2Icon sx={{ color: GREEN, fontSize: { xs: 16, sm: 19 } }} />
                    </Box>
                    <Typography
                      sx={{
                        fontSize: { xs: 12, sm: 12.5 },
                        fontWeight: 600,
                        color: SLATE,
                        lineHeight: 1.25,
                      }}
                    >
                      Total Stock
                    </Typography>
                  </Box>
                  <Typography
                    sx={{
                      fontSize: { xs: 20, sm: 22 },
                      fontWeight: 700,
                      color: NAVY,
                      lineHeight: 1.2,
                    }}
                  >
                    {totalStock}{" "}
                    <Box
                      component="span"
                      sx={{ fontSize: { xs: 11, sm: 13 }, fontWeight: 500, color: SLATE }}
                    >
                      {uom}
                    </Box>
                  </Typography>
                </Box>
              </Grid>

              <Grid size={4}>
                <Box
                  sx={{
                    border: `1px solid ${BORDER}`,
                    borderRadius: 2,
                    bgcolor: "#F8FAFC",
                    p: { xs: 1.25, sm: 1.75 },
                    height: "100%",
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: { xs: "column", sm: "row" },
                      alignItems: { xs: "flex-start", sm: "center" },
                      gap: { xs: 0.75, sm: 1.25 },
                      mb: { xs: 0.75, sm: 1 },
                    }}
                  >
                    <Box
                      sx={{
                        width: { xs: 28, sm: 34 },
                        height: { xs: 28, sm: 34 },
                        borderRadius: 1.5,
                        bgcolor: "#DBEAFE",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <AssignmentTurnedInIcon sx={{ color: BLUE, fontSize: { xs: 16, sm: 19 } }} />
                    </Box>
                    <Typography
                      sx={{
                        fontSize: { xs: 12, sm: 12.5 },
                        fontWeight: 600,
                        color: SLATE,
                        lineHeight: 1.25,
                      }}
                    >
                      Allocated Stock
                    </Typography>
                  </Box>
                  <Typography
                    sx={{
                      fontSize: { xs: 20, sm: 22 },
                      fontWeight: 700,
                      color: NAVY,
                      lineHeight: 1.2,
                    }}
                  >
                    {allocatedQty}{" "}
                    <Box
                      component="span"
                      sx={{ fontSize: { xs: 11, sm: 13 }, fontWeight: 500, color: SLATE }}
                    >
                      {uom}
                    </Box>
                  </Typography>
                </Box>
              </Grid>

              <Grid size={4}>
                <Box
                  sx={{
                    border: `1px solid ${BORDER}`,
                    borderRadius: 2,
                    bgcolor: "#F8FAFC",
                    p: { xs: 1.25, sm: 1.75 },
                    height: "100%",
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: { xs: "column", sm: "row" },
                      alignItems: { xs: "flex-start", sm: "center" },
                      gap: { xs: 0.75, sm: 1.25 },
                      mb: { xs: 0.75, sm: 1 },
                    }}
                  >
                    <Box
                      sx={{
                        width: { xs: 28, sm: 34 },
                        height: { xs: 28, sm: 34 },
                        borderRadius: 1.5,
                        bgcolor: "#FFEDD5",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <PendingActionsIcon sx={{ color: ORANGE, fontSize: { xs: 16, sm: 19 } }} />
                    </Box>
                    <Typography
                      sx={{
                        fontSize: { xs: 12, sm: 12.5 },
                        fontWeight: 600,
                        color: SLATE,
                        lineHeight: 1.25,
                      }}
                    >
                      Unallocated Stock
                    </Typography>
                  </Box>
                  <Typography
                    sx={{
                      fontSize: { xs: 20, sm: 22 },
                      fontWeight: 700,
                      color: NAVY,
                      lineHeight: 1.2,
                    }}
                  >
                    {unallocatedQty}{" "}
                    <Box
                      component="span"
                      sx={{ fontSize: { xs: 11, sm: 13 }, fontWeight: 500, color: SLATE }}
                    >
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
                p: { xs: 1.5, sm: 1.75 },
                mb: { xs: 1.5, sm: 2 },
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  mb: { xs: 0.75, sm: 1 },
                  gap: 1,
                  flexWrap: "wrap",
                }}
              >
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: NAVY }}>
                  Allocation Summary
                </Typography>
                <Typography
                  sx={{
                    fontSize: { xs: 14, sm: 12.5 },
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
                  height: { xs: 9, sm: 8 },
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
                  overflow: "hidden",
                  mb: { xs: 1.5, sm: 2 },
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 1,
                    px: { xs: 1.5, sm: 2 },
                    py: { xs: 0.9, sm: 1.1 },
                    borderBottom: `1px solid ${BORDER}`,
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <CompareArrowsIcon sx={{ color: BLUE, fontSize: 19 }} />
                    <Box>
                      <Typography
                        sx={{ fontSize: 14, fontWeight: 700, color: NAVY, lineHeight: 1.25 }}
                      >
                        Stock Comparison
                      </Typography>
                      <Typography
                        sx={{ fontSize: 11.5, fontWeight: 600, color: SLATE, lineHeight: 1.2 }}
                      >
                        SAP vs App
                      </Typography>
                    </Box>
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<HistoryIcon sx={{ fontSize: 15 }} />}
                    onClick={openSapHistory}
                    sx={{
                      textTransform: "none",
                      color: BLUE,
                      borderColor: "#BFDBFE",
                      bgcolor: "#EFF6FF",
                      borderRadius: 2,
                      fontWeight: 600,
                      px: { xs: 1, sm: 1.25 },
                      py: 0.4,
                      "&:hover": {
                        bgcolor: "#DBEAFE",
                        borderColor: "#93C5FD",
                      },
                    }}
                  >
                    SAP History
                  </Button>
                </Box>

                {/* One compact row of the three values (icon + label +
                    right-aligned value). Desktop: three columns separated
                    by thin dividers. Mobile: three slim stacked rows. */}
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: { xs: "column", sm: "row" },
                    alignItems: { xs: "stretch", sm: "center" },
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      flex: 1,
                      minWidth: 0,
                      px: { xs: 1.5, sm: 2 },
                      py: { xs: 0.75, sm: 0.9 },
                    }}
                  >
                    <Box
                      sx={{
                        width: { xs: 26, sm: 30 },
                        height: { xs: 26, sm: 30 },
                        borderRadius: 1.5,
                        bgcolor: GREEN_BG,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <StorageIcon sx={{ color: GREEN, fontSize: { xs: 15, sm: 17 } }} />
                    </Box>
                    <Typography
                      sx={{
                        fontSize: { xs: 12.5, sm: 12.5 },
                        fontWeight: 600,
                        color: SLATE,
                        whiteSpace: "nowrap",
                      }}
                    >
                      SAP Stock
                    </Typography>
                    <Typography
                      sx={{
                        ml: "auto",
                        flexShrink: 0,
                        fontSize: { xs: 14, sm: 15 },
                        fontWeight: 700,
                        color: NAVY,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {stockValue(sapComparison.sap)}
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      display: { xs: "none", sm: "block" },
                      alignSelf: "stretch",
                      width: 1,
                      bgcolor: BORDER,
                      flexShrink: 0,
                    }}
                  />

                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      flex: 1,
                      minWidth: 0,
                      px: { xs: 1.5, sm: 2 },
                      py: { xs: 0.75, sm: 0.9 },
                    }}
                  >
                    <Box
                      sx={{
                        width: { xs: 26, sm: 30 },
                        height: { xs: 26, sm: 30 },
                        borderRadius: 1.5,
                        bgcolor: "#DBEAFE",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <MonitorIcon sx={{ color: BLUE, fontSize: { xs: 15, sm: 17 } }} />
                    </Box>
                    <Typography
                      sx={{
                        fontSize: { xs: 12.5, sm: 12.5 },
                        fontWeight: 600,
                        color: SLATE,
                        whiteSpace: "nowrap",
                      }}
                    >
                      App Stock
                    </Typography>
                    <Typography
                      sx={{
                        ml: "auto",
                        flexShrink: 0,
                        fontSize: { xs: 14, sm: 15 },
                        fontWeight: 700,
                        color: NAVY,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {stockValue(sapComparison.app)}
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      display: { xs: "none", sm: "block" },
                      alignSelf: "stretch",
                      width: 1,
                      bgcolor: BORDER,
                      flexShrink: 0,
                    }}
                  />

                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      flex: 1,
                      minWidth: 0,
                      px: { xs: 1.5, sm: 2 },
                      py: { xs: 0.75, sm: 0.9 },
                    }}
                  >
                    <Box
                      sx={{
                        width: { xs: 26, sm: 30 },
                        height: { xs: 26, sm: 30 },
                        borderRadius: 1.5,
                        bgcolor: sapComparison.diff === 0 ? GREEN_BG : "#FFEDD5",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {sapComparison.diff === 0 ? (
                        <CheckCircleIcon sx={{ color: GREEN, fontSize: { xs: 15, sm: 17 } }} />
                      ) : (
                        <WarningAmberIcon sx={{ color: ORANGE, fontSize: { xs: 15, sm: 17 } }} />
                      )}
                    </Box>
                    <Typography
                      sx={{
                        fontSize: { xs: 12.5, sm: 12.5 },
                        fontWeight: 600,
                        color: SLATE,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Difference
                    </Typography>
                    <Typography
                      sx={{
                        ml: "auto",
                        flexShrink: 0,
                        fontSize: { xs: 14, sm: 15 },
                        fontWeight: 700,
                        color: sapComparison.diff === 0 ? GREEN : ORANGE,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {stockValue(signedDiff(sapComparison.diff))}
                    </Typography>
                  </Box>
                </Box>

                {/* Compact single-line status (green when matching, orange
                    when a variance exists). */}
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    borderTop: `1px solid ${BORDER}`,
                    bgcolor: sapComparison.diff === 0 ? "#F0FDF4" : "#FFF7ED",
                    px: { xs: 1.5, sm: 2 },
                    py: { xs: 0.75, sm: 1 },
                  }}
                >
                  {sapComparison.diff === 0 ? (
                    <CheckCircleIcon sx={{ color: "#16A34A", fontSize: 18, flexShrink: 0 }} />
                  ) : (
                    <WarningAmberIcon sx={{ color: ORANGE, fontSize: 18, flexShrink: 0 }} />
                  )}
                  <Typography
                    sx={{
                      fontSize: { xs: 12, sm: 12.5 },
                      fontWeight: 600,
                      color: sapComparison.diff === 0 ? "#166534" : "#9A3412",
                      lineHeight: 1.35,
                    }}
                  >
                    {sapComparison.diff === 0
                      ? "Stock is matching · Your app stock is in sync with SAP."
                      : `Stock variance detected · ${
                          sapComparison.diff > 0
                            ? "SAP stock is higher than app stock"
                            : "App stock is higher than SAP"
                        } by ${Math.abs(sapComparison.diff)} ${uom}.`}
                  </Typography>
                </Box>
              </Box>
            )}

            {/* ---------------- Allocated Locations ---------------- */}
            <Box
              sx={{
                border: `1px solid ${BORDER}`,
                borderRadius: 2,
                mb: { xs: 1.5, sm: 2.5 },
                overflow: "hidden",
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  px: 2,
                  py: { xs: 1.25, sm: 1.5 },
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
                <Box sx={{ py: { xs: 2.5, sm: 4 }, px: 2, textAlign: "center" }}>
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
                              // Mobile: allow wrapping so long codes never
                              // force horizontal scroll; desktop unchanged.
                              whiteSpace: { xs: "normal", sm: "nowrap" },
                              wordBreak: { xs: "break-word", sm: "unset" },
                            }}
                          >
                            {allocation.location_code}
                          </TableCell>
                          <TableCell
                            sx={{
                              color: SLATE,
                              fontSize: 13,
                              py: 1,
                              maxWidth: { xs: "none", sm: 260 },
                              overflow: { xs: "visible", sm: "hidden" },
                              textOverflow: "ellipsis",
                              whiteSpace: { xs: "normal", sm: "nowrap" },
                              wordBreak: { xs: "break-word", sm: "unset" },
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
                              whiteSpace: "nowrap",
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

          </>
        )}
      </DialogContent>

      {/* ---------------- Footer (sticky, never clipped) ---------------- */}
      <DialogActions
        sx={{
          px: { xs: 2, sm: 3 },
          pt: 1,
          pb: { xs: "max(12px, env(safe-area-inset-bottom))", sm: 2.5 },
          borderTop: { xs: `1px solid ${BORDER}`, sm: "none" },
          bgcolor: { xs: "#FFFFFF", sm: "transparent" },
        }}
      >
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
            height: { xs: 44, sm: "auto" },
            "&:hover": { borderColor: "#CBD5E1", bgcolor: "#F8FAFC" },
          }}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
