import { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
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
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import MinimizeIcon from "@mui/icons-material/Minimize";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";

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
  // Image transformation state
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const imageDragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const imagePanStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Floating window position & size state
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [windowSize, setWindowSize] = useState({ width: 680, height: 530 });
  const [windowPos, setWindowPos] = useState({ x: 40, y: 70 });

  // Window drag state
  const [isDraggingWindow, setIsDraggingWindow] = useState(false);
  const windowDragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number }>({
    mouseX: 0,
    mouseY: 0,
    startX: 0,
    startY: 0,
  });

  // Window resize state
  const [isResizingWindow, setIsResizingWindow] = useState(false);
  const resizeStartRef = useRef<{ mouseX: number; mouseY: number; startW: number; startH: number }>({
    mouseX: 0,
    mouseY: 0,
    startW: 0,
    startH: 0,
  });

  // On open or image change, place window conveniently and reset transforms
  useEffect(() => {
    if (open) {
      setZoom(1);
      setRotation(0);
      setPan({ x: 0, y: 0 });
      setIsMinimized(false);
      setIsMaximized(false);

      // Position nicely on the right side if screen allows, else centered
      if (typeof window !== "undefined") {
        const defaultWidth = Math.min(680, window.innerWidth - 40);
        const defaultHeight = Math.min(530, window.innerHeight - 100);
        setWindowSize({ width: defaultWidth, height: defaultHeight });

        const posX = Math.max(16, window.innerWidth - defaultWidth - 28);
        const posY = 75;
        setWindowPos({ x: posX, y: posY });
      }
    }
  }, [open, imageUrl]);

  // Window Drag listener
  useEffect(() => {
    if (!isDraggingWindow) return;

    function handleMouseMove(e: MouseEvent) {
      const dx = e.clientX - windowDragStartRef.current.mouseX;
      const dy = e.clientY - windowDragStartRef.current.mouseY;

      const maxX = Math.max(10, window.innerWidth - 120);
      const maxY = Math.max(10, window.innerHeight - 80);

      setWindowPos({
        x: Math.max(0, Math.min(maxX, windowDragStartRef.current.startX + dx)),
        y: Math.max(0, Math.min(maxY, windowDragStartRef.current.startY + dy)),
      });
    }

    function handleMouseUp() {
      setIsDraggingWindow(false);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingWindow]);

  // Window Resize listener
  useEffect(() => {
    if (!isResizingWindow) return;

    function handleMouseMove(e: MouseEvent) {
      const dx = e.clientX - resizeStartRef.current.mouseX;
      const dy = e.clientY - resizeStartRef.current.mouseY;

      const minW = 380;
      const minH = 320;
      const maxW = Math.max(minW, window.innerWidth - windowPos.x - 10);
      const maxH = Math.max(minH, window.innerHeight - windowPos.y - 10);

      setWindowSize({
        width: Math.max(minW, Math.min(maxW, resizeStartRef.current.startW + dx)),
        height: Math.max(minH, Math.min(maxH, resizeStartRef.current.startH + dy)),
      });
    }

    function handleMouseUp() {
      setIsResizingWindow(false);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingWindow, windowPos]);

  if (!open || !imageUrl) return null;

  function startWindowDrag(e: React.MouseEvent) {
    if (isMaximized) return;
    // Don't drag if user clicked an interactive control
    if ((e.target as HTMLElement).closest("button, a, input, .MuiChip-root")) return;

    setIsDraggingWindow(true);
    windowDragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: windowPos.x,
      startY: windowPos.y,
    };
  }

  function startWindowResize(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingWindow(true);
    resizeStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startW: windowSize.width,
      startH: windowSize.height,
    };
  }

  // Preset size controls
  function applySizePreset(width: number, height: number) {
    setIsMaximized(false);
    setIsMinimized(false);
    const w = Math.min(width, window.innerWidth - 30);
    const h = Math.min(height, window.innerHeight - 80);
    setWindowSize({ width: w, height: h });
  }

  // Image manipulation handlers
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

  // Image pan drag handlers
  function handleImageMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    setIsDraggingImage(true);
    imageDragStartRef.current = { x: e.clientX, y: e.clientY };
    imagePanStartRef.current = { ...pan };
  }

  function handleImageMouseMove(e: React.MouseEvent) {
    if (!isDraggingImage) return;
    const dx = e.clientX - imageDragStartRef.current.x;
    const dy = e.clientY - imageDragStartRef.current.y;
    setPan({
      x: imagePanStartRef.current.x + dx,
      y: imagePanStartRef.current.y + dy,
    });
  }

  function handleImageMouseUp() {
    setIsDraggingImage(false);
  }

  // Touch drag for mobile image pan
  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 1) {
      setIsDraggingImage(true);
      imageDragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      imagePanStartRef.current = { ...pan };
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!isDraggingImage || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - imageDragStartRef.current.x;
    const dy = e.touches[0].clientY - imageDragStartRef.current.y;
    setPan({
      x: imagePanStartRef.current.x + dx,
      y: imagePanStartRef.current.y + dy,
    });
  }

  function handleTouchEnd() {
    setIsDraggingImage(false);
  }

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

  // Minimized dock pill widget (fixed at bottom right so user can work anywhere)
  if (isMinimized) {
    return (
      <Box
        sx={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 1350,
          pointerEvents: "auto",
        }}
      >
        <Paper
          elevation={8}
          onClick={() => setIsMinimized(false)}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.25,
            px: 2,
            py: 1,
            bgcolor: "#0f172a",
            color: "#f8fafc",
            borderRadius: 6,
            border: "1.5px solid #38bdf8",
            cursor: "pointer",
            boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
            transition: "all 0.2s ease",
            "&:hover": {
              bgcolor: "#1e293b",
              transform: "translateY(-2px)",
              boxShadow: "0 14px 28px rgba(0,0,0,0.6)",
            },
          }}
        >
          <PhotoCameraIcon sx={{ fontSize: 18, color: "#38bdf8" }} />
          <Typography variant="body2" sx={{ fontWeight: 700, fontSize: "0.85rem" }}>
            Reservation Slip {reservationNo ? `(${reservationNo})` : ""}
          </Typography>
          <Chip
            size="small"
            label="Click to Expand"
            sx={{
              height: 20,
              fontSize: "0.68rem",
              fontWeight: 700,
              bgcolor: "rgba(56, 189, 248, 0.2)",
              color: "#38bdf8",
            }}
          />
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            sx={{ color: "#94a3b8", ml: 0.5, p: 0.25, "&:hover": { color: "#fff" } }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Paper>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: "none", // CRITICAL: Allows user to click and work in the app underneath!
        zIndex: 1350,
      }}
    >
      <Paper
        elevation={16}
        sx={{
          position: "absolute",
          left: isMaximized ? 16 : windowPos.x,
          top: isMaximized ? 16 : windowPos.y,
          width: isMaximized ? "calc(100vw - 32px)" : `${windowSize.width}px`,
          height: isMaximized ? "calc(100vh - 32px)" : `${windowSize.height}px`,
          maxWidth: "calc(100vw - 20px)",
          maxHeight: "calc(100vh - 20px)",
          pointerEvents: "auto", // The window itself is fully interactive
          display: "flex",
          flexDirection: "column",
          bgcolor: "#0b0f17",
          color: "#f8fafc",
          borderRadius: 2.5,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.18)",
          boxShadow: "0 25px 60px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255,255,255,0.1)",
          transition: isDraggingWindow || isResizingWindow ? "none" : "width 0.15s ease, height 0.15s ease",
        }}
      >
        {/* Window Top Titlebar - DRAGGABLE */}
        <Box
          onMouseDown={startWindowDrag}
          sx={{
            cursor: isMaximized ? "default" : "move",
            userSelect: "none",
            bgcolor: "#111827",
            px: { xs: 1.5, sm: 2 },
            py: 1.25,
            borderBottom: "1px solid rgba(255,255,255,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
            {!isMaximized && (
              <Tooltip title="Drag this bar to move the popup anywhere on your screen">
                <DragIndicatorIcon sx={{ color: "#64748b", fontSize: 18, cursor: "move" }} />
              </Tooltip>
            )}
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="subtitle2"
                noWrap
                sx={{ fontWeight: 800, color: "#f8fafc", fontSize: { xs: "0.88rem", sm: "0.95rem" } }}
              >
                {title}
              </Typography>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "nowrap",
                  gap: 0.75,
                  mt: 0.25,
                  overflow: "hidden",
                }}
              >
                {reservationNo && (
                  <Chip
                    size="small"
                    label={`Reservation: ${reservationNo}`}
                    sx={{
                      bgcolor: "rgba(59, 130, 246, 0.25)",
                      color: "#93c5fd",
                      fontWeight: 700,
                      fontSize: "0.72rem",
                      height: 22,
                    }}
                  />
                )}
                {createdBy && (
                  <Chip
                    size="small"
                    label={`By: ${createdBy}`}
                    sx={{
                      bgcolor: "rgba(255, 255, 255, 0.08)",
                      color: "#cbd5e1",
                      fontSize: "0.7rem",
                      height: 22,
                      display: { xs: "none", sm: "inline-flex" },
                    }}
                  />
                )}
                {department && (
                  <Typography
                    variant="caption"
                    noWrap
                    sx={{ color: "#94a3b8", display: { xs: "none", md: "inline" } }}
                  >
                    {department}
                  </Typography>
                )}
                {subtitle && (
                  <Chip
                    size="small"
                    label={subtitle}
                    sx={{
                      bgcolor: "rgba(255, 255, 255, 0.08)",
                      color: "#cbd5e1",
                      fontSize: "0.7rem",
                      height: 22,
                    }}
                  />
                )}
                {date && (
                  <Typography
                    variant="caption"
                    noWrap
                    sx={{ color: "#94a3b8", display: { xs: "none", lg: "inline" } }}
                  >
                    {date}
                  </Typography>
                )}
              </Box>
            </Box>
          </Box>

          {/* Window Action Buttons */}
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
            {/* Quick Size Presets */}
            <Tooltip title="Compact size (480x400)">
              <Button
                size="small"
                onClick={() => applySizePreset(480, 400)}
                sx={{
                  minWidth: 28,
                  height: 26,
                  px: 0.75,
                  color: "#94a3b8",
                  fontSize: "0.68rem",
                  fontWeight: 600,
                  bgcolor: "rgba(255,255,255,0.04)",
                  "&:hover": { color: "#fff", bgcolor: "rgba(255,255,255,0.12)" },
                  display: { xs: "none", sm: "inline-flex" },
                }}
              >
                Small
              </Button>
            </Tooltip>

            <Tooltip title="Standard size (680x530)">
              <Button
                size="small"
                onClick={() => applySizePreset(680, 530)}
                sx={{
                  minWidth: 28,
                  height: 26,
                  px: 0.75,
                  color: "#94a3b8",
                  fontSize: "0.68rem",
                  fontWeight: 600,
                  bgcolor: "rgba(255,255,255,0.04)",
                  "&:hover": { color: "#fff", bgcolor: "rgba(255,255,255,0.12)" },
                  display: { xs: "none", sm: "inline-flex" },
                }}
              >
                Medium
              </Button>
            </Tooltip>

            <Tooltip title="Large size (920x680)">
              <Button
                size="small"
                onClick={() => applySizePreset(920, 680)}
                sx={{
                  minWidth: 28,
                  height: 26,
                  px: 0.75,
                  color: "#94a3b8",
                  fontSize: "0.68rem",
                  fontWeight: 600,
                  bgcolor: "rgba(255,255,255,0.04)",
                  "&:hover": { color: "#fff", bgcolor: "rgba(255,255,255,0.12)" },
                  display: { xs: "none", md: "inline-flex" },
                }}
              >
                Large
              </Button>
            </Tooltip>

            {/* Maximize / Restore Toggle */}
            <Tooltip title={isMaximized ? "Restore window" : "Maximize window"}>
              <IconButton
                size="small"
                onClick={() => setIsMaximized((prev) => !prev)}
                sx={{ color: "#94a3b8", "&:hover": { color: "#fff" } }}
              >
                {isMaximized ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
              </IconButton>
            </Tooltip>

            {/* Minimize to Dock (Work in app while photo is docked) */}
            <Tooltip title="Minimize to dock (lets you work in app, click anytime to expand)">
              <IconButton
                size="small"
                onClick={() => setIsMinimized(true)}
                sx={{ color: "#94a3b8", "&:hover": { color: "#fff" } }}
              >
                <MinimizeIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            {/* Download */}
            <Tooltip title="Download slip photo">
              <IconButton
                size="small"
                onClick={handleDownload}
                sx={{ color: "#94a3b8", "&:hover": { color: "#fff" } }}
              >
                <DownloadIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            {/* Open in new tab */}
            <Tooltip title="Open full photo in new window">
              <IconButton
                size="small"
                component="a"
                href={imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ color: "#94a3b8", "&:hover": { color: "#fff" } }}
              >
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            {/* Close */}
            <Tooltip title="Close photo window">
              <IconButton
                size="small"
                onClick={onClose}
                sx={{
                  color: "#94a3b8",
                  "&:hover": { color: "#f87171", bgcolor: "rgba(239, 68, 68, 0.1)" },
                }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>

        {/* Floating Toolbar: Rotation, Zoom & Reset Controls */}
        <Box
          sx={{
            bgcolor: "#1e293b",
            px: { xs: 1.25, sm: 2 },
            py: 0.75,
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
            <Typography variant="caption" sx={{ color: "#94a3b8", fontWeight: 600, mr: 0.5 }}>
              Rotate:
            </Typography>
            <Tooltip title="Rotate 90° Counter-Clockwise (Left)">
              <Button
                size="small"
                variant="outlined"
                onClick={handleRotateLeft}
                startIcon={<RotateLeftIcon sx={{ fontSize: 16 }} />}
                sx={{
                  color: "#e2e8f0",
                  borderColor: "rgba(255,255,255,0.2)",
                  bgcolor: "rgba(255,255,255,0.05)",
                  textTransform: "none",
                  fontWeight: 600,
                  fontSize: "0.72rem",
                  py: 0.25,
                  px: 1,
                  minHeight: 28,
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
                startIcon={<RotateRightIcon sx={{ fontSize: 16 }} />}
                sx={{
                  color: "#e2e8f0",
                  borderColor: "rgba(255,255,255,0.2)",
                  bgcolor: "rgba(255,255,255,0.05)",
                  textTransform: "none",
                  fontWeight: 600,
                  fontSize: "0.72rem",
                  py: 0.25,
                  px: 1,
                  minHeight: 28,
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
                sx={{ bgcolor: "rgba(56,189,248,0.2)", color: "#38bdf8", fontWeight: 700, fontSize: "0.68rem", height: 22 }}
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
                    p: 0.5,
                    "&:hover": { bgcolor: "rgba(255,255,255,0.15)" },
                    "&.Mui-disabled": { color: "#475569" },
                  }}
                >
                  <ZoomOutIcon sx={{ fontSize: 16 }} />
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
                fontSize: "0.72rem",
                minWidth: 48,
                height: 24,
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
                    p: 0.5,
                    "&:hover": { bgcolor: "rgba(255,255,255,0.15)" },
                    "&.Mui-disabled": { color: "#475569" },
                  }}
                >
                  <ZoomInIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </span>
            </Tooltip>

            <Tooltip title="Reset Zoom & Orientation">
              <Button
                size="small"
                onClick={handleReset}
                startIcon={<RestartAltIcon sx={{ fontSize: 14 }} />}
                disabled={zoom === 1 && rotation === 0 && pan.x === 0 && pan.y === 0}
                sx={{
                  color: "#94a3b8",
                  textTransform: "none",
                  fontSize: "0.72rem",
                  py: 0.25,
                  px: 0.75,
                  minHeight: 26,
                  "&:hover": { color: "#fff" },
                  "&.Mui-disabled": { color: "#475569" },
                }}
              >
                Reset
              </Button>
            </Tooltip>
          </Stack>
        </Box>

        {/* Main Photograph Canvas */}
        <Box
          onWheel={handleWheel}
          onMouseDown={handleImageMouseDown}
          onMouseMove={handleImageMouseMove}
          onMouseUp={handleImageMouseUp}
          onMouseLeave={handleImageMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          sx={{
            flex: 1,
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            bgcolor: "#030712",
            userSelect: "none",
            cursor: isDraggingImage ? "grabbing" : zoom > 1 ? "grab" : "default",
          }}
        >
          <Box
            component="img"
            src={imageUrl}
            alt="SAP Reservation Slip"
            draggable={false}
            sx={{
              maxWidth: rotation % 180 !== 0 ? "75%" : "96%",
              maxHeight: rotation % 180 !== 0 ? "75%" : "94%",
              objectFit: "contain",
              transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${zoom})`,
              transformOrigin: "center center",
              transition: isDraggingImage ? "none" : "transform 0.16s cubic-bezier(0.2, 0, 0, 1)",
              pointerEvents: "auto",
              boxShadow: "0 10px 30px rgba(0,0,0,0.8)",
              borderRadius: 1,
            }}
          />

          {/* Pan hint overlay when zoomed */}
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

          {/* Draggable Resize Grip at Bottom-Right */}
          {!isMaximized && (
            <Tooltip title="Drag to adjust window size">
              <Box
                onMouseDown={startWindowResize}
                sx={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  width: 22,
                  height: 22,
                  cursor: "nwse-resize",
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "flex-end",
                  p: 0.5,
                  zIndex: 10,
                  "&::after": {
                    content: '""',
                    width: 10,
                    height: 10,
                    borderRight: "2px solid #38bdf8",
                    borderBottom: "2px solid #38bdf8",
                  },
                }}
              />
            </Tooltip>
          )}
        </Box>
      </Paper>
    </Box>
  );
}
