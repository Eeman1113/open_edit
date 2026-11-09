// GET /api/feed/<home|discover> → feed JSON (the shape of src/data/home.json / discover.json).
// Provider: OE_FEED_API_URL / OE_FEED_API_KEY (or OE_CONTENT_*); otherwise the generated demo feed.
import { BadRequest, catalogHandler } from "@/server/http";
import { loadCatalog } from "@/server/providers";
import { FEED_NAMES, type FeedName } from "@/lib/content/types";

export const GET = catalogHandler<{ name: string }>(async (_req, q, { name }) => {
  if (!(FEED_NAMES as readonly string[]).includes(name)) throw new BadRequest(`unknown feed; expected one of ${FEED_NAMES.join(", ")}`);
  const n = name as FeedName;
  const { data, source } = await loadCatalog("feed", n, q, async (p, cq) => {
    const r = await p.feed?.(n, cq);
    if (r === undefined) return r;
    if (typeof r !== "object" || r === null || JSON.stringify(r).length > 2_000_000) throw new Error("invalid feed");
    return r;
  });
  return { body: data, source };
});
