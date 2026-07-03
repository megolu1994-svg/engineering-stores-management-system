import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

import {
  Alert,
  Box,
  Card,
  CircularProgress,
  IconButton,
  InputAdornment,
  Paper,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

import SearchIcon from "@mui/icons-material/Search";
import DownloadIcon from "@mui/icons-material/Download";
import PlaceIcon from "@mui/icons-material/Place";

import {
  getCurrentStock,
  type CurrentStockRow,
} from "../services/materialAllocationService";

type SnackbarSeverity = "success" | "error" | "info";

export default function CurrentStockTab() {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [rows, setRows] = useState<CurrentStockRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: SnackbarSeverity;
  }>({ open: false, message: "", severity: "info" });

  function showSnackbar(message: string, severity: SnackbarSeverity) {
    setSnackbar({ open: true, message, severity });
  }

  useEffect(() => {
    let cancelled = false;

    setLoading(true);

    getCurrentStock()
      .then((data) => {
        if (!cancelled) {
          setRows(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          showSnackbar("Failed to load current stock.", "error");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return rows;
    }

    return rows.filter(
      (row) =>
        row.material_code.toLowerCase().includes(query) ||
        row.short_description.toLowerCase().includes(query) ||
        row.location_code.toLowerCase().includes(query) ||
        row.location_description.toLowerCase().includes(query)
    );
  }, [rows, search]);

  function handleExport() {
    if (filteredRows.length === 0) {
      showSnackbar("There is no data to export.", "info");
      return;
    }

    const worksheet = XLSX.utils.aoa_to_sheet([
      ["Material Code", "Description", "Location", "Quantity"],
      ...filteredRows.map((row) => [
        row.material_code,
        row.short_description,
        row.location_code,
        row.quantity,
      ]),
    ]);

    worksheet["!cols"] = [
      { wch: 18 },
      { wch: 42 },
      { wch: 18 },
      { wch: 12 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Current Stock");
    XLSX.writeFile(workbook, "Current_Stock.xlsx");

    showSnackbar("Current stock exported.", "success");
  }

  return (
    <Box sx={{ mt: 1.5 }}>
      <Box
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 5,
          bgcolor: "background.default",
          display: "flex",
          alignItems: "center",
          gap: 1,
          py: 1,
        }}
      >
        <TextField
          size="small"
          placeholder="Search Material Code, Description or Location"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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
          sx={{
            "& .MuiOutlinedInput-root": {
              borderRadius: 2,
              bgcolor: "background.paper",
            },
          }}
        />

        <Tooltip title="Export to Excel">
          <IconButton
            onClick={handleExport}
            sx={{
              flexShrink: 0,
              width: 40,
              height: 40,
              borderRadius: 2,
              bgcolor: "primary.main",
              color: "primary.contrastText",
              "&:hover": { bgcolor: "primary.dark" },
            }}
          >
            <DownloadIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
          <CircularProgress size={28} />
        </Box>
      ) : filteredRows.length === 0 ? (
        <Card variant="outlined" sx={{ p: 3, textAlign: "center", borderRadius: 2, mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            No current stock records found.
          </Typography>
        </Card>
      ) : mobile ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, mt: 0.5 }}>
          {filteredRows.map((row, index) => (
            <Card
              key={`${row.material_code}-${row.location_code}-${index}`}
              variant="outlined"
              sx={{ borderRadius: 2, px: 1.25, py: 0.75 }}
            >
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700, fontSize: "0.85rem" }} noWrap>
                    {row.material_code}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      lineHeight: 1.3,
                    }}
                  >
                    {row.short_description}
                  </Typography>
                </Box>

                <Typography
                  sx={{ fontWeight: 800, fontSize: "1.15rem", flexShrink: 0 }}
                  color="primary.main"
                >
                  {row.quantity}
                </Typography>
              </Box>

              <Box sx={{ display: "flex", alignItems: "center", gap: 0.4, mt: 0.5 }}>
                <PlaceIcon sx={{ fontSize: 14 }} color="action" />
                <Typography variant="caption" color="text.secondary">
                  {row.location_code}
                </Typography>
              </Box>
            </Card>
          ))}
        </Box>
      ) : (
        <TableContainer
          component={Paper}
          elevation={0}
          sx={{
            borderRadius: 2,
            boxShadow: "0 2px 14px rgba(15, 23, 42, 0.06)",
            mt: 1,
          }}
        >
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Material Code</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Location</TableCell>
                <TableCell align="right">Quantity</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {filteredRows.map((row, index) => (
                <TableRow key={`${row.material_code}-${row.location_code}-${index}`}>
                  <TableCell>{row.material_code}</TableCell>
                  <TableCell>{row.short_description}</TableCell>
                  <TableCell>{row.location_code}</TableCell>
                  <TableCell align="right">{row.quantity}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

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
