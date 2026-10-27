import { supabase } from "../config/supabase";

export type ChatCategory = "General" | "Material" | "Location" | "Document" | "Urgent";

export interface StoreChatMessage {
  id: string;
  created_at: string;
  author_name: string;
  message: string;
  photo_url: string | null;
  category: ChatCategory;
  user_id?: string | null;
}

export interface PostMessageInput {
  author_name?: string;
  message: string;
  photo_url?: string | null;
  category?: ChatCategory;
}

const STORAGE_KEY = "stores_chat_messages_cache_v2";
const DEFAULT_AUTHOR_KEY = "stores_chat_author_name";
const BUCKET_NAME = "receipt-photos";

/**
 * Default sample message so the timeline is never a blank void when first opened.
 */
const INITIAL_SEED_MESSAGES: StoreChatMessage[] = [
  {
    id: "seed-msg-1",
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    author_name: "Store In-Charge",
    message: "Store Chat & Activity Log is active. Use this board to log material receipts, storage bin changes, inspection status, gate slips, or shift handovers with photographs.",
    photo_url: null,
    category: "General",
  },
];

/**
 * Gets cached messages from localStorage
 */
function getLocalMessages(): StoreChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_SEED_MESSAGES));
      return INITIAL_SEED_MESSAGES;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : INITIAL_SEED_MESSAGES;
  } catch (err) {
    console.warn("Failed to read store chat local cache", err);
    return INITIAL_SEED_MESSAGES;
  }
}

/**
 * Saves messages to localStorage
 */
function saveLocalMessages(messages: StoreChatMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch (err) {
    console.warn("Failed to save store chat local cache", err);
  }
}

/**
 * Get the last used author name from localStorage
 */
export function getSavedAuthorName(): string {
  try {
    return localStorage.getItem(DEFAULT_AUTHOR_KEY) || "Store Staff";
  } catch {
    return "Store Staff";
  }
}

/**
 * Remember author name for future posts
 */
export function saveAuthorName(name: string): void {
  try {
    const clean = name.trim();
    if (clean) {
      localStorage.setItem(DEFAULT_AUTHOR_KEY, clean);
    }
  } catch {
    // Ignore storage errors
  }
}

export interface FetchMessagesResult {
  messages: StoreChatMessage[];
  isFallback: boolean;
  error?: string;
}

/**
 * Fetches store chat messages from Supabase, falling back to local storage
 * if the table has not yet been migrated in Supabase.
 */
export async function getStoreChatMessages(categoryFilter?: string): Promise<FetchMessagesResult> {
  try {
    let query = supabase
      .from("store_chat_messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (categoryFilter && categoryFilter !== "All") {
      query = query.eq("category", categoryFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.warn("Supabase store_chat_messages query returned error:", error.message);
      // Fallback to local
      let local = getLocalMessages();
      if (categoryFilter && categoryFilter !== "All") {
        local = local.filter((m) => m.category === categoryFilter);
      }
      return {
        messages: local,
        isFallback: true,
        error: error.message,
      };
    }

    if (data && data.length > 0) {
      // Sync local cache with latest data
      saveLocalMessages(data);
      return { messages: data as StoreChatMessage[], isFallback: false };
    }

    // If remote table exists but has 0 records, return local cache or empty
    const local = getLocalMessages();
    return {
      messages: local.length > 0 ? local : [],
      isFallback: false,
    };
  } catch (err: unknown) {
    console.warn("Network or client error fetching store chat:", err);
    let local = getLocalMessages();
    if (categoryFilter && categoryFilter !== "All") {
      local = local.filter((m) => m.category === categoryFilter);
    }
    return {
      messages: local,
      isFallback: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Post a new store chat message.
 */
export async function postStoreChatMessage(input: PostMessageInput): Promise<{
  message: StoreChatMessage;
  isFallback: boolean;
}> {
  const author = (input.author_name && input.author_name.trim()) || "Store Staff";
  saveAuthorName(author);

  const newMsg: StoreChatMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
    author_name: author,
    message: input.message.trim(),
    photo_url: input.photo_url || null,
    category: input.category || "General",
  };

  try {
    // Attempt Supabase insert
    const { data, error } = await supabase
      .from("store_chat_messages")
      .insert([
        {
          author_name: newMsg.author_name,
          message: newMsg.message,
          photo_url: newMsg.photo_url,
          category: newMsg.category,
        },
      ])
      .select()
      .single();

    if (error) {
      console.warn("Error inserting to Supabase store_chat_messages:", error.message);
      // Fallback save locally
      const local = getLocalMessages();
      const updated = [newMsg, ...local];
      saveLocalMessages(updated);
      return { message: newMsg, isFallback: true };
    }

    const saved = data as StoreChatMessage;
    const local = getLocalMessages();
    saveLocalMessages([saved, ...local.filter((m) => m.id !== saved.id)]);
    return { message: saved, isFallback: false };
  } catch (err) {
    console.warn("Exception posting chat message, falling back to local:", err);
    const local = getLocalMessages();
    const updated = [newMsg, ...local];
    saveLocalMessages(updated);
    return { message: newMsg, isFallback: true };
  }
}

/**
 * Deletes a chat message by ID
 */
export async function deleteStoreChatMessage(id: string): Promise<boolean> {
  let success = false;
  try {
    const { error } = await supabase.from("store_chat_messages").delete().eq("id", id);
    if (!error) success = true;
  } catch {
    // Ignore error
  }

  // Also remove from local cache
  const local = getLocalMessages().filter((m) => m.id !== id);
  saveLocalMessages(local);
  return success;
}

/**
 * Compress an image file in browser to ensure swift upload and low bandwidth consumption
 */
async function compressImageToDataUrl(file: File, maxDimension = 1400, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads a photograph to Supabase Storage (receipt-photos bucket)
 * with automatic fallback to compressed base64 data URL so photos never fail!
 */
export async function uploadStoreChatPhoto(file: File): Promise<string> {
  try {
    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const path = `store-chat/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(path, file, { cacheControl: "3600", upsert: true });

    if (!uploadError) {
      const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);
      if (data?.publicUrl) {
        return data.publicUrl;
      }
    }
    console.warn("Storage upload failed or returned no URL, using compressed base64 fallback");
  } catch (err) {
    console.warn("Storage upload exception, using compressed base64 fallback:", err);
  }

  // Resilient fallback: compressed base64 representation
  return await compressImageToDataUrl(file, 1200, 0.78);
}

/**
 * Format a timestamp into user-friendly time and date
 */
export function formatTimeOnly(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
  } catch {
    return "";
  }
}

export function formatFullDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    const dateStr = d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const timeStr = d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    return `${dateStr} at ${timeStr}`;
  } catch {
    return iso;
  }
}

export function getDateGroupHeader(iso: string): string {
  try {
    const target = new Date(iso);
    const now = new Date();

    const isToday =
      target.getDate() === now.getDate() &&
      target.getMonth() === now.getMonth() &&
      target.getFullYear() === now.getFullYear();

    if (isToday) return "Today";

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      target.getDate() === yesterday.getDate() &&
      target.getMonth() === yesterday.getMonth() &&
      target.getFullYear() === yesterday.getFullYear();

    if (isYesterday) return "Yesterday";

    return target.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "Previous";
  }
}
