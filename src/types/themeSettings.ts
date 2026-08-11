/** Saved per-account theme preference, stored in `user_theme_settings`. */
export interface ThemeSettings {
  /** "system" follows the OS light/dark preference; resolved in the provider. */
  mode: "light" | "dark" | "system";
  /** Hex primary color, e.g. "#6C2BD9". */
  primaryColor: string;
  /** Key into FONT_FAMILY_OPTIONS. */
  fontFamily: string;
}

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  mode: "light",
  primaryColor: "#6C2BD9",
  fontFamily: "inter",
};

/** Preset swatches shown in Settings; any hex is still allowed via the
 *  custom color input, so these are suggestions, not a closed set. */
export const PRIMARY_COLOR_OPTIONS: { label: string; value: string }[] = [
  { label: "Brand Purple", value: "#6C2BD9" },
  { label: "Indigo", value: "#4F46E5" },
  { label: "Blue", value: "#2563EB" },
  { label: "Teal", value: "#0F766E" },
  { label: "Emerald", value: "#059669" },
  { label: "Amber", value: "#D97706" },
  { label: "Rose", value: "#DC2626" },
  { label: "Pink", value: "#DB2777" },
  { label: "Slate", value: "#334155" },
];

export interface FontFamilyOption {
  label: string;
  /** Persisted key. */
  value: string;
  /** Full CSS font-family stack applied by buildTheme. */
  stack: string;
}

export const FONT_FAMILY_OPTIONS: FontFamilyOption[] = [
  {
    label: "Inter",
    value: "inter",
    stack: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
  },
  {
    label: "Roboto",
    value: "roboto",
    stack: 'Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
  },
  {
    label: "Open Sans",
    value: "open-sans",
    stack: '"Open Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
  },
  {
    label: "Lato",
    value: "lato",
    stack: 'Lato, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
  },
  {
    label: "Playfair Display",
    value: "playfair",
    stack: '"Playfair Display", Georgia, "Times New Roman", serif',
  },
  {
    label: "Georgia",
    value: "georgia",
    stack: 'Georgia, "Times New Roman", serif',
  },
  {
    label: "Monospace",
    value: "monospace",
    stack: '"Courier New", Courier, monospace',
  },
];

export function getFontFamilyStack(key: string): string {
  return (
    FONT_FAMILY_OPTIONS.find((o) => o.value === key)?.stack ??
    FONT_FAMILY_OPTIONS[0].stack
  );
}
