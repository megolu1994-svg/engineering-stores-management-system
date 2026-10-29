import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";

import {
  Button,
  CircularProgress,
  IconButton,
  Typography,
} from "@mui/material";

import CloseIcon from "@mui/icons-material/Close";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
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

const OXO_STOREKEEPER_IDS = new Set(["00511044", "00058806"]);

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
  const isOxoStorekeeper = Boolean(row.user_name && OXO_STOREKEEPER_IDS.has(row.user_name.trim()));

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
        border: isOxoStorekeeper ? `1.5px solid #86EFAC` : `1px solid ${C.border}`,
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
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <CalendarMonthOutlinedIcon sx={{ fontSize: 15, color: C.slate }} />
            <span style={{ fontSize: "12.5px", fontWeight: 600, color: C.slate }}>
              {formatCardDate(row.posting_date)}
            </span>
            {isOxoStorekeeper && (
              <span
                style={{
                  backgroundColor: "#DCFCE7",
                  color: "#166534",
                  borderRadius: "6px",
                  paddingLeft: 6,
                  paddingRight: 6,
                  paddingTop: 1,
                  paddingBottom: 1,
                  fontSize: "11px",
                  fontWeight: 700,
                }}
              >
                Oxo Storekeeper
              </span>
            )}
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
            backgroundColor: isOxoStorekeeper ? "#F0FDF4" : "#F8FAFC",
            borderRadius: "8px",
            paddingLeft: 8,
            paddingRight: 8,
            paddingTop: 6,
            paddingBottom: 6,
            border: isOxoStorekeeper ? "1px solid #DCFCE7" : "none",
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
              <PersonOutlinedIcon sx={{ fontSize: 11, color: isOxoStorekeeper ? "#16A34A" : C.slate }} />
              <span style={{ fontSize: "10px", color: isOxoStorekeeper ? "#166534" : C.slate, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>
                User {isOxoStorekeeper ? "(Oxo)" : ""}
              </span>
            </div>
            <div title={row.user_name ?? undefined} style={{ fontSize: "12px", color: isOxoStorekeeper ? "#166534" : C.navy, fontWeight: isOxoStorekeeper ? 700 : 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
  returnToReviewId?: number;
}

/**
 * A popup that shows the SAP Material History (MB51) for a single material
 * directly on screen, with a clear "Back to Review & Make Changes" action
 * and Oxo storekeeper analysis so storekeepers can audit before saving stock changes.
 */
export default function SapMaterialHistoryPopup({
  open,
  onClose,
  materialCode,
  returnToReviewId,
}: Props) {
  const navigate = useNavigate();

  const [docs, setDocs] = useState<SapDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filterOxoOnly, setFilterOxoOnly] = useState(false);

  useEffect(() => {
    if (!open || !materialCode) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setExpandedId(null);
      try {
        const result = await getSapHistoryPage({ materialCode, page: 0, pageSize: 150 });
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
    return () => {
      cancelled = true;
    };
  }, [open, materialCode]);

  const handleToggle = useCallback((id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  // Oxo Unit calculations from MB51 transactions
  const oxoDocs = useMemo(() => {
    return docs.filter((d) => d.user_name && OXO_STOREKEEPER_IDS.has(d.user_name.trim()));
  }, [docs]);

  const oxoNetQty = useMemo(() => {
    const sum = oxoDocs.reduce((acc, d) => acc + (Number(d.quantity) || 0), 0);
    return Math.round(sum * 1000) / 1000;
  }, [oxoDocs]);

  const oxoInward = useMemo(() => {
    const sum = oxoDocs
      .filter((d) => (Number(d.quantity) || 0) > 0)
      .reduce((acc, d) => acc + (Number(d.quantity) || 0), 0);
    return Math.round(sum * 1000) / 1000;
  }, [oxoDocs]);

  const oxoOutward = useMemo(() => {
    const sum = oxoDocs
      .filter((d) => (Number(d.quantity) || 0) < 0)
      .reduce((acc, d) => acc + Math.abs(Number(d.quantity) || 0), 0);
    return Math.round(sum * 1000) / 1000;
  }, [oxoDocs]);

  const displayDocs = filterOxoOnly ? oxoDocs : docs;

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
        zIndex: 1500, // Higher than MUI Dialog (1300) so it cleanly overlays over the review screen
        backgroundColor: "#FFFFFF",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
      }}
    >
      {/* Header with Navigation and Return button */}
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
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flexWrap: "wrap" }}>
          <Button
            variant="contained"
            size="small"
            startIcon={<ArrowBackIcon />}
            onClick={onClose}
            sx={{
              fontWeight: 800,
              borderRadius: 2,
              textTransform: "none",
              fontSize: "13px",
              bgcolor: "#2563EB",
              boxShadow: "0 2px 8px rgba(37,99,235,0.25)",
              "&:hover": { bgcolor: "#1D4ED8" },
              whiteSpace: "nowrap",
            }}
          >
            ← Back to Review & Make Changes
          </Button>

          <div>
            <Typography sx={{ fontWeight: 800, fontSize: "16px", color: C.navy }}>
              SAP Material History · {materialCode}
            </Typography>
            <Typography sx={{ fontSize: "12px", color: C.slate }}>
              {total} total records in MB51 {oxoDocs.length > 0 ? `· ${oxoDocs.length} by Oxo Unit` : ""}
            </Typography>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {returnToReviewId && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<OpenInNewIcon sx={{ fontSize: 15 }} />}
              onClick={() => {
                onClose();
                navigate(`/sap-history?material=${materialCode}&returnToReview=${returnToReviewId}`);
              }}
              sx={{
                fontWeight: 600,
                borderRadius: 2,
                textTransform: "none",
                fontSize: "12px",
                color: C.navy,
                borderColor: C.border,
                display: { xs: "none", sm: "inline-flex" },
                "&:hover": { bgcolor: "#F1F5F9" },
              }}
            >
              Open Full Page
            </Button>
          )}

          <IconButton onClick={onClose} size="small" sx={{ color: C.slate }} title="Close and return to review">
            <CloseIcon fontSize="small" />
          </IconButton>
        </div>
      </div>

      {/* Oxo Unit Summary Banner */}
      {docs.length > 0 && (
        <div
          style={{
            padding: "10px 16px",
            backgroundColor: "#F0FDF4",
            borderBottom: "1px solid #DCFCE7",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#166534" }}>
              Oxo Unit History (IDs: 00511044 & 00058806):
            </span>
            <span style={{ fontSize: "13px", color: "#15803D" }}>
              Net Stock from MB51: <strong style={{ fontSize: "14px", color: "#166534" }}>{oxoNetQty} Qty</strong> (Inward: +{oxoInward} · Outward: -{oxoOutward})
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={() => setFilterOxoOnly(false)}
              style={{
                border: "none",
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                backgroundColor: !filterOxoOnly ? "#2563EB" : "#E2E8F0",
                color: !filterOxoOnly ? "#FFFFFF" : "#475569",
              }}
            >
              All Records ({docs.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterOxoOnly(true)}
              style={{
                border: "none",
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
                backgroundColor: filterOxoOnly ? "#16A34A" : "#E2E8F0",
                color: filterOxoOnly ? "#FFFFFF" : "#475569",
              }}
            >
              Oxo Unit Only ({oxoDocs.length})
            </button>
          </div>
        </div>
      )}

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
        ) : displayDocs.length === 0 ? (
          <div style={{ padding: 36, textAlign: "center" }}>
            <Typography variant="body2" sx={{ color: C.slate, fontWeight: 600 }}>
              {filterOxoOnly
                ? "No MB51 transactions found for Oxo Unit storekeepers (00511044 / 00058806)."
                : "No SAP history records found for this material."}
            </Typography>
            {filterOxoOnly && (
              <Button
                size="small"
                variant="outlined"
                onClick={() => setFilterOxoOnly(false)}
                sx={{ mt: 1.5, textTransform: "none", borderRadius: 2 }}
              >
                View all Plant 9035 postings ({docs.length})
              </Button>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {displayDocs.map((doc) => (
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
