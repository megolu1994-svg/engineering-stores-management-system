import { useRef, useState, type ChangeEvent, type MouseEvent } from "react";

import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";

import AddAPhotoIcon from "@mui/icons-material/AddAPhoto";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import PhotoLibraryIcon from "@mui/icons-material/PhotoLibrary";

import type { Material } from "../types/material";
import { uploadMaterialPhoto } from "../services/materialPhotoService";

interface Props {
  material: Material | null;
  onUploaded?: () => void;
  onError?: (message: string) => void;
}

/**
 * Camera/gallery button that uploads straight into the shared
 * `material_photos` table via uploadMaterialPhoto - the same store
 * Material Master's photo section reads from, so a photo taken here
 * during allocation shows up there too.
 */
export default function MaterialPhotoUploadButton({
  material,
  onUploaded,
  onError,
}: Props) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  function openMenu(e: MouseEvent<HTMLElement>) {
    if (!material) return;
    setMenuAnchor(e.currentTarget);
  }

  function closeMenu() {
    setMenuAnchor(null);
  }

  function handleTakePhoto() {
    closeMenu();
    cameraInputRef.current?.click();
  }

  function handleChooseFromGallery() {
    closeMenu();
    galleryInputRef.current?.click();
  }

  async function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file || !material) return;

    setUploading(true);

    try {
      await uploadMaterialPhoto(material.material_code, file);
      onUploaded?.();
    } catch {
      onError?.("Failed to upload photo. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <Tooltip
        title={
          material ? "Upload material photo" : "Select a material first"
        }
      >
        <span>
          <IconButton
            onClick={openMenu}
            disabled={!material || uploading}
            aria-label="Upload material photo"
            sx={{
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
              width: 40,
              height: 40,
              flexShrink: 0,
            }}
          >
            {uploading ? (
              <CircularProgress size={20} />
            ) : (
              <AddAPhotoIcon fontSize="small" />
            )}
          </IconButton>
        </span>
      </Tooltip>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={handleFileSelected}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleFileSelected}
      />

      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={closeMenu}>
        <MenuItem onClick={handleTakePhoto}>
          <PhotoCameraIcon fontSize="small" sx={{ mr: 1 }} />
          Take Photo
        </MenuItem>
        <MenuItem onClick={handleChooseFromGallery}>
          <PhotoLibraryIcon fontSize="small" sx={{ mr: 1 }} />
          Choose From Gallery
        </MenuItem>
      </Menu>
    </>
  );
}
