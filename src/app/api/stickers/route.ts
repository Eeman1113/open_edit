// GET /api/stickers → StickerCategory[] (a bare array, as the sticker panels expect). Extra effect categories shown
// after the built-in "Featured" set.
// Provider: OE_STICKERS_API_URL / OE_STICKERS_API_KEY (or OE_CONTENT_*); otherwise the open pack grouped by theme.
import { catalogHandler } from "@/server/http";
import { loadCatalog } from "@/server/providers";

export const GET = catalogHandler(async (_req, q) => {
  const { data, source } = await loadCatalog("stickers", "", q, (p, cq) => p.stickers?.(cq));
  return { body: data, source };
});
