import { useCallback, useEffect, useState } from "react";
import * as XLSX from "xlsx";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  InputAdornment,
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
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

import SearchIcon from "@mui/icons-material/Search";
import DownloadIcon from "@mui/icons-material/Download";
import PrintIcon from "@mui/icons-material/Print";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import HistoryIcon from "@mui/icons-material/History";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import OutputIcon from "@mui/icons-material/Output";

import MaterialSearch from "../components/MaterialSearch";
import { useSwipeTabs } from "../hooks/useSwipeTabs";
import SwipeableTabPanel from "../components/SwipeableTabPanel";

import type { Material } from "../types/material";
import type { MaterialAllocation } from "../types/materialAllocation";
import type { Location } from "../types/location";

import { getAllocations } from "../services/materialAllocationService";
import { getLocations } from "../services/locationService";
import {
  getMaterialMovementDates,
  type MaterialMovementDates,
} from "../services/inventoryOverviewService";
import { supabase } from "../config/supabase";
import type { InventoryTransactionType } from "../services/inventoryTransactionService";

function safeNumber(value: number | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function safeText(value: string | null | undefined): string {
  return value ?? "-";
}

const UNALLOCATED_LOCATION = "UNALLOCATED";

function formatReportDate(value: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatReportDateTime(value: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function downloadWorkbook(
  headers: string[],
  rows: (string | number)[][],
  filename: string,
  sheetName: string
) {
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  worksheet["!cols"] = headers.map(() => ({ wch: 20 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename);
}

const TAB_MATERIAL_SUMMARY = 0;
const TAB_MOVEMENT_HISTORY = 1;
const TAB_RECEIPT_HISTORY = 2;
const TAB_ISSUE_HISTORY = 3;

interface MovementRow {
  id: number;
  created_at: string;
  transaction_type: InventoryTransactionType;
  reference_number: string | null;
  quantity: number;
  movement: "IN" | "OUT";
  location_code: string;
  material_code: string;
  created_by: string | null;
}

interface ReceiptHistoryRow {
  id: number;
  drc_number: string;
  po_number: string | null;
  vendor_name: string;
  package_qty: number;
  receipt_datetime: string;
}

interface IssueHistoryRow {
  id: number;
  issue_number: string;
  department: string;
  total_quantity: number;
  issue_datetime: string;
}

function ExportPrintBar({
  onExportExcel,
  onPrint,
}: {
  onExportExcel: () => void;
  onPrint: () => void;
}) {
  return (
    <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
      <Button
        size="small"
        variant="outlined"
        startIcon={<DownloadIcon fontSize="small" />}
        onClick={onExportExcel}
        sx={{ borderRadius: 2, fontWeight: 600 }}
      >
        Export Excel
      </Button>
      <Button
        size="small"
        variant="outlined"
        startIcon={<PictureAsPdfIcon fontSize="small" />}
        onClick={onPrint}
        sx={{ borderRadius: 2, fontWeight: 600 }}
      >
        Export PDF
      </Button>
      <Button
        size="small"
        variant="outlined"
        startIcon={<PrintIcon fontSize="small" />}
        onClick={onPrint}
        sx={{ borderRadius: 2, fontWeight: 600 }}
      >
        Print
      </Button>
    </Box>
  );
}

export default function Reports() {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [activeTab, setActiveTab] = useState(TAB_MATERIAL_SUMMARY);

  const { direction } = useSwipeTabs(activeTab, setActiveTab, 4);

  // ---------------- Material Summary ----------------
  const [material, setMaterial] = useState<Material | null>(null);
  const [allocations, setAllocations] = useState<MaterialAllocation[]>([]);
  const [locationMap, setLocationMap] = useState<Record<string, string>>({});
  const [loadingAllocations, setLoadingAllocations] = useState(false);
  const [movementDates, setMovementDates] = useState<MaterialMovementDates>({
    lastReceiptDate: null,
    lastIssueDate: null,
    lastMovementDate: null,
  });

  useEffect(() => {
    let isMounted = true;

    async function loadLocationDescriptions() {
      try {
        const data = await getLocations();
        if (!isMounted) return;
        const map: Record<string, string> = {};
        data.forEach((loc: Location) => {
          map[loc.location_code] = loc.location_description;
        });
        setLocationMap(map);
      } catch {
        // Location descriptions are a display-only enhancement.
      }
    }

    loadLocationDescriptions();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!material) {
      setAllocations([]);
      setMovementDates({ lastReceiptDate: null, lastIssueDate: null, lastMovementDate: null });
      return;
    }

    let isMounted = true;

    async function loadAllocations() {
      setLoadingAllocations(true);
      try {
        const [allocationData, dates] = await Promise.all([
          getAllocations(material!.material_code),
          getMaterialMovementDates(material!.material_code),
        ]);
        if (isMounted) {
          setAllocations(allocationData);
          setMovementDates(dates);
        }
      } finally {
        if (isMounted) setLoadingAllocations(false);
      }
    }

    loadAllocations();

    return () => {
      isMounted = false;
    };
  }, [material]);

  const totalStock = safeNumber(allocations.reduce((sum, a) => sum + safeNumber(a.quantity), 0));
  const unallocatedQty = safeNumber(
    allocations
      .filter((a) => a.location_code === UNALLOCATED_LOCATION)
      .reduce((sum, a) => sum + safeNumber(a.quantity), 0)
  );
  const allocatedQty = safeNumber(totalStock - unallocatedQty);
  const numberOfLocations = allocations.filter(
    (a) => a.location_code !== UNALLOCATED_LOCATION && safeNumber(a.quantity) > 0
  ).length;

  function handleExportMaterialSummary() {
    if (!material) return;
    downloadWorkbook(
      ["Material Code", "Description", "UoM", "Total Stock", "Allocated Stock", "Unallocated Stock", "Total Locations", "Last Receipt Date", "Last Issue Date", "Last Movement Date"],
      [[
        material.material_code,
        material.short_description,
        material.uom,
        totalStock,
        allocatedQty,
        unallocatedQty,
        numberOfLocations,
        formatReportDate(movementDates.lastReceiptDate),
        formatReportDate(movementDates.lastIssueDate),
        formatReportDate(movementDates.lastMovementDate),
      ]],
      `Material_Summary_${material.material_code}.xlsx`,
      "Material Summary"
    );
  }

  // ---------------- Movement History ----------------
  const [movementSearch, setMovementSearch] = useState("");
  const [movementRows, setMovementRows] = useState<MovementRow[]>([]);
  const [loadingMovement, setLoadingMovement] = useState(false);

  const loadMovementHistory = useCallback(async () => {
    setLoadingMovement(true);
    try {
      let query = supabase
        .from("inventory_transactions")
        .select(
          "id, created_at, transaction_type, reference_number, quantity, movement, location_code, material_code, created_by"
        )
        .order("created_at", { ascending: false })
        .limit(100);

      const trimmed = movementSearch.trim();
      if (trimmed) {
        const safe = trimmed.replace(/[%_]/g, (m) => `\\${m}`);
        query = query.or(
          `material_code.ilike.%${safe}%,reference_number.ilike.%${safe}%,location_code.ilike.%${safe}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      setMovementRows((data ?? []) as MovementRow[]);
    } catch (err) {
      console.error(err);
      setMovementRows([]);
    } finally {
      setLoadingMovement(false);
    }
  }, [movementSearch]);

  useEffect(() => {
    if (activeTab !== TAB_MOVEMENT_HISTORY) return;
    const timer = setTimeout(() => loadMovementHistory(), 300);
    return () => clearTimeout(timer);
  }, [activeTab, loadMovementHistory]);

  function movementFromTo(row: MovementRow): { from: string; to: string } {
    if (row.movement === "OUT") {
      return { from: row.location_code, to: "-" };
    }
    return { from: "-", to: row.location_code };
  }

  function handleExportMovement() {
    downloadWorkbook(
      ["Date", "Transaction Type", "Reference", "Material", "Quantity", "From Location", "To Location", "User"],
      movementRows.map((r) => {
        const { from, to } = movementFromTo(r);
        return [
          formatReportDateTime(r.created_at),
          r.transaction_type,
          safeText(r.reference_number),
          r.material_code,
          safeNumber(r.quantity),
          from,
          to,
          safeText(r.created_by),
        ];
      }),
      "Movement_History.xlsx",
      "Movement History"
    );
  }

  // ---------------- Receipt History ----------------
  const [receiptRows, setReceiptRows] = useState<ReceiptHistoryRow[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);

  useEffect(() => {
    if (activeTab !== TAB_RECEIPT_HISTORY) return;

    let cancelled = false;
    setLoadingReceipts(true);

    async function load() {
      try {
        const { data, error } = await supabase
          .from("receipt_header")
          .select(
            "id, drc_number, sap_po_number, gem_order_number, vendor_name, package_details, receipt_datetime"
          )
          .order("receipt_datetime", { ascending: false })
          .limit(100);

        if (error) throw error;

        const rows = (
          (data ?? []) as {
            id: number;
            drc_number: string;
            sap_po_number: string | null;
            gem_order_number: string | null;
            vendor_name: string;
            package_details: { quantity: number }[] | null;
            receipt_datetime: string;
          }[]
        ).map((r) => ({
          id: r.id,
          drc_number: r.drc_number,
          po_number: r.sap_po_number ?? r.gem_order_number,
          vendor_name: r.vendor_name,
          package_qty: (r.package_details ?? []).reduce(
            (sum, p) => sum + safeNumber(p.quantity),
            0
          ),
          receipt_datetime: r.receipt_datetime,
        }));

        if (!cancelled) setReceiptRows(rows);
      } catch (err) {
        console.error(err);
        if (!cancelled) setReceiptRows([]);
      } finally {
        if (!cancelled) setLoadingReceipts(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  function handleExportReceipts() {
    downloadWorkbook(
      ["DRC", "PO", "Vendor", "Qty", "Date"],
      receiptRows.map((r) => [
        r.drc_number,
        safeText(r.po_number),
        r.vendor_name,
        safeNumber(r.package_qty),
        formatReportDate(r.receipt_datetime),
      ]),
      "Receipt_History.xlsx",
      "Receipt History"
    );
  }

  // ---------------- Issue History ----------------
  const [issueRows, setIssueRows] = useState<IssueHistoryRow[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(false);

  useEffect(() => {
    if (activeTab !== TAB_ISSUE_HISTORY) return;

    let cancelled = false;
    setLoadingIssues(true);

    async function load() {
      try {
        const { data, error } = await supabase
          .from("issue_header")
          .select("id, issue_number, department, total_quantity, issue_datetime")
          .order("issue_datetime", { ascending: false })
          .limit(100);

        if (error) throw error;

        if (!cancelled) setIssueRows((data ?? []) as IssueHistoryRow[]);
      } catch (err) {
        console.error(err);
        if (!cancelled) setIssueRows([]);
      } finally {
        if (!cancelled) setLoadingIssues(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  function handleExportIssues() {
    downloadWorkbook(
      ["Issue No", "Department", "Qty", "Date"],
      issueRows.map((r) => [
        r.issue_number,
        r.department,
        safeNumber(r.total_quantity),
        formatReportDate(r.issue_datetime),
      ]),
      "Issue_History.xlsx",
      "Issue History"
    );
  }

  function handlePrint() {
    window.print();
  }

  return (
    <Box sx={{ pb: 4 }}>
      <Typography
        variant="h5"
        sx={{
          mb: 2,
          fontWeight: "bold",
          fontSize: { xs: "1.25rem", sm: "1.5rem", md: "2rem" },
        }}
      >
        Reports
      </Typography>

      <Tabs
        value={activeTab}
        onChange={(_, value) => setActiveTab(value)}
        variant="fullWidth"
        sx={{
          minHeight: 56,
          borderBottom: 1,
          borderColor: "divider",
          mb: 2.5,
          borderRadius: 2,
          bgcolor: "grey.50",
          "& .MuiTab-root": {
            fontWeight: 700,
            textTransform: "none",
            minHeight: 56,
            minWidth: 0,
            fontSize: "0.68rem",
            lineHeight: 1.15,
            px: 0.5,
            py: 0.5,
            gap: 0.25,
          },
          "& .MuiTabs-indicator": {
            height: 3,
            borderRadius: 3,
          },
        }}
      >
        <Tab icon={<Inventory2Icon sx={{ fontSize: 18 }} />} iconPosition="top" label="Summary" />
        <Tab icon={<HistoryIcon sx={{ fontSize: 18 }} />} iconPosition="top" label="Movement" />
        <Tab icon={<LocalShippingIcon sx={{ fontSize: 18 }} />} iconPosition="top" label="Receipts" />
        <Tab icon={<OutputIcon sx={{ fontSize: 18 }} />} iconPosition="top" label="Issues" />
      </Tabs>

      <SwipeableTabPanel activeTab={activeTab} direction={direction}>

      {activeTab === TAB_MATERIAL_SUMMARY && (
        <>
          <Card elevation={0} sx={{ borderRadius: 2, boxShadow: "0 2px 14px rgba(15,23,42,0.06)", mb: 2 }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Typography variant="subtitle1" sx={{ fontWeight: "bold" }} gutterBottom>
                Material Search
              </Typography>

              <MaterialSearch value={material} onChange={setMaterial} />
            </CardContent>
          </Card>

          {!material && (
            <Alert severity="info">
              Search and select a material to view its summary and allocated
              locations.
            </Alert>
          )}

          {material && (
            <>
              <ExportPrintBar onExportExcel={handleExportMaterialSummary} onPrint={handlePrint} />

              <Card elevation={0} sx={{ borderRadius: 2, boxShadow: "0 2px 14px rgba(15,23,42,0.06)", mb: 2 }}>
                <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: "bold" }} gutterBottom>
                    Material Summary
                  </Typography>

                  <Divider sx={{ mb: 2 }} />

                  <Stack spacing={1.5}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                          Material Code
                        </Typography>
                        <Typography variant="body1" sx={{ fontWeight: "bold" }}>
                          {material.material_code}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                          UoM
                        </Typography>
                        <Typography variant="body1">{material.uom}</Typography>
                      </Box>
                    </Box>

                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                        Description
                      </Typography>
                      <Typography variant="body1" sx={{ overflowWrap: "break-word" }}>
                        {material.short_description}
                      </Typography>
                    </Box>

                    <Divider />

                    <Box sx={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 2 }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                          Total Stock
                        </Typography>
                        <Typography variant="h6" sx={{ fontWeight: "bold" }} color="primary.main">
                          {totalStock}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                          Allocated Stock
                        </Typography>
                        <Typography variant="h6" sx={{ fontWeight: "bold" }}>
                          {allocatedQty}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                          Unallocated Stock
                        </Typography>
                        <Typography variant="h6" sx={{ fontWeight: "bold" }} color={unallocatedQty > 0 ? "warning.main" : "success.main"}>
                          {unallocatedQty}
                        </Typography>
                      </Box>
                    </Box>

                    <Divider />

                    <Box sx={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 2 }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                          Total Locations
                        </Typography>
                        <Typography variant="body1" sx={{ fontWeight: "bold" }}>
                          {numberOfLocations}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                          Last Receipt Date
                        </Typography>
                        <Typography variant="body1">{formatReportDate(movementDates.lastReceiptDate)}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                          Last Issue Date
                        </Typography>
                        <Typography variant="body1">{formatReportDate(movementDates.lastIssueDate)}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                          Last Movement Date
                        </Typography>
                        <Typography variant="body1">{formatReportDate(movementDates.lastMovementDate)}</Typography>
                      </Box>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>

              <Typography variant="subtitle1" sx={{ fontWeight: "bold", mb: 1.5 }}>
                Location Wise Stock
              </Typography>

              {loadingAllocations ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                  <CircularProgress />
                </Box>
              ) : allocations.filter((a) => a.location_code !== UNALLOCATED_LOCATION).length === 0 ? (
                <Card variant="outlined" sx={{ p: 3, textAlign: "center", borderRadius: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    No allocations found for this material.
                  </Typography>
                </Card>
              ) : mobile ? (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {allocations
                    .filter((a) => a.location_code !== UNALLOCATED_LOCATION)
                    .map((allocation) => (
                      <Card key={allocation.id} variant="outlined" sx={{ borderRadius: 2.5, px: 1.5, py: 1.25 }}>
                        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontWeight: 700, fontSize: "0.9rem" }} noWrap>
                              {allocation.location_code}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" noWrap>
                              {safeText(locationMap[allocation.location_code])}
                            </Typography>
                          </Box>
                          <Typography sx={{ fontWeight: 800, flexShrink: 0 }}>
                            {safeNumber(allocation.quantity)}
                          </Typography>
                        </Box>
                      </Card>
                    ))}
                </Box>
              ) : (
                <TableContainer component={Card} variant="outlined" sx={{ borderRadius: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Location</TableCell>
                        <TableCell>Description</TableCell>
                        <TableCell align="right">Quantity</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {allocations
                        .filter((a) => a.location_code !== UNALLOCATED_LOCATION)
                        .map((allocation) => (
                          <TableRow key={allocation.id}>
                            <TableCell sx={{ fontWeight: 700 }}>{allocation.location_code}</TableCell>
                            <TableCell>{safeText(locationMap[allocation.location_code])}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>
                              {safeNumber(allocation.quantity)}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </>
          )}
        </>
      )}

      {activeTab === TAB_MOVEMENT_HISTORY && (
        <>
          <TextField
            size="small"
            placeholder="Search Material Code, Reference or Location"
            value={movementSearch}
            onChange={(e) => setMovementSearch(e.target.value)}
            fullWidth
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ mb: 1.5, "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
          />

          <ExportPrintBar onExportExcel={handleExportMovement} onPrint={handlePrint} />

          {loadingMovement ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress />
            </Box>
          ) : movementRows.length === 0 ? (
            <Card variant="outlined" sx={{ p: 3, textAlign: "center", borderRadius: 2 }}>
              <Typography variant="body2" color="text.secondary">
                No movement history found.
              </Typography>
            </Card>
          ) : mobile ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {movementRows.map((row) => {
                const { from, to } = movementFromTo(row);
                return (
                  <Card key={row.id} variant="outlined" sx={{ borderRadius: 2.5, px: 1.5, py: 1.25 }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: "0.9rem" }} noWrap>
                          {row.material_code}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                          {safeText(row.reference_number)}
                        </Typography>
                      </Box>
                      <Chip
                        size="small"
                        label={row.transaction_type.replace("_", " ")}
                        sx={{ fontWeight: 700, fontSize: "0.65rem" }}
                      />
                    </Box>

                    <Grid container spacing={0.5} sx={{ mt: 0.5 }}>
                      <Grid size={6}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: "0.65rem" }}>
                          Qty
                        </Typography>
                        <Typography variant="body2" noWrap>{safeNumber(row.quantity)}</Typography>
                      </Grid>
                      <Grid size={6}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: "0.65rem" }}>
                          Date
                        </Typography>
                        <Typography variant="body2" noWrap>{formatReportDateTime(row.created_at)}</Typography>
                      </Grid>
                      <Grid size={6}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: "0.65rem" }}>
                          From
                        </Typography>
                        <Typography variant="body2" noWrap>{from}</Typography>
                      </Grid>
                      <Grid size={6}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: "0.65rem" }}>
                          To
                        </Typography>
                        <Typography variant="body2" noWrap>{to}</Typography>
                      </Grid>
                      <Grid size={12}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: "0.65rem" }}>
                          User
                        </Typography>
                        <Typography variant="body2" noWrap>{safeText(row.created_by)}</Typography>
                      </Grid>
                    </Grid>
                  </Card>
                );
              })}
            </Box>
          ) : (
            <TableContainer component={Card} variant="outlined" sx={{ borderRadius: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Reference</TableCell>
                    <TableCell>Material</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    <TableCell>From</TableCell>
                    <TableCell>To</TableCell>
                    <TableCell>User</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {movementRows.map((row) => {
                    const { from, to } = movementFromTo(row);
                    return (
                      <TableRow key={row.id}>
                        <TableCell>{formatReportDateTime(row.created_at)}</TableCell>
                        <TableCell>{row.transaction_type.replace("_", " ")}</TableCell>
                        <TableCell>{safeText(row.reference_number)}</TableCell>
                        <TableCell>{row.material_code}</TableCell>
                        <TableCell align="right">{safeNumber(row.quantity)}</TableCell>
                        <TableCell>{from}</TableCell>
                        <TableCell>{to}</TableCell>
                        <TableCell>{safeText(row.created_by)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}

      {activeTab === TAB_RECEIPT_HISTORY && (
        <>
          <ExportPrintBar onExportExcel={handleExportReceipts} onPrint={handlePrint} />

          {loadingReceipts ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress />
            </Box>
          ) : receiptRows.length === 0 ? (
            <Card variant="outlined" sx={{ p: 3, textAlign: "center", borderRadius: 2 }}>
              <Typography variant="body2" color="text.secondary">
                No receipts found.
              </Typography>
            </Card>
          ) : mobile ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {receiptRows.map((row) => (
                <Card key={row.id} variant="outlined" sx={{ borderRadius: 2.5, px: 1.5, py: 1.25 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 700, fontSize: "0.9rem" }} noWrap>
                        {row.drc_number}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {row.vendor_name}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontWeight: 800, flexShrink: 0 }}>
                      {safeNumber(row.package_qty)}
                    </Typography>
                  </Box>

                  <Grid container spacing={0.5} sx={{ mt: 0.5 }}>
                    <Grid size={6}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: "0.65rem" }}>
                        PO
                      </Typography>
                      <Typography variant="body2" noWrap>{safeText(row.po_number)}</Typography>
                    </Grid>
                    <Grid size={6}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: "0.65rem" }}>
                        Date
                      </Typography>
                      <Typography variant="body2" noWrap>{formatReportDate(row.receipt_datetime)}</Typography>
                    </Grid>
                  </Grid>
                </Card>
              ))}
            </Box>
          ) : (
            <TableContainer component={Card} variant="outlined" sx={{ borderRadius: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>DRC</TableCell>
                    <TableCell>PO</TableCell>
                    <TableCell>Vendor</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    <TableCell>Date</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {receiptRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell sx={{ fontWeight: 700 }}>{row.drc_number}</TableCell>
                      <TableCell>{safeText(row.po_number)}</TableCell>
                      <TableCell>{row.vendor_name}</TableCell>
                      <TableCell align="right">{safeNumber(row.package_qty)}</TableCell>
                      <TableCell>{formatReportDate(row.receipt_datetime)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}

      {activeTab === TAB_ISSUE_HISTORY && (
        <>
          <ExportPrintBar onExportExcel={handleExportIssues} onPrint={handlePrint} />

          {loadingIssues ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress />
            </Box>
          ) : issueRows.length === 0 ? (
            <Card variant="outlined" sx={{ p: 3, textAlign: "center", borderRadius: 2 }}>
              <Typography variant="body2" color="text.secondary">
                No issues found.
              </Typography>
            </Card>
          ) : mobile ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {issueRows.map((row) => (
                <Card key={row.id} variant="outlined" sx={{ borderRadius: 2.5, px: 1.5, py: 1.25 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 700, fontSize: "0.9rem" }} noWrap>
                        {row.issue_number}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {row.department}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontWeight: 800, flexShrink: 0 }}>
                      {safeNumber(row.total_quantity)}
                    </Typography>
                  </Box>

                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                    {formatReportDate(row.issue_datetime)}
                  </Typography>
                </Card>
              ))}
            </Box>
          ) : (
            <TableContainer component={Card} variant="outlined" sx={{ borderRadius: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Issue No</TableCell>
                    <TableCell>Department</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    <TableCell>Date</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {issueRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell sx={{ fontWeight: 700 }}>{row.issue_number}</TableCell>
                      <TableCell>{row.department}</TableCell>
                      <TableCell align="right">{safeNumber(row.total_quantity)}</TableCell>
                      <TableCell>{formatReportDate(row.issue_datetime)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}

      </SwipeableTabPanel>
    </Box>
  );
}
