import { createTheme } from "@mui/material/styles";

export const BRAND_PURPLE = "#5B21B6";
export const BRAND_PURPLE_SOFT = "#F3E8FF";

const theme = createTheme({
  palette: {
    primary: {
      main: BRAND_PURPLE,
    },
    background: {
      default: "#FFFFFF",
      paper: "#FFFFFF",
    },
    text: {
      primary: "#111827",
      secondary: "#6B7280",
    },
  },
  shape: {
    borderRadius: 16,
  },
  typography: {
    h5: { fontWeight: 800 },
    h6: { fontWeight: 700 },
    subtitle1: { fontWeight: 700 },
    button: { textTransform: "none", fontWeight: 700 },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: "0 2px 8px rgba(15, 23, 42, 0.06)",
          backgroundColor: "#FFFFFF",
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        colorPrimary: {
          backgroundColor: BRAND_PURPLE,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
  },
});

export default theme;
