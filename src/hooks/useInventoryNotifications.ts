import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "../config/supabase";
import type { InventoryTransactionType } from "../services/inventoryTransactionService";

/* =========================================================================
 * Desktop header notifications
 *
 * Listens for realtime INSERTs on `inventory_transactions` (every stock
 * movement - Opening Stock, Adjustment, Allocation, Material Receipt,
 * Material Issue, Location Transfer) and `receipt_header` (DRC creation),
 * and turns each one into a bell notification. Best-effort only, exactly
 * like the rest of the transaction logging: if realtime isn't reachable
 * the bell just stays quiet, nothing else in the app depends on it.
 * ========================================================================= */

export interface AppNotification {
  id: string;
  message: string;
  createdAt: string;
}

const TRANSACTION_LABELS: Record<InventoryTransactionType, string> = {
  OPENING_STOCK: "Opening Stock",
  ADJUSTMENT: "Stock Adjustment",
  ALLOCATION: "Stock Allocation",
  MATERIAL_RECEIPT: "Material Receipt",
  MATERIAL_ISSUE: "Material Issue",
  LOCATION_TRANSFER: "Location Transfer",
};

const MAX_NOTIFICATIONS = 20;

interface InventoryTransactionRow {
  transaction_type: InventoryTransactionType;
  material_code: string;
  location_code: string;
  quantity: number;
  movement: "IN" | "OUT";
  reference_number: string | null;
  created_at: string;
}

interface ReceiptHeaderRow {
  drc_number: string;
  vendor_name: string;
  created_at: string;
}

/** Short synthesized chime - no audio asset needed. Silently no-ops if the
 * browser blocks/lacks Web Audio (autoplay policy, unsupported browser). */
function playChime() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.4);
    oscillator.onended = () => ctx.close();
  } catch {
    // Never let a notification sound break the app.
  }
}

/**
 * `enabled` gates the realtime subscription itself (not just the UI) -
 * pass `false` on mobile so this feature has zero footprint there.
 */
export function useInventoryNotifications(enabled: boolean) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [ringKey, setRingKey] = useState(0);

  // Session-only dedupe for paired ledger rows (e.g. a Location Transfer
  // writes an OUT row at the FROM location and an IN row at the TO
  // location, sharing one reference_number) so one logical action is one
  // notification, not two.
  const seenReferenceKeys = useRef(new Set<string>());
  const descriptionCache = useRef(new Map<string, string>());

  const addNotification = useCallback((message: string, createdAt: string) => {
    setNotifications((prev) =>
      [
        {
          id: `${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
          message,
          createdAt,
        },
        ...prev,
      ].slice(0, MAX_NOTIFICATIONS)
    );
    setUnreadCount((prev) => prev + 1);
    setRingKey((prev) => prev + 1);
    playChime();
  }, []);

  useEffect(() => {
    if (!enabled) return;

    async function describeMaterial(materialCode: string): Promise<string> {
      const cached = descriptionCache.current.get(materialCode);
      if (cached !== undefined) return cached;

      const { data } = await supabase
        .from("material_master")
        .select("short_description")
        .eq("material_code", materialCode)
        .maybeSingle();

      const description = data?.short_description || materialCode;
      descriptionCache.current.set(materialCode, description);
      return description;
    }

    const channel = supabase
      .channel("app-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "inventory_transactions" },
        (payload) => {
          const row = payload.new as InventoryTransactionRow;

          const dedupeKey = row.reference_number
            ? `${row.transaction_type}:${row.reference_number}`
            : null;

          if (dedupeKey) {
            if (seenReferenceKeys.current.has(dedupeKey)) return;
            seenReferenceKeys.current.add(dedupeKey);
          }

          const label = TRANSACTION_LABELS[row.transaction_type] ?? row.transaction_type;
          const verb = row.movement === "IN" ? "to" : "from";

          describeMaterial(row.material_code).then((description) => {
            addNotification(
              `${label}: ${row.quantity} x ${description} ${verb} ${row.location_code}`,
              row.created_at
            );
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "receipt_header" },
        (payload) => {
          const row = payload.new as ReceiptHeaderRow;
          addNotification(
            `DRC Created: ${row.drc_number} (${row.vendor_name})`,
            row.created_at
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, addNotification]);

  const markAllRead = useCallback(() => setUnreadCount(0), []);

  return { notifications, unreadCount, ringKey, markAllRead };
}
