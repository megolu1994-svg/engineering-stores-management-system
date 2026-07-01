import { supabase } from "../config/supabase";
import type { Location } from "../types/location";

/**
 * Get all active locations
 */
export async function getLocations(): Promise<Location[]> {
  const { data, error } = await supabase
    .from("location_master")
    .select("*")
    .eq("is_active", true)
    .order("location_code");

  if (error) throw error;

  return data as Location[];
}

/**
 * Check if location already exists
 */
export async function locationExists(
  locationCode: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("location_master")
    .select("location_code")
    .eq("location_code", locationCode)
    .maybeSingle();

  if (error) throw error;

  return !!data;
}

/**
 * Add Location
 */
export async function addLocation(
  location: Location
): Promise<void> {

  const exists = await locationExists(
    location.location_code
  );

  if (exists) {
    throw new Error("Location Code already exists.");
  }

  const { error } = await supabase
    .from("location_master")
    .insert({
      location_code: location.location_code,
      location_description: location.location_description,
      is_active: true,
    });

  if (error) throw error;
}

/**
 * Update Location
 */
export async function updateLocation(
  location: Location
): Promise<void> {

  const { error } = await supabase
    .from("location_master")
    .update({
      location_description: location.location_description,
    })
    .eq("location_code", location.location_code);

  if (error) throw error;
}

/**
 * Soft Delete Location
 */
export async function deleteLocation(
  locationCode: string
): Promise<void> {

  const { error } = await supabase
    .from("location_master")
    .update({
      is_active: false,
    })
    .eq("location_code", locationCode);

  if (error) throw error;
}