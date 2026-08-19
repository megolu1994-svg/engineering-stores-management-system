import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import {
  CircularProgress,
  IconButton,
  Typography,
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
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: "3.5px 0" }}>
      <span style={{ fontSize: "11.5px", color: C.slate, fontWeight: 500 }}>
        {label}
      </span>
      <span
        style={{
          fontSize: "12px",
          color: valueColor ?? C.navy,
          fontWeight: 600,
          wordBreak: "break-word",
          textAlign: "right",
        }}
      >
        {value}
      </span>
    </div>
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
    <div
      style={{
        backgroundColor: color.bg,
        border: `1px solid ${color.border}`,
        borderRadius: "8px",
        padding: "10px",
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
        <span style={{ color: color.fg, fontSize: "14px", display: "flex" }}>{icon}</span>
        <span style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" as const, color: color.fg }}>
          {title}
        </span>
      </div>
      {children}
    </div>
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
    <div
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
      style={{
        borderRadius: "12px",
        border: `1px solid ${C.border}`,
        boxShadow: expanded ? "0 2px 8px rgba(0,0,0,0.06)" : "0 1px 3px rgba(0,0,0,0.04)",
        cursor: "pointer",
        width: "100%",
        overflow: "hidden",
        backgroundColor: "#FFFFFF",
      }}
    >
      {/* COLLAPSED HEADER */}
      <div style={{ padding: expanded ? "10px 10px 10px 10px" : "10px 10px 12px 10px" }}>
        {/* Row 1: date + expand arrow */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <CalendarMonthOutlinedIcon sx={{ fontSize: 15, color: C.slate }} />
            <span style={{ fontSize: "12.5px", fontWeight: 600, color: C.slate }}>
              {formatCardDate(row.posting_date)}
            </span>
          </div>
          <ExpandMoreIcon
            sx={{
              color: C.slate,
              fontSize: 20,
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.15s ease",
            }}
          />
        </div>

        {/* Row 2: material code + quantity badge */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: "16px", fontWeight: 700, color: C.primary, wordBreak: "break-word" }}>
            {row.material_code}
          </span>
          <div
            style={{
              flexShrink: 0,
              backgroundColor: qtyPositive ? "#DCFCE7" : "#FEE2E2",
              color: qtyPositive ? C.green : C.red,
              borderRadius: "8px",
              paddingLeft: 10,
              paddingRight: 10,
              paddingTop: 3,
              paddingBottom: 3,
              fontSize: "13px",
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            {qtyPositive ? "+" : ""}{row.quantity}{unit}
          </div>
        </div>

        {/* Row 3: description */}
        {row.material_description ? (
          <div
            style={{
              fontSize: "13px",
              color: C.navy,
              lineHeight: 1.35,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              marginBottom: 6,
            }}
          >
            {row.material_description}
          </div>
        ) : null}

        {/* Row 4: movement type + storage location chips */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              backgroundColor: badge.bg,
              color: badge.fg,
              borderRadius: "6px",
              paddingLeft: 7,
              paddingRight: 7,
              paddingTop: 2,
              paddingBottom: 2,
              fontSize: "11px",
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            <SwapHorizOutlinedIcon sx={{ fontSize: 13 }} />
            {label}
          </span>
          {row.storage_location ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                backgroundColor: "#EDE9FE",
                color: "#7C3AED",
                borderRadius: "6px",
                paddingLeft: 7,
                paddingRight: 7,
                paddingTop: 2,
                paddingBottom: 2,
                fontSize: "11px",
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              <LocationOnOutlinedIcon sx={{ fontSize: 13 }} />
              {row.storage_location}
            </span>
          ) : null}
        </div>

        {/* Row 5: vendor / invoice / user */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 4,
            backgroundColor: "#F8FAFC",
            borderRadius: "8px",
            paddingLeft: 8,
            paddingRight: 8,
            paddingTop: 6,
            paddingBottom: 6,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 1 }}>
              <BusinessOutlinedIcon sx={{ fontSize: 11, color: C.slate }} />
              <span style={{ fontSize: "10px", color: C.slate, fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Vendor</span>
            </div>
            <div title={row.vendor ?? undefined} style={{ fontSize: "12px", color: C.navy, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {row.vendor || "—"}
            </div>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 1 }}>
              <ReceiptOutlinedIcon sx={{ fontSize: 11, color: C.slate }} />
              <span style={{ fontSize: "10px", color: C.slate, fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Invoice</span>
            </div>
            <div title={row.invoice_number ?? undefined} style={{ fontSize: "12px", color: C.navy, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {row.invoice_number || "—"}
            </div>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 1 }}>
              <PersonOutlinedIcon sx={{ fontSize: 11, color: C.slate }} />
              <span style={{ fontSize: "10px", color: C.slate, fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>User</span>
            </div>
            <div title={row.user_name ?? undefined} style={{ fontSize: "12px", color: C.navy, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {row.user_name || "—"}
            </div>
          </div>
        </div>
      </div>

      {/* EXPANDED DETAILS */}
      {expanded ? (
        <div style={{ padding: "0 10px 10px 10px" }}>
          <div style={{ borderTop: `1px solid ${C.border}`, marginBottom: 8 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
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
          </div>
          {/* Footer strip */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              backgroundColor: "#FFFBEB",
              borderRadius: "8px",
              paddingLeft: 10,
              paddingRight: 10,
              paddingTop: 6,
              paddingBottom: 6,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <CalendarMonthOutlinedIcon sx={{ fontSize: 14, color: C.orange }} />
              <div>
                <div style={{ fontSize: "9.5px", color: C.slate, fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Posting Date</div>
                <div style={{ fontSize: "12px", color: C.navy, fontWeight: 600 }}>{formatCardDate(row.posting_date)}</div>
              </div>
            </div>
            {importedAt ? (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <AccessTimeOutlinedIcon sx={{ fontSize: 14, color: C.slate }} />
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "9.5px", color: C.slate, fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Imported At</div>
                  <div style={{ fontSize: "11.5px", color: C.navy, fontWeight: 500 }}>{importedAt}</div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ====================================================================== */
/* PUBLIC COMPONENT – full-screen overlay for a single material           */
/* ====================================================================== */

interface Props {
  open: boolean;
  onClose: () => void;
  materialCode: string;
}

/**
 * A mobile-friendly popup that shows the SAP Material History (MB51)
 * for a single material without navigating away from the current screen.
 * Uses a Portal-based full-screen overlay to avoid MUI Dialog rendering
 * issues in fullScreen mode.
 */
export default function SapMaterialHistoryPopup({ open, onClose, materialCode }: Props) {
  const theme = useTheme();

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

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const overlay = (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: theme.zIndex.modal,
        backgroundColor: "#FFFFFF",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: 16,
          paddingRight: 16,
          paddingTop: 12,
          paddingBottom: 12,
          borderBottom: `1px solid ${C.border}`,
          backgroundColor: "#F8FAFC",
          flexShrink: 0,
        }}
      >
        <div>
          <Typography sx={{ fontWeight: 700, fontSize: "16px", color: C.navy }}>
            SAP Material History
          </Typography>
          <Typography sx={{ fontSize: "12px", color: C.slate, mt: 0.25 }}>
            {materialCode} · {total} record{total !== 1 ? "s" : ""}
          </Typography>
        </div>
        <IconButton onClick={onClose} size="small" sx={{ color: C.slate }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </div>

      {/* Scrollable body */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 12,
          WebkitOverflowScrolling: "touch",
        }}
      >
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
            <CircularProgress size={32} sx={{ color: C.primary }} />
          </div>
        ) : error ? (
          <div style={{ padding: 24 }}>
            <span style={{ color: C.red, fontSize: "13px" }}>{error}</span>
          </div>
        ) : docs.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center" }}>
            <span style={{ color: C.slate, fontSize: "13px" }}>
              No SAP history records found for this material.
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {docs.map((doc) => (
              <HistoryCard
                key={doc.id}
                row={doc}
                expanded={expandedId === doc.id}
                onToggle={() => handleToggle(doc.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
