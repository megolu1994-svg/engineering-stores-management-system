import { useEffect, useState } from "react";

import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Stack,
  Typography,
} from "@mui/material";

import MaterialSearch from "../components/MaterialSearch";

import type { Material } from "../types/material";
import type { MaterialAllocation } from "../types/materialAllocation";
import type { Location } from "../types/location";

import { getAllocations } from "../services/materialAllocationService";
import { getLocations } from "../services/locationService";
import {
  getMaterialMovementDates,
  type MaterialMovementDates,
} from "../services/inventoryOverviewService";

function safeNumber(value: number | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const UNALLOCATED_LOCATION = "UNALLOCATED";

function formatReportDate(value: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function Reports() {
  const [material, setMaterial] = useState<Material | null>(null);

  const [allocations, setAllocations] = useState<MaterialAllocation[]>([]);

  const [locationMap, setLocationMap] = useState<Record<string, string>>({});

  const [loadingAllocations, setLoadingAllocations] = useState(false);

  const [movementDates, setMovementDates] = useState<MaterialMovementDates>({
    lastReceiptDate: null,
    lastIssueDate: null,
    lastMovementDate: null,
  });

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
      }
    }

    loadLocationDescriptions();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!material) {
      setAllocations([]);
      setMovementDates({
        lastReceiptDate: null,
        lastIssueDate: null,
        lastMovementDate: null,
      });
      return;
    }

    let isMounted = true;

    async function loadAllocations() {
      setLoadingAllocations(true);

      try {
        const [allocationData, dates] = await Promise.all([
          getAllocations(material!.material_code),
          getMaterialMovementDates(material!.material_code),
        ]);

        if (isMounted) {
          setAllocations(allocationData);
          setMovementDates(dates);
        }
      } finally {
        if (isMounted) {
          setLoadingAllocations(false);
        }
      }
    }

    loadAllocations();

    return () => {
      isMounted = false;
    };
  }, [material]);

  const totalStock = safeNumber(
    allocations.reduce((sum, a) => sum + safeNumber(a.quantity), 0)
  );
  const unallocatedQty = safeNumber(
    allocations
      .filter((a) => a.location_code === UNALLOCATED_LOCATION)
      .reduce((sum, a) => sum + safeNumber(a.quantity), 0)
  );
  const allocatedQty = safeNumber(totalStock - unallocatedQty);
  const numberOfLocations = allocations.filter(
    (a) => a.location_code !== UNALLOCATED_LOCATION && safeNumber(a.quantity) > 0
  ).length;

  return (
    <Box sx={{ pb: 4 }}>
      <Typography
        variant="h5"
        sx={{
          mb: 3,
          fontWeight: "bold",
          fontSize: { xs: "1.25rem", sm: "1.5rem", md: "2rem" },
        }}
      >
        Reports
      </Typography>

      <Card elevation={3} sx={{ borderRadius: 2, mb: 2 }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="subtitle1" sx={{ fontWeight: "bold" }} gutterBottom>
            Material Search
          </Typography>

          <MaterialSearch value={material} onChange={setMaterial} />
        </CardContent>
      </Card>

      {!material && (
        <Alert severity="info">
          Search and select a material to view its details and allocated
          locations.
        </Alert>
      )}

      {material && (
        <>
          <Card elevation={3} sx={{ borderRadius: 2, mb: 2 }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Typography variant="subtitle1" sx={{ fontWeight: "bold" }} gutterBottom>
                Material Details
              </Typography>

              <Divider sx={{ mb: 2 }} />

              <Stack spacing={1.5}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 1,
                  }}
                >
                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block" }}
                    >
                      Material Code
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: "bold" }}>
                      {material.material_code}
                    </Typography>
                  </Box>

                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block" }}
                    >
                      UoM
                    </Typography>
                    <Typography variant="body1">{material.uom}</Typography>
                  </Box>
                </Box>

                <Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block" }}
                  >
                    Description
                  </Typography>
                  <Typography
                    variant="body1"
                    sx={{ overflowWrap: "break-word" }}
                  >
                    {material.short_description}
                  </Typography>
                </Box>

                <Divider />

                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 2,
                  }}
                >
                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block" }}
                    >
                      Total Stock
                    </Typography>
                    <Typography
                      variant="h6"
                      sx={{ fontWeight: "bold" }}
                      color="primary.main"
                    >
                      {totalStock}
                    </Typography>
                  </Box>

                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block" }}
                    >
                      Allocated Qty
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: "bold" }}>
                      {allocatedQty}
                    </Typography>
                  </Box>

                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block" }}
                    >
                      Unallocated Qty
                    </Typography>
                    <Typography
                      variant="h6"
                      sx={{ fontWeight: "bold" }}
                      color={unallocatedQty > 0 ? "warning.main" : "success.main"}
                    >
                      {unallocatedQty}
                    </Typography>
                  </Box>
                </Box>

                <Divider />

                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 2,
                  }}
                >
                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block" }}
                    >
                      Number of Locations
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: "bold" }}>
                      {numberOfLocations}
                    </Typography>
                  </Box>

                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block" }}
                    >
                      Last Receipt Date
                    </Typography>
                    <Typography variant="body1">
                      {formatReportDate(movementDates.lastReceiptDate)}
                    </Typography>
                  </Box>

                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block" }}
                    >
                      Last Issue Date
                    </Typography>
                    <Typography variant="body1">
                      {formatReportDate(movementDates.lastIssueDate)}
                    </Typography>
                  </Box>

                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block" }}
                    >
                      Last Movement Date
                    </Typography>
                    <Typography variant="body1">
                      {formatReportDate(movementDates.lastMovementDate)}
                    </Typography>
                  </Box>
                </Box>
              </Stack>
            </CardContent>
          </Card>

          <Typography variant="subtitle1" sx={{ fontWeight: "bold", mb: 1.5 }}>
            Allocated Locations
          </Typography>

          {loadingAllocations ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress />
            </Box>
          ) : allocations.filter((a) => a.location_code !== UNALLOCATED_LOCATION).length === 0 ? (
            <Card
              variant="outlined"
              sx={{ p: 3, textAlign: "center", borderRadius: 2 }}
            >
              <Typography variant="body2" color="text.secondary">
                No allocations found for this material.
              </Typography>
            </Card>
          ) : (
            <Stack spacing={1.5}>
              {allocations
                .filter((a) => a.location_code !== UNALLOCATED_LOCATION)
                .map((allocation) => (
                <Card
                  key={allocation.id}
                  variant="outlined"
                  sx={{ borderRadius: 2 }}
                >
                  <CardContent
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 1,
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        variant="subtitle1"
                        sx={{ fontWeight: "bold" }}
                        noWrap
                      >
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
                        Available Quantity
                      </Typography>
                      <Typography
                        variant="subtitle1"
                        sx={{ fontWeight: "bold" }}
                        color="primary.main"
                      >
                        {safeNumber(allocation.quantity)}
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}
        </>
      )}
    </Box>
  );
}
