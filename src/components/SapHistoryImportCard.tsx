import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import * as XLSX from "xlsx";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  LinearProgress,
  Snackbar,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from "@mui/material";

import UploadFileIcon from "@mui/icons-material/UploadFile";
import VisibilityIcon from "@mui/icons-material/Visibility";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DownloadIcon from "@mui/icons-material/Download";
import HistoryIcon from "@mui/icons-material/History";
import Inventory2Icon from "@mui/icons-material/Inventory2";

import {
  bulkImportMb51,
  bulkImportMb52,
  downloadMb51ImportReport,
  downloadMb52ImportReport,
  parseMb51ExcelRows,
  parseMb52ExcelRows,
  type Mb51ImportSummary,
  type Mb52ImportSummary,
  type SapDocumentRow,
  type SapDistributionRow,
  type SapInvalidRow,
} from "../services/sapHistoryService";
import { getMovementTypeDescription } from "../utils/sapMovementTypes";

type SnackbarSeverity = "success" | "error" | "warning" | "info";

const IMPORT_PREVIEW_LIMIT = 30;

async function readExcelFile(file: File): Promise<unknown[][]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  // Pick the sheet with the most rows - SAP workbooks sometimes carry a
  // cover / criteria sheet before the data sheet.
  let bestSheet = workbook.Sheets[workbook.SheetNames[0]];
  let bestRows = -1;
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const rowCount = sheet["!ref"]
      ? XLSX.utils.decode_range(sheet["!ref"]).e.r
      : 0;
    if (rowCount > bestRows) {
      bestRows = rowCount;
      bestSheet = sheet;
    }
  }

  return XLSX.utils.sheet_to_json(bestSheet, {
    header: 1,
    defval: "",
  }) as unknown[][];
}

interface Props {
  onImportComplete?: () => void;
}

type Mb51Validation = {
  totalRecords: number;
  validRows: SapDocumentRow[];
  invalidRows: SapInvalidRow[];
  detectedHeader: string[];
};
type Mb52Validation = {
  totalRecords: number;
  validRows: SapDistributionRow[];
  invalidRows: SapInvalidRow[];
  detectedHeader: string[];
};

/** Most frequent rejection reasons across invalid rows, e.g.
 *  "Quantity is required (39394×); Posting Date is required (39394×)". */
