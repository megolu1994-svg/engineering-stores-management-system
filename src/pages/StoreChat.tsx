import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Fade,
  IconButton,
  InputAdornment,
  Paper,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";

// Icons
import ForumIcon from "@mui/icons-material/Forum";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import SendIcon from "@mui/icons-material/Send";
import CloseIcon from "@mui/icons-material/Close";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import DeleteIcon from "@mui/icons-material/Delete";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import PersonIcon from "@mui/icons-material/Person";
import InventoryIcon from "@mui/icons-material/Inventory";
import PlaceIcon from "@mui/icons-material/Place";
import DescriptionIcon from "@mui/icons-material/Description";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ChatIcon from "@mui/icons-material/Chat";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";

import {
  getStoreChatMessages,
  postStoreChatMessage,
  deleteStoreChatMessage,
  uploadStoreChatPhoto,
  getSavedAuthorName,
  saveAuthorName,
  formatFullDateTime,
  formatTimeOnly,
  getDateGroupHeader,
  type ChatCategory,
  type StoreChatMessage,
} from "../services/storeChatService";

const CATEGORIES: { label: string; value: ChatCategory; color: string }[] = [
  { label: "General", value: "General", color: "#64748B" },
  { label: "Material", value: "Material", color: "#0284C7" },
  { label: "Location", value: "Location", color: "#D97706" },
  { label: "Document", value: "Document", color: "#059669" },
  { label: "Urgent", value: "Urgent", color: "#DC2626" },
];

function renderCategoryIcon(category: ChatCategory, isSelected = false) {
  const color = isSelected ? "#FFFFFF" : getCategoryConfig(category).color;
  switch (category) {
    case "Material":
      return <InventoryIcon fontSize="small" sx={{ color }} />;
    case "Location":
      return <PlaceIcon fontSize="small" sx={{ color }} />;
    case "Document":
      return <DescriptionIcon fontSize="small" sx={{ color }} />;
    case "Urgent":
      return <WarningAmberIcon fontSize="small" sx={{ color }} />;
    default:
      return <ChatIcon fontSize="small" sx={{ color }} />;
  }
}

function getCategoryConfig(category: string) {
  return (
    CATEGORIES.find((c) => c.value === category) || {
      label: category,
      value: category as ChatCategory,
      color: "#64748B",
    }
  );
}

