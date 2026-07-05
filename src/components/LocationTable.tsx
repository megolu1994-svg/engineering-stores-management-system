import { useState } from "react";

import { useTheme } from "@mui/material/styles";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";

import VisibilityIcon from "@mui/icons-material/Visibility";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";

import type { Location } from "../types/location";

interface Props {
  locations: Location[];
  onEdit: (location: Location) => void;
  onDelete: (location: Location) => void;
}

export default function LocationTable({
  locations,
  onEdit,
  onDelete,
}: Props) {

  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [viewLocation, setViewLocation] = useState<Location | null>(null);

  const viewDialog = (
    <Dialog
      open={!!viewLocation}
      onClose={() => setViewLocation(null)}
      fullWidth
      maxWidth="xs"
      fullScreen={mobile}
    >
      <DialogTitle>Location Details</DialogTitle>

      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              Location Code
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: "bold" }}>
              {viewLocation?.location_code}
            </Typography>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              Description
            </Typography>
            <Typography variant="body1" sx={{ overflowWrap: "break-word" }}>
              {viewLocation?.location_description}
            </Typography>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              Status
            </Typography>
            <Typography
              variant="body1"
              color={viewLocation?.is_active ? "success.main" : "error.main"}
            >
              {viewLocation?.is_active ? "Active" : "Inactive"}
            </Typography>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={() => setViewLocation(null)} fullWidth={mobile} sx={{ minHeight: 48 }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );

  if (locations.length === 0) {
    return (
      <>
        <Card
          variant="outlined"
          sx={{ p: 3, textAlign: "center", borderRadius: 2 }}
        >
          <Typography variant="body2" color="text.secondary">
            No locations found.
          </Typography>
        </Card>
        {viewDialog}
      </>
    );
  }

  return (
    <>
      <Stack spacing={0.75}>
        {locations.map((location) => (
          <Card
            key={location.location_code}
            variant="outlined"
            sx={{
              borderRadius: 2,
              display: "flex",
              alignItems: "flex-start",
              gap: 0.5,
              px: 1.5,
              py: 0.75,
            }}
          >
            <Box sx={{ minWidth: 0, flex: 1, pt: 0.5 }}>
              <Typography variant="body2" sx={{ fontWeight: "bold" }} noWrap>
                {location.location_code}
              </Typography>

              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", overflowWrap: "break-word" }}
              >
                {location.location_description}
              </Typography>
            </Box>

            <IconButton
              color="default"
              size="small"
              onClick={() => setViewLocation(location)}
              aria-label="View location"
              sx={{ minWidth: 40, minHeight: 40, mt: 0.5 }}
            >
              <VisibilityIcon fontSize="small" />
            </IconButton>

            <IconButton
              color="primary"
              size="small"
              onClick={() => onEdit(location)}
              aria-label="Edit location"
              sx={{ minWidth: 40, minHeight: 40, mt: 0.5 }}
            >
              <EditIcon fontSize="small" />
            </IconButton>

            <IconButton
              color="error"
              size="small"
              onClick={() => onDelete(location)}
              aria-label="Delete location"
              sx={{ minWidth: 40, minHeight: 40, mt: 0.5 }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Card>
        ))}
      </Stack>

      {viewDialog}
    </>
  );
}
