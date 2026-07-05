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
  // Base unit multiplied by every unitless `borderRadius` value passed to
  // MUI's `sx` prop (e.g. `sx={{ borderRadius: 2 }}` -> 2 * shape.borderRadius).
  // At 16 that pushed the many `borderRadius: 2` usages on ~48-56px tall
  // tabs/inputs/buttons to a 32px radius - equal to or past half their
  // height, so corners rendered as a full pill/cylinder instead of a
  // rounded rectangle. 8 keeps those the same rounded-rectangle look while
  // letting the deliberately pill-shaped elements (progress bars, avatars)
  // stay pill-shaped since their radius still exceeds half their height.
  shape: {
    borderRadius: 8,
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
    MuiInputBase: {
      styleOverrides: {
        // Mobile browsers/WebViews auto-zoom the whole page when a focused
        // input's font-size is under 16px, and never zoom back out - this
        // keeps every text field at 16px (regardless of MUI's "small" size)
        // so tapping into a field never triggers that zoom.
        input: {
          fontSize: 16,
        },
      },
    },
  },
});

export default theme;
