// GET /api/aistyle → { styles: ArtStyle[] }. Art styles are recipes applied on the device; photos are never sent.
// Provider: OE_ARTSTYLE_API_URL / OE_ARTSTYLE_API_KEY (or OE_CONTENT_*); otherwise the built-in styles.
import { catalogHandler } from "@/server/http";
import { loadCatalog } from "@/server/providers";

export const GET = catalogHandler(async (_req, q) => {
  const { data, source } = await loadCatalog("artStyles", "", q, (p, cq) => p.artStyles?.(cq));
  return { body: { styles: data }, source };
});
