// GET /api/templates → { items: CatalogItem[] }. Photo and collage templates.
// Provider: OE_TEMPLATES_API_URL / OE_TEMPLATES_API_KEY (or OE_CONTENT_*); otherwise the built-in collage layouts.
import { catalogHandler } from "@/server/http";
import { loadCatalog } from "@/server/providers";

export const GET = catalogHandler(async (_req, q) => {
  const { data, source } = await loadCatalog("templates", "", q, (p, cq) => p.templates?.(cq));
  return { body: { items: data }, source };
});
