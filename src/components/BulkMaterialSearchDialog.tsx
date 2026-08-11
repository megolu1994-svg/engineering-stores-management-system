import { useMemo, useState } from "react";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";

import {
  bulkSearchMaterialsByCodes,
  MAX_BULK_CODES,
  parseMaterialCodes,
  type BulkMaterialSearchResult,
} from "../services/bulkMaterialSearchService";
import {
  exportPickListExcel,
  exportPickListPdf,
  pickListFilename,
} from "../utils/pickListExport";

const MAX_NOT_FOUND_PREVIEW = 15;

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Bulk material search: paste a column of material codes copied straight
 * from Excel, search them all at once, review the scrollable results
 * (total stock + every location for each material), then export an Excel
 * or PDF pick list for the storekeeper. The parent remounts this dialog
 * (via a changing `key`) every time it opens, so it always starts fresh.
 */
export default function BulkMaterialSearchDialog({ open, onClose }: Props) {
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkMaterialSearchResult | null>(null);

  const parsedCodes = useMemo(() => parseMaterialCodes(draft), [draft]);
  const tooMany = parsedCodes.length > MAX_BULK_CODES;
  const canSearch = parsedCodes.length > 0 && !tooMany && !loading;

  const totalStockSum = result
    ? result.rows.reduce((sum, row) => sum + row.totalStock, 0)
    : 0;

  async function handleSearch() {
    if (parsedCodes.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const found = await bulkSearchMaterialsByCodes(parsedCodes);
      setResult(found);
    } catch {
      setError("Search failed. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleExport(kind: "excel" | "pdf") {
    if (!result) return;
    const filename = pickListFilename("Bulk_Material_Search");
    if (kind === "excel") {
      exportPickListExcel(result.rows, result.notFound, filename);
    } else {
      exportPickListPdf(result.rows, result.notFound, filename);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle
        sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        Bulk Material Search
        <IconButton size="small" onClick={onClose} aria-label="Close">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <TextField
          label="Material codes"
          multiline
          fullWidth
          minRows={5}
          maxRows={12}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setResult(null);
          }}
          placeholder={
            "Paste one material code per line (copy a column from Excel).\n\nMC001\nMC002\nMC003"
          }
          helperText={
            parsedCodes.length > 0
              ? `${parsedCodes.length} unique code${parsedCodes.length === 1 ? "" : "s"} detected${
                  tooMany
                    ? ` - maximum ${MAX_BULK_CODES.toLocaleString("en-IN")} allowed`
                    : ""
                }`
              : "Codes are matched exactly as they appear in Material Master. Commas, tabs and semicolons also work."
          }
          error={tooMany}
          sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
        />

        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 1.5 }}>
          <Button
            variant="contained"
            startIcon={<SearchIcon />}
            onClick={handleSearch}
            disabled={!canSearch}
            sx={{ minHeight: 44, borderRadius: 2.5, fontWeight: 700 }}
          >
            Search
          </Button>
        </Box>

        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>
            {error}
          </Alert>
        )}

        {result && !loading && (
          <Box sx={{ mt: 2 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1,
                mb: 1.5,
                flexWrap: "wrap",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                <Chip
                  size="small"
                  color="primary"
                  label={`${result.rows.length} found`}
                  sx={{ fontWeight: 700 }}
                />
                {result.notFound.length > 0 && (
                  <Chip
                    size="small"
                    color="warning"
                    variant="outlined"
                    label={`${result.notFound.length} not found`}
                    sx={{ fontWeight: 700 }}
                  />
                )}
              </Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "text.primary" }}>
                Total stock:{" "}
                <Box component="span" sx={{ color: "primary.main", fontWeight: 800 }}>
                  {totalStockSum}
                </Box>
              </Typography>
            </Box>

            {result.notFound.length > 0 && (
              <Alert severity="warning" sx={{ mb: 1.5, borderRadius: 2 }}>
                <strong>{result.notFound.length}</strong> code
                {result.notFound.length === 1 ? "" : "s"} not found:{" "}
                {result.notFound.slice(0, MAX_NOT_FOUND_PREVIEW).join(", ")}
                {result.notFound.length > MAX_NOT_FOUND_PREVIEW
                  ? ` +${result.notFound.length - MAX_NOT_FOUND_PREVIEW} more`
                  : ""}
              </Alert>
            )}

            <TableContainer
              sx={{
                maxHeight: "55vh",
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 2,
              }}
            >
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                      Material Code
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
                    <TableCell sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                      UoM
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                      Total Stock
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Locations</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {result.rows.map((row) => (
                    <TableRow
                      key={row.material_code}
                      hover
                      sx={{
                        "&:nth-of-type(even)": {
                          bgcolor: (theme) => theme.palette.action.hover,
                        },
                      }}
                    >
                      <TableCell sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                        {row.material_code}
                      </TableCell>
                      <TableCell sx={{ minWidth: 220, wordBreak: "break-word" }}>
                        {row.short_description}
                      </TableCell>
                      <TableCell sx={{ textAlign: "center" }}>{row.uom}</TableCell>
                      <TableCell
                        align="right"
                        sx={{ fontWeight: 800, color: "primary.main", whiteSpace: "nowrap" }}
                      >
                        {row.totalStock}
                      </TableCell>
                      <TableCell>
                        {row.locations.length === 0 && row.unallocatedQty === 0 ? (
                          <Chip
                            size="small"
                            label="No stock"
                            variant="outlined"
                            sx={{ color: "text.secondary" }}
                          />
                        ) : (
                          <Box
                            sx={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 0.5,
                              py: 0.25,
                            }}
                          >
                            {row.locations.map((loc) => (
                              <Chip
                                key={loc.location_code}
                                size="small"
                                label={
                                  <Box
                                    component="span"
                                    sx={{ display: "inline-flex", alignItems: "baseline", gap: 0.75 }}
                                  >
                                    <Box component="span">{loc.location_code}</Box>
                                    <Box component="span" sx={{ fontWeight: 800 }}>
                                      {loc.quantity}
                                    </Box>
                                  </Box>
                                }
                                sx={{
                                  bgcolor: "primary.soft",
                                  color: "primary.main",
                                  fontWeight: 600,
                                  "& .MuiChip-label": { px: 1 },
                                }}
                              />
                            ))}
                            {row.unallocatedQty > 0 && (
                              <Chip
                                size="small"
                                variant="outlined"
                                color="warning"
                                label={`UNALLOCATED: ${row.unallocatedQty}`}
                                sx={{ fontWeight: 600 }}
                              />
                            )}
                          </Box>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button
          variant="outlined"
          startIcon={<FileDownloadIcon />}
          onClick={() => handleExport("excel")}
          disabled={!result || loading}
          sx={{ borderRadius: 2.5, fontWeight: 600 }}
        >
          Export Excel
        </Button>
        <Button
          variant="outlined"
          startIcon={<PictureAsPdfIcon />}
          onClick={() => handleExport("pdf")}
          disabled={!result || loading}
          sx={{ borderRadius: 2.5, fontWeight: 600 }}
        >
          Export PDF
        </Button>
        <Button onClick={onClose} sx={{ borderRadius: 2.5, fontWeight: 600 }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
