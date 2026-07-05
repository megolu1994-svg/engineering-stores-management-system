import { useEffect, useState } from "react";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";

import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";

import type { Material } from "../types/material";
import {
  deleteMaterialPhoto,
  getMaterialPhotos,
  type MaterialPhoto,
} from "../services/materialPhotoService";

interface Props {
  material: Material | null;
  onClose: () => void;
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {label}
      </Typography>
      <Typography variant="body1" sx={{ fontWeight: 600, overflowWrap: "break-word" }}>
        {value || "-"}
      </Typography>
    </Box>
  );
}

export default function MaterialInfoDialog({ material, onClose }: Props) {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [photos, setPhotos] = useState<MaterialPhoto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [photoPendingDelete, setPhotoPendingDelete] =
    useState<MaterialPhoto | null>(null);
  const [deletingPhotoId, setDeletingPhotoId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    // Dialog is hidden (open={!!material}) when there's no material, so
    // stale photos from the previously viewed material staying in state
    // briefly isn't visible - avoids a setState call with no UI to update.
    if (!material) return;

    let cancelled = false;
    setLoadingPhotos(true);
    setPhotoPendingDelete(null);
    setDeleteError(null);

    getMaterialPhotos(material.material_code)
      .then((data) => {
        if (!cancelled) setPhotos(data);
      })
      .catch(() => {
        if (!cancelled) setPhotos([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingPhotos(false);
      });

    return () => {
      cancelled = true;
    };
  }, [material]);

  async function handleConfirmDeletePhoto() {
    if (!photoPendingDelete) return;

    const photo = photoPendingDelete;
    setDeletingPhotoId(photo.id);

    try {
      await deleteMaterialPhoto(photo);
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
      setPhotoPendingDelete(null);
    } catch {
      setDeleteError("Failed to delete photo. Please try again.");
    } finally {
      setDeletingPhotoId(null);
    }
  }

  return (
    <>
      <Dialog
        open={!!material}
        onClose={onClose}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Material Details</DialogTitle>

        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <DetailField label="Material Code" value={material?.material_code ?? ""} />
            <DetailField label="Description" value={material?.short_description ?? ""} />

            <Box sx={{ display: "flex", gap: 3 }}>
              <DetailField label="UoM" value={material?.uom ?? ""} />
              <DetailField label="HSN Code" value={material?.hsn_code ?? ""} />
            </Box>

            <DetailField label="Material Group" value={material?.material_group ?? ""} />

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                Photos
              </Typography>

              {loadingPhotos ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : photos.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No photos uploaded yet.
                </Typography>
              ) : (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                  {photos.map((photo) => (
                    <Box key={photo.id} sx={{ position: "relative", width: 84, height: 84 }}>
                      <Box
                        component="img"
                        src={photo.photo_url}
                        alt="Material"
                        onClick={() => setLightboxUrl(photo.photo_url)}
                        sx={{
                          width: 84,
                          height: 84,
                          borderRadius: 2,
                          objectFit: "cover",
                          cursor: "pointer",
                          border: "1px solid",
                          borderColor: "divider",
                          opacity: deletingPhotoId === photo.id ? 0.5 : 1,
                        }}
                      />

                      <IconButton
                        size="small"
                        aria-label="Delete photo"
                        disabled={deletingPhotoId === photo.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPhotoPendingDelete(photo);
                        }}
                        sx={{
                          position: "absolute",
                          top: -8,
                          right: -8,
                          bgcolor: "background.paper",
                          border: "1px solid",
                          borderColor: "divider",
                          "&:hover": { bgcolor: "error.main", color: "error.contrastText" },
                        }}
                      >
                        {deletingPhotoId === photo.id ? (
                          <CircularProgress size={16} />
                        ) : (
                          <DeleteIcon fontSize="small" />
                        )}
                      </IconButton>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button onClick={onClose} fullWidth={mobile} sx={{ minHeight: 48 }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!lightboxUrl}
        onClose={() => setLightboxUrl(null)}
        fullScreen
        slotProps={{
          paper: { sx: { bgcolor: "rgba(0, 0, 0, 0.92)" } },
        }}
      >
        <IconButton
          onClick={() => setLightboxUrl(null)}
          aria-label="Close"
          sx={{
            position: "absolute",
            top: 12,
            right: 12,
            color: "#fff",
            bgcolor: "rgba(255, 255, 255, 0.12)",
            zIndex: 1,
          }}
        >
          <CloseIcon />
        </IconButton>

        <Box
          onClick={() => setLightboxUrl(null)}
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            width: "100%",
          }}
        >
          {lightboxUrl && (
            <Box
              component="img"
              src={lightboxUrl}
              alt="Material full size"
              onClick={(e) => e.stopPropagation()}
              sx={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )}
        </Box>
      </Dialog>

      <Dialog
        open={!!photoPendingDelete}
        onClose={() => setPhotoPendingDelete(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Delete Photo</DialogTitle>

        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this photo? This action cannot
            be undone.
          </DialogContentText>
        </DialogContent>

        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button
            onClick={() => setPhotoPendingDelete(null)}
            fullWidth={mobile}
            sx={{ minHeight: 48, borderRadius: 2 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmDeletePhoto}
            color="error"
            variant="contained"
            disabled={deletingPhotoId !== null}
            fullWidth={mobile}
            sx={{ minHeight: 48, borderRadius: 2 }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!deleteError}
        autoHideDuration={4000}
        onClose={() => setDeleteError(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setDeleteError(null)}
          severity="error"
          variant="filled"
          sx={{ width: "100%" }}
        >
          {deleteError}
        </Alert>
      </Snackbar>
    </>
  );
}