export default function StoreChat() {
  const [messages, setMessages] = useState<StoreChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isFallback, setIsFallback] = useState(false);

  // Author state
  const [authorName, setAuthorName] = useState(() => getSavedAuthorName());
  const [isEditingAuthor, setIsEditingAuthor] = useState(false);

  // Filter & Search
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");

  // Input composer state
  const [messageText, setMessageText] = useState("");
  const [postCategory, setPostCategory] = useState<ChatCategory>("General");
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [copiedMigration, setCopiedMigration] = useState(false);

  // Lightbox modal state
  const [activePhotoModal, setActivePhotoModal] = useState<{
    url: string;
    title: string;
    timestamp: string;
  } | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load messages
  const loadMessages = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const result = await getStoreChatMessages();
      setMessages(result.messages);
      setIsFallback(result.isFallback);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadMessages();

    // Auto-refresh poll every 25 seconds
    const interval = setInterval(() => {
      loadMessages(true);
    }, 25000);

    return () => clearInterval(interval);
  }, []);

  // Handle photo selection
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedPhoto(file);
      const previewUrl = URL.createObjectURL(file);
      setPhotoPreview(previewUrl);
    }
    // reset input so same file can be picked again
    e.target.value = "";
  };

  const handleClearPhoto = () => {
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }
    setSelectedPhoto(null);
    setPhotoPreview(null);
  };

  // Handle post submit
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!messageText.trim() && !selectedPhoto) || sending) return;

    setSending(true);
    try {
      let uploadedPhotoUrl: string | null = null;
      if (selectedPhoto) {
        uploadedPhotoUrl = await uploadStoreChatPhoto(selectedPhoto);
      }

      const res = await postStoreChatMessage({
        author_name: authorName.trim() || "Store Staff",
        message: messageText.trim() || (selectedPhoto ? "Uploaded a photo" : ""),
        photo_url: uploadedPhotoUrl,
        category: postCategory,
      });

      // Update local state immediately
      setMessages((prev) => [res.message, ...prev.filter((m) => m.id !== res.message.id)]);
      if (res.isFallback) {
        setIsFallback(true);
      }

      // Reset composer
      setMessageText("");
      handleClearPhoto();
    } catch (err) {
      console.error("Failed to send message", err);
    } finally {
      setSending(false);
    }
  };

  // Delete message
  const handleDelete = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this comment?")) {
      await deleteStoreChatMessage(id);
      setMessages((prev) => prev.filter((m) => m.id !== id));
    }
  };

  // Copy migration SQL snippet
  const handleCopyMigrationSql = () => {
    const sql = `-- Run this in Supabase SQL Editor if store_chat_messages table is not yet created
CREATE TABLE IF NOT EXISTS public.store_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  author_name TEXT NOT NULL DEFAULT 'Store Staff',
  message TEXT NOT NULL,
  photo_url TEXT,
  category TEXT NOT NULL DEFAULT 'General',
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.store_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY store_chat_all_read ON public.store_chat_messages FOR SELECT USING (true);
CREATE POLICY store_chat_all_insert ON public.store_chat_messages FOR INSERT WITH CHECK (true);
CREATE POLICY store_chat_all_delete ON public.store_chat_messages FOR DELETE USING (true);
GRANT ALL ON public.store_chat_messages TO authenticated, anon;`;

    navigator.clipboard.writeText(sql);
    setCopiedMigration(true);
    setTimeout(() => setCopiedMigration(false), 2500);
  };

  // Filter messages by category and query
  const filteredMessages = messages.filter((msg) => {
    const matchesCategory = selectedCategory === "All" || msg.category === selectedCategory;
    const query = searchQuery.toLowerCase().trim();
    const matchesQuery =
      !query ||
      msg.message.toLowerCase().includes(query) ||
      msg.author_name.toLowerCase().includes(query) ||
      msg.category.toLowerCase().includes(query);
    return matchesCategory && matchesQuery;
  });

  // Group messages chronologically by day
  const groupedByDay: { [day: string]: StoreChatMessage[] } = {};
  filteredMessages.forEach((msg) => {
    const dayLabel = getDateGroupHeader(msg.created_at);
    if (!groupedByDay[dayLabel]) groupedByDay[dayLabel] = [];
    groupedByDay[dayLabel].push(msg);
  });

  return (
    <Box
      sx={{
        p: { xs: 1.5, sm: 2.5, md: 3 },
        maxWidth: 1100,
        mx: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        minHeight: "calc(100vh - 120px)",
      }}
    >
      {/* Top Header Card */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, sm: 2.5 },
          borderRadius: 2,
          border: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: { xs: "flex-start", sm: "center" },
            justifyContent: "space-between",
            flexDirection: { xs: "column", sm: "row" },
            gap: 2,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Avatar
              sx={{
                bgcolor: "primary.main",
                width: 44,
                height: 44,
                boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
              }}
            >
              <ForumIcon />
            </Avatar>
            <Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                  Store Chat & Activity Log
                </Typography>
                <Chip
                  label={`${filteredMessages.length} comments`}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ fontWeight: 600, fontSize: "0.75rem", height: 22 }}
                />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Daily warehouse logs, material notes, location shifts, physical document & slip photos
              </Typography>
            </Box>
          </Box>

          {/* Action controls */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, alignSelf: { xs: "flex-end", sm: "center" } }}>
            <Tooltip title="Refresh comments">
              <IconButton
                onClick={() => loadMessages(true)}
                disabled={refreshing}
                size="small"
                sx={{
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 1.5,
                  bgcolor: "background.paper",
                }}
              >
                <RefreshIcon
                  fontSize="small"
                  sx={{
                    animation: refreshing ? "spin 1s linear infinite" : "none",
                    "@keyframes spin": { "100%": { transform: "rotate(360deg)" } },
                  }}
                />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Fallback Notice if Supabase table is not yet created */}
        {isFallback && (
          <Fade in>
            <Alert
              severity="info"
              sx={{ mt: 2, borderRadius: 1.5 }}
              action={
                <Button
                  size="small"
                  variant="outlined"
                  color="inherit"
                  startIcon={copiedMigration ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
                  onClick={handleCopyMigrationSql}
                  sx={{ textTransform: "none", whiteSpace: "nowrap" }}
                >
                  {copiedMigration ? "Copied SQL!" : "Copy Supabase SQL"}
                </Button>
              }
            >
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Store Chat is running in local-save mode.
              </Typography>
              <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
                All comments and photos are saved safely on this device. To sync with other store personnel across devices,
                run migration <strong>0026_store_chat_messages.sql</strong> in your Supabase SQL Editor.
              </Typography>
            </Alert>
          </Fade>
        )}

        {/* Filter and Search Bar */}
        <Box sx={{ mt: 2, pt: 2, borderTop: "1px solid", borderColor: "divider" }}>
          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", sm: "row" },
              gap: 1.5,
              alignItems: { xs: "stretch", sm: "center" },
              justifyContent: "space-between",
            }}
          >
            {/* Category Chips */}
            <Box
              sx={{
                display: "flex",
                gap: 0.8,
                overflowX: "auto",
                pb: { xs: 0.5, sm: 0 },
                "&::-webkit-scrollbar": { height: 4 },
              }}
            >
              <Chip
                label="All"
                size="small"
                clickable
                onClick={() => setSelectedCategory("All")}
                color={selectedCategory === "All" ? "primary" : "default"}
                variant={selectedCategory === "All" ? "filled" : "outlined"}
                sx={{ fontWeight: selectedCategory === "All" ? 700 : 500 }}
              />
              {CATEGORIES.map((cat) => (
                <Chip
                  key={cat.value}
                  icon={renderCategoryIcon(cat.value, selectedCategory === cat.value)}
                  label={cat.label}
                  size="small"
                  clickable
                  onClick={() => setSelectedCategory(cat.value)}
                  sx={{
                    fontWeight: selectedCategory === cat.value ? 700 : 500,
                    bgcolor: selectedCategory === cat.value ? cat.color : "transparent",
                    color: selectedCategory === cat.value ? "#FFFFFF" : "text.primary",
                    borderColor: cat.color,
                    "&:hover": {
                      bgcolor: selectedCategory === cat.value ? cat.color : "action.hover",
                    },
                  }}
                  variant={selectedCategory === cat.value ? "filled" : "outlined"}
                />
              ))}
            </Box>

            {/* Search Input */}
            <TextField
              size="small"
              placeholder="Search comments, staff, or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" sx={{ color: "text.secondary" }} />
                    </InputAdornment>
                  ),
                  endAdornment: searchQuery ? (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setSearchQuery("")}>
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ) : undefined,
                },
              }}
              sx={{ minWidth: { sm: 260 } }}
            />
          </Box>
        </Box>
      </Paper>

      {/* Messages Timeline Feed */}
      <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column", gap: 2.5 }}>
        {loading ? (
          <Box sx={{ py: 8, display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5 }}>
            <CircularProgress size={32} />
            <Typography variant="body2" color="text.secondary">
              Loading store notes & photos...
            </Typography>
          </Box>
        ) : filteredMessages.length === 0 ? (
          <Paper
            elevation={0}
            sx={{
              p: 6,
              textAlign: "center",
              borderRadius: 2,
              border: "1px dashed",
              borderColor: "divider",
              bgcolor: "background.paper",
            }}
          >
            <ChatIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
            <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 600 }}>
              No comments found
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 460, mx: "auto" }}>
              {searchQuery || selectedCategory !== "All"
                ? "No comments matched your current filter. Try clearing your search."
                : "Be the first to share an update! Use the comment box below to record notes on incoming shipments, locations, or upload slips."}
            </Typography>
          </Paper>
        ) : (
          Object.entries(groupedByDay).map(([dayLabel, dayMessages]) => (
            <Box key={dayLabel} sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              {/* Day Divider Badge */}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  my: 0.5,
                  "&::before, &::after": {
                    content: '""',
                    flex: 1,
                    borderBottom: "1px solid",
                    borderColor: "divider",
                  },
                }}
              >
                <Chip
                  label={dayLabel}
                  size="small"
                  sx={{
                    mx: 2,
                    fontWeight: 700,
                    fontSize: "0.75rem",
                    bgcolor: "grey.200",
                    color: "text.secondary",
                  }}
                />
              </Box>

              {/* Messages within the day */}
              {dayMessages.map((msg) => {
                const catConfig = getCategoryConfig(msg.category);
                return (
                  <Card
                    key={msg.id}
                    elevation={0}
                    sx={{
                      borderRadius: 2,
                      border: "1px solid",
                      borderColor: "divider",
                      bgcolor: "background.paper",
                      transition: "all 0.15s ease-in-out",
                      "&:hover": {
                        borderColor: "primary.light",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                      },
                    }}
                  >
                    <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
                      {/* Message Header */}
                      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                          <Avatar
                            sx={{
                              width: 34,
                              height: 34,
                              fontSize: "0.85rem",
                              fontWeight: 700,
                              bgcolor: catConfig.color,
                            }}
                          >
                            {msg.author_name ? msg.author_name.charAt(0).toUpperCase() : "S"}
                          </Avatar>
                          <Box>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "text.primary" }}>
                                {msg.author_name || "Store Staff"}
                              </Typography>
                              <Chip
                                label={msg.category}
                                size="small"
                                sx={{
                                  height: 20,
                                  fontSize: "0.68rem",
                                  fontWeight: 600,
                                  bgcolor: `${catConfig.color}15`,
                                  color: catConfig.color,
                                  border: `1px solid ${catConfig.color}40`,
                                }}
                              />
                            </Box>
                            <Tooltip title={formatFullDateTime(msg.created_at)}>
                              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                                {formatTimeOnly(msg.created_at)} ({new Date(msg.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })})
                              </Typography>
                            </Tooltip>
                          </Box>
                        </Box>

                        {/* Delete action */}
                        <Tooltip title="Delete comment">
                          <IconButton
                            size="small"
                            onClick={() => handleDelete(msg.id)}
                            sx={{ color: "text.disabled", "&:hover": { color: "error.main" } }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>

                      {/* Message Content */}
                      {msg.message && (
                        <Typography
                          variant="body1"
                          sx={{
                            mt: 1.5,
                            color: "text.primary",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            fontSize: "0.95rem",
                            lineHeight: 1.5,
                          }}
                        >
                          {msg.message}
                        </Typography>
                      )}

                      {/* Attached Photograph Preview */}
                      {msg.photo_url && (
                        <Box sx={{ mt: 1.5 }}>
                          <CardActionArea
                            onClick={() =>
                              setActivePhotoModal({
                                url: msg.photo_url!,
                                title: `${msg.author_name} - ${msg.category}`,
                                timestamp: formatFullDateTime(msg.created_at),
                              })
                            }
                            sx={{
                              display: "inline-block",
                              borderRadius: 1.5,
                              overflow: "hidden",
                              border: "1px solid",
                              borderColor: "divider",
                              maxWidth: { xs: "100%", sm: 380 },
                              position: "relative",
                              "&:hover .zoom-overlay": {
                                opacity: 1,
                              },
                            }}
                          >
                            <Box
                              component="img"
                              src={msg.photo_url}
                              alt="Store photograph attachment"
                              sx={{
                                width: "100%",
                                maxHeight: 260,
                                objectFit: "cover",
                                display: "block",
                                bgcolor: "grey.100",
                              }}
                              loading="lazy"
                            />
                            <Box
                              className="zoom-overlay"
                              sx={{
                                position: "absolute",
                                bottom: 0,
                                left: 0,
                                right: 0,
                                p: 0.8,
                                bgcolor: "rgba(0,0,0,0.6)",
                                color: "#FFFFFF",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 0.5,
                                opacity: 0,
                                transition: "opacity 0.2s ease-in-out",
                              }}
                            >
                              <ZoomInIcon fontSize="small" />
                              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                                Click to view full image
                              </Typography>
                            </Box>
                          </CardActionArea>
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </Box>
          ))
        )}
        <div ref={messagesEndRef} />
      </Box>

      {/* Composer Card at Bottom */}
      <Paper
        elevation={2}
        sx={{
          p: 2,
          borderRadius: 2,
          border: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
          position: "sticky",
          bottom: { xs: 60, md: 16 },
          zIndex: 10,
          boxShadow: "0 -2px 14px rgba(0,0,0,0.06)",
        }}
      >
        <Box component="form" onSubmit={handleSendMessage} sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {/* Author bar and Category selector */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 1,
            }}
          >
            {/* Author Name */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <PersonIcon fontSize="small" sx={{ color: "text.secondary" }} />
              {isEditingAuthor ? (
                <TextField
                  size="small"
                  variant="standard"
                  placeholder="Your Name / Shift"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  onBlur={() => {
                    saveAuthorName(authorName);
                    setIsEditingAuthor(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveAuthorName(authorName);
                      setIsEditingAuthor(false);
                    }
                  }}
                  autoFocus
                  sx={{ width: 140 }}
                />
              ) : (
                <Tooltip title="Click to change your display name">
                  <Chip
                    label={`Posting as: ${authorName || "Store Staff"}`}
                    size="small"
                    variant="outlined"
                    onClick={() => setIsEditingAuthor(true)}
                    sx={{
                      cursor: "pointer",
                      fontWeight: 600,
                      borderColor: "primary.light",
                      color: "primary.main",
                      "&:hover": { bgcolor: "primary.50" },
                    }}
                  />
                </Tooltip>
              )}
            </Box>

            {/* Category Selector Buttons */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
              <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5, display: { xs: "none", sm: "inline" } }}>
                Tag:
              </Typography>
              {CATEGORIES.map((cat) => (
                <Chip
                  key={cat.value}
                  label={cat.label}
                  size="small"
                  clickable
                  onClick={() => setPostCategory(cat.value)}
                  sx={{
                    height: 24,
                    fontSize: "0.72rem",
                    fontWeight: postCategory === cat.value ? 700 : 500,
                    bgcolor: postCategory === cat.value ? cat.color : "transparent",
                    color: postCategory === cat.value ? "#FFFFFF" : "text.secondary",
                    borderColor: cat.color,
                  }}
                  variant={postCategory === cat.value ? "filled" : "outlined"}
                />
              ))}
            </Box>
          </Box>

          {/* Photo Preview Pill if selected */}
          {photoPreview && (
            <Box
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 1.5,
                p: 1,
                borderRadius: 1.5,
                bgcolor: "grey.100",
                border: "1px solid",
                borderColor: "divider",
                width: "fit-content",
              }}
            >
              <Box
                component="img"
                src={photoPreview}
                alt="Selected attachment"
                sx={{ width: 44, height: 44, borderRadius: 1, objectFit: "cover" }}
              />
              <Box>
                <Typography variant="caption" sx={{ fontWeight: 600, display: "block" }}>
                  {selectedPhoto?.name || "Photograph attached"}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {selectedPhoto ? `${Math.round(selectedPhoto.size / 1024)} KB` : ""}
                </Typography>
              </Box>
              <IconButton size="small" onClick={handleClearPhoto} color="error" sx={{ ml: 1 }}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          )}

          {/* Main Input Box */}
          <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1 }}>
            <TextField
              fullWidth
              multiline
              minRows={2}
              maxRows={5}
              placeholder="Type what's going on in stores... (e.g. material received, location change, document slip)"
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              sx={{
                bgcolor: "background.paper",
                "& .MuiOutlinedInput-root": {
                  borderRadius: 2,
                },
              }}
            />

            {/* Hidden file inputs */}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              ref={cameraInputRef}
              style={{ display: "none" }}
              onChange={handlePhotoSelect}
            />
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={handlePhotoSelect}
            />

            {/* Actions: Camera, Upload, Send */}
            <Box sx={{ display: "flex", gap: 0.8, pb: 0.5 }}>
              <Tooltip title="Capture with Camera">
                <IconButton
                  color="primary"
                  onClick={() => cameraInputRef.current?.click()}
                  sx={{
                    border: "1px solid",
                    borderColor: "primary.light",
                    borderRadius: 1.5,
                    bgcolor: "primary.50",
                  }}
                >
                  <PhotoCameraIcon fontSize="small" />
                </IconButton>
              </Tooltip>

              <Tooltip title="Upload Photo / Document Image">
                <IconButton
                  color="info"
                  onClick={() => fileInputRef.current?.click()}
                  sx={{
                    border: "1px solid",
                    borderColor: "info.light",
                    borderRadius: 1.5,
                    bgcolor: "info.50",
                  }}
                >
                  <UploadFileIcon fontSize="small" />
                </IconButton>
              </Tooltip>

              <Button
                variant="contained"
                color="primary"
                type="submit"
                disabled={(!messageText.trim() && !selectedPhoto) || sending}
                startIcon={sending ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
                sx={{
                  borderRadius: 1.5,
                  px: 2.5,
                  height: 40,
                  fontWeight: 700,
                  textTransform: "none",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                }}
              >
                {sending ? "Posting..." : "Post"}
              </Button>
            </Box>
          </Box>
        </Box>
      </Paper>

      {/* Lightbox / Expanded Photo Dialog */}
      <Dialog
        open={Boolean(activePhotoModal)}
        onClose={() => setActivePhotoModal(null)}
        maxWidth="md"
        fullWidth
        slotProps={{
          paper: {
            sx: { borderRadius: 2, bgcolor: "#0f172a", color: "#FFFFFF" },
          },
        }}
      >
        {activePhotoModal && (
          <>
            <DialogTitle
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid rgba(255,255,255,0.1)",
                py: 1.5,
              }}
            >
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "#FFFFFF" }}>
                  {activePhotoModal.title}
                </Typography>
                <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.6)" }}>
                  {activePhotoModal.timestamp}
                </Typography>
              </Box>
              <IconButton onClick={() => setActivePhotoModal(null)} sx={{ color: "#FFFFFF" }}>
                <CloseIcon />
              </IconButton>
            </DialogTitle>
            <DialogContent sx={{ p: 2, display: "flex", justifyContent: "center", alignItems: "center" }}>
              <Box
                component="img"
                src={activePhotoModal.url}
                alt="Store photograph preview"
                sx={{
                  maxWidth: "100%",
                  maxHeight: "75vh",
                  objectFit: "contain",
                  borderRadius: 1,
                  boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
                }}
              />
            </DialogContent>
            <DialogActions sx={{ borderTop: "1px solid rgba(255,255,255,0.1)", px: 2, py: 1 }}>
              <Button
                variant="outlined"
                component="a"
                href={activePhotoModal.url}
                target="_blank"
                rel="noreferrer"
                download="store_photo.jpg"
                sx={{ color: "#FFFFFF", borderColor: "rgba(255,255,255,0.3)", textTransform: "none" }}
              >
                Open Full Original
              </Button>
              <Button
                variant="contained"
                onClick={() => setActivePhotoModal(null)}
                sx={{ textTransform: "none", bgcolor: "primary.main" }}
              >
                Close
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}
