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
    <Box>

      <Typography
        variant="h5"
        sx={{
          mb: 3,
          fontWeight: "bold",
          fontSize: { xs: "1.25rem", sm: "1.5rem", md: "2rem" },
        }}
      >
        Material Master
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
          label="Search Material"
          placeholder="Search by Code, Description or UoM"
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
          Add Material
        </Button>
      </Box>

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
      >
        <DialogTitle>
          Delete Material
        </DialogTitle>

        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this material?
          </DialogContentText>
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={() =>
              setDeleteMaterialData(null)
            }
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
