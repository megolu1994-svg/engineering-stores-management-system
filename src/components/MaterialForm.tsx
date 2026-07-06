import { useEffect, useRef } from "react";
import type { Material } from "../types/material";

import {
  Box,
  Button,
  Grid,
  Paper,
  TextField,
  Typography,
} from "@mui/material";

import { usePersistentState } from "../hooks/usePersistentState";

interface Props {
  material?: Material | null;
  onSave: (material: Material) => Promise<boolean>;
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

// Draft is keyed by which record is being edited (or "add" for a new
// one) so an in-progress edit survives navigating away and back without
// leaking into an unrelated Add/Edit later. Exported so the parent page
// can clear a stale draft right before deliberately opening a fresh
// Add/Edit (see MaterialMaster.tsx's handleAdd/handleEdit).
export function materialFormDraftKey(material?: Material | null): string {
  return material
    ? `materialForm.edit.${material.material_code}`
    : "materialForm.add";
}

export default function MaterialForm({
  material,
  onSave,
  onCancel,
}: Props) {
  const [formData, setFormData, clearDraft] = usePersistentState<Material>(
    materialFormDraftKey(material),
    material ?? emptyMaterial
  );

  // Only reset formData from the `material` prop when it actually
  // switches to a different record - otherwise this would stomp on a
  // draft just restored from sessionStorage on mount.
  const lastMaterialCode = useRef<string | null>(
    material?.material_code ?? null
  );

  useEffect(() => {
    const code = material?.material_code ?? null;
    if (code !== lastMaterialCode.current) {
      lastMaterialCode.current = code;
      setFormData(material ?? emptyMaterial);
    }
  }, [material, setFormData]);

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

    const saved = await onSave(formData);
    if (saved) {
      clearDraft();
    }
  }

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2.5, sm: 4 },
        mb: 3,
        borderRadius: 3,
        boxShadow: "0 2px 14px rgba(15, 23, 42, 0.08)",
        maxWidth: { md: 860 },
        mx: { md: "auto" },
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
          onClick={() => {
            clearDraft();
            onCancel();
          }}
          sx={{ minHeight: 52, fontWeight: 600, borderRadius: 2, fontSize: "1rem" }}
        >
          Cancel
        </Button>
      </Box>

    </Paper>
  );
}
