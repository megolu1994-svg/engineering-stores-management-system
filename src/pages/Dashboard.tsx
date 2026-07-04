import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  InputAdornment,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";

import Inventory2Icon from "@mui/icons-material/Inventory2";
import PlaceIcon from "@mui/icons-material/Place";
import InboxIcon from "@mui/icons-material/Inbox";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import OutputIcon from "@mui/icons-material/Output";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import PendingActionsIcon from "@mui/icons-material/PendingActions";
import HistoryIcon from "@mui/icons-material/History";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import BarChartIcon from "@mui/icons-material/BarChart";
import AssignmentReturnedIcon from "@mui/icons-material/AssignmentReturned";
import AssignmentReturnIcon from "@mui/icons-material/AssignmentReturn";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import CloseIcon from "@mui/icons-material/Close";

import { supabase } from "../config/supabase";
import {
  getRecentActivity,
  searchInventory,
  type InventoryOverviewRow,
} from "../services/inventoryOverviewService";
import { searchMaterials } from "../services/materialService";
import { getAllocations } from "../services/materialAllocationService";
import AllocationSummary from "../components/AllocationSummary";
import AllocationTable from "../components/AllocationTable";
import type { Material } from "../types/material";
import type { MaterialAllocation } from "../types/materialAllocation";
import { BRAND_PURPLE, BRAND_PURPLE_SOFT } from "../theme";
import { useSwipeTabs } from "../hooks/useSwipeTabs";
import SwipeableTabPanel from "../components/SwipeableTabPanel";

const UNALLOCATED_LOCATION = "UNALLOCATED";
const LOW_STOCK_THRESHOLD = 10;
const SEARCH_DEBOUNCE_MS = 300;
const MIN_SEARCH_LENGTH = 2;
const MAX_EXPANDED_RESULTS = 10;
const SUPABASE_PAGE_SIZE = 1000;

