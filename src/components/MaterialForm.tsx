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
    <Paper elevation={3} sx={{ p: 3, mb: 3 }}>

      <Typography variant="h5" gutterBottom>
        {material ? "Edit Material" : "Add Material"}
      </Typography>

      <Grid container spacing={2}>

        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            label="Material Code"
            value={formData.material_code}
            disabled={!!material}
            onChange={(e) =>
              updateField("material_code", e.target.value)
            }
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
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            type="number"
            label="Quantity"
            value={formData.current_quantity}
            onChange={(e) =>
              updateField(
                "current_quantity",
                Number(e.target.value)
              )
            }
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
          />
        </Grid>

      </Grid>

      <Box
        sx={{
          display: "flex",
          gap: 2,
          mt: 3,
        }}
      >
        <Button
          variant="contained"
          onClick={handleSave}
        >
          {material ? "Update" : "Save"}
        </Button>

        <Button
          variant="outlined"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </Box>

    </Paper>
  );
}