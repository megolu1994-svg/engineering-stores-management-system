import type { ReactNode } from "react";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";

import Inventory2Icon from "@mui/icons-material/Inventory2";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

import { BRAND_PURPLE, BRAND_PURPLE_SOFT } from "../theme";
import type { Material } from "../types/material";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

interface Props {
  materials: Material[];
  totalCount: number;
  lastUpdated: string | null;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onEdit: (material: Material) => void;
  onDelete: (material: Material) => void;
}

function formatLastUpdated(value: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function StatItem({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 1.25, minWidth: 0 }}>
      <Box
        sx={{
          width: { xs: 34, sm: 40 },
          height: { xs: 34, sm: 40 },
          borderRadius: 2,
          bgcolor: BRAND_PURPLE_SOFT,
          color: BRAND_PURPLE,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: { xs: "0.95rem", sm: "1rem" } }} noWrap>
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
          {label}
        </Typography>
      </Box>
    </Box>
  );
}

function getPageNumbers(currentPage: number, totalPages: number): (number | "ellipsis")[] {
  const windowSize = 2;
  const show = new Set<number>([1, totalPages]);

  for (let p = currentPage - windowSize; p <= currentPage + windowSize; p++) {
    if (p >= 1 && p <= totalPages) show.add(p);
  }

  const sorted = Array.from(show).sort((a, b) => a - b);
  const pages: (number | "ellipsis")[] = [];
  let prev = 0;

  for (const p of sorted) {
    if (prev && p - prev > 1) pages.push("ellipsis");
    pages.push(p);
    prev = p;
  }

  return pages;
}

export default function MaterialMasterListView({
  materials,
  totalCount,
  lastUpdated,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onEdit,
  onDelete,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = page + 1;
  const from = totalCount === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(totalCount, (page + 1) * pageSize);
  const pageNumbers = getPageNumbers(currentPage, totalPages);

  return (
    <Box>
      <Card elevation={0} sx={{ borderRadius: 3, mb: 2, boxShadow: "0 2px 14px rgba(15, 23, 42, 0.06)" }}>
        <CardContent
          sx={{
            display: "flex",
            alignItems: "center",
            p: { xs: 1.5, sm: 2 },
            "&:last-child": { pb: { xs: 1.5, sm: 2 } },
          }}
        >
          <StatItem
            icon={<Inventory2Icon fontSize="small" />}
            value={totalCount.toLocaleString("en-IN")}
            label="Total Materials"
          />
          <Divider orientation="vertical" flexItem sx={{ mx: { xs: 1, sm: 2 } }} />
          <StatItem
            icon={<CalendarMonthIcon fontSize="small" />}
            value={formatLastUpdated(lastUpdated)}
            label="Last Updated"
          />
        </CardContent>
      </Card>

      <TableContainer
        component={Card}
        elevation={0}
        sx={{ borderRadius: 3, boxShadow: "0 2px 14px rgba(15, 23, 42, 0.06)", overflowX: "auto" }}
      >
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: BRAND_PURPLE_SOFT }}>
              <TableCell sx={{ fontWeight: 700, color: BRAND_PURPLE, py: 1 }}>Code</TableCell>
              <TableCell sx={{ fontWeight: 700, color: BRAND_PURPLE, py: 1 }}>Description</TableCell>
              <TableCell sx={{ fontWeight: 700, color: BRAND_PURPLE, py: 1 }}>UoM</TableCell>
              <TableCell sx={{ fontWeight: 700, color: BRAND_PURPLE, py: 1 }} align="right">
                Actions
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {materials.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ py: 4, color: "text.secondary" }}>
                  No materials found.
                </TableCell>
              </TableRow>
            ) : (
              materials.map((material) => (
                <TableRow key={material.material_code} hover>
                  <TableCell sx={{ fontWeight: 700, color: BRAND_PURPLE, py: 0.75 }}>
                    {material.material_code}
                  </TableCell>
                  <TableCell
                    sx={{
                      py: 0.75,
                      maxWidth: { xs: 120, sm: 320 },
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={material.short_description}
                  >
                    {material.short_description}
                  </TableCell>
                  <TableCell sx={{ py: 0.75 }}>{material.uom}</TableCell>
                  <TableCell align="right" sx={{ py: 0.25, whiteSpace: "nowrap" }}>
                    <IconButton
                      color="primary"
                      size="small"
                      onClick={() => onEdit(material)}
                      aria-label="Edit material"
                      sx={{ p: 0.5 }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      color="error"
                      size="small"
                      onClick={() => onDelete(material)}
                      aria-label="Delete material"
                      sx={{ p: 0.5 }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 1.5,
          mt: 2,
        }}
      >
        <Typography variant="caption" color="text.secondary">
          Showing {from} to {to} of {totalCount.toLocaleString("en-IN")} items
        </Typography>

        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
          <IconButton
            size="small"
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
            sx={{
              bgcolor: "background.paper",
              boxShadow: "0 1px 3px rgba(15, 23, 42, 0.12)",
              "&.Mui-disabled": { boxShadow: "none" },
            }}
          >
            <ChevronLeftIcon fontSize="small" />
          </IconButton>

          {pageNumbers.map((p, idx) =>
            p === "ellipsis" ? (
              <Typography key={`ellipsis-${idx}`} sx={{ px: 0.5, color: "text.secondary" }}>
                …
              </Typography>
            ) : (
              <Button
                key={p}
                size="small"
                variant={p === currentPage ? "contained" : "outlined"}
                onClick={() => onPageChange(p - 1)}
                sx={{
                  minWidth: 32,
                  height: 32,
                  px: 0,
                  borderRadius: 2,
                  fontWeight: 700,
                  ...(p !== currentPage && {
                    borderColor: "transparent",
                    bgcolor: "background.paper",
                    boxShadow: "0 1px 3px rgba(15, 23, 42, 0.12)",
                  }),
                }}
              >
                {p}
              </Button>
            )
          )}

          <IconButton
            size="small"
            disabled={page >= totalPages - 1}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
            sx={{
              bgcolor: "background.paper",
              boxShadow: "0 1px 3px rgba(15, 23, 42, 0.12)",
              "&.Mui-disabled": { boxShadow: "none" },
            }}
          >
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </Box>

        <TextField
          select
          size="small"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          sx={{ width: 80, "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
        >
          {PAGE_SIZE_OPTIONS.map((option) => (
            <MenuItem key={option} value={option}>
              {option}
            </MenuItem>
          ))}
        </TextField>
      </Box>
    </Box>
  );
}
