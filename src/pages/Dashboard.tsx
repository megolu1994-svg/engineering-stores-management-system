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
  Grid,
  Typography,
} from "@mui/material";

import Inventory2Icon from "@mui/icons-material/Inventory2";
import PlaceIcon from "@mui/icons-material/Place";
import StackedLineChartIcon from "@mui/icons-material/StackedLineChart";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import OutputIcon from "@mui/icons-material/Output";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import PendingActionsIcon from "@mui/icons-material/PendingActions";
import HistoryIcon from "@mui/icons-material/History";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import AssessmentIcon from "@mui/icons-material/Assessment";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";

import { supabase } from "../config/supabase";
import {
  getRecentActivity,
  type InventoryOverviewRow,
} from "../services/inventoryOverviewService";

const UNALLOCATED_LOCATION = "UNALLOCATED";
const LOW_STOCK_THRESHOLD = 10;

function safeNumber(value: number | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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

const quickActions = [
  { label: "Material Receipt", path: "/material-receipt", icon: <LocalShippingIcon /> },
  { label: "Material Issue", path: "/material-issue", icon: <OutputIcon /> },
  { label: "Inventory", path: "/allocation", icon: <Inventory2Icon /> },
  { label: "Reports", path: "/reports", icon: <AssessmentIcon /> },
];

export default function Dashboard() {
  const navigate = useNavigate();

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
          allocationResult,
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
          supabase.from("material_allocation").select("location_code, quantity"),
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

        const allocationRows = (allocationResult.data ?? []) as {
          location_code: string;
          quantity: number;
        }[];

        const totalStock = allocationRows.reduce(
          (sum, r) => sum + safeNumber(r.quantity),
          0
        );
        const unallocatedQty = allocationRows
          .filter((r) => r.location_code === UNALLOCATED_LOCATION)
          .reduce((sum, r) => sum + safeNumber(r.quantity), 0);

        setStats({
          totalMaterials: safeNumber(materialCountResult.count),
          totalLocations: safeNumber(locationCountResult.count),
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
        const { data, error } = await supabase
          .from("material_allocation")
          .select("material_code, quantity")
          .neq("location_code", UNALLOCATED_LOCATION);

        if (error) throw error;

        const rows = (data ?? []) as { material_code: string; quantity: number }[];

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

  const summaryCards = [
    { label: "Total Materials", value: stats.totalMaterials, icon: <Inventory2Icon />, color: "primary.main" },
    { label: "Total Locations", value: stats.totalLocations, icon: <PlaceIcon />, color: "info.main" },
    { label: "Total Stock", value: stats.totalStock, icon: <StackedLineChartIcon />, color: "success.main" },
    { label: "Allocated Qty", value: stats.allocatedQty, icon: <CheckCircleIcon />, color: "secondary.main" },
    { label: "Unallocated Qty", value: stats.unallocatedQty, icon: <WarningAmberIcon />, color: "warning.main" },
    { label: "Today's Receipts", value: stats.todaysReceipts, icon: <LocalShippingIcon />, color: "success.main" },
    { label: "Today's Issues", value: stats.todaysIssues, icon: <OutputIcon />, color: "error.main" },
    { label: "Today's Transfers", value: stats.todaysTransfers, icon: <CompareArrowsIcon />, color: "warning.main" },
    { label: "Pending DRC", value: stats.pendingDrc, icon: <PendingActionsIcon />, color: "info.main" },
  ];

  return (
    <Box sx={{ pb: 4 }}>
      <Typography
        variant="h5"
        sx={{
          mb: 0.5,
          fontWeight: 800,
          letterSpacing: -0.5,
          fontSize: { xs: "1.4rem", sm: "1.75rem", md: "2.1rem" },
        }}
      >
        Dashboard
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Engineering Stores Management System
      </Typography>

      {/* ---- Summary cards ---- */}
      <Grid container spacing={1.5} sx={{ mb: 3 }}>
        {summaryCards.map((card) => (
          <Grid key={card.label} size={{ xs: 6, sm: 4, md: 3 }}>
            <Card
              elevation={0}
              sx={{
                borderRadius: 3,
                boxShadow: "0 2px 14px rgba(15, 23, 42, 0.06)",
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

      {/* ---- Quick Actions ---- */}
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.25 }}>
        Quick Actions
      </Typography>
      <Grid container spacing={1.5} sx={{ mb: 3 }}>
        {quickActions.map((action) => (
          <Grid key={action.label} size={{ xs: 6, sm: 3 }}>
            <Card elevation={0} sx={{ borderRadius: 3, boxShadow: "0 2px 14px rgba(15, 23, 42, 0.06)" }}>
              <CardActionArea onClick={() => navigate(action.path)} sx={{ p: 1.75, textAlign: "center" }}>
                <Avatar sx={{ bgcolor: "primary.main", mx: "auto", mb: 1, width: 40, height: 40 }}>
                  {action.icon}
                </Avatar>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {action.label}
                </Typography>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2}>
        {/* ---- Recent Activity ---- */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card elevation={0} sx={{ borderRadius: 3, boxShadow: "0 2px 14px rgba(15, 23, 42, 0.06)", height: "100%" }}>
            <CardContent>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1.5 }}>
                <HistoryIcon color="action" />
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
          <Card elevation={0} sx={{ borderRadius: 3, boxShadow: "0 2px 14px rgba(15, 23, 42, 0.06)", height: "100%" }}>
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
    </Box>
  );
}
