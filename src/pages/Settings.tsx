import { useState, type ReactNode } from "react";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControlLabel,
  Grid,
  MenuItem,
  Snackbar,
  Switch,
  TextField,
  Typography,
} from "@mui/material";

import BusinessIcon from "@mui/icons-material/Business";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import BackupIcon from "@mui/icons-material/Backup";
import InfoIcon from "@mui/icons-material/Info";
import DownloadIcon from "@mui/icons-material/Download";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

import { useSwipeOpenDrawer } from "../hooks/useSwipeTabs";

const APP_VERSION = "1.0.0";
const DEVELOPER_NAME = "ESMS Engineering Team";

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card
      elevation={0}
      sx={{ borderRadius: 3, boxShadow: "0 2px 14px rgba(15, 23, 42, 0.06)", mb: 2.5 }}
    >
      <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
          {icon}
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
        </Box>
        <Divider sx={{ mb: 2 }} />
        {children}
      </CardContent>
    </Card>
  );
}

/**
 * Settings is UI-only for now: nothing here is persisted to the
 * database. Values reset on refresh - a future pass can wire this up to
 * a settings table once one exists.
 */
export default function Settings() {
  useSwipeOpenDrawer();

  const [snackbarOpen, setSnackbarOpen] = useState(false);

  // Application
  const [companyName, setCompanyName] = useState("");
  const [warehouseName, setWarehouseName] = useState("");
  const [theme, setTheme] = useState("light");

  // Inventory
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [defaultUom, setDefaultUom] = useState("EA");
  const [decimalPrecision, setDecimalPrecision] = useState("2");

  // Receipt
  const [autoDrcNumber, setAutoDrcNumber] = useState(true);
  const [autoIssueNumber, setAutoIssueNumber] = useState(true);

  function handleSave() {
    setSnackbarOpen(true);
  }

  return (
    <Box sx={{ pb: 4, maxWidth: { md: 980 }, mx: { md: "auto" } }}>
      <Typography
        variant="h5"
        sx={{
          mb: 3,
          fontWeight: 800,
          letterSpacing: -0.5,
          fontSize: { xs: "1.4rem", sm: "1.75rem", md: "2.1rem" },
        }}
      >
        Settings
      </Typography>

      <Alert severity="info" sx={{ mb: 2.5, borderRadius: 2 }}>
        These settings are for reference only in this release - they are not
        yet saved to the database.
      </Alert>

      {/* ---- Application ---- */}
      <SectionCard icon={<BusinessIcon color="primary" />} title="Application">
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Company Name"
              fullWidth
              size="small"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Warehouse Name"
              fullWidth
              size="small"
              value={warehouseName}
              onChange={(e) => setWarehouseName(e.target.value)}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              select
              label="Theme"
              fullWidth
              size="small"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            >
              <MenuItem value="light">Light</MenuItem>
              <MenuItem value="dark">Dark</MenuItem>
              <MenuItem value="system">System Default</MenuItem>
            </TextField>
          </Grid>
        </Grid>
      </SectionCard>

      {/* ---- Inventory ---- */}
      <SectionCard icon={<Inventory2Icon color="primary" />} title="Inventory">
        <Grid container spacing={2} sx={{ alignItems: "center" }}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={allowNegativeStock}
                  onChange={(e) => setAllowNegativeStock(e.target.checked)}
                />
              }
              label="Allow Negative Stock"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              select
              label="Default UoM"
              fullWidth
              size="small"
              value={defaultUom}
              onChange={(e) => setDefaultUom(e.target.value)}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            >
              <MenuItem value="EA">EA - Each</MenuItem>
              <MenuItem value="KG">KG - Kilogram</MenuItem>
              <MenuItem value="L">L - Litre</MenuItem>
              <MenuItem value="M">M - Metre</MenuItem>
              <MenuItem value="SET">SET</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              select
              label="Decimal Precision"
              fullWidth
              size="small"
              value={decimalPrecision}
              onChange={(e) => setDecimalPrecision(e.target.value)}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            >
              <MenuItem value="0">0 (Whole numbers)</MenuItem>
              <MenuItem value="1">1 decimal place</MenuItem>
              <MenuItem value="2">2 decimal places</MenuItem>
              <MenuItem value="3">3 decimal places</MenuItem>
            </TextField>
          </Grid>
        </Grid>
      </SectionCard>

      {/* ---- Receipt ---- */}
      <SectionCard icon={<ReceiptLongIcon color="primary" />} title="Receipt">
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={autoDrcNumber}
                  onChange={(e) => setAutoDrcNumber(e.target.checked)}
                />
              }
              label="Auto DRC Number"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={autoIssueNumber}
                  onChange={(e) => setAutoIssueNumber(e.target.checked)}
                />
              }
              label="Auto Issue Number"
            />
          </Grid>
        </Grid>
      </SectionCard>

      {/* ---- Backup ---- */}
      <SectionCard icon={<BackupIcon color="primary" />} title="Backup">
        <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 1.5 }}>
          <Button
            variant="outlined"
            fullWidth
            startIcon={<DownloadIcon />}
            sx={{ minHeight: 48, borderRadius: 2.5, fontWeight: 600 }}
            disabled
          >
            Export Database
          </Button>
          <Button
            variant="outlined"
            fullWidth
            startIcon={<UploadFileIcon />}
            sx={{ minHeight: 48, borderRadius: 2.5, fontWeight: 600 }}
            disabled
          >
            Import Database
          </Button>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
          Backup and restore are not yet available in this release.
        </Typography>
      </SectionCard>

      {/* ---- About ---- */}
      <SectionCard icon={<InfoIcon color="primary" />} title="About">
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              Application Version
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 700 }}>
              {APP_VERSION}
            </Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              Developer
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 700 }}>
              {DEVELOPER_NAME}
            </Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              Database Status
            </Typography>
            <Chip
              size="small"
              icon={<CheckCircleIcon />}
              label="Connected"
              color="success"
              sx={{ fontWeight: 700 }}
            />
          </Grid>
        </Grid>
      </SectionCard>

      <Button
        variant="contained"
        size="large"
        onClick={handleSave}
        sx={{ minHeight: 52, borderRadius: 2.5, fontWeight: 700, width: { xs: "100%", sm: "auto" } }}
      >
        Save Settings
      </Button>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="info" variant="filled" onClose={() => setSnackbarOpen(false)}>
          Settings are UI-only in this release and are not saved yet.
        </Alert>
      </Snackbar>
    </Box>
  );
}
