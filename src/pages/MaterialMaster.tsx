import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Snackbar,
  TextField,
  Typography,
} from "@mui/material";

import MaterialForm from "../components/MaterialForm";
import MaterialTable from "../components/MaterialTable";

import {
  addMaterial,
  getMaterials,
} from "../services/materialService";

import type { Material } from "../types/material";

export default function MaterialMaster() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [filteredMaterials, setFilteredMaterials] = useState<Material[]>([]);

  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);

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
      await addMaterial(material);

      await loadMaterials();

      setShowForm(false);

      setSnackbarSeverity("success");
      setSnackbarMessage("Material saved successfully.");
      setSnackbarOpen(true);
    } catch (error: any) {
      setSnackbarSeverity("error");
      setSnackbarMessage(error.message);
      setSnackbarOpen(true);
    }
  }

  return (
    <Box>

      <Typography
        variant="h4"
        fontWeight="bold"
        mb={3}
      >
        Material Master
      </Typography>

      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={3}
      >
        <TextField
          label="Search Material"
          placeholder="Search by Code, Description or UoM"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: 350 }}
        />

        <Button
          variant="contained"
          onClick={() => setShowForm(true)}
        >
          Add Material
        </Button>
      </Box>

      {showForm && (
        <MaterialForm
          onSave={handleSave}
          onCancel={() => setShowForm(false)}
        />
      )}

      <MaterialTable materials={filteredMaterials} />

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