// GET /api/music → { tracks: Track[] }. Music library for the camera and the video editor.
// Provider: OE_MUSIC_API_URL / OE_MUSIC_API_KEY (or OE_CONTENT_*); otherwise the open pack's built-in tracks.
import { catalogHandler } from "@/server/http";
import { loadCatalog } from "@/server/providers";

export const GET = catalogHandler(async (_req, q) => {
  const { data, source } = await loadCatalog("music", "", q, (p, cq) => p.music?.(cq));
  return { body: { tracks: data }, source };
});
