import { supabase } from "../config/supabase";
import {
  DEFAULT_THEME_SETTINGS,
  type ThemeSettings,
} from "../types/themeSettings";

interface ThemeSettingsRow {
  mode: string;
  primary_color: string | null;
  font_family: string | null;
}

export async function getThemeSettings(userId: string): Promise<ThemeSettings> {
  const { data, error } = await supabase
    .from("user_theme_settings")
    .select("mode, primary_color, font_family")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return DEFAULT_THEME_SETTINGS;

  const row = data as ThemeSettingsRow;
  const mode = row.mode === "dark" || row.mode === "system" ? row.mode : "light";

  return {
    mode,
    primaryColor: row.primary_color || DEFAULT_THEME_SETTINGS.primaryColor,
    fontFamily: row.font_family || DEFAULT_THEME_SETTINGS.fontFamily,
  };
}

export async function saveThemeSettings(
  userId: string,
  settings: ThemeSettings
): Promise<void> {
  const { error } = await supabase.from("user_theme_settings").upsert({
    user_id: userId,
    mode: settings.mode,
    primary_color: settings.primaryColor,
    font_family: settings.fontFamily,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
}
