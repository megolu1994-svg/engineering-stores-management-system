import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Snackbar,
  TextField,
  Typography,
} from "@mui/material";

import LocationForm from "../components/LocationForm";
import LocationTable from "../components/LocationTable";

import {
  addLocation,
  deleteLocation,
  getLocations,
  updateLocation,
} from "../services/locationService";

import type { Location } from "../types/location";

export default function LocationMaster() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [filteredLocations, setFilteredLocations] = useState<Location[]>([]);

  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);

  const [selectedLocation, setSelectedLocation] =
    useState<Location | null>(null);

  const [deleteLocationData, setDeleteLocationData] =
    useState<Location | null>(null);

  const [snackbarOpen, setSnackbarOpen] = useState(false);

  const [snackbarMessage, setSnackbarMessage] = useState("");

  const [snackbarSeverity, setSnackbarSeverity] = useState<
    "success" | "error"
  >("success");

  async function loadLocations() {
    const data = await getLocations();

    setLocations(data);
    setFilteredLocations(data);
  }

  useEffect(() => {
    loadLocations();
  }, []);

  useEffect(() => {
    const value = search.toLowerCase().trim();

    const filtered = locations.filter((l) => {
      return (
        l.location_code.toLowerCase().includes(value) ||
        l.location_description.toLowerCase().includes(value)
      );
    });

    setFilteredLocations(filtered);
  }, [search, locations]);

  async function handleSave(location: Location) {
    try {
      if (selectedLocation) {
        await updateLocation(location);

        setSnackbarSeverity("success");
        setSnackbarMessage("Location updated successfully.");
      } else {
        await addLocation(location);

        setSnackbarSeverity("success");
        setSnackbarMessage("Location saved successfully.");
      }

      await loadLocations();

      setShowForm(false);
      setSelectedLocation(null);

      setSnackbarOpen(true);
    } catch (error: any) {
      setSnackbarSeverity("error");
      setSnackbarMessage(error.message);

      setSnackbarOpen(true);
    }
  }

  function handleAdd() {
    setSelectedLocation(null);
    setShowForm(true);
  }

  function handleEdit(location: Location) {
    setSelectedLocation(location);
    setShowForm(true);
  }

  async function confirmDelete() {
    if (!deleteLocationData) return;

    try {
      await deleteLocation(deleteLocationData.location_code);

      await loadLocations();

      setSnackbarSeverity("success");
      setSnackbarMessage("Location deleted successfully.");
    } catch (error: any) {
      setSnackbarSeverity("error");
      setSnackbarMessage(error.message);
    }

    setDeleteLocationData(null);
    setSnackbarOpen(true);
  }

  return (
    <Box>

      <Typography
        variant="h5"
        sx={{
          mb: 3,
          fontWeight: "bold",
          fontSize: { xs: "1.25rem", sm: "1.5rem", md: "2rem" },
        }}
      >
        Location Master
      </Typography>

      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          justifyContent: { sm: "space-between" },
          alignItems: { xs: "stretch", sm: "center" },
          gap: 2,
          mb: 3,
        }}
      >
        <TextField
          label="Search Location"
          placeholder="Search by Code or Description"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          fullWidth
          sx={{ width: { xs: "100%", sm: 350 } }}
        />

        <Button
          variant="contained"
          size="large"
          fullWidth
          onClick={handleAdd}
          sx={{
            minHeight: 48,
            width: { xs: "100%", sm: "auto" },
          }}
        >
          Add Location
        </Button>
      </Box>

      {showForm && (
        <LocationForm
          location={selectedLocation}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false);
            setSelectedLocation(null);
          }}
        />
      )}

      <LocationTable
        locations={filteredLocations}
        onEdit={handleEdit}
        onDelete={(location) =>
          setDeleteLocationData(location)
        }
      />

      <Dialog
        open={!!deleteLocationData}
        onClose={() => setDeleteLocationData(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>
          Delete Location
        </DialogTitle>

        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this location?
          </DialogContentText>
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={() => setDeleteLocationData(null)}
            sx={{ minHeight: 48 }}
          >
            Cancel
          </Button>

          <Button
            color="error"
            variant="contained"
            onClick={confirmDelete}
            sx={{ minHeight: 48 }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
      >
        <Alert
          severity={snackbarSeverity}
          variant="filled"
          onClose={() => setSnackbarOpen(false)}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>

    </Box>
  );
}
