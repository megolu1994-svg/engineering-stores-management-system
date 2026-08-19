import { useCallback, useEffect, useState } from "react";

import {
  Box,
  CircularProgress,
  Dialog,
  IconButton,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";

import CloseIcon from "@mui/icons-material/Close";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import SwapHorizOutlinedIcon from "@mui/icons-material/SwapHorizOutlined";
import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import ReceiptOutlinedIcon from "@mui/icons-material/ReceiptOutlined";
import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Paper } from "@mui/material";

import {
  getSapHistoryPage,
  type SapDocument,
} from "../services/sapHistoryService";
import { getMovementTypeDescription } from "../utils/sapMovementTypes";

/* -- Palette -- */
const C = {
  primary: "#2563EB",
  navy: "#172554",
  slate: "#64748B",
  border: "#E2E8F0",
  headerBg: "#F8FAFC",
  headerText: "#1D4ED8",
  green: "#15803D",
  orange: "#EA580C",
  red: "#DC2626",
};

const SEC = {
  material: { bg: "#F5F3FF", fg: "#7C3AED", border: "#EDE9FE" },
  document: { bg: "#EFF6FF", fg: "#2563EB", border: "#DBEAFE" },
  org: { bg: "#F0FDF4", fg: "#16A34A", border: "#DCFCE7" },
  movement: { bg: "#FFF7ED", fg: "#EA580C", border: "#FFEDD5" },
};

/* -- Helpers -- */

function movementBadgeColors(mvt: string | null): { bg: string; fg: string } {
  const t = (mvt ?? "").trim();
  if (/^[15]/.test(t)) return { bg: "#DCFCE7", fg: C.green };
  if (/^[2789]/.test(t)) return { bg: "#FFEDD5", fg: C.orange };
  return { bg: "#DBEAFE", fg: C.headerText };
}

function formatCardDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[Number(m) - 1] ?? m;
  return `${Number(d)}-${month}-${y}`;
}

function movementLabel(row: SapDocument): string {
  if (!row.movement_type) return "Movement";
  const description = getMovementTypeDescription(row.movement_type);
  return description ? `${row.movement_type} - ${description}` : `Mvt ${row.movement_type}`;
}

/* -- Small field helpers for the expanded card -- */

function FieldRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  if (!value) return null;
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0.5, py: 0.35 }}>
      <Typography sx={{ fontSize: "11.5px", color: C.slate, fontWeight: 500 }}>
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: "12px",
          color: valueColor ?? C.navy,
          fontWeight: 600,
          wordBreak: "break-word",
          textAlign: "right",
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function SectionCard({
  title,
  icon,
  color,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  color: { bg: string; fg: string; border: string };
  children: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        bgcolor: color.bg,
        border: `1px solid ${color.border}`,
        borderRadius: "8px",
        p: 1.25,
        minWidth: 0,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.75 }}>
        <Box sx={{ color: color.fg, fontSize: "14px", display: "flex" }}>{icon}</Box>
        <Typography sx={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: color.fg }}>
          {title}
        </Typography>
      </Box>
      {children}
    </Box>
  );
}

/* -- Single expandable history card -- */

