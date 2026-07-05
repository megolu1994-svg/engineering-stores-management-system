import { useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from "react";

import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";

import AddAPhotoIcon from "@mui/icons-material/AddAPhoto";
import CloseIcon from "@mui/icons-material/Close";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import PhotoLibraryIcon from "@mui/icons-material/PhotoLibrary";

import type { Material } from "../types/material";

interface Props {
  material: Material | null;
  pendingFile: File | null;
  onFileSelected: (file: File) => void;
  onClear: () => void;
}

/**
 * Camera/gallery button that only stages a photo locally. The file is
 * handed to the parent via `onFileSelected` and previewed here, but it is
 * NOT uploaded to `material_photos` yet - the parent (allocation screen)
 * uploads it itself once the user presses Save, so a picture taken here
 * never lands in Material Master unless the allocation is actually saved.
 */
export default function MaterialPhotoUploadButton({
  material,
  pendingFile,
  onFileSelected,
  onClear,
}: Props) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const previewUrl = useMemo(
    () => (pendingFile ? URL.createObjectURL(pendingFile) : null),
    [pendingFile]
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

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

  function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file) return;

    onFileSelected(file);
  }

  function handleClear(e: MouseEvent<HTMLElement>) {
    e.stopPropagation();
    onClear();
  }

  return (
    <>
      <Tooltip
        title={
          !material
            ? "Select a material first"
            : pendingFile
            ? "Photo will be uploaded when you press Save"
            : "Attach a material photo"
        }
      >
        <span>
          <IconButton
            onClick={openMenu}
            disabled={!material}
            aria-label="Attach material photo"
            sx={{
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
              width: 40,
              height: 40,
              flexShrink: 0,
              p: previewUrl ? 0.25 : 1,
              overflow: "visible",
            }}
          >
            {previewUrl ? (
              <Box
                component="img"
                src={previewUrl}
                alt="Selected material photo"
                sx={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  borderRadius: 1.5,
                }}
              />
            ) : (
              <AddAPhotoIcon fontSize="small" />
            )}

            {previewUrl && (
              <Box
                component="span"
                onClick={handleClear}
                sx={{
                  position: "absolute",
                  top: -6,
                  right: -6,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  bgcolor: "grey.800",
                  color: "common.white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <CloseIcon sx={{ fontSize: 12 }} />
              </Box>
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
