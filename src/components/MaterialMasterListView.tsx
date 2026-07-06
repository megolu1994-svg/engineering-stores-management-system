import type { ReactNode } from "react";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
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
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
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
  onUploadPhoto: (material: Material, anchorEl: HTMLElement) => void;
  uploadingPhotoCode: string | null;
  onRowClick: (material: Material) => void;
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
          width: { xs: 34, sm: 40, md: 48 },
          height: { xs: 34, sm: 40, md: 48 },
          borderRadius: 2,
          bgcolor: BRAND_PURPLE_SOFT,
          color: BRAND_PURPLE,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          "& svg": { fontSize: { xs: 18, sm: 20, md: 24 } },
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: { xs: "0.95rem", sm: "1rem", md: "1.15rem" } }} noWrap>
          {value}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          noWrap
          sx={{ display: "block", fontSize: { xs: "0.75rem", md: "0.85rem" } }}
        >
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
  onUploadPhoto,
  uploadingPhotoCode,
  onRowClick,
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

      {/* ---- Mobile/tablet: card list (unchanged) ---- */}
      <Card
        elevation={0}
        sx={{
          display: { xs: "block", md: "none" },
          borderRadius: 3,
          boxShadow: "0 2px 14px rgba(15, 23, 42, 0.06)",
          overflow: "hidden",
        }}
      >
        {materials.length === 0 ? (
          <Box sx={{ py: 4, textAlign: "center", color: "text.secondary" }}>
            <Typography variant="body2">No materials found.</Typography>
          </Box>
        ) : (
          materials.map((material, index) => (
            <Box
              key={material.material_code}
              role="button"
              tabIndex={0}
              onClick={() => onRowClick(material)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onRowClick(material);
              }}
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: 0.5,
                px: { xs: 1.5, sm: 2.5 },
                py: 1.25,
                cursor: "pointer",
                borderTop: index === 0 ? "none" : "1px solid",
                borderColor: "divider",
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                  <Typography
                    sx={{ fontWeight: 700, color: BRAND_PURPLE, fontSize: { xs: "0.9rem", sm: "1rem" } }}
                    noWrap
                  >
                    {material.material_code}
                  </Typography>
                  <Chip
                    label={material.uom}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: "0.65rem",
                      fontWeight: 700,
                      bgcolor: BRAND_PURPLE_SOFT,
                      color: BRAND_PURPLE,
                    }}
                  />
                </Box>

                <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 1.25, sm: 1.5 }, flexShrink: 0 }}>
                  <IconButton
                    color="primary"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(material);
                    }}
                    aria-label="Edit material"
                    sx={{ p: 0.75 }}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>

                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUploadPhoto(material, e.currentTarget);
                    }}
                    disabled={uploadingPhotoCode === material.material_code}
                    aria-label="Add material photo"
                    sx={{ p: 0.75, color: "text.secondary" }}
                  >
                    {uploadingPhotoCode === material.material_code ? (
                      <CircularProgress size={18} />
                    ) : (
                      <PhotoCameraIcon fontSize="small" />
                    )}
                  </IconButton>

                  <IconButton
                    color="error"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(material);
                    }}
                    aria-label="Delete material"
                    sx={{ p: 0.75 }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>

              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ wordBreak: "break-word", fontSize: { xs: "0.82rem", sm: "0.875rem" } }}
              >
                {material.short_description}
              </Typography>
            </Box>
          ))
        )}
      </Card>

      {/* ---- Desktop: proper table, comfortable padding + consistent row height ---- */}
      <Card
        elevation={0}
        sx={{
          display: { xs: "none", md: "block" },
          borderRadius: 3,
          boxShadow: "0 2px 14px rgba(15, 23, 42, 0.06)",
          overflow: "hidden",
        }}
      >
        {materials.length === 0 ? (
          <Box sx={{ py: 4, textAlign: "center", color: "text.secondary" }}>
            <Typography variant="body2">No materials found.</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table sx={{ "& td, & th": { borderColor: "divider" } }}>
              <TableHead>
                <TableRow sx={{ "& th": { bgcolor: "grey.50", fontWeight: 700, color: "text.secondary" } }}>
                  <TableCell>Material Code</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>UoM</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {materials.map((material) => (
                  <TableRow
                    key={material.material_code}
                    hover
                    onClick={() => onRowClick(material)}
                    sx={{ cursor: "pointer", height: 60 }}
                  >
                    <TableCell sx={{ fontWeight: 700, color: BRAND_PURPLE }}>
                      {material.material_code}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 480 }}>
                      <Typography variant="body2" sx={{ wordBreak: "break-word" }}>
                        {material.short_description}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={material.uom}
                        size="small"
                        sx={{
                          height: 22,
                          fontSize: "0.7rem",
                          fontWeight: 700,
                          bgcolor: BRAND_PURPLE_SOFT,
                          color: BRAND_PURPLE,
                        }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 0.5 }}>
                        <IconButton
                          color="primary"
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEdit(material);
                          }}
                          aria-label="Edit material"
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>

                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUploadPhoto(material, e.currentTarget);
                          }}
                          disabled={uploadingPhotoCode === material.material_code}
                          aria-label="Add material photo"
                          sx={{ color: "text.secondary" }}
                        >
                          {uploadingPhotoCode === material.material_code ? (
                            <CircularProgress size={18} />
                          ) : (
                            <PhotoCameraIcon fontSize="small" />
                          )}
                        </IconButton>

                        <IconButton
                          color="error"
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(material);
                          }}
                          aria-label="Delete material"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>

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
