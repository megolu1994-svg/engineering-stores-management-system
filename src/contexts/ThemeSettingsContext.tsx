import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { useAuth } from "./AuthContext";
import {
  DEFAULT_THEME_SETTINGS,
  type ThemeSettings,
} from "../types/themeSettings";
import {
  getThemeSettings,
  saveThemeSettings,
} from "../services/themeSettingsService";

type ResolvedMode = "light" | "dark";

interface ThemeSettingsContextValue extends ThemeSettings {
  /** True while the signed-in account's saved settings are being fetched. */
  loading: boolean;
  /** "system" already resolved against the OS preference. */
  effectiveMode: ResolvedMode;
  updateThemeSettings: (settings: ThemeSettings) => Promise<void>;
}

const ThemeSettingsContext = createContext<ThemeSettingsContextValue | null>(
  null
);

function prefersDarkScheme(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches === true
  );
}

export function ThemeSettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [settings, setSettings] = useState<ThemeSettings>(DEFAULT_THEME_SETTINGS);
  // The user id whose saved settings currently live in `settings` - loading
  // is derived from it, so the effect below only ever calls setState inside
  // async callbacks.
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [systemDark, setSystemDark] = useState(prefersDarkScheme);

  const loading = user !== null && loadedUserId !== user.id;

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    getThemeSettings(user.id)
      .then((saved) => {
        if (cancelled) return;
        setSettings(saved);
        setLoadedUserId(user.id);
      })
      .catch(() => {
        // Missing table/row or network hiccup - fall back to defaults rather
        // than blocking the app on a theming preference.
        if (cancelled) return;
        setSettings(DEFAULT_THEME_SETTINGS);
        setLoadedUserId(user.id);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;

    const handleChange = (event: MediaQueryListEvent) => {
      setSystemDark(event.matches);
    };

    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  async function updateThemeSettings(next: ThemeSettings) {
    if (!user) return;
    await saveThemeSettings(user.id, next);
    setSettings(next);
  }

  // Signed-out visitors have no saved preference - follow the OS theme so
  // the login screen doesn't flash light mode for dark-mode users.
  const effectiveMode: ResolvedMode =
    user === null
      ? systemDark
        ? "dark"
        : "light"
      : settings.mode === "system"
        ? systemDark
          ? "dark"
          : "light"
        : settings.mode;

  return (
    <ThemeSettingsContext.Provider
      value={{
        ...settings,
        loading,
        effectiveMode,
        updateThemeSettings,
      }}
    >
      {children}
    </ThemeSettingsContext.Provider>
  );
}

export function useThemeSettings(): ThemeSettingsContextValue {
  const ctx = useContext(ThemeSettingsContext);
  if (!ctx) {
    throw new Error("useThemeSettings must be used within a ThemeSettingsProvider");
  }
  return ctx;
}
