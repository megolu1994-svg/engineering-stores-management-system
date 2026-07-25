import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

import { DEFAULT_PAGE_SIZE_OPTIONS } from "../constants/pagination";

interface Props {
  /** 0-indexed current page. */
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
  /** Plural noun shown in the "Showing X to Y of Z <itemLabel>" caption. */
  itemLabel?: string;
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

/**
 * Shared page-number + rows-per-page control bar, matching the pagination
 * UI Material Master already uses. Reused anywhere a list is fetched a
 * page at a time via `.range()` so the user can always reach every row
 * instead of the list quietly stopping at a fixed fetch limit.
 */
export default function PaginationControls({
  page,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  itemLabel = "items",
}: Props) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = page + 1;
  const from = totalCount === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(totalCount, (page + 1) * pageSize);
  const pageNumbers = getPageNumbers(currentPage, totalPages);

  return (
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
        Showing {from} to {to} of {totalCount.toLocaleString("en-IN")} {itemLabel}
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
        {pageSizeOptions.map((option) => (
          <MenuItem key={option} value={option}>
            {option}
          </MenuItem>
        ))}
      </TextField>
    </Box>
  );
}