function HistoryCard({
  row,
  expanded,
  onToggle,
}: {
  row: SapDocument;
  expanded: boolean;
  onToggle: () => void;
}) {
  const badge = movementBadgeColors(row.movement_type);
  const label = movementLabel(row);
  const qtyPositive = row.quantity >= 0;
  const unit = row.unit_of_entry ? ` ${row.unit_of_entry}` : "";
  const importedAt = row.imported_at ? new Date(row.imported_at).toLocaleString() : "";
  const docStr = row.material_document
    ? row.material_doc_item
      ? `${row.material_document} / ${row.material_doc_item}`
      : row.material_document
    : "";

  return (
    <Paper
      elevation={0}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      sx={{
        borderRadius: "12px",
        border: `1px solid ${C.border}`,
        boxShadow: expanded ? "0 2px 8px rgba(0,0,0,0.06)" : "0 1px 3px rgba(0,0,0,0.04)",
        cursor: "pointer",
        width: "100%",
        overflow: "hidden",
        transition: "box-shadow 0.15s ease",
        "&:active": { bgcolor: C.headerBg },
      }}
    >
      {/* COLLAPSED HEADER */}
      <Box sx={{ p: 1.25, pb: expanded ? 1.25 : 1.5 }}>
        {/* Row 1: date + expand arrow */}
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <CalendarMonthOutlinedIcon sx={{ fontSize: 15, color: C.slate }} />
            <Typography sx={{ fontSize: "12.5px", fontWeight: 600, color: C.slate }}>
              {formatCardDate(row.posting_date)}
            </Typography>
          </Box>
          <ExpandMoreIcon
            sx={{
              color: C.slate,
              fontSize: 20,
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.15s ease",
            }}
          />
        </Box>

        {/* Row 2: material code + quantity badge */}
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: 0.25 }}>
          <Typography sx={{ fontSize: "16px", fontWeight: 700, color: C.primary, wordBreak: "break-word" }}>
            {row.material_code}
          </Typography>
          <Box
            sx={{
              flexShrink: 0,
              bgcolor: qtyPositive ? "#DCFCE7" : "#FEE2E2",
              color: qtyPositive ? C.green : C.red,
              borderRadius: "8px",
              px: 1.25,
              py: 0.4,
              fontSize: "13px",
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            {qtyPositive ? "+" : ""}{row.quantity}{unit}
          </Box>
        </Box>

        {/* Row 3: description */}
        {row.material_description ? (
          <Typography
            sx={{
              fontSize: "13px",
              color: C.navy,
              lineHeight: 1.35,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              mb: 0.75,
            }}
          >
            {row.material_description}
          </Typography>
        ) : null}

        {/* Row 4: movement type + storage location chips */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap", mb: 0.75 }}>
          <Box
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.4,
              bgcolor: badge.bg,
              color: badge.fg,
              borderRadius: "6px",
              px: 0.85,
              py: 0.3,
              fontSize: "11px",
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            <SwapHorizOutlinedIcon sx={{ fontSize: 13 }} />
            {label}
          </Box>
          {row.storage_location ? (
            <Box
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.4,
                bgcolor: "#EDE9FE",
                color: "#7C3AED",
                borderRadius: "6px",
                px: 0.85,
                py: 0.3,
                fontSize: "11px",
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              <LocationOnOutlinedIcon sx={{ fontSize: 13 }} />
              {row.storage_location}
            </Box>
          ) : null}
        </Box>

        {/* Row 5: vendor / invoice / user */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 0.5,
            bgcolor: "#F8FAFC",
            borderRadius: "8px",
            px: 1,
            py: 0.75,
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.3, mb: 0.15 }}>
              <BusinessOutlinedIcon sx={{ fontSize: 11, color: C.slate }} />
              <Typography sx={{ fontSize: "10px", color: C.slate, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>Vendor</Typography>
            </Box>
            <Typography noWrap title={row.vendor ?? undefined} sx={{ fontSize: "12px", color: C.navy, fontWeight: 600, minWidth: 0 }}>
              {row.vendor || "—"}
            </Typography>
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.3, mb: 0.15 }}>
              <ReceiptOutlinedIcon sx={{ fontSize: 11, color: C.slate }} />
              <Typography sx={{ fontSize: "10px", color: C.slate, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>Invoice</Typography>
            </Box>
            <Typography noWrap title={row.invoice_number ?? undefined} sx={{ fontSize: "12px", color: C.navy, fontWeight: 600, minWidth: 0 }}>
              {row.invoice_number || "—"}
            </Typography>
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.3, mb: 0.15 }}>
              <PersonOutlinedIcon sx={{ fontSize: 11, color: C.slate }} />
              <Typography sx={{ fontSize: "10px", color: C.slate, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>User</Typography>
            </Box>
            <Typography noWrap title={row.user_name ?? undefined} sx={{ fontSize: "12px", color: C.navy, fontWeight: 600, minWidth: 0 }}>
              {row.user_name || "—"}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* EXPANDED DETAILS */}
      {expanded ? (
        <Box sx={{ px: 1.25, pb: 1.25 }}>
          <Box sx={{ borderTop: `1px solid ${C.border}`, mb: 1 }} />
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0.75, mb: 1 }}>
            <SectionCard title="Material" icon={<Inventory2OutlinedIcon sx={{ fontSize: 14 }} />} color={SEC.material}>
              <FieldRow label="Material Code" value={row.material_code} />
              <FieldRow label="Description" value={row.material_description ?? ""} />
              <FieldRow label="Item" value={row.item ?? ""} />
            </SectionCard>
            <SectionCard title="Document" icon={<InsertDriveFileOutlinedIcon sx={{ fontSize: 14 }} />} color={SEC.document}>
              <FieldRow label="Doc" value={docStr} />
              <FieldRow label="Doc Header Text" value={row.document_header_text ?? ""} />
              <FieldRow label="PO" value={row.purchase_order ?? ""} />
              <FieldRow label="Invoice" value={row.invoice_number ?? ""} />
            </SectionCard>
            <SectionCard title="Organizational" icon={<LocationOnOutlinedIcon sx={{ fontSize: 14 }} />} color={SEC.org}>
              <FieldRow label="Storage Location" value={row.storage_location} />
              <FieldRow label="User" value={row.user_name ?? ""} />
              <FieldRow label="Special Stock" value={row.special_stock ?? ""} />
            </SectionCard>
            <SectionCard title="Movement" icon={<SwapHorizOutlinedIcon sx={{ fontSize: 14 }} />} color={SEC.movement}>
              <FieldRow label="Movement Type" value={movementLabel(row)} />
              <FieldRow label="Quantity" value={`${qtyPositive ? "+" : ""}${row.quantity}${unit}`} valueColor={qtyPositive ? C.green : C.red} />
              <FieldRow label="Running Balance" value={`${row.running_balance}${unit}`} valueColor={C.primary} />
            </SectionCard>
          </Box>
          {/* Footer strip */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1,
              bgcolor: "#FFFBEB",
              borderRadius: "8px",
              px: 1.25,
              py: 0.75,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <CalendarMonthOutlinedIcon sx={{ fontSize: 14, color: C.orange }} />
              <Box>
                <Typography sx={{ fontSize: "9.5px", color: C.slate, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>Posting Date</Typography>
                <Typography sx={{ fontSize: "12px", color: C.navy, fontWeight: 600 }}>{formatCardDate(row.posting_date)}</Typography>
              </Box>
            </Box>
            {importedAt ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <AccessTimeOutlinedIcon sx={{ fontSize: 14, color: C.slate }} />
                <Box sx={{ textAlign: "right" }}>
                  <Typography sx={{ fontSize: "9.5px", color: C.slate, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>Imported At</Typography>
                  <Typography sx={{ fontSize: "11.5px", color: C.navy, fontWeight: 500 }}>{importedAt}</Typography>
                </Box>
              </Box>
            ) : null}
          </Box>
        </Box>
      ) : null}
    </Paper>
  );
}

/* ====================================================================== */
/* PUBLIC COMPONENT – full-screen mobile dialog for a single material     */
/* ====================================================================== */

interface Props {
  open: boolean;
  onClose: () => void;
  materialCode: string;
}

/**
 * A mobile-friendly popup that shows the SAP Material History (MB51)
 * for a single material without navigating away from the current screen.
 * Opens as a full-screen Dialog on mobile. Desktop also works but the
 * real use-case is mobile where navigating away loses task context.
 */
export default function SapMaterialHistoryPopup({ open, onClose, materialCode }: Props) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [docs, setDocs] = useState<SapDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !materialCode) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setExpandedId(null);
      try {
        const result = await getSapHistoryPage({ materialCode, page: 0, pageSize: 100 });
        if (cancelled) return;
        setDocs(result.docs);
        setTotal(result.total);
        if (result.error) setError(result.error);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load history");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [open, materialCode]);

  const handleToggle = useCallback((id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={isMobile}
      maxWidth="md"
      fullWidth
      slotProps={{
        paper: {
          sx: isMobile
            ? { borderRadius: 0, height: "100%", maxHeight: "100%" }
            : { borderRadius: "16px", maxHeight: "85vh" },
        },
      }}
    >
      {/* Header – plain Box, not DialogTitle */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1.5,
          borderBottom: `1px solid ${C.border}`,
          bgcolor: "#F8FAFC",
          flexShrink: 0,
        }}
      >
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: "16px", color: C.navy }}>
            SAP Material History
          </Typography>
          <Typography sx={{ fontSize: "12px", color: C.slate, mt: 0.25 }}>
            {materialCode} · {total} record{total !== 1 ? "s" : ""}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ color: C.slate }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Body – plain Box, not DialogContent */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          p: 1.5,
          display: "flex",
          flexDirection: "column",
          gap: 1,
        }}
      >
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress size={32} sx={{ color: C.primary }} />
          </Box>
        ) : error ? (
          <Box sx={{ p: 3 }}>
            <Typography sx={{ color: C.red, fontSize: "13px" }}>{error}</Typography>
          </Box>
        ) : docs.length === 0 ? (
          <Box sx={{ p: 3, textAlign: "center" }}>
            <Typography sx={{ color: C.slate, fontSize: "13px" }}>
              No SAP history records found for this material.
            </Typography>
          </Box>
        ) : (
          docs.map((doc) => (
            <HistoryCard
              key={doc.id}
              row={doc}
              expanded={expandedId === doc.id}
              onToggle={() => handleToggle(doc.id)}
            />
          ))
        )}
      </Box>
    </Dialog>
  );
}
