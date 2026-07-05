import { supabase } from "../config/supabase";

const MATERIAL_PHOTOS_BUCKET = "material-photos";

export interface MaterialPhoto {
  id: number;
  material_code: string;
  photo_url: string;
  uploaded_at: string;
}

/**
 * Uploads a single material photo to the `material-photos` Supabase
 * Storage bucket and records it in the `material_photos` table (one row
 * per photo, so a material can have any number of photos). Throws on
 * failure - unlike the best-effort inventory transaction log, a photo
 * upload is the primary action the user just took, so the caller needs
 * to know if it didn't work.
 */
export async function uploadMaterialPhoto(
  materialCode: string,
  file: File
): Promise<MaterialPhoto> {
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const path = `${materialCode}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(MATERIAL_PHOTOS_BUCKET)
    .upload(path, file);

  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage
    .from(MATERIAL_PHOTOS_BUCKET)
    .getPublicUrl(path);

  if (!urlData?.publicUrl) {
    throw new Error("Could not get a URL for the uploaded photo.");
  }

  const { data, error: insertError } = await supabase
    .from("material_photos")
    .insert({ material_code: materialCode, photo_url: urlData.publicUrl })
    .select()
    .single();

  if (insertError) throw insertError;

  return data as MaterialPhoto;
}

export async function getMaterialPhotos(
  materialCode: string
): Promise<MaterialPhoto[]> {
  const { data, error } = await supabase
    .from("material_photos")
    .select("*")
    .eq("material_code", materialCode)
    .order("uploaded_at", { ascending: false });

  if (error) throw error;

  return (data ?? []) as MaterialPhoto[];
}

/**
 * Recovers the Storage object path from a public URL produced by
 * `getPublicUrl`, since `material_photos` only stores the URL rather than
 * the bucket-relative path.
 */
function storagePathFromPublicUrl(photoUrl: string): string {
  const marker = `/object/public/${MATERIAL_PHOTOS_BUCKET}/`;
  const index = photoUrl.indexOf(marker);

  if (index === -1) {
    throw new Error("Could not determine the storage path for this photo.");
  }

  return decodeURIComponent(photoUrl.slice(index + marker.length));
}

/**
 * Deletes a single photo: removes the file from the `material-photos`
 * Storage bucket, then removes its row from `material_photos`. Throws on
 * failure so the caller can surface the error and keep the photo in the
 * UI rather than silently dropping it.
 */
export async function deleteMaterialPhoto(photo: MaterialPhoto): Promise<void> {
  const path = storagePathFromPublicUrl(photo.photo_url);

  const { error: removeError } = await supabase.storage
    .from(MATERIAL_PHOTOS_BUCKET)
    .remove([path]);

  if (removeError) throw removeError;

  const { error: deleteError } = await supabase
    .from("material_photos")
    .delete()
    .eq("id", photo.id);

  if (deleteError) throw deleteError;
}
