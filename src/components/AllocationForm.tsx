import {
  Box,
  Button,
  Paper,
  TextField,
  Typography,
} from "@mui/material";

import LocationSearch from "./LocationSearch";

import { usePersistentState } from "../hooks/usePersistentState";

import type { Location } from "../types/location";

interface Props {
  // Scopes the persisted draft to the material being allocated - the
  // caller also passes this as this component's React `key` so a fresh
  // instance (and a fresh draft) is used whenever it changes, instead
  // of leaking one material's in-progress location/quantity into another's.
  materialCode: string;
  onAllocate: (
    locationCode: string,
    quantity: number
  ) => void;
}

export default function AllocationForm({
  materialCode,
  onAllocate,
}: Props) {

  const [location, setLocation] =
    usePersistentState<Location | null>(
      `allocationForm.${materialCode}.location`,
      null
    );

  const [quantity, setQuantity] =
    usePersistentState(`allocationForm.${materialCode}.quantity`, "");

  function handleAllocate() {

    if (!location) {
      alert("Please select a location.");
      return;
    }

    if (Number(quantity) <= 0) {
      alert("Enter a valid quantity.");
      return;
    }

    onAllocate(
      location.location_code,
      Number(quantity)
    );

    setLocation(null);
    setQuantity("");
  }

  return (
    <Paper elevation={2} sx={{ p: 1.5, mb: 1, borderRadius: 2 }}>

      <Typography
        variant="subtitle2"
        sx={{ fontWeight: "bold", mb: 1, fontSize: "0.9rem" }}
      >
        Allocate Stock
      </Typography>

      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          gap: 1,
        }}
      >
        <Box sx={{ flex: { sm: 2 } }}>
          <LocationSearch
            value={location}
            onChange={setLocation}
          />
        </Box>

        <Box
          sx={{
            display: "flex",
            gap: 1,
            flex: { sm: 2 },
          }}
        >
          <TextField
            label="Quantity"
            type="number"
            size="small"
            fullWidth
            value={quantity}
            onChange={(e) =>
              setQuantity(e.target.value)
            }
            slotProps={{
              htmlInput: {
                inputMode: "numeric",
              },
            }}
            sx={{
              "& .MuiOutlinedInput-root": { borderRadius: 2 },
            }}
          />

          <Button
            variant="contained"
            onClick={handleAllocate}
            sx={{
              minHeight: 40,
              minWidth: 88,
              borderRadius: 2,
              fontWeight: "bold",
              whiteSpace: "nowrap",
            }}
          >
            Save
          </Button>
        </Box>
      </Box>

    </Paper>
  );
}
