import { useEffect, useState } from "react";
import type { Material } from "../types/material";

import {
  Box,
  Button,
  Grid,
  Paper,
  TextField,
  Typography,
} from "@mui/material";

interface Props {
  material?: Material | null;
  onSave: (material: Material) => Promise<void>;
  onCancel: () => void;
}

const emptyMaterial: Material = {
  material_code: "",
  short_description: "",
  uom: "",
  current_quantity: 0,
  hsn_code: "",
  material_group: "",
  is_active: true,
};

// Quantity is owned exclusively by the Inventory Engine and must never
// be entered or edited here - this keeps material_master.current_quantity
// out of the Add/Edit form entirely while leaving the field on the
// Material type/database untouched.

const fieldSx = {
  "& .MuiOutlinedInput-root": {
    borderRadius: 2,
  },
};

export default function MaterialForm({
  material,
  onSave,
  onCancel,
}: Props) {
  const [formData, setFormData] = useState<Material>(emptyMaterial);

  useEffect(() => {
    if (material) {
      setFormData(material);
    } else {
      setFormData(emptyMaterial);
    }
  }, [material]);

  function updateField(
    field: keyof Material,
    value: string | number
  ) {
    setFormData((prev) => {
      const updated = {
        ...prev,
        [field]: value,
      };

      if (
        field === "material_code" &&
        typeof value === "string"
      ) {
        updated.material_group = value.substring(0, 2);
      }

      return updated;
    });
  }

  async function handleSave() {
    if (!formData.material_code.trim()) {
      alert("Material Code is required.");
      return;
    }

    if (!/^\d{10}$/.test(formData.material_code)) {
      alert("Material Code must be exactly 10 digits.");
      return;
    }

    if (!formData.short_description.trim()) {
      alert("Short Description is required.");
      return;
    }

    if (!formData.uom.trim()) {
      alert("Unit of Measurement is required.");
      return;
    }

    await onSave(formData);
  }

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2.5, sm: 4 },
        mb: 3,
        borderRadius: 3,
        boxShadow: "0 2px 14px rgba(15, 23, 42, 0.08)",
      }}
    >

      <Typography
        variant="h5"
        sx={{ fontWeight: 800, mb: 0.5, fontSize: { xs: "1.25rem", sm: "1.5rem" } }}
      >
        {material ? "Edit Material" : "Add Material"}
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {material
          ? "Update the details below and save your changes."
          : "Fill in the details below to add a new material."}
      </Typography>

      <Grid container spacing={2.5}>

        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            label="Material Code"
            value={formData.material_code}
            disabled={!!material}
            onChange={(e) =>
              updateField("material_code", e.target.value)
            }
            sx={fieldSx}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            label="Short Description"
            value={formData.short_description}
            onChange={(e) =>
              updateField(
                "short_description",
                e.target.value
              )
            }
            sx={fieldSx}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            label="Unit of Measurement"
            value={formData.uom}
            onChange={(e) =>
              updateField("uom", e.target.value)
            }
            sx={fieldSx}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            label="HSN Code"
            value={formData.hsn_code}
            onChange={(e) =>
              updateField(
                "hsn_code",
                e.target.value
              )
            }
            sx={fieldSx}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            label="Material Group"
            value={formData.material_group}
            slotProps={{
              input: {
                readOnly: true,
              },
            }}
            sx={fieldSx}
          />
        </Grid>

      </Grid>

      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          gap: 2,
          mt: 4,
        }}
      >
        <Button
          variant="contained"
          size="large"
          fullWidth
          onClick={handleSave}
          sx={{ minHeight: 52, fontWeight: 700, borderRadius: 2, fontSize: "1rem" }}
        >
          {material ? "Update" : "Save"}
        </Button>

        <Button
          variant="outlined"
          size="large"
          fullWidth
          onClick={onCancel}
          sx={{ minHeight: 52, fontWeight: 600, borderRadius: 2, fontSize: "1rem" }}
        >
          Cancel
        </Button>
      </Box>

    </Paper>
  );
}
