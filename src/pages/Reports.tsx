import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  InputAdornment,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";

import SearchIcon from "@mui/icons-material/Search";
import DownloadIcon from "@mui/icons-material/Download";
import PrintIcon from "@mui/icons-material/Print";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import PlaceIcon from "@mui/icons-material/Place";
import RemoveShoppingCartIcon from "@mui/icons-material/RemoveShoppingCart";
import InboxIcon from "@mui/icons-material/Inbox";
import HistoryIcon from "@mui/icons-material/History";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import OutputIcon from "@mui/icons-material/Output";

import MaterialSearch from "../components/MaterialSearch";
import { useSwipeTabs } from "../hooks/useSwipeTabs";
import SwipeableTabPanel from "../components/SwipeableTabPanel";
import { BRAND_PURPLE, BRAND_PURPLE_SOFT } from "../theme";

import type { Material } from "../types/material";
import type { MaterialAllocation } from "../types/materialAllocation";
import type { Location } from "../types/location";

import { getAllocations } from "../services/materialAllocationService";
import { getMaterials } from "../services/materialService";
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

function downloadPdf(
  title: string,
  headers: string[],
  rows: (string | number)[][],
  filename: string
) {
  const doc = new jsPDF({ orientation: headers.length > 5 ? "landscape" : "portrait" });

  doc.setFontSize(14);
  doc.text(title, 14, 15);

  autoTable(doc, {
    head: [headers],
    body: rows.map((row) => row.map((cell) => String(cell))),
    startY: 20,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [91, 33, 182], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 243, 255] },
  });

  doc.save(filename);
}

const SUPABASE_PAGE_SIZE = 1000;

interface ExportAllocationRow {
  material_code: string;
  location_code: string;
  quantity: number;
}

/**
 * Same 1000-row PostgREST page cap that Dashboard's totals hit - these
 * bulk export reports need every allocation/location row, not just the
 * first page, so they page through with `.range()` instead of a single
 * `.select()`.
 */
