import { useState } from "react";

import { useTheme } from "@mui/material/styles";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";

import { DataGrid } from "@mui/x-data-grid";
import type { GridColDef } from "@mui/x-data-grid";

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

  if (mobile) {

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
        <Stack spacing={1.5}>
          {locations.map((location) => (
            <Card
              key={location.location_code}
              variant="outlined"
              sx={{ borderRadius: 2 }}
            >
              <CardContent sx={{ pb: 1.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: "bold" }} noWrap>
                  {location.location_code}
                </Typography>

                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ overflowWrap: "break-word" }}
                >
                  {location.location_description}
                </Typography>
              </CardContent>

              <Divider />

              <CardActions sx={{ justifyContent: "flex-end", px: 1.5, py: 1 }}>
                <IconButton
                  color="default"
                  onClick={() => setViewLocation(location)}
                  aria-label="View location"
                  sx={{ minWidth: 48, minHeight: 48 }}
                >
                  <VisibilityIcon />
                </IconButton>

                <IconButton
                  color="primary"
                  onClick={() => onEdit(location)}
                  aria-label="Edit location"
                  sx={{ minWidth: 48, minHeight: 48 }}
                >
                  <EditIcon />
                </IconButton>

                <IconButton
                  color="error"
                  onClick={() => onDelete(location)}
                  aria-label="Delete location"
                  sx={{ minWidth: 48, minHeight: 48 }}
                >
                  <DeleteIcon />
                </IconButton>
              </CardActions>
            </Card>
          ))}
        </Stack>

        {viewDialog}
      </>
    );
  }

  const columns: GridColDef[] = [

    {
      field: "location_code",
      headerName: "Location Code",
      width: 180,
    },

    {
      field: "location_description",
      headerName: "Description",
      flex: 1,
    },

    {
      field: "actions",
      headerName: "Actions",
      width: 160,
      sortable: false,

      renderCell: (params) => (
        <>
          <IconButton
            color="default"
            onClick={() => setViewLocation(params.row as Location)}
          >
            <VisibilityIcon />
          </IconButton>

          <IconButton
            color="primary"
            onClick={() => onEdit(params.row as Location)}
          >
            <EditIcon />
          </IconButton>

          <IconButton
            color="error"
            onClick={() => onDelete(params.row as Location)}
          >
            <DeleteIcon />
          </IconButton>
        </>
      ),
    },

  ];

  const rows = locations.map((location) => ({
    id: location.location_code,
    ...location,
  }));

  return (
    <>
      <Paper elevation={3}>
        <DataGrid
          rows={rows}
          columns={columns}
          autoHeight
          disableRowSelectionOnClick
          pageSizeOptions={[10, 25, 50]}
          initialState={{
            pagination: {
              paginationModel: {
                pageSize: 10,
                page: 0,
              },
            },
          }}
        />
      </Paper>

      {viewDialog}
    </>
  );
}
