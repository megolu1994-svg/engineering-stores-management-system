import { supabase } from "../config/supabase";
import type { Material } from "../types/material";

export async function getMaterials(): Promise<Material[]> {
  const { data, error } = await supabase
    .from("material_master")
    .select("*")
    .eq("is_active", true)
    .order("material_code");

  if (error) {
    console.error(error);
    return [];
  }

  return data as Material[];
}