async function fetchAllAllocationRowsForExport(): Promise<ExportAllocationRow[]> {
  const rows: ExportAllocationRow[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("material_allocation")
      .select("material_code, location_code, quantity")
      .range(from, from + SUPABASE_PAGE_SIZE - 1);

    if (error) throw error;

    const page = (data ?? []) as ExportAllocationRow[];
    rows.push(...page);

    if (page.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }

  return rows;
}

async function fetchAllLocationsForExport(): Promise<Location[]> {
  const rows: Location[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("location_master")
      .select("*")
      .eq("is_active", true)
      .order("location_code")
      .range(from, from + SUPABASE_PAGE_SIZE - 1);

    if (error) throw error;

    const page = (data ?? []) as Location[];
    rows.push(...page);

    if (page.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }

  return rows;
}

interface ExportReportData {
  materials: Material[];
  allocations: ExportAllocationRow[];
  locations: Location[];
}

interface ReportDataset {
  headers: string[];
  rows: (string | number)[][];
}

function buildAllMaterialStockList(data: ExportReportData): ReportDataset {
  const byMaterial = new Map<
    string,
    { total: number; unallocated: number; locations: Map<string, number> }
  >();

  for (const a of data.allocations) {
    const qty = safeNumber(a.quantity);
    const entry = byMaterial.get(a.material_code) ?? {
      total: 0,
      unallocated: 0,
      locations: new Map<string, number>(),
    };

    entry.total += qty;
    if (a.location_code === UNALLOCATED_LOCATION) {
      entry.unallocated += qty;
    } else if (qty > 0) {
      entry.locations.set(a.location_code, (entry.locations.get(a.location_code) ?? 0) + qty);
    }

    byMaterial.set(a.material_code, entry);
  }

  const rows = data.materials.map((m) => {
    const entry = byMaterial.get(m.material_code);
    const total = entry?.total ?? 0;
    const unallocated = entry?.unallocated ?? 0;
    const allocated = total - unallocated;
    const locationsText = entry
      ? Array.from(entry.locations.entries())
          .map(([loc, qty]) => `${loc}:${qty}`)
          .join(", ")
      : "";

    return [
      m.material_code,
      m.short_description,
      m.uom,
      total,
      allocated,
      unallocated,
      locationsText || "-",
    ];
  });

  return {
    headers: [
      "Material Code",
      "Description",
      "UoM",
      "Total Stock",
      "Allocated Qty",
      "Unallocated Qty",
      "Allocated Locations",
    ],
    rows,
  };
}

function buildAllocatedMaterialList(data: ExportReportData): ReportDataset {
  const materialMap = new Map(data.materials.map((m) => [m.material_code, m]));
  const locationMap = new Map(data.locations.map((l) => [l.location_code, l]));

  const rows = data.allocations
    .filter((a) => a.location_code !== UNALLOCATED_LOCATION && safeNumber(a.quantity) > 0)
    .map((a) => {
      const material = materialMap.get(a.material_code);
      const location = locationMap.get(a.location_code);

      return [
        a.material_code,
        safeText(material?.short_description),
        safeText(material?.uom),
        a.location_code,
        safeText(location?.location_description),
        safeNumber(a.quantity),
      ];
    });

  return {
    headers: ["Material Code", "Description", "UoM", "Location Code", "Location Description", "Quantity"],
    rows,
  };
}

function buildUnallocatedMaterialList(data: ExportReportData): ReportDataset {
  const allocatedQtyByMaterial = new Map<string, number>();
  const unallocatedQtyByMaterial = new Map<string, number>();

  for (const a of data.allocations) {
    const qty = safeNumber(a.quantity);
    if (a.location_code === UNALLOCATED_LOCATION) {
      unallocatedQtyByMaterial.set(
        a.material_code,
        (unallocatedQtyByMaterial.get(a.material_code) ?? 0) + qty
      );
    } else if (qty > 0) {
      allocatedQtyByMaterial.set(
        a.material_code,
        (allocatedQtyByMaterial.get(a.material_code) ?? 0) + qty
      );
    }
  }

  const rows = data.materials
    .filter((m) => !allocatedQtyByMaterial.get(m.material_code))
    .map((m) => [
      m.material_code,
      m.short_description,
      m.uom,
      unallocatedQtyByMaterial.get(m.material_code) ?? 0,
    ]);

  return {
    headers: ["Material Code", "Description", "UoM", "Unallocated Quantity"],
    rows,
  };
}

function buildEmptyLocationsList(data: ExportReportData): ReportDataset {
  const occupied = new Set(
    data.allocations
      .filter((a) => a.location_code !== UNALLOCATED_LOCATION && safeNumber(a.quantity) > 0)
      .map((a) => a.location_code)
  );

  const rows = data.locations
    .filter((l) => !occupied.has(l.location_code))
    .map((l) => [l.location_code, l.location_description]);

  return {
    headers: ["Location Code", "Description"],
    rows,
  };
}

interface ExportSummaryReport {
  key: string;
  icon: ReactNode;
  title: string;
  /** Excel sheet names are capped at 31 chars, so this is kept short and separate from the display title. */
  sheetName: string;
  description: string;
  filenameBase: string;
  build: (data: ExportReportData) => ReportDataset;
}

const EXPORT_SUMMARY_REPORTS: ExportSummaryReport[] = [
  {
    key: "stock",
    icon: <Inventory2Icon />,
    title: "1. All Material Stock List",
    sheetName: "Material Stock List",
    description:
      "Export all materials with total stock, allocated & unallocated quantity with allocated locations.",
    filenameBase: "All_Material_Stock_List",
    build: buildAllMaterialStockList,
  },
  {
    key: "allocated",
    icon: <PlaceIcon />,
    title: "2. All Allocated Material List",
    sheetName: "Allocated Materials",
    description: "Export all materials that are allocated with their allocated locations and quantities.",
    filenameBase: "All_Allocated_Material_List",
    build: buildAllocatedMaterialList,
  },
  {
    key: "unallocated",
    icon: <RemoveShoppingCartIcon />,
    title: "3. All Unallocated Material List",
    sheetName: "Unallocated Materials",
    description: "Export all materials that are not allocated with their unallocated quantity.",
    filenameBase: "All_Unallocated_Material_List",
    build: buildUnallocatedMaterialList,
  },
  {
    key: "empty-locations",
    icon: <InboxIcon />,
    title: "4. All Empty Locations List",
    sheetName: "Empty Locations",
    description: "Export all locations which are currently empty.",
    filenameBase: "All_Empty_Locations_List",
    build: buildEmptyLocationsList,
  },
];

function ExportSummaryRow({
  report,
  loadingExcel,
  loadingPdf,
  onExportExcel,
  onExportPdf,
}: {
  report: ExportSummaryReport;
  loadingExcel: boolean;
  loadingPdf: boolean;
  onExportExcel: () => void;
  onExportPdf: () => void;
}) {
  const busy = loadingExcel || loadingPdf;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        p: 1.5,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2,
        flexWrap: "wrap",
      }}
    >
      <Avatar sx={{ bgcolor: BRAND_PURPLE_SOFT, color: BRAND_PURPLE, width: 44, height: 44 }}>
        {report.icon}
      </Avatar>

      <Box sx={{ flex: 1, minWidth: 180 }}>
        <Typography sx={{ fontWeight: 700, fontSize: "0.9rem" }}>{report.title}</Typography>
        <Typography variant="caption" color="text.secondary">
          {report.description}
        </Typography>
      </Box>

      <Box sx={{ display: "flex", gap: 1 }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={loadingExcel ? <CircularProgress size={14} /> : <DownloadIcon fontSize="small" />}
          onClick={onExportExcel}
          disabled={busy}
          sx={{ borderRadius: 2, fontWeight: 700 }}
        >
          Excel
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={loadingPdf ? <CircularProgress size={14} /> : <PictureAsPdfIcon fontSize="small" />}
          onClick={onExportPdf}
          disabled={busy}
          sx={{ borderRadius: 2, fontWeight: 700 }}
        >
          PDF
        </Button>
      </Box>
    </Box>
  );
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

  // ---------------- Export Summary (bulk reports) ----------------
  const [exportLoading, setExportLoading] = useState<Record<string, boolean>>({});
  const [exportError, setExportError] = useState<string | null>(null);
  const reportDataCacheRef = useRef<ExportReportData | null>(null);
  const reportDataPromiseRef = useRef<Promise<ExportReportData> | null>(null);

  function loadExportReportData(): Promise<ExportReportData> {
    if (reportDataCacheRef.current) {
      return Promise.resolve(reportDataCacheRef.current);
    }

    if (!reportDataPromiseRef.current) {
      reportDataPromiseRef.current = Promise.all([
        getMaterials(),
        fetchAllAllocationRowsForExport(),
        fetchAllLocationsForExport(),
      ])
        .then(([materials, allocations, locations]) => {
          const data: ExportReportData = { materials, allocations, locations };
          reportDataCacheRef.current = data;
          return data;
        })
        .finally(() => {
          reportDataPromiseRef.current = null;
        });
    }

    return reportDataPromiseRef.current;
  }

  async function handleExportSummaryReport(
    report: ExportSummaryReport,
    format: "excel" | "pdf"
  ) {
    const loadingKey = `${report.key}-${format}`;
    setExportLoading((prev) => ({ ...prev, [loadingKey]: true }));

    try {
      const data = await loadExportReportData();
      const { headers, rows } = report.build(data);

      if (format === "excel") {
        downloadWorkbook(headers, rows, `${report.filenameBase}.xlsx`, report.sheetName);
      } else {
        downloadPdf(report.title, headers, rows, `${report.filenameBase}.pdf`);
      }
    } catch (err) {
      console.error(err);
      setExportError("Something went wrong while generating the export. Please try again.");
    } finally {
      setExportLoading((prev) => ({ ...prev, [loadingKey]: false }));
    }
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

          <Card elevation={0} sx={{ borderRadius: 2, boxShadow: "0 2px 14px rgba(15,23,42,0.06)", mb: 2 }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>
                Export Summary
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Select a report type to export
              </Typography>

              <Stack spacing={1.5}>
                {EXPORT_SUMMARY_REPORTS.map((report) => (
                  <ExportSummaryRow
                    key={report.key}
                    report={report}
                    loadingExcel={!!exportLoading[`${report.key}-excel`]}
                    loadingPdf={!!exportLoading[`${report.key}-pdf`]}
                    onExportExcel={() => handleExportSummaryReport(report, "excel")}
                    onExportPdf={() => handleExportSummaryReport(report, "pdf")}
                  />
                ))}
              </Stack>

              <Alert severity="info" sx={{ mt: 2, borderRadius: 2 }}>
                Exports will include the latest data as per current stock and allocation status.
              </Alert>
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
              ) : (
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
          ) : (
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
          ) : (
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
          ) : (
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
          )}
        </>
      )}

      </SwipeableTabPanel>

      <Snackbar
        open={!!exportError}
        autoHideDuration={4000}
        onClose={() => setExportError(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="error" variant="filled" onClose={() => setExportError(null)}>
          {exportError}
        </Alert>
      </Snackbar>
    </Box>
  );
}
