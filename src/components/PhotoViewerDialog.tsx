import { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";

import RotateLeftIcon from "@mui/icons-material/RotateLeft";
import RotateRightIcon from "@mui/icons-material/RotateRight";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import DownloadIcon from "@mui/icons-material/Download";
import CloseIcon from "@mui/icons-material/Close";
import PanToolIcon from "@mui/icons-material/PanTool";

export interface PhotoViewerDialogProps {
  open: boolean;
  onClose: () => void;
  imageUrl: string | null | undefined;
  title?: string;
  subtitle?: string;
  reservationNo?: string | null;
  createdBy?: string | null;
  department?: string | null;
  date?: string | null;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4.0;
const ZOOM_STEP = 0.25;

export default function PhotoViewerDialog({
  open,
  onClose,
  imageUrl,
  title = "SAP Reservation Photograph",
  subtitle,
  reservationNo,
  createdBy,
  department,
  date,
}: PhotoViewerDialogProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Reset transforms whenever modal opens or new image is viewed
  useEffect(() => {
    if (open) {
      setZoom(1);
      setRotation(0);
      setPan({ x: 0, y: 0 });
      setIsDragging(false);
    }
  }, [open, imageUrl]);

  function handleRotateLeft() {
    setRotation((prev) => (prev - 90 + 360) % 360);
  }

  function handleRotateRight() {
    setRotation((prev) => (prev + 90) % 360);
  }

  function handleZoomIn() {
    setZoom((prev) => Math.min(MAX_ZOOM, Number((prev + ZOOM_STEP).toFixed(2))));
  }

  function handleZoomOut() {
    setZoom((prev) => Math.max(MIN_ZOOM, Number((prev - ZOOM_STEP).toFixed(2))));
  }

  function handleReset() {
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
  }

  // Mouse drag handlers
  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...pan };
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: panStartRef.current.x + dx,
      y: panStartRef.current.y + dy,
    });
  }

  function handleMouseUp() {
    setIsDragging(false);
  }

  // Touch drag handlers for mobile
  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 1) {
      setIsDragging(true);
      dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      panStartRef.current = { ...pan };
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!isDragging || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - dragStartRef.current.x;
    const dy = e.touches[0].clientY - dragStartRef.current.y;
    setPan({
      x: panStartRef.current.x + dx,
      y: panStartRef.current.y + dy,
    });
  }

  function handleTouchEnd() {
    setIsDragging(false);
  }

  // Wheel zoom handler
  function handleWheel(e: React.WheelEvent) {
    if (e.deltaY < 0) {
      handleZoomIn();
    } else if (e.deltaY > 0) {
      handleZoomOut();
    }
  }

  async function handleDownload() {
    if (!imageUrl) return;
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeReservation = reservationNo
        ? `Reservation_${reservationNo}`
        : "Reservation_Slip";
      a.download = `${safeReservation}.jpg`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      window.open(imageUrl, "_blank");
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            bgcolor: "#0b0f17",
            color: "#f8fafc",
            borderRadius: { xs: 1.5, sm: 2.5 },
            overflow: "hidden",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.75)",
            maxHeight: "94vh",
            display: "flex",
            flexDirection: "column",
          },
        },
      }}
    >
      {/* Top Header */}
      <DialogTitle
        sx={{
          m: 0,
          p: { xs: 1.5, sm: 2 },
          bgcolor: "#111827",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="subtitle1"
            sx={{ fontWeight: 800, color: "#f8fafc", fontSize: { xs: "0.95rem", sm: "1.1rem" } }}
          >
            {title}
          </Typography>
          <Box
            sx={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              flexWrap: "wrap",
              mt: 0.5,
              gap: 0.75,
            }}
          >
            {reservationNo && (
              <Chip
                size="small"
                label={`Reservation: ${reservationNo}`}
                sx={{
                  bgcolor: "rgba(59, 130, 246, 0.2)",
                  color: "#93c5fd",
                  fontWeight: 700,
                  fontSize: "0.75rem",
                  border: "1px solid rgba(59, 130, 246, 0.3)",
                }}
              />
            )}
            {createdBy && (
              <Chip
                size="small"
                label={`Created By: ${createdBy}`}
                sx={{
                  bgcolor: "rgba(255, 255, 255, 0.08)",
                  color: "#e2e8f0",
                  fontSize: "0.72rem",
                }}
              />
            )}
            {department && (
              <Chip
                size="small"
                label={department}
                sx={{
                  bgcolor: "rgba(255, 255, 255, 0.08)",
                  color: "#cbd5e1",
                  fontSize: "0.72rem",
                }}
              />
            )}
            {date && (
              <Typography variant="caption" sx={{ color: "#94a3b8" }}>
                {date}
              </Typography>
            )}
            {subtitle && (
              <Typography variant="caption" sx={{ color: "#94a3b8" }}>
                {subtitle}
              </Typography>
            )}
          </Box>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, ml: "auto" }}>
          {imageUrl && (
            <>
              <Tooltip title="Download Photo">
                <IconButton
                  size="small"
                  onClick={handleDownload}
                  sx={{ color: "#94a3b8", "&:hover": { color: "#fff", bgcolor: "rgba(255,255,255,0.1)" } }}
                >
                  <DownloadIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Open in new window">
                <IconButton
                  size="small"
                  component="a"
                  href={imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ color: "#94a3b8", "&:hover": { color: "#fff", bgcolor: "rgba(255,255,255,0.1)" } }}
                >
                  <OpenInNewIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
          <IconButton
            size="small"
            aria-label="close"
            onClick={onClose}
            sx={{ color: "#94a3b8", "&:hover": { color: "#fff", bgcolor: "rgba(255,255,255,0.1)" } }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </DialogTitle>

      {/* Floating Toolbar for Rotation, Zoom, and Pan Controls */}
      <Box
        sx={{
          bgcolor: "#1e293b",
          px: { xs: 1.5, sm: 2 },
          py: 1,
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 1,
          zIndex: 2,
        }}
      >
        {/* Rotation Controls */}
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
          <Typography variant="caption" sx={{ color: "#94a3b8", fontWeight: 600, mr: 0.5, display: { xs: "none", sm: "inline" } }}>
            Rotate:
          </Typography>
          <Tooltip title="Rotate 90° Counter-Clockwise (Left)">
            <Button
              size="small"
              variant="outlined"
              onClick={handleRotateLeft}
              startIcon={<RotateLeftIcon fontSize="small" />}
              sx={{
                color: "#e2e8f0",
                borderColor: "rgba(255,255,255,0.2)",
                bgcolor: "rgba(255,255,255,0.05)",
                textTransform: "none",
                fontWeight: 600,
                fontSize: "0.75rem",
                py: 0.5,
                px: { xs: 1, sm: 1.5 },
                "&:hover": { borderColor: "#38bdf8", bgcolor: "rgba(56,189,248,0.1)" },
              }}
            >
              Left 90°
            </Button>
          </Tooltip>
          <Tooltip title="Rotate 90° Clockwise (Right)">
            <Button
              size="small"
              variant="outlined"
              onClick={handleRotateRight}
              startIcon={<RotateRightIcon fontSize="small" />}
              sx={{
                color: "#e2e8f0",
                borderColor: "rgba(255,255,255,0.2)",
                bgcolor: "rgba(255,255,255,0.05)",
                textTransform: "none",
                fontWeight: 600,
                fontSize: "0.75rem",
                py: 0.5,
                px: { xs: 1, sm: 1.5 },
                "&:hover": { borderColor: "#38bdf8", bgcolor: "rgba(56,189,248,0.1)" },
              }}
            >
              Right 90°
            </Button>
          </Tooltip>
          {rotation !== 0 && (
            <Chip
              size="small"
              label={`${rotation}°`}
              sx={{ bgcolor: "rgba(56,189,248,0.2)", color: "#38bdf8", fontWeight: 700, fontSize: "0.7rem", height: 24 }}
            />
          )}
        </Stack>

        {/* Zoom & Reset Controls */}
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
          <Tooltip title="Zoom Out (-)">
            <span>
              <IconButton
                size="small"
                onClick={handleZoomOut}
                disabled={zoom <= MIN_ZOOM}
                sx={{
                  color: "#e2e8f0",
                  bgcolor: "rgba(255,255,255,0.08)",
                  "&:hover": { bgcolor: "rgba(255,255,255,0.15)" },
                  "&.Mui-disabled": { color: "#475569" },
                }}
              >
                <ZoomOutIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

          <Chip
            size="small"
            label={`${Math.round(zoom * 100)}%`}
            sx={{
              bgcolor: "rgba(255,255,255,0.12)",
              color: "#f8fafc",
              fontWeight: 700,
              fontSize: "0.75rem",
              minWidth: 54,
            }}
          />

          <Tooltip title="Zoom In (+)">
            <span>
              <IconButton
                size="small"
                onClick={handleZoomIn}
                disabled={zoom >= MAX_ZOOM}
                sx={{
                  color: "#e2e8f0",
                  bgcolor: "rgba(255,255,255,0.08)",
                  "&:hover": { bgcolor: "rgba(255,255,255,0.15)" },
                  "&.Mui-disabled": { color: "#475569" },
                }}
              >
                <ZoomInIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip title="Reset Zoom & Orientation">
            <Button
              size="small"
              onClick={handleReset}
              startIcon={<RestartAltIcon fontSize="small" />}
              disabled={zoom === 1 && rotation === 0 && pan.x === 0 && pan.y === 0}
              sx={{
                ml: 1,
                color: "#94a3b8",
                textTransform: "none",
                fontSize: "0.75rem",
                "&:hover": { color: "#fff" },
                "&.Mui-disabled": { color: "#475569" },
              }}
            >
              Reset
            </Button>
          </Tooltip>
        </Stack>
      </Box>

      {/* Main Image Canvas */}
      <DialogContent
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        sx={{
          p: 2,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          bgcolor: "#030712",
          minHeight: { xs: "50vh", sm: "65vh" },
          maxHeight: "75vh",
          userSelect: "none",
          cursor: isDragging ? "grabbing" : zoom > 1 ? "grab" : "default",
        }}
      >
        {imageUrl ? (
          <Box
            component="img"
            src={imageUrl}
            alt="SAP Reservation Photograph"
            draggable={false}
            sx={{
              maxWidth: rotation % 180 !== 0 ? "70vh" : "100%",
              maxHeight: rotation % 180 !== 0 ? "85vw" : "68vh",
              objectFit: "contain",
              transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${zoom})`,
              transformOrigin: "center center",
              transition: isDragging ? "none" : "transform 0.18s cubic-bezier(0.2, 0, 0, 1)",
              pointerEvents: "auto",
              boxShadow: "0 10px 30px rgba(0,0,0,0.8)",
              borderRadius: 1,
            }}
          />
        ) : (
          <Typography variant="body2" color="text.secondary">
            No photograph available.
          </Typography>
        )}

        {/* Floating pan hint when zoomed */}
        {zoom > 1 && (
          <Box
            sx={{
              position: "absolute",
              bottom: 12,
              left: "50%",
              transform: "translateX(-50%)",
              bgcolor: "rgba(15, 23, 42, 0.8)",
              backdropFilter: "blur(4px)",
              color: "#cbd5e1",
              px: 1.5,
              py: 0.5,
              borderRadius: 5,
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              fontSize: "0.72rem",
              pointerEvents: "none",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <PanToolIcon sx={{ fontSize: 13, color: "#38bdf8" }} />
            Click & drag to pan around image
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
