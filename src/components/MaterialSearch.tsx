import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";

import { Autocomplete, TextField } from "@mui/material";

import { searchMaterials } from "../services/materialService";
import type { Material } from "../types/material";

interface Props {
  value: Material | null;
  onChange: (material: Material | null) => void;
  label?: string;
}

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_PAGE_SIZE = 20;
const MIN_SEARCH_LENGTH = 2;

export default function MaterialSearch({
  value,
  onChange,
  label = "Search Material",
}: Props) {
  const [inputValue, setInputValue] = useState("");
  const [options, setOptions] = useState<Material[]>([]);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Require at least 2 characters before querying Supabase, so we never
    // fire a search request (or load unnecessary data) for a blank or
    // single-character input.
    if (inputValue.trim().length < MIN_SEARCH_LENGTH) {
      requestId.current += 1;
      setOptions([]);
      return;
    }

    debounceTimer.current = setTimeout(() => {
      const currentRequestId = ++requestId.current;

      searchMaterials(inputValue, 0, SEARCH_PAGE_SIZE).then((results) => {
        // Ignore stale responses from a previous, slower request.
        if (currentRequestId === requestId.current) {
          setOptions(results);
        }
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [inputValue]);

  function handleChange(_: SyntheticEvent, newValue: Material | null) {
    onChange(newValue);

    // Close keyboard on mobile
    setTimeout(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    }, 50);
  }

  // Keep the currently selected material visible in the options list even
  // if it no longer matches the in-progress search text, so Autocomplete
  // always has a valid match for the controlled `value`.
  const mergedOptions = useMemo(() => {
    if (
      value &&
      !options.some((option) => option.material_code === value.material_code)
    ) {
      return [value, ...options];
    }

    return options;
  }, [options, value]);

  return (
    <Autocomplete
      size="small"
      options={mergedOptions}
      value={value}
      inputValue={inputValue}
      onInputChange={(_, newInputValue) => setInputValue(newInputValue)}
      onChange={handleChange}
      getOptionLabel={(option) =>
        `${option.material_code} - ${option.short_description}`
      }
      isOptionEqualToValue={(option, value) =>
        option.material_code === value.material_code
      }
      filterOptions={(x) => x}
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
