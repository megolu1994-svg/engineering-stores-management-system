import { useEffect, useState } from "react";
import { MenuItem, TextField } from "@mui/material";

import {
  DEFAULT_STORAGE_LOCATION,
  getStorageLocations,
} from "../services/storageLocationService";
import type { StorageLocation } from "../types/storageLocation";

interface Props {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
}

export default function StorageLocationSelect({
  value,
  onChange,
  label = "Storage Location",
  required = true,
}: Props) {
  const [options, setOptions] = useState<StorageLocation[]>([]);

  useEffect(() => {
    let cancelled = false;

    getStorageLocations().then((locations) => {
      if (!cancelled) setOptions(locations);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <TextField
      select
      size="small"
      fullWidth
      required={required}
      label={label}
      value={value || DEFAULT_STORAGE_LOCATION}
      onChange={(e) => onChange(e.target.value.toUpperCase())}
      sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
    >
      {options.map((option) => (
        <MenuItem
          key={option.storage_location_code}
          value={option.storage_location_code}
        >
          {option.storage_location_code} - {option.storage_location_description}
        </MenuItem>
      ))}
    </TextField>
  );
}