function topRejectionReasons(
  invalidRows: SapInvalidRow[],
  maxReasons = 2
): string {
  const counts = new Map<string, number>();
  for (const row of invalidRows) {
    for (const error of row.errors) {
      counts.set(error, (counts.get(error) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxReasons)
    .map(([error, count]) => `${error} (${count}×)`)
    .join("; ");
}

function useSnackbar() {
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: SnackbarSeverity;
  }>({ open: false, message: "", severity: "info" });

  function showSnackbar(message: string, severity: SnackbarSeverity) {
    setSnackbar({ open: true, message, severity });
  }

  return { snackbar, setSnackbar, showSnackbar };
}

/* -------------------------------------------------------------------------
 * One import tab: MB51 (history) or MB52 (current stock)
 * ---------------------------------------------------------------------- */

interface Mb51TabProps {
  fileName: string | null;
  validation: Mb51Validation | null;
  summary: Mb51ImportSummary | null;
  previewLoading: boolean;
  importing: boolean;
  processed: number;
  importTotal: number;
  onChooseFile: () => void;
  onPreview: () => void;
  onImport: () => void;
  onDownloadReport: () => void;
}

function Mb51Tab({
  fileName,
  validation,
  summary,
  previewLoading,
  importing,
  processed,
  importTotal,
  onChooseFile,
  onPreview,
  onImport,
  onDownloadReport,
}: Mb51TabProps) {
  const validRows = validation?.validRows ?? [];
  const invalidRows = validation?.invalidRows ?? [];
  const distinctMaterials = new Set(validRows.map((r) => r.material_code)).size;
  const distinctLocations = new Set(
    validRows.map((r) => r.storage_location).filter(Boolean)
  ).size;

  const previewRows: {
    rowNumber: number;
    status: "Valid" | "Invalid";
    material_code: string;
    location_code: string;
    movement_type: string;
    posting_date: string;
    quantity: string;
    errors: string[];
  }[] = [
    ...validRows.map((row) => ({
      rowNumber: row.rowNumber,
      status: "Valid" as const,
      material_code: row.material_code,
      location_code: row.storage_location || "Unallocated",
      movement_type: row.movement_type,
      posting_date: row.posting_date ?? "",
      quantity: String(row.quantity),
      errors: [] as string[],
    })),
    ...invalidRows.map((row) => ({
      rowNumber: row.rowNumber,
      status: "Invalid" as const,
      material_code: row.material_code,
      location_code: "",
      movement_type: "",
      posting_date: "",
      quantity: "",
      errors: row.errors,
    })),
  ]
    .sort((a, b) => a.rowNumber - b.rowNumber)
    .slice(0, IMPORT_PREVIEW_LIMIT);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Alert severity="info" sx={{ borderRadius: 2, py: 0.5 }}>
        MB51 = Material Document List (movement history). Every movement is
        stored as history with its SAP details (movement type, posting date,
        document, PO, vendor, invoice, user). History never affects app
        stock. Materials not yet in Material Master are created
        automatically (numeric codes only). Re-uploading the same file
        updates existing documents instead of duplicating them.
      </Alert>

      <Button
        variant="outlined"
        fullWidth
        startIcon={<UploadFileIcon fontSize="small" />}
        onClick={onChooseFile}
        sx={{ minHeight: 42, borderRadius: 2, fontWeight: 600 }}
      >
        Choose MB51 Excel File
      </Button>

      <Typography
        variant="caption"
        color="text.secondary"
        noWrap
        title={fileName ?? undefined}
        sx={{ minWidth: 0 }}
      >
        {fileName ?? "No file selected"}
      </Typography>

      <Button
        variant="contained"
        fullWidth
        startIcon={
          previewLoading ? (
            <CircularProgress size={18} color="inherit" />
          ) : (
            <VisibilityIcon fontSize="small" />
          )
        }
        onClick={onPreview}
        disabled={!fileName || previewLoading}
        sx={{ minHeight: 42, borderRadius: 2, fontWeight: 700 }}
      >
        Preview
      </Button>

      {validation && validation.detectedHeader.length > 0 && (
        <Typography
          variant="caption"
          color="text.secondary"
          noWrap
          title={validation.detectedHeader.join(" | ")}
          sx={{ display: "block", maxWidth: "100%" }}
        >
          Detected headers: {validation.detectedHeader.join(" · ")}
        </Typography>
      )}

      {validation && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
          <Chip size="small" label={`Movements: ${validRows.length}`} />
          <Chip size="small" label={`Materials: ${distinctMaterials}`} />
          <Chip
            size="small"
            label={`Storage Locations: ${distinctLocations}`}
            color="primary"
          />
          <Chip
            size="small"
            label={`Invalid: ${invalidRows.length}`}
            color={invalidRows.length > 0 ? "error" : "default"}
          />
        </Box>
      )}

      {validation && previewRows.length > 0 && (
        <TableContainer sx={{ maxHeight: 260, overflowX: "auto", borderRadius: 2 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Row</TableCell>
                <TableCell>Material</TableCell>
                <TableCell>Location</TableCell>
                <TableCell>Mvt</TableCell>
                <TableCell>Date</TableCell>
                <TableCell align="right">Qty</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Reason</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {previewRows.map((row) => (
                <TableRow key={row.rowNumber}>
                  <TableCell>{row.rowNumber}</TableCell>
                  <TableCell>{row.material_code}</TableCell>
                  <TableCell>{row.location_code}</TableCell>
                  <TableCell title={getMovementTypeDescription(row.movement_type)}>
                    {row.movement_type}
                  </TableCell>
                  <TableCell>{row.posting_date}</TableCell>
                  <TableCell align="right">{row.quantity}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={row.status}
                      color={row.status === "Valid" ? "success" : "error"}
                    />
                  </TableCell>
                  <TableCell>
                    {row.errors.length > 0
                      ? row.errors.join("; ")
                      : ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Button
        variant="contained"
        color="primary"
        fullWidth
        startIcon={
          importing ? (
            <CircularProgress size={18} color="inherit" />
          ) : (
            <CloudUploadIcon fontSize="small" />
          )
        }
        onClick={onImport}
        disabled={!validation || validRows.length === 0 || importing}
        sx={{ minHeight: 42, borderRadius: 2, fontWeight: 700 }}
      >
        Import History
      </Button>

      {importing && (
        <Box>
          <LinearProgress
            variant="determinate"
            value={
              importTotal > 0 ? Math.round((processed / importTotal) * 100) : 0
            }
            sx={{ height: 6, borderRadius: 3 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, display: "block" }}>
            Processing {processed} / {importTotal}
          </Typography>
        </Box>
      )}

      {summary && (
        <Alert
          severity={summary.failed > 0 ? "warning" : "success"}
          sx={{ borderRadius: 2, py: 0.25 }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <HistoryIcon fontSize="small" />
            <span>
              Imported: {summary.inserted}, Updated: {summary.updated},
              Materials created: {summary.materialsCreated}, Failed:{" "}
              {summary.failed}
            </span>
          </Box>
        </Alert>
      )}

      {summary && (
        <Button
          size="small"
          variant="outlined"
          startIcon={<DownloadIcon fontSize="small" />}
          onClick={onDownloadReport}
          sx={{ borderRadius: 2, fontWeight: 600, alignSelf: "flex-start" }}
        >
          Download Import Report
        </Button>
      )}
    </Box>
  );
}

interface Mb52TabProps {
  fileName: string | null;
  validation: Mb52Validation | null;
  summary: Mb52ImportSummary | null;
  previewLoading: boolean;
  importing: boolean;
  processed: number;
  importTotal: number;
  onChooseFile: () => void;
  onPreview: () => void;
  onImport: () => void;
  onDownloadReport: () => void;
}

function Mb52Tab({
  fileName,
  validation,
  summary,
  previewLoading,
  importing,
  processed,
  importTotal,
  onChooseFile,
  onPreview,
  onImport,
  onDownloadReport,
}: Mb52TabProps) {
  const validRows = validation?.validRows ?? [];
  const invalidRows = validation?.invalidRows ?? [];
  const distinctMaterials = new Set(validRows.map((r) => r.material_code)).size;
  const distinctLocations = new Set(
    validRows.map((r) => r.storage_location).filter(Boolean)
  ).size;

  const previewRows: {
    rowNumber: number;
    status: "Valid" | "Invalid";
    material_code: string;
    location_code: string;
    quantity: string;
    errors: string[];
  }[] = [
    ...validRows.map((row) => ({
      rowNumber: row.rowNumber,
      status: "Valid" as const,
      material_code: row.material_code,
      location_code: row.storage_location,
      quantity: String(row.quantity),
      errors: [] as string[],
    })),
    ...invalidRows.map((row) => ({
      rowNumber: row.rowNumber,
      status: "Invalid" as const,
      material_code: row.material_code,
      location_code: "",
      quantity: "",
      errors: row.errors,
    })),
  ]
    .sort((a, b) => a.rowNumber - b.rowNumber)
    .slice(0, IMPORT_PREVIEW_LIMIT);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Alert severity="info" sx={{ borderRadius: 2, py: 0.5 }}>
        MB52 = Current Stock Overview (point-in-time snapshot). This sets
        the SAP distribution (quantity per material + storage location) and
        compares each material's SAP total against the app's physical
        stock: totals that match are marked matched, differences create
        reconciliation reviews for you to review in the Adjust tab.
        Materials not yet in Material Master are created automatically
        (numeric codes only). Re-importing replaces the snapshot; the app's
        stock is never changed automatically.
      </Alert>

      <Button
        variant="outlined"
        fullWidth
        startIcon={<UploadFileIcon fontSize="small" />}
        onClick={onChooseFile}
        sx={{ minHeight: 42, borderRadius: 2, fontWeight: 600 }}
      >
        Choose MB52 Excel File
      </Button>

      <Typography
        variant="caption"
        color="text.secondary"
        noWrap
        title={fileName ?? undefined}
        sx={{ minWidth: 0 }}
      >
        {fileName ?? "No file selected"}
      </Typography>

      <Button
        variant="contained"
        fullWidth
        startIcon={
          previewLoading ? (
            <CircularProgress size={18} color="inherit" />
          ) : (
            <VisibilityIcon fontSize="small" />
          )
        }
        onClick={onPreview}
        disabled={!fileName || previewLoading}
        sx={{ minHeight: 42, borderRadius: 2, fontWeight: 700 }}
      >
        Preview
      </Button>

      {validation && validation.detectedHeader.length > 0 && (
        <Typography
          variant="caption"
          color="text.secondary"
          noWrap
          title={validation.detectedHeader.join(" | ")}
          sx={{ display: "block", maxWidth: "100%" }}
        >
          Detected headers: {validation.detectedHeader.join(" · ")}
        </Typography>
      )}

      {validation && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
          <Chip size="small" label={`Rows: ${validRows.length}`} />
          <Chip size="small" label={`Materials: ${distinctMaterials}`} />
          <Chip
            size="small"
            label={`Storage Locations: ${distinctLocations}`}
            color="primary"
          />
          <Chip
            size="small"
            label={`Invalid: ${invalidRows.length}`}
            color={invalidRows.length > 0 ? "error" : "default"}
          />
        </Box>
      )}

      {validation && previewRows.length > 0 && (
        <TableContainer sx={{ maxHeight: 260, overflowX: "auto", borderRadius: 2 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Row</TableCell>
                <TableCell>Material</TableCell>
                <TableCell>Location</TableCell>
                <TableCell align="right">Qty</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Reason</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {previewRows.map((row) => (
                <TableRow key={row.rowNumber}>
                  <TableCell>{row.rowNumber}</TableCell>
                  <TableCell>{row.material_code}</TableCell>
                  <TableCell>{row.location_code}</TableCell>
                  <TableCell align="right">{row.quantity}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={row.status}
                      color={row.status === "Valid" ? "success" : "error"}
                    />
                  </TableCell>
                  <TableCell>
                    {row.errors.length > 0 ? row.errors.join("; ") : ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Button
        variant="contained"
        color="primary"
        fullWidth
        startIcon={
          importing ? (
            <CircularProgress size={18} color="inherit" />
          ) : (
            <CloudUploadIcon fontSize="small" />
          )
        }
        onClick={onImport}
        disabled={!validation || validRows.length === 0 || importing}
        sx={{ minHeight: 42, borderRadius: 2, fontWeight: 700 }}
      >
        Import Current Stock
      </Button>

      {importing && (
        <Box>
          <LinearProgress
            variant="determinate"
            value={
              importTotal > 0 ? Math.round((processed / importTotal) * 100) : 0
            }
            sx={{ height: 6, borderRadius: 3 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, display: "block" }}>
            Processing {processed} / {importTotal}
          </Typography>
        </Box>
      )}

      {summary && (
        <Alert
          severity={summary.reviewsCreated > 0 ? "info" : "success"}
          sx={{ borderRadius: 2, py: 0.25 }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Inventory2Icon fontSize="small" />
            <span>
              Distribution rows: {summary.distributionRowsWritten}, Materials:{" "}
              {summary.materialsProcessed}, Matched: {summary.matched},
              Reviews created: {summary.reviewsCreated}, Materials created:{" "}
              {summary.materialsCreated}, Failed: {summary.failed}
            </span>
          </Box>
          {summary.reviewsCreated > 0 && (
            <Typography variant="caption" sx={{ display: "block", mt: 0.5 }}>
              Differences found - review them under Inventory → Adjust.
            </Typography>
          )}
        </Alert>
      )}

      {summary && (
        <Button
          size="small"
          variant="outlined"
          startIcon={<DownloadIcon fontSize="small" />}
          onClick={onDownloadReport}
          sx={{ borderRadius: 2, fontWeight: 600, alignSelf: "flex-start" }}
        >
          Download Import Report
        </Button>
      )}
    </Box>
  );
}

/* -------------------------------------------------------------------------
 * Card with MB51 / MB52 tabs
 * ---------------------------------------------------------------------- */

export default function SapHistoryImportCard({ onImportComplete }: Props) {
  const { snackbar, setSnackbar, showSnackbar } = useSnackbar();

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"mb51" | "mb52">("mb52");

  const mb51FileInputRef = useRef<HTMLInputElement | null>(null);
  const mb52FileInputRef = useRef<HTMLInputElement | null>(null);

  // MB51 state
  const [mb51File, setMb51File] = useState<File | null>(null);
  const [mb51PreviewLoading, setMb51PreviewLoading] = useState(false);
  const [mb51Validation, setMb51Validation] = useState<Mb51Validation | null>(null);
  const [mb51Importing, setMb51Importing] = useState(false);
  const [mb51Processed, setMb51Processed] = useState(0);
  const [mb51ImportTotal, setMb51ImportTotal] = useState(0);
  const [mb51Summary, setMb51Summary] = useState<Mb51ImportSummary | null>(null);

  // MB52 state
  const [mb52File, setMb52File] = useState<File | null>(null);
  const [mb52PreviewLoading, setMb52PreviewLoading] = useState(false);
  const [mb52Validation, setMb52Validation] = useState<Mb52Validation | null>(null);
  const [mb52Importing, setMb52Importing] = useState(false);
  const [mb52Processed, setMb52Processed] = useState(0);
  const [mb52ImportTotal, setMb52ImportTotal] = useState(0);
  const [mb52Summary, setMb52Summary] = useState<Mb52ImportSummary | null>(null);

  function handleMb51FileChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setMb51File(selected);
    setMb51Validation(null);
    setMb51Summary(null);
    setMb51Processed(0);
    setMb51ImportTotal(0);
    e.target.value = "";
  }

  function handleMb52FileChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setMb52File(selected);
    setMb52Validation(null);
    setMb52Summary(null);
    setMb52Processed(0);
    setMb52ImportTotal(0);
    e.target.value = "";
  }

  async function handleMb51Preview() {
    if (!mb51File) {
      showSnackbar("Please choose an Excel file first.", "warning");
      return;
    }
    setMb51PreviewLoading(true);
    setMb51Summary(null);
    try {
      const rows = await readExcelFile(mb51File);
      const result = parseMb51ExcelRows(rows);
      setMb51Validation(result);
      showSnackbar(
        result.validRows.length === 0
          ? `No valid movement rows found. ${topRejectionReasons(result.invalidRows)}`
          : `Preview ready. ${result.validRows.length} movements across ${new Set(result.validRows.map((r) => r.material_code)).size} material(s).`,
        result.validRows.length === 0 ? "error" : "success"
      );
    } catch {
      showSnackbar("Failed to read the Excel file.", "error");
    } finally {
      setMb51PreviewLoading(false);
    }
  }

  async function handleMb52Preview() {
    if (!mb52File) {
      showSnackbar("Please choose an Excel file first.", "warning");
      return;
    }
    setMb52PreviewLoading(true);
    setMb52Summary(null);
    try {
      const rows = await readExcelFile(mb52File);
      const result = parseMb52ExcelRows(rows);
      setMb52Validation(result);
      showSnackbar(
        result.validRows.length === 0
          ? `No valid stock rows found. ${topRejectionReasons(result.invalidRows)}`
          : `Preview ready. ${result.validRows.length} rows across ${new Set(result.validRows.map((r) => r.material_code)).size} material(s).`,
        result.validRows.length === 0 ? "error" : "success"
      );
    } catch {
      showSnackbar("Failed to read the Excel file.", "error");
    } finally {
      setMb52PreviewLoading(false);
    }
  }

  async function handleMb51Import() {
    if (!mb51Validation || mb51Validation.validRows.length === 0) {
      showSnackbar("Please preview the file before importing.", "warning");
      return;
    }
    setMb51Importing(true);
    setMb51Processed(0);
    setMb51ImportTotal(mb51Validation.validRows.length);
    setMb51Summary(null);
    try {
      const result = await bulkImportMb51(
        mb51Validation.validRows,
        mb51File?.name,
        (done, total) => {
          setMb51Processed(done);
          setMb51ImportTotal(total);
        }
      );
      setMb51Summary(result);
      await downloadMb51ImportReport(mb51Validation, result, mb51File?.name);
      showSnackbar(
        `Imported ${result.inserted} movement(s) (${result.updated} updated).`,
        result.failed > 0 ? "warning" : "success"
      );
      onImportComplete?.();
    } catch {
      showSnackbar("MB51 import failed unexpectedly.", "error");
    } finally {
      setMb51Importing(false);
    }
  }

  async function handleMb52Import() {
    if (!mb52Validation || mb52Validation.validRows.length === 0) {
      showSnackbar("Please preview the file before importing.", "warning");
      return;
    }
    setMb52Importing(true);
    setMb52Processed(0);
    setMb52ImportTotal(mb52Validation.validRows.length);
    setMb52Summary(null);
    try {
      const result = await bulkImportMb52(
        mb52Validation.validRows,
        mb52File?.name,
        (done, total) => {
          setMb52Processed(done);
          setMb52ImportTotal(total);
        }
      );
      setMb52Summary(result);
      await downloadMb52ImportReport(mb52Validation, result, mb52File?.name);
      showSnackbar(
        result.reviewsCreated > 0
          ? `Snapshot imported. ${result.reviewsCreated} reconciliation review(s) created - check Inventory → Adjust.`
          : "Snapshot imported. All totals matched.",
        result.failed > 0 ? "warning" : "success"
      );
      onImportComplete?.();
    } catch {
      showSnackbar("MB52 import failed unexpectedly.", "error");
    } finally {
      setMb52Importing(false);
    }
  }

  async function handleMb51DownloadReport() {
    if (!mb51Validation || !mb51Summary) return;
    try {
      await downloadMb51ImportReport(mb51Validation, mb51Summary, mb51File?.name);
      showSnackbar("Import report downloaded.", "success");
    } catch {
      showSnackbar("Failed to download the import report.", "error");
    }
  }

  async function handleMb52DownloadReport() {
    if (!mb52Validation || !mb52Summary) return;
    try {
      await downloadMb52ImportReport(mb52Validation, mb52Summary, mb52File?.name);
      showSnackbar("Import report downloaded.", "success");
    } catch {
      showSnackbar("Failed to download the import report.", "error");
    }
  }

  let tabContent: ReactNode;

  if (tab === "mb51") {
    tabContent = (
      <Mb51Tab
        fileName={mb51File?.name ?? null}
        validation={mb51Validation}
        summary={mb51Summary}
        previewLoading={mb51PreviewLoading}
        importing={mb51Importing}
        processed={mb51Processed}
        importTotal={mb51ImportTotal}
        onChooseFile={() => mb51FileInputRef.current?.click()}
        onPreview={handleMb51Preview}
        onImport={handleMb51Import}
        onDownloadReport={handleMb51DownloadReport}
      />
    );
  } else {
    tabContent = (
      <Mb52Tab
        fileName={mb52File?.name ?? null}
        validation={mb52Validation}
        summary={mb52Summary}
        previewLoading={mb52PreviewLoading}
        importing={mb52Importing}
        processed={mb52Processed}
        importTotal={mb52ImportTotal}
        onChooseFile={() => mb52FileInputRef.current?.click()}
        onPreview={handleMb52Preview}
        onImport={handleMb52Import}
        onDownloadReport={handleMb52DownloadReport}
      />
    );
  }

  return (
    <Card
      elevation={0}
      sx={{ borderRadius: 2, boxShadow: "0 2px 10px rgba(15, 23, 42, 0.06)" }}
    >
      <Box
        onClick={() => setOpen((prev) => !prev)}
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 1.5,
          py: 1,
          cursor: "pointer",
        }}
      >
        <Typography sx={{ fontWeight: 700, fontSize: "0.9rem" }}>
          Import SAP Data (MB51 History / MB52 Current Stock)
        </Typography>
        <ExpandMoreIcon
          fontSize="small"
          sx={{
            transition: "transform 0.2s",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </Box>

      <Collapse in={open} timeout="auto" unmountOnExit>
        <CardContent sx={{ p: 1.5, pt: 0, "&:last-child": { pb: 1.5 } }}>
          <Tabs
            value={tab}
            onChange={(_, value: "mb51" | "mb52") => setTab(value)}
            variant="fullWidth"
            sx={{
              mb: 1.25,
              minHeight: 40,
              "& .MuiTab-root": {
                fontWeight: 700,
                textTransform: "none",
                minHeight: 40,
                fontSize: "0.8rem",
                py: 0.5,
              },
            }}
          >
            <Tab value="mb52" label="MB52 · Current Stock" />
            <Tab value="mb51" label="MB51 · Material History" />
          </Tabs>

          <input
            ref={mb51FileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            hidden
            onChange={handleMb51FileChange}
          />
          <input
            ref={mb52FileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            hidden
            onChange={handleMb52FileChange}
          />

          {tabContent}
        </CardContent>
      </Collapse>

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
    </Card>
  );
}
