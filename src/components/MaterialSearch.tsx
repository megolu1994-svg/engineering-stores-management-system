import { useEffect, useState } from "react";

import {
  Autocomplete,
    TextField,
    } from "@mui/material";

    import { getMaterials } from "../services/materialService";
    import type { Material } from "../types/material";

    interface Props {
      value: Material | null;
        onChange: (material: Material | null) => void;
          label?: string;
          }

          export default function MaterialSearch({
            value,
              onChange,
                label = "Search Material",
                }: Props) {

                  const [materials, setMaterials] = useState<Material[]>([]);

                    useEffect(() => {
                        async function load() {
                              const data = await getMaterials();
                                    setMaterials(data);
                                        }

                                            load();
                                              }, []);

                                                function handleChange(
                                                    _: React.SyntheticEvent,
                                                        newValue: Material | null
                                                          ) {
                                                              onChange(newValue);

                                                                  // Close keyboard on mobile
                                                                      setTimeout(() => {
                                                                            (document.activeElement as HTMLElement | null)?.blur();
                                                                                }, 50);
                                                                                  }

                                                                                    return (
                                                                                        <Autocomplete
                                                                                              options={materials}
                                                                                                    value={value}
                                                                                                          onChange={handleChange}
                                                                                                                getOptionLabel={(option) =>
                                                                                                                        `${option.material_code} - ${option.short_description}`
                                                                                                                              }
                                                                                                                                    isOptionEqualToValue={(option, value) =>
                                                                                                                                            option.material_code === value.material_code
                                                                                                                                                  }
                                                                                                                                                        blurOnSelect
                                                                                                                                                              clearOnBlur={false}
                                                                                                                                                                    renderInput={(params) => (
                                                                                                                                                                            <TextField
                                                                                                                                                                                      {...params}
                                                                                                                                                                                                label={label}
                                                                                                                                                                                                          fullWidth
                                                                                                                                                                                                                  />
                                                                                                                                                                                                                        )}
                                                                                                                                                                                                                            />
                                                                                                                                                                                                                              );
                                                                                                                                                                                                                              }