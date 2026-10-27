import React, { useEffect, useRef, useState } from "react";
import {
  Avatar,
  Box,
  Button,
  Card,
  CircularProgress,
  Dialog,
  DialogContent,
  IconButton,
  InputAdornment,
  Paper,
  TextField,
  Tooltip,
  Typography,
  Chip,
} from "@mui/material";

// Icons
import ForumIcon from "@mui/icons-material/Forum";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import SendIcon from "@mui/icons-material/Send";
import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";
import DeleteIcon from "@mui/icons-material/Delete";
import RefreshIcon from "@mui/icons-material/Refresh";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import PersonIcon from "@mui/icons-material/Person";

import {
  getStoreChatMessages,
  postStoreChatMessage,
  deleteStoreChatMessage,
  uploadStoreChatPhoto,
  getSavedAuthorName,
  saveAuthorName,
  formatFullDateTime,
  getDateGroupHeader,
  type StoreChatMessage,
} from "../services/storeChatService";

export default function StoreChat() {
  const [messages, setMessages] = useState<StoreChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Search filter
  const [searchQuery, setSearchQuery] = useState("");

  // Composer state
  const [messageText, setMessageText] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [authorName, setAuthorName] = useState(() => getSavedAuthorName());
  const [isEditingAuthor, setIsEditingAuthor] = useState(false);
  const [tempAuthorName, setTempAuthorName] = useState(authorName);

  // Lightbox modal
  const [activePhotoModal, setActivePhotoModal] = useState<{
    url: string;
    timestamp: string;
    author: string;
    caption?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load messages
  const loadMessages = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const result = await getStoreChatMessages();
      setMessages(result.messages);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadMessages();
    const interval = setInterval(() => {
      loadMessages(true);
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  // Scroll to bottom on initial load or new message
  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    if (!loading && messages.length > 0) {
      scrollToBottom("auto");
    }
  }, [loading, messages.length]);

  // Handle photo selection
  const handlePhotoSelect = (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Please select a valid image file.");
      return;
    }
    setSelectedPhoto(file);
    const objectUrl = URL.createObjectURL(file);
    setPhotoPreview(objectUrl);
  };

  const handleClearPhoto = () => {
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }
    setSelectedPhoto(null);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  // Send message
  const handleSendMessage = async () => {
    const trimmed = messageText.trim();
    if (!trimmed && !selectedPhoto) return;

    setSending(true);
    try {
      let uploadedPhotoUrl: string | null = null;
      if (selectedPhoto) {
        uploadedPhotoUrl = await uploadStoreChatPhoto(selectedPhoto);
      }

      const res = await postStoreChatMessage({
        message: trimmed,
        author_name: authorName.trim() || "Store Staff",
        photo_url: uploadedPhotoUrl,
        category: "General",
      });

      setMessages((prev) => [...prev, res.message]);
      setMessageText("");
      handleClearPhoto();
      setTimeout(() => scrollToBottom("smooth"), 100);
    } catch (err) {
      console.error("Failed to post message:", err);
      alert("Could not send message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  // Key press in chat input: Enter sends, Shift+Enter makes newline
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Delete message
  const handleDeleteMessage = async (id: string) => {
    const confirmed = window.confirm("Are you sure you want to delete this message?");
    if (!confirmed) return;

    try {
      await deleteStoreChatMessage(id);
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      console.error("Failed to delete message:", err);
      alert("Could not delete message.");
    }
  };

  // Filter messages by search query
  const filteredMessages = messages.filter((m) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const textMatch = (m.message || "").toLowerCase().includes(q);
    const authorMatch = (m.author_name || "").toLowerCase().includes(q);
    const dateMatch = formatFullDateTime(m.created_at).toLowerCase().includes(q);
    return textMatch || authorMatch || dateMatch;
  });

  // Group messages by date
  const groupedMessages: { dateHeader: string; items: StoreChatMessage[] }[] = [];
  let currentDate = "";
  let currentGroup: StoreChatMessage[] = [];

  filteredMessages.forEach((m) => {
    const dateHeader = getDateGroupHeader(m.created_at);
    if (dateHeader !== currentDate) {
      if (currentGroup.length > 0) {
        groupedMessages.push({ dateHeader: currentDate, items: currentGroup });
      }
      currentDate = dateHeader;
      currentGroup = [m];
    } else {
      currentGroup.push(m);
    }
  });
  if (currentGroup.length > 0) {
    groupedMessages.push({ dateHeader: currentDate, items: currentGroup });
  }

  const handleSaveAuthor = () => {
    const clean = tempAuthorName.trim() || "Store Staff";
    setAuthorName(clean);
    saveAuthorName(clean);
    setIsEditingAuthor(false);
  };

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2.5 }, maxWidth: 1100, mx: "auto", display: "flex", flexDirection: "column", height: "calc(100vh - 90px)" }}>
      {/* Hidden File / Camera Inputs */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handlePhotoSelect(e.target.files[0]);
          }
        }}
      />
      <input
        type="file"
        ref={cameraInputRef}
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handlePhotoSelect(e.target.files[0]);
          }
        }}
      />

      {/* Top Header: Title, Search Bar & Info */}
      <Card
        elevation={0}
        sx={{
          p: 1.5,
          mb: 1.5,
          borderRadius: 2.5,
          border: "1px solid #E2E8F0",
          backgroundColor: "#FFFFFF",
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { xs: "stretch", sm: "center" },
          gap: 1.5,
          justifyContent: "space-between",
        }}
      >
        {/* Left: Title & Active Count */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
          <Avatar sx={{ bgcolor: "#4F46E5", width: 38, height: 38 }}>
            <ForumIcon fontSize="small" />
          </Avatar>
          <Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, fontSize: "1.05rem", color: "#1E293B", lineHeight: 1.2 }}>
                Store Chat
              </Typography>
              <Chip
                label={`${filteredMessages.length} ${filteredMessages.length === 1 ? "entry" : "entries"}`}
                size="small"
                sx={{
                  height: 20,
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  bgcolor: "#EEF2FF",
                  color: "#4338CA",
                }}
              />
            </Box>
            <Typography variant="caption" sx={{ color: "#64748B", fontSize: "0.75rem" }}>
              Notes, material photos, location updates & store activity
            </Typography>
          </Box>
        </Box>

        {/* Center/Right: Simple Search Bar & Refresh */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexGrow: { sm: 1 }, maxWidth: { sm: 460 } }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search chat or date (e.g. valve, bay, 27 Oct)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: "#94A3B8", fontSize: 20 }} />
                  </InputAdornment>
                ),
                endAdornment: searchQuery ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchQuery("")}>
                      <CloseIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </InputAdornment>
                ) : null,
                sx: {
                  borderRadius: 2,
                  bgcolor: "#F8FAFC",
                  fontSize: "0.85rem",
                  "& fieldset": { borderColor: "#CBD5E1" },
                },
              },
            }}
          />

          <Tooltip title="Refresh updates">
            <IconButton
              size="small"
              onClick={() => loadMessages(true)}
              disabled={refreshing}
              sx={{ border: "1px solid #E2E8F0", borderRadius: 2, p: 0.85 }}
            >
              <RefreshIcon sx={{ fontSize: 20, color: "#64748B", animation: refreshing ? "spin 1s linear infinite" : "none" }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Card>

      {/* Main Chat Box */}
      <Paper
        elevation={0}
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          borderRadius: 3,
          border: "1px solid #E2E8F0",
          backgroundColor: "#F8FAFC",
          overflow: "hidden",
        }}
      >
        {/* Messages Stream Area */}
        <Box
          sx={{
            flex: 1,
            overflowY: "auto",
            p: { xs: 1.5, sm: 2.5 },
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {loading ? (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", py: 8, gap: 1.5 }}>
              <CircularProgress size={32} sx={{ color: "#4F46E5" }} />
              <Typography variant="body2" sx={{ color: "#64748B" }}>
                Loading store chat...
              </Typography>
            </Box>
          ) : filteredMessages.length === 0 ? (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                py: 8,
                textAlign: "center",
                px: 2,
              }}
            >
              <ForumIcon sx={{ fontSize: 48, color: "#CBD5E1", mb: 1 }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 600, color: "#475569" }}>
                {searchQuery ? `No messages matching "${searchQuery}"` : "No store comments yet"}
              </Typography>
              <Typography variant="body2" sx={{ color: "#94A3B8", maxWidth: 400, mt: 0.5 }}>
                {searchQuery
                  ? "Try checking for typos or searching by date, item name, or location."
                  : "Post a quick comment or upload a photo below to start logging store activities."}
              </Typography>
              {searchQuery && (
                <Button size="small" variant="text" onClick={() => setSearchQuery("")} sx={{ mt: 1.5, textTransform: "none" }}>
                  Clear Search
                </Button>
              )}
            </Box>
          ) : (
            groupedMessages.map((group) => (
              <Box key={group.dateHeader} sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                {/* Date separator pill */}
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", my: 0.5 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      bgcolor: "#E2E8F0",
                      color: "#475569",
                      px: 1.5,
                      py: 0.35,
                      borderRadius: 10,
                      fontWeight: 600,
                      fontSize: "0.72rem",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {group.dateHeader}
                  </Typography>
                </Box>

                {/* Messages in this date group */}
                {group.items.map((msg) => (
                  <Box
                    key={msg.id}
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      maxWidth: { xs: "96%", sm: "80%" },
                    }}
                  >
                    {/* Bubble Container */}
                    <Box
                      sx={{
                        backgroundColor: "#FFFFFF",
                        border: "1px solid #E2E8F0",
                        borderRadius: 2.5,
                        p: 1.75,
                        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                        width: "100%",
                        position: "relative",
                        "&:hover .delete-btn": {
                          opacity: 1,
                        },
                      }}
                    >
                      {/* Header inside bubble: Author & exact time */}
                      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.75 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: "0.85rem", color: "#1E293B" }}>
                            {msg.author_name || "Store Staff"}
                          </Typography>
                          <Typography variant="caption" sx={{ color: "#64748B", fontSize: "0.72rem" }}>
                            {formatFullDateTime(msg.created_at)}
                          </Typography>
                        </Box>

                        {/* Delete button (subtle) */}
                        <Tooltip title="Delete comment">
                          <IconButton
                            size="small"
                            className="delete-btn"
                            onClick={() => handleDeleteMessage(msg.id)}
                            sx={{
                              opacity: { xs: 0.7, sm: 0 },
                              transition: "opacity 0.2s",
                              p: 0.25,
                              color: "#94A3B8",
                              "&:hover": { color: "#EF4444" },
                            }}
                          >
                            <DeleteIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>

                      {/* Photo Attachment (if present) */}
                      {msg.photo_url && (
                        <Box
                          sx={{
                            my: 1,
                            position: "relative",
                            borderRadius: 2,
                            overflow: "hidden",
                            border: "1px solid #E2E8F0",
                            maxHeight: 280,
                            maxWidth: 380,
                            cursor: "pointer",
                            backgroundColor: "#0F172A",
                            "&:hover .zoom-overlay": {
                              opacity: 1,
                            },
                          }}
                          onClick={() =>
                            setActivePhotoModal({
                              url: msg.photo_url!,
                              timestamp: formatFullDateTime(msg.created_at),
                              author: msg.author_name || "Store Staff",
                              caption: msg.message,
                            })
                          }
                        >
                          <Box
                            component="img"
                            src={msg.photo_url}
                            alt="Store photo attachment"
                            sx={{
                              width: "100%",
                              maxHeight: 280,
                              objectFit: "cover",
                              display: "block",
                            }}
                          />
                          <Box
                            className="zoom-overlay"
                            sx={{
                              position: "absolute",
                              inset: 0,
                              bgcolor: "rgba(0,0,0,0.45)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 0.75,
                              color: "#FFFFFF",
                              opacity: 0,
                              transition: "opacity 0.2s",
                            }}
                          >
                            <ZoomInIcon />
                            <Typography variant="caption" sx={{ fontWeight: 600 }}>
                              Click to enlarge
                            </Typography>
                          </Box>
                        </Box>
                      )}

                      {/* Message Text */}
                      {msg.message && (
                        <Typography
                          variant="body2"
                          sx={{
                            color: "#334155",
                            fontSize: "0.88rem",
                            lineHeight: 1.5,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          {msg.message}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                ))}
              </Box>
            ))
          )}
          <div ref={messagesEndRef} />
        </Box>

        {/* Bottom Simple Chat Composer */}
        <Box
          sx={{
            p: 1.5,
            backgroundColor: "#FFFFFF",
            borderTop: "1px solid #E2E8F0",
          }}
        >
          {/* Photo Preview Pill before sending */}
          {photoPreview && (
            <Box
              sx={{
                mb: 1.25,
                p: 0.75,
                pl: 1.25,
                display: "inline-flex",
                alignItems: "center",
                gap: 1.25,
                bgcolor: "#F1F5F9",
                borderRadius: 2,
                border: "1px solid #CBD5E1",
              }}
            >
              <Box
                component="img"
                src={photoPreview}
                alt="Selected attachment"
                sx={{ width: 36, height: 36, borderRadius: 1, objectFit: "cover" }}
              />
              <Box sx={{ pr: 0.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, display: "block", color: "#1E293B", lineHeight: 1.1 }}>
                  Photo attached
                </Typography>
                <Typography variant="caption" sx={{ color: "#64748B", fontSize: "0.7rem" }}>
                  Ready to post
                </Typography>
              </Box>
              <IconButton size="small" onClick={handleClearPhoto} sx={{ color: "#64748B", "&:hover": { color: "#EF4444" } }}>
                <CloseIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>
          )}

          {/* Simple Author Name Bar (quick customizable or toggle) */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.75 }}>
            <Typography variant="caption" sx={{ color: "#64748B", display: "flex", alignItems: "center", gap: 0.5 }}>
              <PersonIcon sx={{ fontSize: 14 }} /> Posting as:
            </Typography>
            {isEditingAuthor ? (
              <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                <TextField
                  size="small"
                  variant="standard"
                  value={tempAuthorName}
                  onChange={(e) => setTempAuthorName(e.target.value)}
                  placeholder="Your Name / Shift"
                  sx={{ "& input": { fontSize: "0.78rem", py: 0.2, width: 140 } }}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveAuthor();
                  }}
                />
                <Button size="small" onClick={handleSaveAuthor} sx={{ fontSize: "0.7rem", py: 0.1, minWidth: "auto" }}>
                  Save
                </Button>
                <Button size="small" onClick={() => setIsEditingAuthor(false)} sx={{ fontSize: "0.7rem", py: 0.1, minWidth: "auto", color: "#94A3B8" }}>
                  Cancel
                </Button>
              </Box>
            ) : (
              <Box
                onClick={() => {
                  setTempAuthorName(authorName);
                  setIsEditingAuthor(true);
                }}
                sx={{
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0.5,
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 600, color: "#4F46E5" }}>
                  {authorName}
                </Typography>
                <Typography variant="caption" sx={{ color: "#94A3B8", fontSize: "0.68rem" }}>
                  (change)
                </Typography>
              </Box>
            )}
          </Box>

          {/* Input Controls Row */}
          <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1 }}>
            {/* Camera Button */}
            <Tooltip title="Take photo with camera">
              <IconButton
                onClick={() => cameraInputRef.current?.click()}
                sx={{
                  bgcolor: "#F8FAFC",
                  border: "1px solid #E2E8F0",
                  borderRadius: 2,
                  p: 1,
                  color: "#4F46E5",
                  "&:hover": { bgcolor: "#EEF2FF" },
                }}
              >
                <PhotoCameraIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>

            {/* Upload File Button */}
            <Tooltip title="Upload photo from device">
              <IconButton
                onClick={() => fileInputRef.current?.click()}
                sx={{
                  bgcolor: "#F8FAFC",
                  border: "1px solid #E2E8F0",
                  borderRadius: 2,
                  p: 1,
                  color: "#64748B",
                  "&:hover": { bgcolor: "#F1F5F9" },
                }}
              >
                <AttachFileIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>

            {/* Text Input */}
            <TextField
              fullWidth
              multiline
              maxRows={4}
              placeholder="Write a comment or update about stores... (Enter to send)"
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              slotProps={{
                input: {
                  sx: {
                    borderRadius: 2,
                    fontSize: "0.88rem",
                    bgcolor: "#F8FAFC",
                    "& fieldset": { borderColor: "#CBD5E1" },
                  },
                },
              }}
            />

            {/* Send Button */}
            <Button
              variant="contained"
              onClick={handleSendMessage}
              disabled={sending || (!messageText.trim() && !selectedPhoto)}
              sx={{
                bgcolor: "#4F46E5",
                "&:hover": { bgcolor: "#4338CA" },
                borderRadius: 2,
                px: 2.5,
                py: 1,
                minHeight: 40,
                textTransform: "none",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 0.75,
              }}
            >
              {sending ? (
                <CircularProgress size={18} sx={{ color: "#FFFFFF" }} />
              ) : (
                <>
                  <Typography variant="body2" sx={{ fontWeight: 600, display: { xs: "none", sm: "inline" } }}>
                    Send
                  </Typography>
                  <SendIcon sx={{ fontSize: 16 }} />
                </>
              )}
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* Lightbox Modal for Photo Enlarge */}
      <Dialog
        open={Boolean(activePhotoModal)}
        onClose={() => setActivePhotoModal(null)}
        maxWidth="md"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              bgcolor: "#0F172A",
              color: "#FFFFFF",
              borderRadius: 3,
              overflow: "hidden",
            },
          },
        }}
      >
        {activePhotoModal && (
          <>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                px: 2.5,
                py: 1.5,
                borderBottom: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "#F8FAFC" }}>
                  Photo by {activePhotoModal.author}
                </Typography>
                <Typography variant="caption" sx={{ color: "#94A3B8" }}>
                  {activePhotoModal.timestamp}
                </Typography>
              </Box>
              <IconButton onClick={() => setActivePhotoModal(null)} sx={{ color: "#94A3B8", "&:hover": { color: "#FFFFFF" } }}>
                <CloseIcon />
              </IconButton>
            </Box>

            <DialogContent sx={{ p: 1, display: "flex", flexDirection: "column", alignItems: "center", bgcolor: "#020617" }}>
              <Box
                component="img"
                src={activePhotoModal.url}
                alt="Enlarged store photograph"
                sx={{
                  maxWidth: "100%",
                  maxHeight: "75vh",
                  objectFit: "contain",
                  borderRadius: 1.5,
                }}
              />
              {activePhotoModal.caption && (
                <Typography variant="body2" sx={{ color: "#E2E8F0", mt: 1.5, textAlign: "center", px: 2 }}>
                  {activePhotoModal.caption}
                </Typography>
              )}
            </DialogContent>
          </>
        )}
      </Dialog>
    </Box>
  );
}
