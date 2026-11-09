// Camera / app preferences, persisted in localStorage (one JSON value per key) with live updates across components.
import { useCallback, useSyncExternalStore } from "react";

/** Storage keys of the app preferences (all namespaced "oe."). Use these constants, never raw strings. */
export const SETTINGS = {
  /** true = full-resolution capture, false = faster shooting (default). */
  highResolution: "oe.camera.highResolution",
  /** Save front-camera photos as previewed (mirrored). */
  mirrorFront: "oe.camera.mirrorFront",
  antiBlemish: "oe.camera.antiBlemish",
  gridLines: "oe.camera.gridLines",
  /** "New" badge on the grid setting (off on a fresh install). */
  gridBadge: "oe.camera.gridBadge",
  locationExif: "oe.capture.locationExif",
  /** Open_Edit watermark on captures. */
  watermark: "oe.capture.watermark",
  optimiseMaleMakeup: "oe.beauty.optimiseMaleMakeup",
  storageOptimisation: "oe.storage.optimise",
} as const;

export const SETTING_DEFAULTS = {
  [SETTINGS.highResolution]: false,
  [SETTINGS.mirrorFront]: true,
  [SETTINGS.antiBlemish]: false,
  [SETTINGS.gridLines]: false,
  [SETTINGS.gridBadge]: false,
  [SETTINGS.locationExif]: false,
  [SETTINGS.watermark]: false,
  [SETTINGS.optimiseMaleMakeup]: true,
  [SETTINGS.storageOptimisation]: true,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

/**
 * Keys written by pre-release builds under names that were not namespaced. They are removed once per browser
 * (their values are not carried over: the old builds were development previews).
 */
const LEGACY_KEYS = [
  "highResolutionMode", "isMirrorMode", "keyIsAntiBlemishMode", "gridPreviewMode", "isGridSettingNewMark",
  "isUseLocationExif", "isUseWatermark_v510", "optimizeMaleMakeupStatus", "isUseStorageOptimization",
  "photoEditShowStampShopTooltip", "keyShowReshapePartialOptionTooltip", "keyMakeupSelectFaceTooptipCount",
  "keyBeautySelectFaceTooptipCount",
];
const MIGRATED = "oe.settings.migrated";

/** One-time cleanup of the legacy keys. Safe to call repeatedly; runs automatically when this module loads. */
export function migrateLegacySettings() {
  try {
    if (localStorage.getItem(MIGRATED) === "1") return;
    for (const k of LEGACY_KEYS) localStorage.removeItem(k);
    localStorage.setItem(MIGRATED, "1");
  } catch {
    /* storage unavailable */
  }
}
if (typeof window !== "undefined") migrateLegacySettings();

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
 * `const [mirror, setMirror] = useSetting(SETTINGS.mirrorFront, true)`.
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
