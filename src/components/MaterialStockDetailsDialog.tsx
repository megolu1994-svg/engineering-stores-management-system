import { useEffect, useState } from "react";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import CloseIcon from "@mui/icons-material/Close";
import HistoryIcon from "@mui/icons-material/History";

import { useNavigate } from "react-router-dom";

import { searchMaterials } from "../services/materialService";
import { getAllocations } from "../services/materialAllocationService";
import {
  getMaterialAppMovements,
  type MaterialMovementRow,
} from "../services/inventoryTransactionService";
import { getSapStockDistribution } from "../services/sapHistoryService";
import AllocationSummary from "./AllocationSummary";
import AllocationTable from "./AllocationTable";
import type { Material } from "../types/material";
import type { MaterialAllocation } from "../types/materialAllocation";

const UNALLOCATED_LOCATION = "UNALLOCATED";
const HISTORY_LIMIT = 15;

function safeNumber(value: number | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function movementLabel(row: MaterialMovementRow): string {
  return row.transaction_type.replace(/_/g, " ");
}

interface Props {
  /** Material code to show, or null to close the dialog. */
  materialCode: string | null;
  onClose: () => void;
}

/**
 * Stock-detail box for a single material: the allocation summary (Total /
 * Allocated / Unallocated), every allocated location, the latest app
 * movements from the ledger, and the material's SAP status (MB52
 * distribution + reconciliation state) with a link to the full SAP
 * History screen. Shared by the Dashboard's inventory search results and
 * the desktop header's global material search, so clicking a search
 * result opens the same "box" everywhere.
 */
export default function MaterialStockDetailsDialog({
  materialCode,
  onClose,
}: Props) {
  const navigate = useNavigate();

  const [data, setData] = useState<{
    material: Material | null;
    allocations: MaterialAllocation[];
    history: MaterialMovementRow[];
    sapTotal: number | null;
    sapDiff: number | null;
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
      getMaterialAppMovements(materialCode, HISTORY_LIMIT),
      getSapStockDistribution(),
    ])
      .then(([materials, allocations, history, sapRows]) => {
        if (cancelled) return;
        const exact =
          materials.find((m) => m.material_code === materialCode) ??
          materials[0] ??
          null;
        const sapRow = sapRows.find((r) => r.material_code === materialCode);
        setData({
          material: exact,
          allocations,
          history,
          sapTotal: sapRow ? sapRow.total : null,
          sapDiff: sapRow?.review ? sapRow.review.difference : null,
        });
        setLoadedForCode(materialCode);
      })
      .catch(() => {
        // Missing/errored rows - show the dialog with whatever we have
        // rather than blocking on a lookup that failed.
        if (cancelled) return;
        setData({
          material: null,
          allocations: [],
          history: [],
          sapTotal: null,
          sapDiff: null,
        });
        setLoadedForCode(materialCode);
      });

    return () => {
      cancelled = true;
    };
  }, [materialCode]);

  const allocations = data?.allocations ?? [];
  const history = data?.history ?? [];
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
    <Dialog open={!!materialCode} onClose={onClose} fullWidth maxWidth="sm">
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

            {data && data.sapTotal !== null && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  flexWrap: "wrap",
                  mt: 1,
                  px: 1.25,
                  py: 0.75,
                  borderRadius: 2,
                  bgcolor: "grey.50",
                }}
              >
                <Chip
                  size="small"
                  variant="outlined"
                  label={`SAP total: ${data!.sapTotal}`}
                />
                {data!.sapDiff !== null && data!.sapDiff !== 0 ? (
                  <Chip
                    size="small"
                    color={data!.sapDiff > 0 ? "info" : "error"}
                    label={
                      data!.sapDiff > 0
                        ? `App ${data!.sapDiff} below SAP`
                        : `App ${-data!.sapDiff} above SAP`
                    }
                  />
                ) : (
                  <Chip size="small" color="success" label="✓ Matches SAP" />
                )}
                <Button
                  size="small"
                  variant="text"
                  startIcon={<HistoryIcon fontSize="small" />}
                  onClick={() => {
                    onClose();
                    navigate(`/sap-history?material=${materialCode}`);
                  }}
                  sx={{ ml: "auto", borderRadius: 2, fontWeight: 700 }}
                >
                  SAP History
                </Button>
              </Box>
            )}

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

            <Divider sx={{ my: 1.5 }} />

            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                mb: 0.75,
              }}
            >
              <Typography
                variant="subtitle2"
                sx={{ fontWeight: "bold", fontSize: "0.85rem" }}
              >
                Recent Movements (App)
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Latest {Math.min(history.length, HISTORY_LIMIT)}
              </Typography>
            </Box>

            {history.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                No movements recorded yet.
              </Typography>
            ) : (
              <Stack spacing={0.75} sx={{ maxHeight: 320, overflowY: "auto", pr: 0.5 }}>
                {history.map((row) => {
                  const negative = row.movement === "OUT";
                  return (
                    <Box
                      key={row.id}
                      sx={{
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: 2,
                        px: 1.25,
                        py: 0.75,
                        bgcolor: "background.paper",
                      }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 1,
                        }}
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: "block", fontWeight: 600 }}
                          >
                            {(row.created_at ?? "").slice(0, 10)} ·{" "}
                            {row.location_code}
                          </Typography>
                          <Typography
                            variant="body2"
                            noWrap
                            sx={{ fontWeight: 600 }}
                            title={movementLabel(row)}
                          >
                            {movementLabel(row)}
                            {row.reference_number
                              ? ` · ${row.reference_number}`
                              : ""}
                          </Typography>
                        </Box>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 800,
                            color: negative ? "error.main" : "success.main",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {negative ? "-" : "+"}
                          {safeNumber(row.quantity)}
                        </Typography>
                      </Box>
                    </Box>
                  );
                })}
              </Stack>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
