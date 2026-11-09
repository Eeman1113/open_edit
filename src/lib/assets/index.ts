// Asset pack lookup. The built-in "open" pack (public/packs/open/manifest.json) is bundled, so lookups are
// synchronous from the first render. When NEXT_PUBLIC_ASSET_PACK names another pack, its manifest is fetched at
// startup and takes over; ids it does not provide fall back to the open pack.
//
//   getAsset("filter", "warm-film")        -> "/packs/open/filters/warm-film.png"
//   useAsset("icon", "camera")             -> same, re-rendering when a custom pack finishes loading
//   getAssetMeta<{ name: string }>("filter", "warm-film")
import { useSyncExternalStore } from "react";
import { asset } from "@/lib/base";
import openManifest from "../../../public/packs/open/manifest.json";
import type { AssetEntry, AssetKind, AssetManifest } from "./types";

export type { AssetEntry, AssetKind, AssetManifest } from "./types";

/** Built-in pack id. */
export const OPEN_PACK = "open";
/** Active pack id (NEXT_PUBLIC_ASSET_PACK, default "open"). */
export const ACTIVE_PACK = (process.env.NEXT_PUBLIC_ASSET_PACK || OPEN_PACK).replace(/[^a-z0-9_-]/gi, "") || OPEN_PACK;

const OPEN = openManifest as AssetManifest;
let active: AssetManifest | null = ACTIVE_PACK === OPEN_PACK ? OPEN : null;
let version = 0;
const listeners = new Set<() => void>();

/** URL of a file inside a pack. */
export const packUrl = (pack: string, path: string) => asset(`/packs/${pack}/${path}`);

function lookup(kind: AssetKind, id: string): { pack: string; entry: AssetEntry } | undefined {
  const a = active?.kinds[kind]?.[id];
  if (a && active) return { pack: active.name || ACTIVE_PACK, entry: a };
  const o = OPEN.kinds[kind]?.[id];
  return o ? { pack: OPEN_PACK, entry: o } : undefined;
}

/** Manifest entry for (kind, id), from the active pack or the open fallback. */
export function getAssetEntry(kind: AssetKind, id: string): AssetEntry | undefined {
  return lookup(kind, id)?.entry;
}

/** URL of an asset, or "" when no pack provides it. */
export function getAsset(kind: AssetKind, id: string): string {
  const hit = lookup(kind, id);
  if (!hit) {
    if (process.env.NODE_ENV !== "production") console.warn(`asset pack: no ${kind} "${id}"`);
    return "";
  }
  return packUrl(hit.pack, hit.entry.path);
}

/** True when some pack provides (kind, id). */
export const hasAsset = (kind: AssetKind, id: string) => !!lookup(kind, id);

/** The entry's `meta`, typed by the caller. */
export function getAssetMeta<T = Record<string, unknown>>(kind: AssetKind, id: string): T | undefined {
  return lookup(kind, id)?.entry.meta as T | undefined;
}

/** All ids of a kind (active pack first, then open ids it does not override), in manifest order. */
export function listAssets(kind: AssetKind): string[] {
  const ids = Object.keys(active?.kinds[kind] ?? {});
  for (const id of Object.keys(OPEN.kinds[kind] ?? {})) if (!ids.includes(id)) ids.push(id);
  return ids;
}

/** The active manifest (the open pack until a custom pack has loaded). */
export const activeManifest = (): AssetManifest => active ?? OPEN;

let loading: Promise<void> | null = null;
/** Loads the active pack's manifest (no-op for the open pack). Resolves when lookups use it. */
export function loadAssetPack(): Promise<void> {
  if (active) return Promise.resolve();
  loading ??= fetch(packUrl(ACTIVE_PACK, "manifest.json"))
    .then((r) => (r.ok ? (r.json() as Promise<AssetManifest>) : Promise.reject(new Error(`asset pack "${ACTIVE_PACK}" not found`))))
    .then((m) => { active = { ...m, name: m.name || ACTIVE_PACK }; })
    .catch((e) => { console.warn(String(e), "- using the open pack"); active = OPEN; })
    .finally(() => { version++; for (const l of listeners) l(); });
  return loading;
}
if (typeof window !== "undefined" && !active) void loadAssetPack();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
const snapshot = () => version;

/** React: URL of an asset; re-renders when a custom pack's manifest arrives. */
export function useAsset(kind: AssetKind, id: string): string {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  return getAsset(kind, id);
}

/** React: re-render on pack changes (for components that call getAsset many times). */
export function useAssetPack(): AssetManifest {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  return activeManifest();
}
