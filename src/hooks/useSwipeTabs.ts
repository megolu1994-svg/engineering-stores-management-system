import { useRef, type TouchEvent } from "react";

const SWIPE_DISTANCE_THRESHOLD = 50;

// Gestures starting on these should never be hijacked as a tab swipe -
// text selection/cursor drag in a field, an open Autocomplete dropdown,
// or a slider drag all involve horizontal touch movement that isn't
// meant to change tabs.
const SWIPE_IGNORE_SELECTOR =
  "input, textarea, [role='listbox'], .MuiAutocomplete-popper, .MuiSlider-root";

/**
 * Lets the currently-active tab be changed with a left/right swipe, in
 * addition to tapping the tab strip - mirrors the swipe-between-tabs
 * behavior of native mobile apps. Spread the returned handlers onto the
 * Box that wraps the tab panels (not the Tabs strip itself).
 */
export function useSwipeTabs(
  value: number,
  onChange: (next: number) => void,
  count: number
) {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);

  function onTouchStart(e: TouchEvent) {
    if (e.touches.length !== 1) {
      startX.current = null;
      startY.current = null;
      return;
    }

    const target = e.target as HTMLElement;

    if (target.closest(SWIPE_IGNORE_SELECTOR)) {
      startX.current = null;
      startY.current = null;
      return;
    }

    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
  }

  function onTouchEnd(e: TouchEvent) {
    if (startX.current === null || startY.current === null) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - startX.current;
    const deltaY = touch.clientY - startY.current;

    startX.current = null;
    startY.current = null;

    if (Math.abs(deltaX) < SWIPE_DISTANCE_THRESHOLD) return;
    if (Math.abs(deltaX) < Math.abs(deltaY)) return;

    if (deltaX < 0 && value < count - 1) {
      onChange(value + 1);
    } else if (deltaX > 0 && value > 0) {
      onChange(value - 1);
    }
  }

  return { onTouchStart, onTouchEnd };
}
