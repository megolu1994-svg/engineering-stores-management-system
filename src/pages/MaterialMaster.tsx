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
  InputAdornment,
  Snackbar,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";

import MaterialForm from "../components/MaterialForm";
import MaterialTable from "../components/MaterialTable";

import {
  addMaterial,
  deleteMaterial,
  getMaterials,
  updateMaterial,
} from "../services/materialService";

import type { Material } from "../types/material";

export default function MaterialMaster() {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [materials, setMaterials] = useState<Material[]>([]);
  const [filteredMaterials, setFilteredMaterials] = useState<Material[]>([]);

  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);

  const [selectedMaterial, setSelectedMaterial] =
    useState<Material | null>(null);

  const [deleteMaterialData, setDeleteMaterialData] =
    useState<Material | null>(null);

  const [snackbarOpen, setSnackbarOpen] = useState(false);

  const [snackbarMessage, setSnackbarMessage] = useState("");

  const [snackbarSeverity, setSnackbarSeverity] = useState<
    "success" | "error"
  >("success");

  async function loadMaterials() {
    const data = await getMaterials();
    setMaterials(data);
    setFilteredMaterials(data);
  }

  useEffect(() => {
    loadMaterials();
  }, []);

  useEffect(() => {
    const value = search.toLowerCase().trim();

    const filtered = materials.filter((m) => {
      return (
        m.material_code.toLowerCase().includes(value) ||
        m.short_description.toLowerCase().includes(value) ||
        m.uom.toLowerCase().includes(value)
      );
    });

    setFilteredMaterials(filtered);
  }, [search, materials]);

  async function handleSave(material: Material) {
    try {
      if (selectedMaterial) {
        await updateMaterial(material);

        setSnackbarSeverity("success");
        setSnackbarMessage("Material updated successfully.");
      } else {
        await addMaterial(material);

        setSnackbarSeverity("success");
        setSnackbarMessage("Material saved successfully.");
      }

      await loadMaterials();

      setShowForm(false);
      setSelectedMaterial(null);

      setSnackbarOpen(true);
    } catch (error: any) {
      setSnackbarSeverity("error");
      setSnackbarMessage(error.message);
      setSnackbarOpen(true);
    }
  }

  function handleEdit(material: Material) {
    setSelectedMaterial(material);
    setShowForm(true);
  }

  function handleAdd() {
    setSelectedMaterial(null);
    setShowForm(true);
  }

  async function confirmDelete() {
    if (!deleteMaterialData) return;

    try {
      await deleteMaterial(deleteMaterialData.material_code);

      await loadMaterials();

      setSnackbarSeverity("success");
      setSnackbarMessage("Material deleted successfully.");
    } catch (error: any) {
      setSnackbarSeverity("error");
      setSnackbarMessage(error.message);
    }

    setDeleteMaterialData(null);
    setSnackbarOpen(true);
  }

  return (
    <Box sx={{ overflowX: "hidden" }}>

      <Typography
        variant="h5"
        sx={{
          mb: 2,
          fontWeight: 800,
          letterSpacing: -0.5,
          fontSize: { xs: "1.4rem", sm: "1.75rem", md: "2.1rem" },
        }}
      >
        Material Master
      </Typography>

      <Box
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 5,
          bgcolor: "background.default",
          pt: 0.5,
          pb: 2,
        }}
      >
        <TextField
          label="Search Material"
          placeholder="Search by Code, Description or UoM"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          fullWidth
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" />
                </InputAdornment>
              ),
            },
          }}
          sx={{
            "& .MuiOutlinedInput-root": {
              borderRadius: 3,
              bgcolor: "background.paper",
              minHeight: 56,
              boxShadow: "0 2px 10px rgba(15, 23, 42, 0.06)",
            },
          }}
        />
      </Box>

      <Button
        variant="contained"
        size="large"
        fullWidth
        startIcon={<AddIcon />}
        onClick={handleAdd}
        sx={{
          minHeight: 56,
          fontWeight: 700,
          fontSize: "1rem",
          borderRadius: 3,
          mb: 3,
          width: { xs: "100%", sm: "auto" },
        }}
      >
        Add Material
      </Button>

      {showForm && (
        <MaterialForm
          material={selectedMaterial}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false);
            setSelectedMaterial(null);
          }}
        />
      )}

      <MaterialTable
        materials={filteredMaterials}
        onEdit={handleEdit}
        onDelete={(material) =>
          setDeleteMaterialData(material)
        }
      />

      <Dialog
        open={!!deleteMaterialData}
        onClose={() => setDeleteMaterialData(null)}
        fullWidth
        maxWidth="xs"
        fullScreen={mobile}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          Delete Material
        </DialogTitle>

        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this material? This action
            cannot be undone.
          </DialogContentText>
        </DialogContent>

        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button
            onClick={() =>
              setDeleteMaterialData(null)
            }
            fullWidth={mobile}
            sx={{ minHeight: 48, borderRadius: 2 }}
          >
            Cancel
          </Button>

          <Button
            color="error"
            variant="contained"
            onClick={confirmDelete}
            fullWidth={mobile}
            sx={{ minHeight: 48, borderRadius: 2, fontWeight: 700 }}
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
