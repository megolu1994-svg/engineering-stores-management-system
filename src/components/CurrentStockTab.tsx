import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
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
    <Box sx={{ mt: 2.5 }}>
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          gap: 2,
          mb: 2.5,
        }}
      >
        <TextField
          label="Search Current Stock"
          placeholder="Search by Material Code, Description or Location"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          fullWidth
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" />
                </InputAdornment>
              ),
            },
          }}
          sx={{
            "& .MuiOutlinedInput-root": {
              borderRadius: 3,
              minHeight: 56,
            },
          }}
        />

        <Button
          variant="contained"
          size="large"
          startIcon={<DownloadIcon />}
          onClick={handleExport}
          sx={{
            minHeight: 56,
            borderRadius: 3,
            fontWeight: 700,
            width: { xs: "100%", sm: "auto" },
            whiteSpace: "nowrap",
          }}
        >
          Export to Excel
        </Button>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress />
        </Box>
      ) : filteredRows.length === 0 ? (
        <Card variant="outlined" sx={{ p: 4, textAlign: "center", borderRadius: 3 }}>
          <Typography color="text.secondary">
            No current stock records found.
          </Typography>
        </Card>
      ) : mobile ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {filteredRows.map((row, index) => (
            <Card
              key={`${row.material_code}-${row.location_code}-${index}`}
              variant="outlined"
              sx={{ borderRadius: 3 }}
            >
              <CardContent>
                <Typography sx={{ fontWeight: 700 }} noWrap>
                  {row.material_code}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {row.short_description}
                </Typography>

                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    mt: 1.5,
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <PlaceIcon fontSize="small" color="action" />
                    <Typography variant="body2">{row.location_code}</Typography>
                  </Box>

                  <Typography sx={{ fontWeight: 700 }} color="primary.main">
                    {row.quantity}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      ) : (
        <TableContainer
          component={Paper}
          elevation={0}
          sx={{
            borderRadius: 3,
            boxShadow: "0 2px 14px rgba(15, 23, 42, 0.06)",
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
