import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

function storageKey(key: string): string {
  return `esms:draft:${key}`;
}

function readDraft<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(storageKey(key));
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Removes a persisted draft outside of React (no re-render). Useful when
 * a parent needs to discard a child's stale draft before it mounts - e.g.
 * clearing a leftover "Add" draft right before opening a fresh Add form,
 * so an abandoned attempt from earlier doesn't resurface in an unrelated
 * later one.
 */
export function clearPersistedDraft(key: string): void {
  try {
    sessionStorage.removeItem(storageKey(key));
  } catch {
    // ignore
  }
}

/**
 * Drop-in replacement for useState that mirrors the value to
 * sessionStorage under `key`. Screens in this app are routed with
 * react-router, which unmounts the previous page (and its useState)
 * on every navigation - this hook lets an in-progress form survive
 * the user switching to another screen and coming back, instead of
 * forcing them to re-enter everything.
 *
 * `key` must be unique per form field/instance and stable for the
 * life of the component.
 */
export function usePersistentState<T>(
  key: string,
  initialValue: T
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const [state, setState] = useState<T>(() => readDraft(key, initialValue));

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey(key), JSON.stringify(state));
    } catch {
      // Ignore storage errors (quota exceeded, private browsing, etc.) -
      // the form still works, it just won't survive navigation.
    }
  }, [key, state]);

  function clearDraft() {
    try {
      sessionStorage.removeItem(storageKey(key));
    } catch {
      // ignore
    }
    setState(initialValue);
  }

  return [state, setState, clearDraft];
}
