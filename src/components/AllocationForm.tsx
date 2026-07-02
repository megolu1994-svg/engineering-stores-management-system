import { useState } from "react";

import {
  Button,
    Paper,
      Stack,
        TextField,
          Typography,
          } from "@mui/material";

          import LocationSearch from "./LocationSearch";

          import type { Location } from "../types/location";

          interface Props {
            onAllocate: (
                locationCode: string,
                    quantity: number
                      ) => void;
                      }

                      export default function AllocationForm({
                        onAllocate,
                        }: Props) {

                          const [location, setLocation] =
                              useState<Location | null>(null);

                                const [quantity, setQuantity] =
                                    useState("");

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
                                                                                                                  <Paper elevation={2} sx={{ p: { xs: 2, sm: 3 }, mb: 2, borderRadius: 2 }}>

                                                                                                                        <Typography
                                                                                                                                variant="subtitle1"
                                                                                                                                        fontWeight="bold"
                                                                                                                                                mb={2}
                                                                                                                                                      >
                                                                                                                                                              Allocate Stock
                                                                                                                                                                    </Typography>

                                                                                                                                                                          <Stack spacing={2}>

                                                                                                                                                                                  <LocationSearch
                                                                                                                                                                                            value={location}
                                                                                                                                                                                                      onChange={setLocation}
                                                                                                                                                                                                              />

                                                                                                                                                                                                                      <TextField
                                                                                                                                                                                                                                label="Quantity"
                                                                                                                                                                                                                                          type="number"
                                                                                                                                                                                                                                                    fullWidth
                                                                                                                                                                                                                                                              value={quantity}
                                                                                                                                                                                                                                                                        onChange={(e) =>
                                                                                                                                                                                                                                                                                    setQuantity(e.target.value)
                                                                                                                                                                                                                                                                                              }
                                                                                                                                                                                                                                                                                                        inputProps={{ inputMode: "numeric" }}
                                                                                                                                                                                                                                                                                                                />

                                                                                                                                                                                                                                                                                                                        <Button
                                                                                                                                                                                                                                                                                                                                  variant="contained"
                                                                                                                                                                                                                                                                                                                                            size="large"
                                                                                                                                                                                                                                                                                                                                                      fullWidth
                                                                                                                                                                                                                                                                                                                                                                onClick={handleAllocate}
                                                                                                                                                                                                                                                                                                                                                                          sx={{ minHeight: 48, fontWeight: "bold" }}
                                                                                                                                                                                                                                                                                                                                                                                  >
                                                                                                                                                                                                                                                                                                                                                                                            Allocate Stock
                                                                                                                                                                                                                                                                                                                                                                                                    </Button>

                                                                                                                                                                                                                                                                                                                                                                                                          </Stack>

                                                                                                                                                                                                                                                                                                                                                                                                              </Paper>
                                                                                                                                                                                                                                                                                                                                                                                                                );
                                                                                                                                                                                                                                                                                                                                                                                                                }
                                                                                                                                                                                                                                                                                                                                                                                                                