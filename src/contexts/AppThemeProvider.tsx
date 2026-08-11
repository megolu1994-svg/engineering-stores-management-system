import { useMemo, type ReactNode } from "react";

import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";

import { buildTheme } from "../theme";
import { useThemeSettings } from "./ThemeSettingsContext";

/**
 * Builds the MUI theme from the account's saved theme settings and provides
 * it to the whole tree (desktop and mobile share this one provider, so a
 * theme change in Settings applies everywhere immediately).
 */
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const { effectiveMode, primaryColor, fontFamily } = useThemeSettings();

  const theme = useMemo(
    () => buildTheme({ mode: effectiveMode, primaryColor, fontFamily }),
    [effectiveMode, primaryColor, fontFamily]
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
