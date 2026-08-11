import {
  alpha,
  createTheme,
  darken,
  lighten,
  type PaletteColorOptions,
  type Theme,
} from "@mui/material/styles";

import { getFontFamilyStack } from "./types/themeSettings";

// Custom tokens on the resolved primary color, referenced from sx as
// "primary.soft" and "primary.hover" (selected-nav background, table row
// hover). The options object below is cast because MUI's input type does
// not declare these extra keys.
declare module "@mui/material/styles" {
  interface PaletteColor {
    soft?: string;
    hover?: string;
  }
}

export interface BuildThemeOptions {
  mode: "light" | "dark";
  /** Hex primary color, e.g. "#6C2BD9". */
  primaryColor: string;
  /** Key into FONT_FAMILY_OPTIONS. */
  fontFamily: string;
}

const CARD_SHADOW: Record<BuildThemeOptions["mode"], string> = {
  light: "0 2px 8px rgba(15, 23, 42, 0.06)",
  dark: "0 2px 10px rgba(0, 0, 0, 0.35)",
};

const PALETTE: Record<
  BuildThemeOptions["mode"],
  {
    background: { default: string; paper: string };
    text: { primary: string; secondary: string };
    divider: string;
  }
> = {
  light: {
    background: { default: "#FFFFFF", paper: "#FFFFFF" },
    text: { primary: "#111827", secondary: "#6B7280" },
    divider: "#E5E7EB",
  },
  dark: {
    background: { default: "#0E1116", paper: "#161B24" },
    text: { primary: "#E8EBF2", secondary: "#9AA3B5" },
    divider: "#262C38",
  },
};

/**
 * Builds the app's MUI theme from the account's saved theme settings.
 * ThemeSettingsProvider resolves "system" mode before this is called, so
 * `mode` here is always an explicit light/dark choice.
 */
export function buildTheme(options: BuildThemeOptions): Theme {
  const { mode, primaryColor, fontFamily } = options;
  const palette = PALETTE[mode];

  return createTheme({
    palette: {
      mode,
      primary: {
        main: primaryColor,
        dark: darken(primaryColor, 0.18),
        light: lighten(primaryColor, 0.25),
        soft: alpha(primaryColor, 0.14),
        hover: alpha(primaryColor, 0.08),
        contrastText: "#FFFFFF",
      } as PaletteColorOptions,
      background: {
        default: palette.background.default,
        paper: palette.background.paper,
      },
      text: {
        primary: palette.text.primary,
        secondary: palette.text.secondary,
      },
      divider: palette.divider,
    },
    shape: {
      // Keeps `borderRadius: 2`-style sx usages as rounded rectangles
      // instead of pills; pill-shaped elements (progress bars, avatars)
      // stay pill-shaped since their radius still exceeds half their height.
      borderRadius: 8,
    },
    typography: {
      fontFamily: getFontFamilyStack(fontFamily),
      h5: { fontWeight: 800 },
      h6: { fontWeight: 700 },
      subtitle1: { fontWeight: 700 },
      button: { textTransform: "none", fontWeight: 700 },
    },
    components: {
      MuiCard: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: 16,
            boxShadow: CARD_SHADOW[theme.palette.mode],
            backgroundColor: theme.palette.background.paper,
          }),
        },
      },
      MuiAppBar: {
        styleOverrides: {
          colorPrimary: ({ theme }) => ({
            backgroundColor: theme.palette.primary.main,
          }),
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 10,
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            fontWeight: 700,
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 10,
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: "#111827",
            fontSize: "0.72rem",
            fontWeight: 600,
            borderRadius: 6,
          },
        },
      },
      MuiInputBase: {
        styleOverrides: {
          // Mobile browsers/WebViews auto-zoom the whole page when a focused
          // input's font-size is under 16px, and never zoom back out - this
          // keeps every text field at 16px so tapping never triggers zoom.
          input: {
            fontSize: 16,
          },
        },
      },
    },
  });
}
