// GET /api/looks/<kind>?q= → { items: CatalogItem[] }. Asset lists for the look creator (/lens), its search
// (kind "store") and the templates screen (kind "templates").
// Provider: OE_LOOKS_API_URL / OE_LOOKS_API_KEY (or OE_CONTENT_*); otherwise the open pack's built-in assets.
import { BadRequest, catalogHandler } from "@/server/http";
import { loadCatalog } from "@/server/providers";
import { LOOK_KINDS, type LookKind } from "@/lib/content/types";

export const GET = catalogHandler<{ kind: string }>(async (_req, q, { kind }) => {
  if (!(LOOK_KINDS as readonly string[]).includes(kind)) throw new BadRequest(`unknown kind; expected one of ${LOOK_KINDS.join(", ")}`);
  const k = kind as LookKind;
  const { data, source } = k === "templates"
    ? await loadCatalog("templates", "", q, (p, cq) => p.templates?.(cq))
    : await loadCatalog("looks", k, q, (p, cq) => p.looks?.(k, cq));
  return { body: { items: data }, source };
});
