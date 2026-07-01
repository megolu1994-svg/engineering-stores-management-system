import { useState } from "react";
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
  onSave: (material: Material) => Promise<void>;
  onCancel: () => void;
}

export default function MaterialForm({
  onSave,
  onCancel,
}: Props) {

  const [material, setMaterial] = useState<Material>({
    material_code: "",
    short_description: "",
    uom: "",
    current_quantity: 0,
    hsn_code: "",
    material_group: "",
    is_active: true,
  });

  function updateField(
    field: keyof Material,
    value: string | number
  ) {
    setMaterial((prev) => {

      const updated = {
        ...prev,
        [field]: value,
      };

      // Auto-generate Material Group
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

    if (material.material_code.length !== 10) {
      alert("Material Code must be exactly 10 digits.");
      return;
    }

    if (!/^\d+$/.test(material.material_code)) {
      alert("Material Code must contain numbers only.");
      return;
    }

    if (!material.short_description.trim()) {
      alert("Short Description is required.");
      return;
    }

    if (!material.uom.trim()) {
      alert("Unit of Measurement is required.");
      return;
    }

    await onSave(material);

  }

  return (

    <Paper
      elevation={3}
      sx={{
        p: 3,
        mb: 3,
      }}
    >

      <Typography
        variant="h5"
        gutterBottom
      >
        Add Material
      </Typography>

      <Grid
        container
        spacing={2}
      >

        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            label="Material Code"
            value={material.material_code}
            onChange={(e) =>
              updateField(
                "material_code",
                e.target.value
              )
            }
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            label="Short Description"
            value={material.short_description}
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
            value={material.uom}
            onChange={(e) =>
              updateField(
                "uom",
                e.target.value
              )
            }
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            type="number"
            label="Quantity"
            value={material.current_quantity}
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
            value={material.hsn_code}
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
            value={material.material_group}
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
          mt: 3,
          display: "flex",
          gap: 2,
        }}
      >

        <Button
          variant="contained"
          onClick={handleSave}
        >
          Save
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