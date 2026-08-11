import { useEffect, useState } from "react";

import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";

import CloseIcon from "@mui/icons-material/Close";

import { searchMaterials } from "../services/materialService";
import { getAllocations } from "../services/materialAllocationService";
import AllocationSummary from "./AllocationSummary";
import AllocationTable from "./AllocationTable";
import type { Material } from "../types/material";
import type { MaterialAllocation } from "../types/materialAllocation";

const UNALLOCATED_LOCATION = "UNALLOCATED";

function safeNumber(value: number | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

interface Props {
  /** Material code to show, or null to close the dialog. */
  materialCode: string | null;
  onClose: () => void;
}

/**
 * Stock-detail box for a single material: the allocation summary (Total /
 * Allocated / Unallocated) plus every allocated location. Shared by the
 * Dashboard's inventory search results and the desktop header's global
 * material search, so clicking a search result opens the same "box"
 * everywhere.
 */
export default function MaterialStockDetailsDialog({
  materialCode,
  onClose,
}: Props) {
  const [data, setData] = useState<{
    material: Material | null;
    allocations: MaterialAllocation[];
  } | null>(null);
  // The code whose data currently lives in `data` - loading is derived from
  // it so the effect below only ever calls setState inside async callbacks.
  const [loadedForCode, setLoadedForCode] = useState<string | null>(null);

  const loading = materialCode !== null && loadedForCode !== materialCode;

  useEffect(() => {
    if (!materialCode) return;

    let cancelled = false;

    Promise.all([
      searchMaterials(materialCode, 0, 1),
      getAllocations(materialCode),
    ])
      .then(([materials, allocations]) => {
        if (cancelled) return;
        const exact =
          materials.find((m) => m.material_code === materialCode) ??
          materials[0] ??
          null;
        setData({ material: exact, allocations });
        setLoadedForCode(materialCode);
      })
      .catch(() => {
        // Missing/errored rows - show the dialog with whatever we have
        // rather than blocking on a lookup that failed.
        if (cancelled) return;
        setData({ material: null, allocations: [] });
        setLoadedForCode(materialCode);
      });

    return () => {
      cancelled = true;
    };
  }, [materialCode]);

  const allocations = data?.allocations ?? [];
  const totalStock = safeNumber(
    allocations.reduce((sum, a) => sum + safeNumber(a.quantity), 0)
  );
  const unallocatedQty = safeNumber(
    allocations
      .filter((a) => a.location_code === UNALLOCATED_LOCATION)
      .reduce((sum, a) => sum + safeNumber(a.quantity), 0)
  );
  const allocatedQty = safeNumber(totalStock - unallocatedQty);

  return (
    <Dialog open={!!materialCode} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle
        sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        Material Details
        <IconButton size="small" onClick={onClose} aria-label="Close">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <>
            <AllocationSummary
              material={data?.material ?? null}
              totalStock={totalStock}
              allocatedQty={allocatedQty}
              unallocatedQty={unallocatedQty}
            />

            <Typography
              variant="subtitle2"
              sx={{ fontWeight: "bold", mb: 0.75, mt: 1.5, fontSize: "0.85rem" }}
            >
              Allocated Locations
            </Typography>

            <AllocationTable
              allocations={allocations.filter(
                (a) => a.location_code !== UNALLOCATED_LOCATION
              )}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
