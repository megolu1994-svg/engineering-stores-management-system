import { supabase } from "../config/supabase";
import type { Material } from "../types/material";

/**
 * Get all active materials
 */
export async function getMaterials(): Promise<Material[]> {
  const { data, error } = await supabase
    .from("material_master")
    .select("*")
    .eq("is_active", true)
    .order("material_code");

  if (error) throw error;

  return data as Material[];
}

/**
 * Check if material exists
 */
export async function materialExists(
  materialCode: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("material_master")
    .select("material_code")
    .eq("material_code", materialCode)
    .maybeSingle();

  if (error) throw error;

  return !!data;
}

/**
 * Add Material
 */
export async function addMaterial(
  material: Material
): Promise<void> {

  const exists = await materialExists(
    material.material_code
  );

  if (exists) {
    throw new Error("Material Code already exists.");
  }

  const { error } = await supabase
    .from("material_master")
    .insert({
      material_code: material.material_code,
      short_description: material.short_description,
      uom: material.uom,
      current_quantity: material.current_quantity,
      hsn_code: material.hsn_code,
      material_group: material.material_group,
      is_active: true,
    });

  if (error) throw error;
}

/**
 * Update Material
 */
export async function updateMaterial(
  material: Material
): Promise<void> {

  const { error } = await supabase
    .from("material_master")
    .update({
      short_description: material.short_description,
      uom: material.uom,
      current_quantity: material.current_quantity,
      hsn_code: material.hsn_code,
      material_group: material.material_group,
    })
    .eq("material_code", material.material_code);

  if (error) throw error;
}

/**
 * Soft Delete
 */
export async function deleteMaterial(
  materialCode: string
): Promise<void> {

  const { error } = await supabase
    .from("material_master")
    .update({
      is_active: false,
    })
    .eq("material_code", materialCode);

  if (error) throw error;
}