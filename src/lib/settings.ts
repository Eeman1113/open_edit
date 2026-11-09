// Camera / app preferences, persisted in localStorage (one JSON value per key) with live updates across components.
import { useCallback, useSyncExternalStore } from "react";

export const SETTING_DEFAULTS = {
  /** true = "High resolution" radio, false = "High-speed shooting" (default). */
  highResolutionMode: false,
  isMirrorMode: true,
  keyIsAntiBlemishMode: false,
  gridPreviewMode: false,
  /** "New" badge on the grid setting (off on a fresh install). */
  isGridSettingNewMark: false,
  isUseLocationExif: false,
  /** Open_Edit watermark on captures. */
  isUseWatermark_v510: false,
  optimizeMaleMakeupStatus: true,
  isUseStorageOptimization: true,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

const EVENT = "openedit:setting";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/** Read a setting outside React (e.g. inside a capture pipeline). */
export function getSetting<T = boolean>(key: string, fallback?: T): T {
  const def = (fallback ?? (SETTING_DEFAULTS as Record<string, unknown>)[key]) as T;
  if (typeof window === "undefined") return def;
  return read(key, def);
}

export function setSetting<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
  } catch {
    /* noop */
  }
}

function subscribe(cb: () => void) {
  const onStorage = () => cb();
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * `const [mirror, setMirror] = useSetting("isMirrorMode", true)`.
 * Values are JSON-serialised; primitives keep referential equality so the snapshot is stable.
 */
export function useSetting<T extends boolean | number | string>(key: string, def: T): [T, (v: T) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read<T>(key, def),
    () => def,
  );
  const set = useCallback((v: T) => setSetting(key, v), [key]);
  return [value, set];
}
