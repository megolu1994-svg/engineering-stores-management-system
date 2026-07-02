import { useCallback, useEffect, useRef, useState } from "react";
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
  searchLocations,
  updateLocation,
} from "../services/locationService";

import type { Location } from "../types/location";

const SEARCH_DEBOUNCE_MS = 300;
const BROWSE_PAGE_SIZE = 50;
const SEARCH_PAGE_SIZE = 20;
const MIN_SEARCH_LENGTH = 2;

export default function LocationMaster() {
  const [locations, setLocations] = useState<Location[]>([]);

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

  const requestId = useRef(0);

  // Loads whatever is currently "in view": either the first browse page
  // (no search text) or the current search results (>= 2 characters).
  // This never loads the entire location_master table into memory.
  const loadCurrentView = useCallback(async (query: string) => {
    const trimmed = query.trim();

    // Below the minimum search length, keep whatever is currently shown
    // rather than firing an unnecessary request (avoids a query per
    // keystroke for 0-1 character input).
    if (trimmed.length > 0 && trimmed.length < MIN_SEARCH_LENGTH) {
      return;
    }

    const currentRequestId = ++requestId.current;

    const pageSize = trimmed ? SEARCH_PAGE_SIZE : BROWSE_PAGE_SIZE;

    const data = await searchLocations(query, 0, pageSize);

    if (currentRequestId === requestId.current) {
      setLocations(data);
    }
  }, []);

  // Initial browse page on mount.
  useEffect(() => {
    loadCurrentView("");
  }, [loadCurrentView]);

  // Debounced server-side search as the user types.
  useEffect(() => {
    const timer = setTimeout(() => {
      loadCurrentView(search);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [search, loadCurrentView]);

  const handleSave = useCallback(
    async (location: Location) => {
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

        // Refresh only the current (small) view instead of reloading the
        // entire location_master table.
        await loadCurrentView(search);

        setShowForm(false);
        setSelectedLocation(null);

        setSnackbarOpen(true);
      } catch (error: any) {
        setSnackbarSeverity("error");
        setSnackbarMessage(error.message);

        setSnackbarOpen(true);
      }
    },
    [selectedLocation, search, loadCurrentView]
  );

  function handleAdd() {
    setSelectedLocation(null);
    setShowForm(true);
  }

  function handleEdit(location: Location) {
    setSelectedLocation(location);
    setShowForm(true);
  }

  const confirmDelete = useCallback(async () => {
    if (!deleteLocationData) return;

    try {
      await deleteLocation(deleteLocationData.location_code);

      // Refresh only the current (small) view instead of reloading the
      // entire location_master table.
      await loadCurrentView(search);

      setSnackbarSeverity("success");
      setSnackbarMessage("Location deleted successfully.");
    } catch (error: any) {
      setSnackbarSeverity("error");
      setSnackbarMessage(error.message);
    }

    setDeleteLocationData(null);
    setSnackbarOpen(true);
  }, [deleteLocationData, search, loadCurrentView]);

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
        locations={locations}
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
