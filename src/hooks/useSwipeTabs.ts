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
 * behavior of native mobile apps.
 *
 * Spread the returned handlers onto the Box that wraps the tab panels
 * (not the Tabs strip itself). Two things make this resilient to the
 * tab content being full of interactive MUI components (Autocomplete,
 * CardActionArea ripples, etc.):
 *  - the handlers use the *capture* phase, so they see the gesture
 *    before any descendant can stop it from propagating;
 *  - the swipe is detected during touchmove, not on touchend - so it
 *    doesn't depend on touchend actually firing, which some WebViews
 *    skip (firing touchcancel instead) once a scroll gesture engages.
 */
export function useSwipeTabs(
  value: number,
  onChange: (next: number) => void,
  count: number
) {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const triggered = useRef(false);

  function reset() {
    startX.current = null;
    startY.current = null;
    triggered.current = false;
  }

  function onTouchStartCapture(e: TouchEvent) {
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

  function onTouchMoveCapture(e: TouchEvent) {
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

    if (deltaX < 0 && value < count - 1) {
      onChange(value + 1);
    } else if (deltaX > 0 && value > 0) {
      onChange(value - 1);
    }
  }

  return {
    onTouchStartCapture,
    onTouchMoveCapture,
    onTouchEndCapture: reset,
    onTouchCancelCapture: reset,
  };
}
