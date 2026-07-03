import { Paper, Typography, Grid, Divider, Box, LinearProgress } from "@mui/material";
import type { Material } from "../types/material";

interface Props {
  material: Material | null;
  allocatedQty: number;
}

export default function AllocationSummary({
  material,
  allocatedQty,
}: Props) {
  if (!material) {
    return (
      <Paper elevation={2} sx={{ p: 1.5, mb: 1.5, borderRadius: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: "bold", fontSize: "0.9rem" }}>
          Material Information
        </Typography>

        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
          Please select a material.
        </Typography>
      </Paper>
    );
  }

  const stock = material.current_quantity;
  const balance = stock - allocatedQty;

  const allocatedPercent =
    stock > 0 ? Math.min((allocatedQty / stock) * 100, 100) : 0;

  const balancePercent = stock > 0 ? (balance / stock) * 100 : 0;

  let balanceColor = "success.main";
  let progressColor: "success" | "warning" | "error" = "success";

  if (balance <= 0) {
    balanceColor = "error.main";
    progressColor = "error";
  } else if (balancePercent <= 20) {
    balanceColor = "warning.main";
    progressColor = "warning";
  }

  return (
    <Paper elevation={2} sx={{ p: 1.5, mb: 1.5, borderRadius: 2 }}>
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
            {allocatedQty}
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
            sx={{ fontWeight: "bold", color: balanceColor }}
          >
            {balance}
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
            {allocatedQty} / {stock}
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
