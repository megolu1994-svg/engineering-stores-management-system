import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";

import {
  searchInventory,
  type InventorySearchResult,
} from "../services/inventoryOverviewService";
import MaterialStockDetailsDialog from "./MaterialStockDetailsDialog";

const SEARCH_DEBOUNCE_MS = 300;
const MIN_SEARCH_LENGTH = 2;

/**
 * Global material search shown in the desktop header on every screen
 * (mobile keeps its per-page search fields unchanged).
 *
 * Typing a code, part of a description, or a location code opens a
 * scrollable dropdown of every matching material; selecting one opens the
 * MaterialStockDetailsDialog box instead of navigating anywhere.
 */
export default function GlobalMaterialSearch() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [query, setQuery] = useState("");
  // null while a fetch for the current query is in flight
  const [results, setResults] = useState<InventorySearchResult[] | null>(null);
  // The trimmed query that `results` corresponds to
  const [resultsFor, setResultsFor] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  const trimmed = query.trim();
  const hasQuery = trimmed.length >= MIN_SEARCH_LENGTH;
  const loading = hasQuery && (results === null || resultsFor !== trimmed);
  const showDropdown = hasQuery && !dismissed;

  useEffect(() => {
    if (trimmed.length < MIN_SEARCH_LENGTH) return;

    let cancelled = false;

    const timer = setTimeout(() => {
      searchInventory(trimmed)
        .then((rows) => {
          if (cancelled) return;
          setResults(rows);
          setResultsFor(trimmed);
          setHighlightIndex(0);
        })
        .catch(() => {
          // A failed lookup just shows the empty state - never break the
          // header for a search hiccup.
          if (cancelled) return;
          setResults([]);
          setResultsFor(trimmed);
          setHighlightIndex(0);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed]);

  // Close the dropdown on outside click or Escape while it's open.
  useEffect(() => {
    if (!showDropdown) return;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setDismissed(true);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setDismissed(true);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showDropdown]);

  function handleSelect(code: string) {
    setDismissed(true);
    setSelectedCode(code);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!showDropdown || !results || results.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const safeIndex = Math.min(highlightIndex, results.length - 1);
      handleSelect(results[safeIndex]?.material_code ?? "");
    }
  }

  const visibleResults = showDropdown && !loading ? (results ?? []) : [];
  const safeHighlight = Math.min(
    highlightIndex,
    Math.max(visibleResults.length - 1, 0)
  );

  return (
    <>
      <Box
        ref={containerRef}
        sx={{ position: "relative", width: "100%", maxWidth: 640 }}
      >
        <TextField
          fullWidth
          size="small"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setDismissed(false);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search material code or description..."
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: "primary.main" }} />
                </InputAdornment>
              ),
              endAdornment: query ? (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    aria-label="Clear search"
                    onClick={() => {
                      setQuery("");
                      setDismissed(false);
                    }}
                  >
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
              sx: {
                bgcolor: "background.paper",
                borderRadius: "12px",
                "& fieldset": { border: "none" },
              },
            },
          }}
        />

        {showDropdown && (
          <Paper
            elevation={8}
            sx={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              right: 0,
              zIndex: 1400,
              borderRadius: 2.5,
              maxHeight: 480,
              overflow: "hidden",
            }}
          >
            {loading ? (
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  py: 3,
                  minHeight: 80,
                }}
              >
                <CircularProgress size={24} />
              </Box>
            ) : visibleResults.length === 0 ? (
              <Box sx={{ px: 2, py: 2.5 }}>
                <Typography variant="body2" color="text.secondary">
                  No materials found for &ldquo;{trimmed}&rdquo;.
                </Typography>
              </Box>
            ) : (
              <>
                <Box
                  sx={{
                    px: 1.75,
                    pt: 1.25,
                    pb: 0.75,
                    borderBottom: "1px solid",
                    borderColor: "divider",
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: 1,
                  }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>
                    {visibleResults.length} matching material
                    {visibleResults.length === 1 ? "" : "s"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Scroll or use ↑↓ + Enter
                  </Typography>
                </Box>

                <List disablePadding sx={{ maxHeight: 400, overflowY: "auto" }}>
                  {visibleResults.map((row, index) => (
                    <ListItemButton
                      key={row.material_code}
                      selected={index === safeHighlight}
                      onClick={() => handleSelect(row.material_code)}
                      onMouseEnter={() => setHighlightIndex(index)}
                      sx={{ px: 1.75, py: 1 }}
                    >
                      <ListItemText
                        primary={row.material_code}
                        secondary={row.short_description}
                        slotProps={{
                          primary: { sx: { fontWeight: 700, fontSize: 14 } },
                          secondary: { noWrap: true },
                        }}
                      />
                      <Box sx={{ textAlign: "right", flexShrink: 0, ml: 2 }}>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 800 }}
                          color="primary.main"
                        >
                          {row.currentStock} {row.uom}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          in stock
                        </Typography>
                      </Box>
                    </ListItemButton>
                  ))}
                </List>
              </>
            )}
          </Paper>
        )}
      </Box>

      <MaterialStockDetailsDialog
        materialCode={selectedCode}
        onClose={() => setSelectedCode(null)}
      />
    </>
  );
}
