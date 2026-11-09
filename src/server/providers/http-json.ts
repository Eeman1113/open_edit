// Generic HTTP/JSON provider adapter ("http-json"). Expects a small REST API under the configured base URL:
//
//   GET {base}/music?q=&limit=&offset=           → { tracks: Track[] }        (or a bare array)
//   GET {base}/art-styles?q=&limit=&offset=      → { styles: ArtStyle[] }
//   GET {base}/looks/{kind}?q=&limit=&offset=    → { items: CatalogItem[] }
//   GET {base}/stickers?q=&limit=&offset=        → { categories: StickerCategory[] }
//   GET {base}/templates?q=&limit=&offset=       → { items: CatalogItem[] }
//   GET {base}/feed/{name}                       → feed JSON (same shape as src/data/home.json / discover.json)
//
// The key is sent as `Authorization: Bearer <key>`. Relative media URLs resolve against the base URL. Responses
// are validated and stripped by src/lib/content/validate.ts before they reach the client.
import "server-only";
import { cleanArtStyles, cleanItems, cleanStickerCategories, cleanTracks } from "@/lib/content/validate";
import type { ProviderConfig } from "../env";
import type { CatalogQuery, ContentProvider } from "./types";

const MAX_BYTES = 2_000_000;

export function httpJsonProvider(cfg: ProviderConfig): ContentProvider {
  const base = cfg.url + "/";
  async function get(path: string, q: CatalogQuery): Promise<unknown> {
    const u = new URL(path, base);
    if (q.q) u.searchParams.set("q", q.q);
    u.searchParams.set("limit", String(q.limit));
    if (q.offset) u.searchParams.set("offset", String(q.offset));
    const headers: Record<string, string> = { accept: "application/json", "user-agent": "Open_Edit content proxy" };
    if (cfg.key) headers.authorization = `Bearer ${cfg.key}`;
    const r = await fetch(u, { headers, signal: q.signal, redirect: "follow", cache: "no-store" });
    if (!r.ok) throw new Error(`provider responded ${r.status}`);
    const len = Number(r.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) throw new Error("provider response too large");
    const text = await r.text();
    if (text.length > MAX_BYTES) throw new Error("provider response too large");
    return JSON.parse(text) as unknown;
  }
  return {
    name: "http-json",
    music: async (q) => cleanTracks(await get("music", q), base),
    artStyles: async (q) => cleanArtStyles(await get("art-styles", q), base),
    looks: async (kind, q) => cleanItems(await get(`looks/${encodeURIComponent(kind)}`, q), base),
    stickers: async (q) => cleanStickerCategories(await get("stickers", q), base),
    templates: async (q) => cleanItems(await get("templates", q), base),
    feed: async (name, q) => get(`feed/${encodeURIComponent(name)}`, q),
  };
}
