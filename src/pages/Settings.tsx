import { useEffect, useState, type ReactNode } from "react";

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
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import LogoutIcon from "@mui/icons-material/Logout";
import PaletteIcon from "@mui/icons-material/Palette";

import { useNavigate } from "react-router-dom";

import { useSwipeOpenDrawer } from "../hooks/useSwipeTabs";
import { useAuth } from "../contexts/AuthContext";
import { useBranding } from "../contexts/BrandingContext";
import { useThemeSettings } from "../contexts/ThemeSettingsContext";
import {
  FONT_FAMILY_OPTIONS,
  PRIMARY_COLOR_OPTIONS,
  type ThemeSettings,
} from "../types/themeSettings";

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
      sx={(theme) => ({
        borderRadius: 3,
        boxShadow:
          theme.palette.mode === "dark"
            ? "0 2px 14px rgba(0, 0, 0, 0.4)"
            : "0 2px 14px rgba(15, 23, 42, 0.06)",
        mb: 2.5,
      })}
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

export default function Settings() {
  useSwipeOpenDrawer();

  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const branding = useBranding();
  const themeSettings = useThemeSettings();

  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [snackbarSeverity, setSnackbarSeverity] = useState<"info" | "success" | "error">("info");
  const [signingOut, setSigningOut] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    navigate("/login", { replace: true });
  }

  // Application - header branding + theme, persisted per account (see
  // BrandingContext / ThemeSettingsContext). Local state mirrors the
  // contexts so the fields are editable, and is re-synced whenever the
  // account's saved values load.
  const [companyName, setCompanyName] = useState("");
  const [warehouseName, setWarehouseName] = useState("");
  const [logoLetter, setLogoLetter] = useState("");
  const [themeMode, setThemeMode] = useState<ThemeSettings["mode"]>("light");
  const [primaryColor, setPrimaryColor] = useState(PRIMARY_COLOR_OPTIONS[0].value);
  const [fontFamily, setFontFamily] = useState(FONT_FAMILY_OPTIONS[0].value);

  useEffect(() => {
    if (branding.loading || themeSettings.loading) return;
    setCompanyName(branding.companyName);
    setWarehouseName(branding.warehouseName);
    setLogoLetter(branding.logoLetter);
    setThemeMode(themeSettings.mode);
    setPrimaryColor(themeSettings.primaryColor);
    setFontFamily(themeSettings.fontFamily);
  }, [
    branding.loading,
    branding.companyName,
    branding.warehouseName,
    branding.logoLetter,
    themeSettings.loading,
    themeSettings.mode,
    themeSettings.primaryColor,
    themeSettings.fontFamily,
  ]);

  const isCustomColor = !PRIMARY_COLOR_OPTIONS.some(
    (o) => o.value.toLowerCase() === primaryColor.toLowerCase()
  );

  // Inventory
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [defaultUom, setDefaultUom] = useState("EA");
  const [decimalPrecision, setDecimalPrecision] = useState("2");

  // Receipt
  const [autoDrcNumber, setAutoDrcNumber] = useState(true);
  const [autoIssueNumber, setAutoIssueNumber] = useState(true);

  async function handleSave() {
    setSaving(true);

    try {
      await branding.updateBranding({ companyName, warehouseName, logoLetter });
      await themeSettings.updateThemeSettings({
        mode: themeMode,
        primaryColor,
        fontFamily,
      });
      setSnackbarSeverity("success");
      setSnackbarMessage("Settings saved.");
    } catch {
      setSnackbarSeverity("error");
      setSnackbarMessage("Could not save settings. Please try again.");
    } finally {
      setSaving(false);
      setSnackbarOpen(true);
    }
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
        Company Name, Warehouse Name, Logo Letter and the theme (Light/Dark
        mode, colors and fonts) are saved to your account and applied across
        the app on both desktop and mobile. Other settings below are for
        reference only in this release and are not yet saved.
      </Alert>

      {/* ---- Account ---- */}
      <SectionCard icon={<AccountCircleIcon color="primary" />} title="Account">
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            alignItems: { sm: "center" },
            justifyContent: "space-between",
            gap: 1.5,
          }}
        >
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              Signed in as
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 700 }}>
              {user?.email}
            </Typography>
          </Box>
          <Button
            variant="outlined"
            color="error"
            startIcon={<LogoutIcon />}
            onClick={handleSignOut}
            disabled={signingOut}
            sx={{ borderRadius: 2.5, fontWeight: 600 }}
          >
            Sign Out
          </Button>
        </Box>
      </SectionCard>

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
              label="Logo Letter"
              fullWidth
              size="small"
              value={logoLetter}
              onChange={(e) => setLogoLetter(e.target.value.slice(0, 2))}
              helperText="Shown in the circular logo next to Warehouse Name (up to 2 characters)."
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            />
          </Grid>

          <Grid size={{ xs: 12 }}>
            <Divider sx={{ mt: 1, mb: 2.5 }} />
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
              <PaletteIcon color="primary" fontSize="small" />
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Appearance
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
              Choose how the app looks. The theme applies everywhere - desktop and mobile -
              the moment you save.
            </Typography>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              select
              label="Theme"
              fullWidth
              size="small"
              value={themeMode}
              onChange={(e) => setThemeMode(e.target.value as ThemeSettings["mode"])}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            >
              <MenuItem value="light">Light</MenuItem>
              <MenuItem value="dark">Dark</MenuItem>
              <MenuItem value="system">System Default</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              select
              label="Font Family"
              fullWidth
              size="small"
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            >
              {FONT_FAMILY_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mb: 1 }}
            >
              Primary Color
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, flexWrap: "wrap" }}>
              {PRIMARY_COLOR_OPTIONS.map((option) => {
                const selected = primaryColor.toLowerCase() === option.value.toLowerCase();
                return (
                  <Box
                    key={option.value}
                    component="button"
                    type="button"
                    title={option.label}
                    aria-label={`Set primary color to ${option.label}`}
                    onClick={() => setPrimaryColor(option.value)}
                    sx={{
                      width: 34,
                      height: 34,
                      borderRadius: "50%",
                      bgcolor: option.value,
                      cursor: "pointer",
                      p: 0,
                      border: "2px solid",
                      borderColor: selected ? "primary.main" : "transparent",
                      outline: selected ? `2px solid ${themeSettings.effectiveMode === "dark" ? "#FFFFFF" : "#0E1116"}` : "none",
                      outlineOffset: 2,
                      transition: "transform 0.15s ease",
                      "&:hover": { transform: "scale(1.12)" },
                    }}
                  />
                );
              })}

              {/* Custom color picker (rainbow swatch) */}
              <Box
                component="label"
                title="Custom color"
                sx={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  cursor: "pointer",
                  position: "relative",
                  overflow: "hidden",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "2px solid",
                  borderColor: isCustomColor ? "primary.main" : "transparent",
                  outline: isCustomColor ? `2px solid ${themeSettings.effectiveMode === "dark" ? "#FFFFFF" : "#0E1116"}` : "none",
                  outlineOffset: 2,
                  transition: "transform 0.15s ease",
                  "&:hover": { transform: "scale(1.12)" },
                }}
              >
                <Box
                  sx={{
                    position: "absolute",
                    inset: 0,
                    background:
                      "conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
                  }}
                />
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  aria-label="Pick a custom primary color"
                  style={{
                    position: "absolute",
                    inset: 0,
                    opacity: 0,
                    width: "100%",
                    height: "100%",
                    cursor: "pointer",
                  }}
                />
              </Box>
            </Box>
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
        disabled={saving}
        sx={{ minHeight: 52, borderRadius: 2.5, fontWeight: 700, width: { xs: "100%", sm: "auto" } }}
      >
        {saving ? "Saving..." : "Save Settings"}
      </Button>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={snackbarSeverity} variant="filled" onClose={() => setSnackbarOpen(false)}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
}
