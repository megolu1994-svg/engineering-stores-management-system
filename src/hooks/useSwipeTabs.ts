import { useEffect, useRef, useState } from "react";

const SWIPE_DISTANCE_THRESHOLD = 50;

// Gestures starting on any of these should never be hijacked as a tab
// swipe: text selection/cursor drag in a field, an open Autocomplete
// dropdown, a slider drag, or anything inside an overlay (Dialog, Menu,
// Popover, the mobile Drawer) - all of those involve horizontal touch
// movement, or sit on top of the page, without meaning to change tabs.
const SWIPE_IGNORE_SELECTOR =
  "input, textarea, [role='listbox'], .MuiAutocomplete-popper, .MuiSlider-root, .MuiModal-root, .MuiAppBar-root, .MuiDrawer-root";

export type SwipeDirection = "left" | "right";

/** Dispatched on `window` when a right swipe happens while already on the
 * first tab (nowhere left to go) - AppLayout listens for this to open the
 * navigation drawer, so swiping right "runs out" of tabs into the menu. */
export const SWIPE_OPEN_DRAWER_EVENT = "esms:swipe-open-drawer";

/**
 * Lets the currently-active tab be changed with a left/right swipe,
 * anywhere on the page - including empty background, not just on top of
 * cards - in addition to tapping the tab strip. Also tracks which way
 * the active tab last moved (whether by swipe or by tapping a tab), so
 * the caller can animate the panel sliding in from the right direction.
 *
 * The listeners are attached to `document` (not a wrapping element) so
 * there's no "dead zone": a tab's content can be shorter than the
 * screen, and the blank space below it still responds to a swipe.
 */
export function useSwipeTabs(
  value: number,
  onChange: (next: number) => void,
  count: number
) {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const triggered = useRef(false);

  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const countRef = useRef(count);

  useEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
    countRef.current = count;
  });

  useEffect(() => {
    function reset() {
      startX.current = null;
      startY.current = null;
      triggered.current = false;
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) {
        reset();
        return;
      }

      const target = e.target as HTMLElement;

      if (target.closest(SWIPE_IGNORE_SELECTOR)) {
        reset();
        return;
      }

      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      triggered.current = false;
    }

    function onTouchMove(e: TouchEvent) {
      if (startX.current === null || startY.current === null || triggered.current) {
        return;
      }

      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - startX.current;
      const deltaY = touch.clientY - startY.current;

      if (Math.abs(deltaX) < SWIPE_DISTANCE_THRESHOLD) return;
      if (Math.abs(deltaX) < Math.abs(deltaY)) return;

      triggered.current = true;

      const current = valueRef.current;

      if (deltaX < 0 && current < countRef.current - 1) {
        onChangeRef.current(current + 1);
      } else if (deltaX > 0 && current > 0) {
        onChangeRef.current(current - 1);
      } else if (deltaX > 0 && current === 0) {
        // Already on the first tab - nothing left to swipe back to, so
        // hand the gesture off to open the drawer instead.
        window.dispatchEvent(new CustomEvent(SWIPE_OPEN_DRAWER_EVENT));
      }
    }

    document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    document.addEventListener("touchmove", onTouchMove, { capture: true, passive: true });
    document.addEventListener("touchend", reset, { capture: true, passive: true });
    document.addEventListener("touchcancel", reset, { capture: true, passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart, { capture: true });
      document.removeEventListener("touchmove", onTouchMove, { capture: true });
      document.removeEventListener("touchend", reset, { capture: true });
      document.removeEventListener("touchcancel", reset, { capture: true });
    };
  }, []);

  // Tracks which way the active tab last moved, from any cause (swipe or
  // tapping the tab strip), purely by comparing to the previous value -
  // so the panel transition direction is always correct.
  const [direction, setDirection] = useState<SwipeDirection>("left");
  const prevValue = useRef(value);

  useEffect(() => {
    if (value !== prevValue.current) {
      setDirection(value > prevValue.current ? "left" : "right");
      prevValue.current = value;
    }
  }, [value]);

  return { direction };
}