function safeNumber(value: number | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

interface AllocationRow {
  material_code: string;
  location_code: string;
  quantity: number;
}

/**
 * A plain `.select()` on material_allocation silently caps out at
 * Supabase/PostgREST's default 1000-row page, which was quietly
 * truncating every dashboard stat derived from this table (Total
 * Stock, Allocated/Unallocated Qty, occupied locations, Low Stock) once
 * the table grew past 1000 rows. Pages through the full table instead.
 */
async function fetchAllAllocationRows(): Promise<AllocationRow[]> {
  const rows: AllocationRow[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("material_allocation")
      .select("material_code, location_code, quantity")
      .range(from, from + SUPABASE_PAGE_SIZE - 1);

    if (error) {
      console.error(error);
      break;
    }

    const page = (data ?? []) as AllocationRow[];
    rows.push(...page);

    if (page.length < SUPABASE_PAGE_SIZE) break;

    from += SUPABASE_PAGE_SIZE;
  }

  return rows;
}

function startOfTodayIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface DashboardStats {
  totalMaterials: number;
  totalLocations: number;
  /** Materials with at least one non-UNALLOCATED allocation row with
   * quantity > 0 - i.e. materials that are fully OR partially allocated
   * to real locations (UNALLOCATED is a sentinel bucket, not a location,
   * so it never counts here). Fully-unallocated materials are excluded. */
  materialsAllocatedCount: number;
  emptyLocations: number;
  totalStock: number;
  allocatedQty: number;
  unallocatedQty: number;
  todaysReceipts: number;
  todaysIssues: number;
  todaysTransfers: number;
  pendingDrc: number;
}

const emptyStats: DashboardStats = {
  totalMaterials: 0,
  totalLocations: 0,
  materialsAllocatedCount: 0,
  emptyLocations: 0,
  totalStock: 0,
  allocatedQty: 0,
  unallocatedQty: 0,
  todaysReceipts: 0,
  todaysIssues: 0,
  todaysTransfers: 0,
  pendingDrc: 0,
};

interface LowStockRow {
  material_code: string;
  short_description: string;
  quantity: number;
}

interface DashboardSearchResult {
  material_code: string;
  short_description: string;
  uom: string;
  totalQty: number;
  allocatedQty: number;
  unallocatedQty: number;
  locations: { location_code: string; quantity: number }[];
}

const quickActions = [
  { label: "Inventory", path: "/allocation", icon: <Inventory2Icon /> },
  { label: "Material Receipt", path: "/material-receipt", icon: <AssignmentReturnedIcon /> },
  { label: "Material Issue", path: "/material-issue", icon: <AssignmentReturnIcon /> },
  { label: "Reports", path: "/reports", icon: <BarChartIcon /> },
];

export default function Dashboard() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState(0);
  const { direction } = useSwipeTabs(activeTab, setActiveTab, 2);
  const [searchTerm, setSearchTerm] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<DashboardSearchResult[]>([]);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsMaterial, setDetailsMaterial] = useState<Material | null>(null);
  const [detailsAllocations, setDetailsAllocations] = useState<MaterialAllocation[]>([]);

  const [stats, setStats] = useState<DashboardStats>(emptyStats);
  const [loadingStats, setLoadingStats] = useState(true);

  const [recentActivity, setRecentActivity] = useState<InventoryOverviewRow[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  const [lowStock, setLowStock] = useState<LowStockRow[]>([]);
  const [loadingLowStock, setLoadingLowStock] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      setLoadingStats(true);

      try {
        const todayIso = startOfTodayIso();

        const [
          materialCountResult,
          locationCountResult,
          allocationRows,
          receiptsTodayResult,
          issuesTodayResult,
          transfersTodayResult,
          pendingDrcResult,
        ] = await Promise.all([
          supabase
            .from("material_master")
            .select("material_code", { count: "exact", head: true })
            .eq("is_active", true),
          supabase
            .from("location_master")
            .select("location_code", { count: "exact", head: true })
            .eq("is_active", true),
          fetchAllAllocationRows(),
          supabase
            .from("inventory_transactions")
            .select("id", { count: "exact", head: true })
            .eq("transaction_type", "MATERIAL_RECEIPT")
            .gte("created_at", todayIso),
          supabase
            .from("inventory_transactions")
            .select("id", { count: "exact", head: true })
            .eq("transaction_type", "MATERIAL_ISSUE")
            .gte("created_at", todayIso),
          supabase
            .from("inventory_transactions")
            .select("id", { count: "exact", head: true })
            .eq("transaction_type", "LOCATION_TRANSFER")
            .gte("created_at", todayIso),
          supabase
            .from("receipt_header")
            .select("id", { count: "exact", head: true })
            .neq("status", "Closed"),
        ]);

        if (cancelled) return;

        const totalStock = allocationRows.reduce(
          (sum, r) => sum + safeNumber(r.quantity),
          0
        );
        const unallocatedQty = allocationRows
          .filter((r) => r.location_code === UNALLOCATED_LOCATION)
          .reduce((sum, r) => sum + safeNumber(r.quantity), 0);

        // Real (non-UNALLOCATED) allocation rows with actual quantity on
        // them - the shared basis for both "occupied locations" (distinct
        // locations touched) and "materials allocated to locations"
        // (distinct materials touched), which are two different counts
        // over the same rows, not the same number.
        const realAllocatedRows = allocationRows.filter(
          (r) =>
            r.location_code !== UNALLOCATED_LOCATION &&
            safeNumber(r.quantity) > 0
        );

        const occupiedLocationCodes = new Set(
          realAllocatedRows.map((r) => r.location_code)
        );
        const materialsAllocatedCodes = new Set(
          realAllocatedRows.map((r) => r.material_code)
        );

        const totalLocations = safeNumber(locationCountResult.count);
        const emptyLocations = Math.max(
          totalLocations - occupiedLocationCodes.size,
          0
        );

        setStats({
          totalMaterials: safeNumber(materialCountResult.count),
          totalLocations,
          materialsAllocatedCount: materialsAllocatedCodes.size,
          emptyLocations,
          totalStock: safeNumber(totalStock),
          allocatedQty: safeNumber(totalStock - unallocatedQty),
          unallocatedQty: safeNumber(unallocatedQty),
          todaysReceipts: safeNumber(receiptsTodayResult.count),
          todaysIssues: safeNumber(issuesTodayResult.count),
          todaysTransfers: safeNumber(transfersTodayResult.count),
          pendingDrc: safeNumber(pendingDrcResult.count),
        });
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoadingStats(false);
      }
    }

    loadStats();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingRecent(true);

    getRecentActivity()
      .then((data) => {
        if (!cancelled) setRecentActivity(data.slice(0, 8));
      })
      .finally(() => {
        if (!cancelled) setLoadingRecent(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingLowStock(true);

    async function loadLowStock() {
      try {
        const allocationRows = await fetchAllAllocationRows();

        const rows = allocationRows.filter(
          (r) => r.location_code !== UNALLOCATED_LOCATION
        );

        const totals = new Map<string, number>();
        rows.forEach((r) => {
          totals.set(
            r.material_code,
            (totals.get(r.material_code) ?? 0) + safeNumber(r.quantity)
          );
        });

        const lowCodes = Array.from(totals.entries())
          .filter(([, qty]) => qty > 0 && qty <= LOW_STOCK_THRESHOLD)
          .sort((a, b) => a[1] - b[1])
          .slice(0, 8);

        if (lowCodes.length === 0) {
          if (!cancelled) setLowStock([]);
          return;
        }

        const { data: materials, error: materialsError } = await supabase
          .from("material_master")
          .select("material_code, short_description")
          .in(
            "material_code",
            lowCodes.map(([code]) => code)
          );

        if (materialsError) throw materialsError;

        const infoMap = new Map<string, string>(
          (materials ?? []).map((m: { material_code: string; short_description: string }) => [
            m.material_code,
            m.short_description,
          ])
        );

        if (!cancelled) {
          setLowStock(
            lowCodes.map(([code, qty]) => ({
              material_code: code,
              short_description: infoMap.get(code) ?? "",
              quantity: qty,
            }))
          );
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoadingLowStock(false);
      }
    }

    loadLowStock();

    return () => {
      cancelled = true;
    };
  }, []);

  // Warehouse-style inventory search: searches material_allocation stock
  // (via the existing searchInventory service) by Material Code or
  // Description, then enriches each match with its allocation breakdown
  // (also via the existing getAllocations service) so results show total,
  // allocated, unallocated and every allocated location. This never touches
  // Material Master search.
  useEffect(() => {
    const trimmed = searchTerm.trim();

    if (trimmed.length < MIN_SEARCH_LENGTH) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);

    const timer = setTimeout(() => {
      searchInventory(trimmed)
        .then(async (baseResults) => {
          const limited = baseResults.slice(0, MAX_EXPANDED_RESULTS);

          const expanded = await Promise.all(
            limited.map(async (item) => {
              const allocations = await getAllocations(item.material_code);

              const totalQty = allocations.reduce(
                (sum, a) => sum + safeNumber(a.quantity),
                0
              );
              const unallocatedQty = allocations
                .filter((a) => a.location_code === UNALLOCATED_LOCATION)
                .reduce((sum, a) => sum + safeNumber(a.quantity), 0);
              const locations = allocations
                .filter(
                  (a) =>
                    a.location_code !== UNALLOCATED_LOCATION &&
                    safeNumber(a.quantity) > 0
                )
                .map((a) => ({
                  location_code: a.location_code,
                  quantity: safeNumber(a.quantity),
                }));

              return {
                material_code: item.material_code,
                short_description: item.short_description,
                uom: item.uom,
                totalQty: safeNumber(totalQty),
                allocatedQty: safeNumber(totalQty - unallocatedQty),
                unallocatedQty: safeNumber(unallocatedQty),
                locations,
              };
            })
          );

          if (!cancelled) setSearchResults(expanded);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchTerm]);

  const isSearchMode = searchTerm.trim().length >= MIN_SEARCH_LENGTH;

  // Opens the Material Details view for a search result, reusing the same
  // AllocationSummary / AllocationTable components and services as the
  // Inventory > Allocate tab - no new business logic or queries.
  async function openMaterialDetails(materialCode: string) {
    setDetailsOpen(true);
    setDetailsLoading(true);

    try {
      const [materials, allocations] = await Promise.all([
        searchMaterials(materialCode, 0, 1),
        getAllocations(materialCode),
      ]);

      const exact =
        materials.find((m) => m.material_code === materialCode) ??
        materials[0] ??
        null;

      setDetailsMaterial(exact);
      setDetailsAllocations(allocations);
    } finally {
      setDetailsLoading(false);
    }
  }

  function closeDetails() {
    setDetailsOpen(false);
    setDetailsMaterial(null);
    setDetailsAllocations([]);
  }

  const detailsTotalStock = safeNumber(
    detailsAllocations.reduce((sum, a) => sum + safeNumber(a.quantity), 0)
  );
  const detailsUnallocatedQty = safeNumber(
    detailsAllocations
      .filter((a) => a.location_code === UNALLOCATED_LOCATION)
      .reduce((sum, a) => sum + safeNumber(a.quantity), 0)
  );
  const detailsAllocatedQty = safeNumber(detailsTotalStock - detailsUnallocatedQty);

  const liveOverview = [
    { label: "Total no. Of Materials", value: stats.totalMaterials, icon: <Inventory2Icon /> },
    { label: "Number of materials allocated locations", value: stats.materialsAllocatedCount, icon: <PlaceIcon /> },
    { label: "Empty locations", value: stats.emptyLocations, icon: <InboxIcon /> },
  ];

  const secondaryStats = [
    { label: "Today's Receipts", value: stats.todaysReceipts, icon: <LocalShippingIcon />, color: "success.main" },
    { label: "Today's Issues", value: stats.todaysIssues, icon: <OutputIcon />, color: "error.main" },
    { label: "Today's Transfers", value: stats.todaysTransfers, icon: <CompareArrowsIcon />, color: "warning.main" },
    { label: "Pending DRC", value: stats.pendingDrc, icon: <PendingActionsIcon />, color: "info.main" },
  ];

  return (
    <Box sx={{ pb: 4 }}>

      {/* ---- Purple hero: search + tabs ---- */}
      <Box
        sx={{
          bgcolor: BRAND_PURPLE,
          mx: { xs: -2, md: -3 },
          mt: { xs: -2, md: -3 },
          mb: 3,
          px: { xs: 2, md: 3 },
          pt: 2.5,
          pb: 0,
        }}
      >
        <TextField
          fullWidth
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search material code or description..."
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: BRAND_PURPLE }} />
                </InputAdornment>
              ),
              endAdornment: searchTerm && (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearchTerm("")}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
              sx: {
                bgcolor: "#FFFFFF",
                borderRadius: "24px",
                "& fieldset": { border: "none" },
              },
            },
          }}
        />

        {!isSearchMode && (
          <Tabs
            value={activeTab}
            onChange={(_e, value) => setActiveTab(value)}
            textColor="inherit"
            centered
            sx={{
              mt: 2,
              minHeight: 44,
              "& .MuiTab-root": {
                color: "#FFFFFF",
                fontWeight: 700,
                minHeight: 44,
              },
              "& .Mui-selected": {
                color: "#FFFFFF !important",
              },
              "& .MuiTabs-indicator": {
                backgroundColor: "#FFFFFF",
                height: 2,
              },
            }}
          >
            <Tab label="DASHBOARD" />
            <Tab label="ACTIVITIES" />
          </Tabs>
        )}

        {isSearchMode && <Box sx={{ height: 16 }} />}
      </Box>

      {isSearchMode ? (
        <Box sx={{ mt: 2 }}>
          {searching ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress size={28} />
            </Box>
          ) : searchResults.length === 0 ? (
            <Alert severity="info">No materials found in inventory stock.</Alert>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {searchResults.map((row) => (
                <Card key={row.material_code} elevation={0}>
                  <CardActionArea
                    onClick={() => openMaterialDetails(row.material_code)}
                    sx={{ p: 1.5 }}
                  >
                    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 700 }} noWrap>
                          {row.material_code}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {row.short_description}
                        </Typography>
                      </Box>
                      <Typography sx={{ fontWeight: 800, flexShrink: 0 }} color="primary.main">
                        {row.totalQty} {row.uom}
                      </Typography>
                    </Box>

                    <Box sx={{ display: "flex", gap: 2, mt: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        Allocated: <strong>{row.allocatedQty}</strong>
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Unallocated: <strong>{row.unallocatedQty}</strong>
                      </Typography>
                    </Box>

                    {row.locations.length > 0 && (
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 1 }}>
                        {row.locations.map((loc) => (
                          <Chip
                            key={loc.location_code}
                            size="small"
                            label={`${loc.location_code}: ${loc.quantity}`}
                          />
                        ))}
                      </Box>
                    )}
                  </CardActionArea>
                </Card>
              ))}
            </Box>
          )}
        </Box>
      ) : (
        <SwipeableTabPanel activeTab={activeTab} direction={direction}>
      {activeTab === 0 && (
        <>
          {/* ---- Live Overview ---- */}
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.25 }}>
            Live Overview
          </Typography>
          <Grid container spacing={1.5} sx={{ mb: 3 }}>
            {liveOverview.map((card) => (
              <Grid key={card.label} size={{ xs: 4 }}>
                <Card elevation={0} sx={{ height: "100%", p: 1.5, textAlign: "center" }}>
                  <Avatar
                    sx={{
                      bgcolor: BRAND_PURPLE_SOFT,
                      color: BRAND_PURPLE,
                      width: 44,
                      height: 44,
                      mx: "auto",
                      mb: 1,
                    }}
                  >
                    {card.icon}
                  </Avatar>
                  {loadingStats ? (
                    <CircularProgress size={18} />
                  ) : (
                    <Typography sx={{ fontWeight: 800, color: BRAND_PURPLE, fontSize: { xs: "1.1rem", sm: "1.4rem" } }}>
                      {card.value}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.primary" sx={{ display: "block", fontWeight: 500 }}>
                    {card.label}
                  </Typography>
                </Card>
              </Grid>
            ))}
          </Grid>

          {/* ---- Quick Actions ---- */}
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.25 }}>
            Quick Actions
          </Typography>
          <Grid container spacing={1.5} sx={{ mb: 3 }}>
            {quickActions.map((action) => (
              <Grid key={action.label} size={{ xs: 6 }}>
                <Card elevation={0} sx={{ height: "100%" }}>
                  <CardActionArea onClick={() => navigate(action.path)} sx={{ p: 2.5, textAlign: "center" }}>
                    <Box sx={{ color: BRAND_PURPLE, mb: 1, "& svg": { fontSize: 36 } }}>
                      {action.icon}
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {action.label}
                    </Typography>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>
        </>
      )}

      {activeTab === 1 && (
        <>
          {/* ---- Additional stats ---- */}
          <Grid container spacing={1.5} sx={{ mb: 3 }}>
            {secondaryStats.map((card) => (
              <Grid key={card.label} size={{ xs: 6, sm: 4, md: 3 }}>
                <Card
                  elevation={0}
                  sx={{
                    p: 1.5,
                    display: "flex",
                    alignItems: "center",
                    gap: 1.25,
                    height: "100%",
                  }}
                >
                  <Avatar sx={{ bgcolor: card.color, width: 40, height: 40 }}>
                    {card.icon}
                  </Avatar>
                  <Box sx={{ minWidth: 0 }}>
                    {loadingStats ? (
                      <CircularProgress size={18} />
                    ) : (
                      <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
                        {card.value}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                      {card.label}
                    </Typography>
                  </Box>
                </Card>
              </Grid>
            ))}
          </Grid>

          <Grid container spacing={2}>
            {/* ---- Recent Activity ---- */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Card elevation={0} sx={{ height: "100%" }}>
                <CardContent>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1.5 }}>
                    <HistoryIcon sx={{ color: BRAND_PURPLE }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      Recent Activity
                    </Typography>
                  </Box>

                  {loadingRecent ? (
                    <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                      <CircularProgress size={24} />
                    </Box>
                  ) : recentActivity.length === 0 ? (
                    <Alert severity="info">No inventory activity recorded yet.</Alert>
                  ) : (
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      {recentActivity.map((row) => (
                        <Box
                          key={row.material_code}
                          sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", p: 1, borderRadius: 2, bgcolor: "grey.50" }}
                        >
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                              {row.material_code} - {row.short_description}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                              {row.locationDisplay}
                            </Typography>
                          </Box>
                          <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                            <Chip size="small" label={row.lastTransactionType.replace("_", " ")} sx={{ fontWeight: 700 }} />
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
                              {formatDateTime(row.lastTransactionTime)}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* ---- Low Stock ---- */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Card elevation={0} sx={{ height: "100%" }}>
                <CardContent>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1.5 }}>
                    <ReportProblemIcon color="warning" />
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      Low Stock Materials
                    </Typography>
                  </Box>

                  {loadingLowStock ? (
                    <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                      <CircularProgress size={24} />
                    </Box>
                  ) : lowStock.length === 0 ? (
                    <Alert severity="success">No low stock materials found.</Alert>
                  ) : (
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      {lowStock.map((row) => (
                        <Box
                          key={row.material_code}
                          sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", p: 1, borderRadius: 2, bgcolor: "warning.50" }}
                        >
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                              {row.material_code}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                              {row.short_description}
                            </Typography>
                          </Box>
                          <Typography variant="body1" sx={{ fontWeight: 800 }} color="warning.main">
                            {safeNumber(row.quantity)}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Box sx={{ display: "flex", justifyContent: "center", mt: 3 }}>
            <Button
              variant="outlined"
              startIcon={<SwapHorizIcon />}
              onClick={() => navigate("/allocation")}
              sx={{ borderRadius: 2.5, fontWeight: 600 }}
            >
              Go to Inventory
            </Button>
          </Box>
        </>
      )}
        </SwipeableTabPanel>
      )}

      {/* ---- Material Details (from the inventory search above) ---- */}
      <Dialog open={detailsOpen} onClose={closeDetails} fullWidth maxWidth="xs">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          Material Details
          <IconButton size="small" onClick={closeDetails} aria-label="Close">
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent>
          {detailsLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress size={28} />
            </Box>
          ) : (
            <>
              <AllocationSummary
                material={detailsMaterial}
                totalStock={detailsTotalStock}
                allocatedQty={detailsAllocatedQty}
                unallocatedQty={detailsUnallocatedQty}
              />

              <Typography
                variant="subtitle2"
                sx={{ fontWeight: "bold", mb: 0.75, mt: 1.5, fontSize: "0.85rem" }}
              >
                Allocated Locations
              </Typography>

              <AllocationTable
                allocations={detailsAllocations.filter(
                  (a) => a.location_code !== UNALLOCATED_LOCATION
                )}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
