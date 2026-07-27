import { supabase } from "../config/supabase";

export interface BrandingSettings {
  companyName: string;
  warehouseName: string;
  logoLetter: string;
}

export const EMPTY_BRANDING: BrandingSettings = {
  companyName: "",
  warehouseName: "",
  logoLetter: "",
};

export async function getBrandingSettings(
  userId: string
): Promise<BrandingSettings> {
  const { data, error } = await supabase
    .from("user_branding_settings")
    .select("company_name, warehouse_name, logo_letter")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;

  if (!data) return EMPTY_BRANDING;

  return {
    companyName: data.company_name ?? "",
    warehouseName: data.warehouse_name ?? "",
    logoLetter: data.logo_letter ?? "",
  };
}

export async function saveBrandingSettings(
  userId: string,
  settings: BrandingSettings
): Promise<void> {
  const { error } = await supabase.from("user_branding_settings").upsert({
    user_id: userId,
    company_name: settings.companyName,
    warehouse_name: settings.warehouseName,
    logo_letter: settings.logoLetter,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
}
