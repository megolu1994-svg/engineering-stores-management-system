import { useEffect, useState } from "react";

import {
  Box,
  Card,
  CardActionArea,
  Chip,
  CircularProgress,
  InputAdornment,
  TextField,
  Typography,
} from "@mui/material";

import SearchIcon from "@mui/icons-material/Search";
import HistoryIcon from "@mui/icons-material/History";
import PlaceIcon from "@mui/icons-material/Place";

import {
  getRecentActivity,
  searchInventory,
  type InventoryOverviewRow,
  type InventorySearchResult,
} from "../services/inventoryOverviewService";
import type { InventoryTransactionType } from "../services/inventoryTransactionService";

interface Props {
  /** Called when the user taps a material card, so the parent (Inventory
   * page) can load that material into the other tabs without another
   * search. */
  onSelectMaterial: (materialCode: string) => void;
}

const SEARCH_DEBOUNCE_MS = 300;

const TRANSACTION_BADGE: Record<
  InventoryTransactionType,
  { label: string; color: string; bg: string }
> = {
  MATERIAL_RECEIPT: { label: "Receipt", color: "#1b5e20", bg: "#e8f5e9" },
  ALLOCATION: { label: "Allocation", color: "#0d47a1", bg: "#e3f2fd" },
  LOCATION_TRANSFER: { label: "Transfer", color: "#e65100", bg: "#fff3e0" },
  MATERIAL_ISSUE: { label: "Issue", color: "#b71c1c", bg: "#ffebee" },
  ADJUSTMENT: { label: "Adjustment", color: "#4a148c", bg: "#f3e5f5" },
  OPENING_STOCK: { label: "Opening Stock", color: "#424242", bg: "#f5f5f5" },
};

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CurrentStockTab({ onSelectMaterial }: Props) {
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<InventorySearchResult[]>(
    []
  );

  const [recentActivity, setRecentActivity] = useState<InventoryOverviewRow[]>(
    []
  );
  const [loadingRecent, setLoadingRecent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingRecent(true);

    getRecentActivity()
      .then((data) => {
        if (!cancelled) setRecentActivity(data);
      })
      .finally(() => {
        if (!cancelled) setLoadingRecent(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const trimmed = search.trim();

    if (trimmed.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(() => {
      setSearching(true);

      searchInventory(trimmed)
        .then((results) => setSearchResults(results))
        .finally(() => setSearching(false));
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [search]);

  const isSearchMode = search.trim().length >= 2;

  return (
    <Box sx={{ mt: 1.5 }}>
      <TextField
        size="small"
        placeholder="Search Material Code, Description or Location Code"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        fullWidth
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
          },
        }}
        sx={{
          mb: 2,
          "& .MuiOutlinedInput-root": {
            borderRadius: 2,
            bgcolor: "background.paper",
          },
        }}
      />

      {isSearchMode ? (
        searching ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : searchResults.length === 0 ? (
          <Card variant="outlined" sx={{ p: 3, textAlign: "center", borderRadius: 2 }}>
            <Typography variant="body2" color="text.secondary">
              No materials found.
            </Typography>
          </Card>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {searchResults.map((row) => (
              <Card
                key={row.material_code}
                variant="outlined"
                sx={{ borderRadius: 2 }}
              >
                <CardActionArea
                  onClick={() => onSelectMaterial(row.material_code)}
                  sx={{ p: 1.25 }}
                >
                  <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 700, fontSize: "0.9rem" }} noWrap>
                        {row.material_code}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {row.short_description}
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                      <Typography sx={{ fontWeight: 800 }} color="primary.main">
                        {row.currentStock}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {row.uom}
                      </Typography>
                    </Box>
                  </Box>
                </CardActionArea>
              </Card>
            ))}
          </Box>
        )
      ) : (
        <>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1 }}>
            <HistoryIcon fontSize="small" color="action" />
            <Typography sx={{ fontWeight: 700, fontSize: "0.9rem" }}>
              Recent Activity
            </Typography>
          </Box>

          {loadingRecent ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress size={24} />
            </Box>
          ) : recentActivity.length === 0 ? (
            <Card variant="outlined" sx={{ p: 3, textAlign: "center", borderRadius: 2 }}>
              <Typography variant="body2" color="text.secondary">
                No inventory transactions recorded yet.
              </Typography>
            </Card>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {recentActivity.map((row) => {
                const badge =
                  TRANSACTION_BADGE[row.lastTransactionType] ??
                  TRANSACTION_BADGE.OPENING_STOCK;

                return (
                  <Card
                    key={row.material_code}
                    variant="outlined"
                    sx={{ borderRadius: 2 }}
                  >
                    <CardActionArea
                      onClick={() => onSelectMaterial(row.material_code)}
                      sx={{ p: 1.25 }}
                    >
                      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 700, fontSize: "0.9rem" }} noWrap>
                            {row.material_code}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" noWrap>
                            {row.short_description}
                          </Typography>
                        </Box>
                        <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                          <Typography sx={{ fontWeight: 800 }} color="primary.main">
                            {row.currentStock}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {row.uom}
                          </Typography>
                        </Box>
                      </Box>

                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          mt: 0.75,
                        }}
                      >
                        <Chip
                          size="small"
                          label={badge.label}
                          sx={{
                            fontWeight: 700,
                            bgcolor: badge.bg,
                            color: badge.color,
                          }}
                        />
                        <Typography variant="caption" color="text.secondary">
                          {formatDateTime(row.lastTransactionTime)}
                        </Typography>
                      </Box>

                      {row.locationDisplay && (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.4, mt: 0.5 }}>
                          <PlaceIcon sx={{ fontSize: 14 }} color="action" />
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {row.locationDisplay}
                          </Typography>
                        </Box>
                      )}
                    </CardActionArea>
                  </Card>
                );
              })}
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
