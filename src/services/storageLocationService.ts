import { supabase } from "../config/supabase";
import type { StorageLocation } from "../types/storageLocation";

export const DEFAULT_STORAGE_LOCATION = "UNSPECIFIED";

export async function getStorageLocations(): Promise<StorageLocation[]> {
  const { data, error } = await supabase
    .from("storage_location_master")
    .select("*")
    .eq("is_active", true)
    .order("storage_location_code");

  if (error) {
    console.warn("Storage locations unavailable; using fallback.", error.message);
    return [
      {
        storage_location_code: DEFAULT_STORAGE_LOCATION,
        storage_location_description: "Unspecified Storage Location",
        is_active: true,
      },
    ];
  }

  return (data ?? []) as StorageLocation[];
}
