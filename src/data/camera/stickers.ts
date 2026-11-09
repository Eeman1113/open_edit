// Sticker (effect) catalogue. The built-in set comes from the asset pack: every `sticker` entry carries its
// definition (STICKER_FORMAT.md) in `meta.def`, its art lives under the pack's stickers root, and its preview is the
// matching `sticker-thumb`. A remote catalogue can be added through the content API; offline the built-in set is
// all there is.
import { getAsset, getAssetMeta, listAssets } from "@/lib/assets";
import { asset } from "@/lib/base";

export interface Sticker {
  id: number;
  /** Preview image URL. */
  thumbnail: string;
  name?: string;
  /** Sticker definition (STICKER_FORMAT.md); resources resolve against STICKER_BASE. */
  json?: unknown;
}

export interface StickerCategory {
  id: number;
  /** Text tab label. */
  text?: string;
  /** Icon ids (selected / unselected). */
  icon?: string;
  grayIcon?: string;
  stickers: Sticker[];
  /** Remote category: content comes from the catalogue API. */
  server?: boolean;
}

/** Base URL that sticker resource names resolve against. */
export const STICKER_BASE = getAsset("root", "stickers");

interface StickerMeta { id: number; name: string; def: unknown }

/** Built-in stickers, in pack order. */
export const STARTER_STICKERS: Sticker[] = listAssets("sticker").flatMap((slug) => {
  const m = getAssetMeta<StickerMeta>("sticker", slug);
  return m ? [{ id: m.id, name: m.name, thumbnail: getAsset("sticker-thumb", slug), json: m.def }] : [];
});

/** Local categories (same shape as a remote catalogue). */
export const LOCAL_STICKER_CATEGORIES: StickerCategory[] = [
  { id: -100, text: "Featured", icon: "sparkles", grayIcon: "sparkles", stickers: STARTER_STICKERS },
];

/**
 * Remote catalogue (GET /api/stickers, served by a route handler when a provider is configured). Resolves with no
 * categories when the app has no provider (the built-in set is then all there is); rejects only on network errors.
 */
export async function fetchStickerCatalog(): Promise<StickerCategory[]> {
  const r = await fetch(asset("/api/stickers"), { headers: { accept: "application/json" } });
  if (!r.ok) return [];
  const j: unknown = await r.json().catch(() => null);
  return Array.isArray(j) ? (j as StickerCategory[]) : [];
}

export const findSticker = (id: number | null | undefined) => (id == null ? undefined : STARTER_STICKERS.find((s) => s.id === id));
