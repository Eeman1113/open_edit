// Validation for content-catalogue data coming from an external provider. Every function takes untrusted JSON and
// returns a clean, size-limited object (or drops the entry). Extra fields are stripped so nothing unexpected reaches
// the client. Client-safe: no server imports.
import { ART_OPS, type ArtOp, type ArtStyle, type CatalogItem, type Track } from "./types";

const MAX_ITEMS = 500;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 200): string | undefined =>
  typeof v === "string" && v.trim() ? v.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : typeof v === "number" ? String(v) : undefined;
const num = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined;
const color = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : undefined);

/**
 * Resolves a media URL from a provider against its base URL. Only http(s) URLs (and site-relative paths for the
 * local catalogue) are allowed, so a provider cannot inject javascript: or data: URLs.
 */
export function safeUrl(v: unknown, base?: string): string | undefined {
  const s = str(v, 2048);
  if (!s) return undefined;
  if (!base && s.startsWith("/") && !s.startsWith("//")) return s;
  try {
    const u = new URL(s, base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}

const list = (v: unknown, key: string): unknown[] => {
  const arr = Array.isArray(v) ? v : isObj(v) && Array.isArray(v[key]) ? (v[key] as unknown[]) : [];
  return arr.slice(0, MAX_ITEMS);
};

export function cleanTracks(v: unknown, base?: string): Track[] {
  return list(v, "tracks").flatMap((t): Track[] => {
    if (!isObj(t)) return [];
    const id = str(t.id, 80), title = str(t.title ?? t.name, 120), url = safeUrl(t.url ?? t.src, base);
    if (!id || !title || !url) return [];
    return [{ id, title, url, artist: str(t.artist, 120), duration: num(t.duration, 0, 3600), mood: str(t.mood, 40), bpm: num(t.bpm, 20, 300), cover: safeUrl(t.cover, base) }];
  });
}

function cleanOp(o: unknown): ArtOp | null {
  if (!isObj(o) || !ART_OPS.includes(o.op as (typeof ART_OPS)[number])) return null;
  const n = (k: string, min: number, max: number, d: number) => num(o[k], min, max) ?? d;
  switch (o.op) {
    case "smooth": return { op: "smooth", radius: n("radius", 0, 0.05, 0.005) };
    case "posterize": return { op: "posterize", levels: Math.round(n("levels", 2, 32, 6)) };
    case "saturate": return { op: "saturate", amount: n("amount", 0, 3, 1) };
    case "contrast": return { op: "contrast", amount: n("amount", 0, 3, 1) };
    case "brightness": return { op: "brightness", amount: n("amount", -1, 1, 0) };
    case "edges": return { op: "edges", strength: n("strength", 0, 1, 0.8), threshold: n("threshold", 0.01, 1, 0.15), color: color(o.color) };
    case "sketch": return { op: "sketch", strength: n("strength", 0, 1, 1) };
    case "duotone": { const dark = color(o.dark), light = color(o.light); return dark && light ? { op: "duotone", dark, light } : null; }
    case "halftone": return { op: "halftone", cell: n("cell", 0.003, 0.05, 0.012), angle: n("angle", -Math.PI, Math.PI, 0.4) };
    case "grain": return { op: "grain", amount: n("amount", 0, 0.5, 0.05) };
    case "paper": { const c = color(o.color); return c ? { op: "paper", color: c, amount: n("amount", 0, 1, 0.3) } : null; }
  }
  return null;
}

export function cleanArtStyles(v: unknown, base?: string): ArtStyle[] {
  return list(v, "styles").flatMap((s): ArtStyle[] => {
    if (!isObj(s) || !Array.isArray(s.ops)) return [];
    const id = str(s.id, 80), name = str(s.name, 60);
    const ops = s.ops.slice(0, 16).map(cleanOp).filter((o): o is ArtOp => !!o);
    if (!id || !name || !ops.length) return [];
    return [{ id, name, about: str(s.about, 200), thumbnail: safeUrl(s.thumbnail, base), ops }];
  });
}

export function cleanItems(v: unknown, base?: string): CatalogItem[] {
  return list(v, "items").flatMap((it): CatalogItem[] => {
    if (!isObj(it)) return [];
    const id = str(it.id, 120), name = str(it.name ?? it.title, 120);
    if (!id || !name) return [];
    const href = typeof it.href === "string" && /^\/(?!\/)[\w\-/?=&%.]*$/.test(it.href) ? it.href.slice(0, 300) : undefined; // in-app routes only
    const tags = Array.isArray(it.tags) ? it.tags.slice(0, 12).map((t) => str(t, 40)).filter((t): t is string => !!t) : undefined;
    return [{ id, name, thumbnail: safeUrl(it.thumbnail, base), kind: str(it.kind, 32), href, tags }];
  });
}

export interface RemoteSticker { id: number; name?: string; thumbnail: string; json?: unknown }
export interface RemoteStickerCategory { id: number; text?: string; stickers: RemoteSticker[]; server?: boolean }

/** Sticker categories. Sticker definitions (`json`) are passed through as data (size-capped); they are never executed. */
export function cleanStickerCategories(v: unknown, base?: string): RemoteStickerCategory[] {
  return list(v, "categories").slice(0, 50).flatMap((c): RemoteStickerCategory[] => {
    if (!isObj(c) || !Array.isArray(c.stickers)) return [];
    const id = num(c.id, -1e9, 1e9);
    if (id == null) return [];
    const stickers = c.stickers.slice(0, 300).flatMap((s): RemoteSticker[] => {
      if (!isObj(s)) return [];
      const sid = num(s.id, -1e9, 1e9), thumbnail = safeUrl(s.thumbnail, base);
      if (sid == null || !thumbnail) return [];
      const json = s.json !== undefined && JSON.stringify(s.json).length <= 64_000 ? s.json : undefined;
      return [{ id: sid, name: str(s.name, 80), thumbnail, json }];
    });
    return [{ id, text: str(c.text ?? c.name, 40), stickers, server: true }];
  });
}
