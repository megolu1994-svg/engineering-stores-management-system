import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";

import type { Material } from "../types/material";

interface Props {
  materials: Material[];
  onEdit: (material: Material) => void;
  onDelete: (material: Material) => void;
}

function StatBlock({ label, value }: { label: string; value: string | number }) {
  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        bgcolor: "grey.50",
        borderRadius: 2,
        px: 1.25,
        py: 0.75,
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", fontWeight: 600, letterSpacing: 0.3 }}
      >
        {label}
      </Typography>
      <Typography
        variant="body2"
        noWrap
        sx={{ fontWeight: 600 }}
      >
        {value || "-"}
      </Typography>
    </Box>
  );
}

export default function MaterialTable({
  materials,
  onEdit,
  onDelete,
}: Props) {

  if (materials.length === 0) {
    return (
      <Card
        variant="outlined"
        sx={{ p: 4, textAlign: "center", borderRadius: 3 }}
      >
        <Typography variant="body1" color="text.secondary">
          No materials found.
        </Typography>
      </Card>
    );
  }

  return (
    <Stack spacing={2}>
      {materials.map((material) => (
        <Card
          key={material.material_code}
          elevation={0}
          sx={{
            borderRadius: 3,
            boxShadow: "0 2px 14px rgba(15, 23, 42, 0.08)",
            overflow: "hidden",
          }}
        >
          <CardContent sx={{ p: 2.25, pb: 2 }}>
            <Box
              sx={{
                mb: 1.5,
              }}
            >
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: 700, fontSize: "1.05rem" }}
                noWrap
              >
                {material.material_code}
              </Typography>

              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ overflowWrap: "break-word", mt: 0.25 }}
              >
                {material.short_description}
              </Typography>
            </Box>

            <Box sx={{ display: "flex", gap: 1 }}>
              <StatBlock label="UOM" value={material.uom} />
            </Box>
          </CardContent>

          <Divider />

          <CardActions sx={{ justifyContent: "flex-end", px: 1.5, py: 1, gap: 0.5 }}>
            <IconButton
              color="primary"
              size="large"
              onClick={() => onEdit(material)}
              aria-label="Edit material"
              sx={{ minWidth: 48, minHeight: 48 }}
            >
              <EditIcon />
            </IconButton>

            <IconButton
              color="error"
              size="large"
              onClick={() => onDelete(material)}
              aria-label="Delete material"
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
