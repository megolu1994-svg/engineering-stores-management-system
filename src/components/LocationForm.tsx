import { useEffect, useState } from "react";
import type { Location } from "../types/location";

import {
  Box,
  Button,
  Grid,
  Paper,
  TextField,
  Typography,
} from "@mui/material";

interface Props {
  location?: Location | null;
  onSave: (location: Location) => Promise<void>;
  onCancel: () => void;
}

const emptyLocation: Location = {
  location_code: "",
  location_description: "",
  is_active: true,
};

export default function LocationForm({
  location,
  onSave,
  onCancel,
}: Props) {

  const [formData, setFormData] =
    useState<Location>(emptyLocation);

  useEffect(() => {
    if (location) {
      setFormData(location);
    } else {
      setFormData(emptyLocation);
    }
  }, [location]);

  function updateField(
    field: keyof Location,
    value: string
  ) {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  async function handleSave() {

    if (!formData.location_code.trim()) {
      alert("Location Code is required.");
      return;
    }

    if (!formData.location_description.trim()) {
      alert("Location Description is required.");
      return;
    }

    await onSave(formData);
  }

  return (

    <Paper elevation={3} sx={{ p: 3, mb: 3 }}>

      <Typography
        variant="h5"
        gutterBottom
      >
        {location ? "Edit Location" : "Add Location"}
      </Typography>

      <Grid container spacing={2}>

        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            label="Location Code"
            value={formData.location_code}
            disabled={!!location}
            onChange={(e) =>
              updateField(
                "location_code",
                e.target.value.toUpperCase()
              )
            }
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            label="Location Description"
            value={formData.location_description}
            onChange={(e) =>
              updateField(
                "location_description",
                e.target.value
              )
            }
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
          {location ? "Update" : "Save"}
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