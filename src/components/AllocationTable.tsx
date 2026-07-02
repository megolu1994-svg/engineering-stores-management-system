import { useEffect, useState } from "react";

import {
  Box,
  Card,
  CardActions,
  CardContent,
  Divider,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";

import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";

import { getLocations } from "../services/locationService";

import type { Location } from "../types/location";
import type { MaterialAllocation } from "../types/materialAllocation";

interface Props {
  allocations: MaterialAllocation[];
  onEdit: (allocation: MaterialAllocation) => void;
  onDelete: (id: number) => void;
}

export default function AllocationTable({
  allocations,
  onEdit,
  onDelete,
}: Props) {

  const [locationMap, setLocationMap] = useState<Record<string, string>>({});

  useEffect(() => {
    let isMounted = true;

    async function loadLocationDescriptions() {
      try {
        const data = await getLocations();

        if (!isMounted) return;

        const map: Record<string, string> = {};

        data.forEach((loc: Location) => {
          map[loc.location_code] = loc.location_description;
        });

        setLocationMap(map);
      } catch {
        // Location descriptions are a display-only enhancement.
        // If lookup fails, allocation codes are still shown.
      }
    }

    loadLocationDescriptions();

    return () => {
      isMounted = false;
    };
  }, []);

  if (allocations.length === 0) {
    return (
      <Card variant="outlined" sx={{ p: 3, textAlign: "center", mb: 2, borderRadius: 2 }}>
        <Typography variant="body2" color="text.secondary">
          No allocations yet for this material.
        </Typography>
      </Card>
    );
  }

  return (
    <Stack spacing={1.5} sx={{ mb: 2 }}>
      {allocations.map((allocation) => (
        <Card
          key={allocation.id}
          variant="outlined"
          sx={{ borderRadius: 2 }}
        >
          <CardContent sx={{ pb: 1.5 }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 1,
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: "bold" }} noWrap>
                  {allocation.location_code}
                </Typography>

                {locationMap[allocation.location_code] && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ overflowWrap: "break-word" }}
                  >
                    {locationMap[allocation.location_code]}
                  </Typography>
                )}
              </Box>

              <Box sx={{ textAlign: "right", whiteSpace: "nowrap" }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block" }}
                >
                  Allocated
                </Typography>
                <Typography
                  variant="subtitle1"
                  sx={{ fontWeight: "bold" }}
                  color="primary.main"
                >
                  {allocation.quantity}
                </Typography>
              </Box>
            </Box>
          </CardContent>

          <Divider />

          <CardActions sx={{ justifyContent: "flex-end", px: 1.5, py: 1 }}>
            <IconButton
              color="primary"
              onClick={() => onEdit(allocation)}
              aria-label="Edit allocation"
              sx={{ minWidth: 48, minHeight: 48 }}
            >
              <EditIcon />
            </IconButton>

            <IconButton
              color="error"
              onClick={() => onDelete(allocation.id as number)}
              aria-label="Delete allocation"
              sx={{ minWidth: 48, minHeight: 48 }}
            >
              <DeleteIcon />
            </IconButton>
          </CardActions>
        </Card>
      ))}
    </Stack>
  );
}
