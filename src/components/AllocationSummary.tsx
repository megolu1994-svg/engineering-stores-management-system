import { Paper, Typography, Grid, Divider, Box, LinearProgress } from "@mui/material";
import type { Material } from "../types/material";

interface Props {
  material: Material | null;
  /** Sum of every material_allocation row for this material (all
   * locations, including UNALLOCATED) - the Inventory Engine's Total
   * Stock. Material Master no longer carries a quantity, so this must
   * always come from the caller's own allocations query. */
  totalStock: number;
  /** Sum of material_allocation rows at real (non-UNALLOCATED) locations. */
  allocatedQty: number;
  /** Quantity sitting in the UNALLOCATED sentinel location. */
  unallocatedQty: number;
}

function safeNumber(value: number | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default function AllocationSummary({
  material,
  totalStock,
  allocatedQty,
  unallocatedQty,
}: Props) {
  if (!material) {
    return (
      <Paper elevation={2} sx={{ p: 1.5, mb: 1, borderRadius: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: "bold", fontSize: "0.9rem" }}>
          Material Information
        </Typography>

        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
          Please select a material.
        </Typography>
      </Paper>
    );
  }

  const stock = safeNumber(totalStock);
  const allocated = safeNumber(allocatedQty);
  const unallocated = safeNumber(unallocatedQty);

  const allocatedPercent = stock > 0 ? Math.min((allocated / stock) * 100, 100) : 0;
  const unallocatedPercent = stock > 0 ? (unallocated / stock) * 100 : 0;

  let unallocatedColor = "success.main";
  let progressColor: "success" | "warning" | "error" = "success";

  if (stock > 0 && unallocated <= 0) {
    progressColor = "success";
  } else if (unallocatedPercent <= 20) {
    unallocatedColor = "warning.main";
    progressColor = "warning";
  }

  if (stock === 0) {
    unallocatedColor = "text.secondary";
  }

  return (
    <Paper elevation={2} sx={{ p: 1.5, mb: 1, borderRadius: 2 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 1,
          flexWrap: "wrap",
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: "bold", fontSize: "0.95rem" }}
            noWrap
          >
            {material.material_code}
          </Typography>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              overflowWrap: "break-word",
              display: "-webkit-box",
              WebkitLineClamp: 1,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {material.short_description}
          </Typography>
        </Box>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ whiteSpace: "nowrap" }}
        >
          UoM: {material.uom}
        </Typography>
      </Box>

      <Divider sx={{ my: 1 }} />

      <Grid container spacing={0.5}>
        <Grid size={4}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", fontSize: "0.68rem" }}
          >
            Total Stock
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: "bold" }}>
            {stock}
          </Typography>
        </Grid>

        <Grid size={4}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", fontSize: "0.68rem" }}
          >
            Allocated
          </Typography>
          <Typography
            variant="body2"
            sx={{ fontWeight: "bold" }}
            color="primary.main"
          >
            {allocated}
          </Typography>
        </Grid>

        <Grid size={4}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", fontSize: "0.68rem" }}
          >
            Unallocated
          </Typography>
          <Typography
            variant="body2"
            sx={{ fontWeight: "bold", color: unallocatedColor }}
          >
            {unallocated}
          </Typography>
        </Grid>
      </Grid>

      <Box sx={{ mt: 1 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            mb: 0.25,
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.68rem" }}>
            {allocated} / {stock}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.68rem" }}>
            {allocatedPercent.toFixed(0)}%
          </Typography>
        </Box>

        <LinearProgress
          variant="determinate"
          value={allocatedPercent}
          color={progressColor}
          sx={{ height: 6, borderRadius: 3 }}
        />
      </Box>
    </Paper>
  );
}
