import { useEffect, useRef, useState, type SyntheticEvent } from "react";

import { Autocomplete, CircularProgress, TextField } from "@mui/material";

import { searchLocations } from "../services/locationService";
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
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);

  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchLocations(inputValue, 0, 50);

        if (requestId === requestIdRef.current) {
          setLocations(data);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [inputValue]);

  function handleChange(_: SyntheticEvent, newValue: Location | null) {
    onChange(newValue);

    setTimeout(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    }, 50);
  }

  return (
    <Autocomplete
      key={value?.location_code ?? "__none__"}
      size="small"
      options={locations}
      value={value}
      onChange={handleChange}
      onInputChange={(_, newInputValue, reason) => {
        if (reason === "input") {
          setInputValue(newInputValue);
        }
      }}
      filterOptions={(x) => x}
      loading={loading}
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
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              endAdornment: (
                <>
                  {loading ? (
                    <CircularProgress color="inherit" size={16} />
                  ) : null}
                  {params.slotProps.input.endAdornment}
                </>
              ),
            },
          }}
        />
      )}
    />
  );
}
