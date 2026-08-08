import { useEffect, useState } from "react";

import {
  Box,
  Card,
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
  /** Omit both to render a read-only list (e.g. Material Details lookups)
   * with no edit/delete actions. */
  onEdit?: (allocation: MaterialAllocation) => void;
  onDelete?: (id: number) => void;
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
      <Card variant="outlined" sx={{ p: 2, textAlign: "center", mb: 1.5, borderRadius: 2 }}>
        <Typography variant="body2" color="text.secondary">
          No allocations yet for this material.
        </Typography>
      </Card>
    );
  }

  return (
    <Stack spacing={0.75} sx={{ mb: 1.5 }}>
      {allocations.map((allocation) => (
        <Card
          key={allocation.id}
          variant="outlined"
          sx={{
            borderRadius: 2,
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 1.25,
            py: 0.75,
          }}
        >
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: "bold" }} noWrap>
              {allocation.location_code}
            </Typography>

            {locationMap[allocation.location_code] && (
              <Typography
                variant="caption"
                color="text.secondary"
                noWrap
                sx={{ display: "block" }}
              >
                {locationMap[allocation.location_code]}
              </Typography>
            )}
          </Box>

          <Typography
            variant="body1"
            sx={{ fontWeight: "bold", flexShrink: 0 }}
            color="primary.main"
          >
            {allocation.quantity}
          </Typography>

          {onEdit && (
            <IconButton
              color="primary"
              size="small"
              onClick={() => onEdit(allocation)}
              aria-label="Edit allocation"
              sx={{ minWidth: 40, minHeight: 40 }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          )}

          {onDelete && (
            <IconButton
              color="error"
              size="small"
              onClick={() => onDelete(allocation.id as number)}
              aria-label="Delete allocation"
              sx={{ minWidth: 40, minHeight: 40 }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          )}
        </Card>
      ))}
    </Stack>
  );
}
