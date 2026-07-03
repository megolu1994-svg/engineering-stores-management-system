import { useEffect, useState, type SyntheticEvent } from "react";

import { Autocomplete, TextField } from "@mui/material";

import { getLocations } from "../services/locationService";
import type { Location } from "../types/location";

interface Props {
  value: Location | null;
  onChange: (location: Location | null) => void;
  label?: string;
}

export default function LocationSearch({
  value,
  onChange,
  label = "Search Location",
}: Props) {
  const [locations, setLocations] = useState<Location[]>([]);

  useEffect(() => {
    async function load() {
      const data = await getLocations();
      setLocations(data);
    }

    load();
  }, []);

  function handleChange(_: SyntheticEvent, newValue: Location | null) {
    onChange(newValue);

    // Close Android keyboard after selecting a location
    setTimeout(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    }, 50);
  }

  return (
    <Autocomplete
      size="small"
      options={locations}
      value={value}
      onChange={handleChange}
      getOptionLabel={(option) =>
        `${option.location_code} - ${option.location_description}`
      }
      isOptionEqualToValue={(option, value) =>
        option.location_code === value.location_code
      }
      blurOnSelect
      clearOnBlur={false}
      slotProps={{
        listbox: {
          sx: {
            maxHeight: 280,
            "& .MuiAutocomplete-option": {
              minHeight: 44,
              py: 0.75,
            },
          },
        },
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          fullWidth
          sx={{
            "& .MuiOutlinedInput-root": {
              borderRadius: 2,
            },
          }}
        />
      )}
    />
  );
}
