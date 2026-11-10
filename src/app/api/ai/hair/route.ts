// Optional hairstyle service for the AI Hair page. New hairstyles need a generative model that doesn't run on the
// device, so this route proxies an online provider configured on the server:
//   OE_HAIR_API_URL  provider base URL (http/https)   OE_HAIR_API_KEY  sent as "authorization: Bearer <key>"
// Provider contract: GET <url>/styles → { provider?, styles: { id, name, thumb? }[] };
//                    POST <url>/restyle (multipart: image, style) → image/jpeg | image/png.
// With no provider, GET reports { available: false, styles: [] } and POST answers 503; the page then offers only its
// on-device tools. The key never leaves the server.
import "server-only";
import type { NextRequest } from "next/server";
import { config } from "@/server/env";
import { limitRequest } from "@/server/rateLimit";

const MAX_BYTES = 8 * 1024 * 1024;
const STYLE_ID = /^[\w.-]{1,64}$/;

function provider() {
  const url = process.env.OE_HAIR_API_URL?.trim();
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  } catch {
    return null;
  }
  const key = process.env.OE_HAIR_API_KEY?.trim();
  const headers: Record<string, string> = key ? { authorization: `Bearer ${key}` } : {};
  return { url: url.replace(/\/+$/, ""), headers };
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": status === 200 ? "private, max-age=60" : "no-store" } });

function limited(req: NextRequest) {
  const r = limitRequest(req, null);
  return r && !r.ok ? json({ error: "rate_limited" }, 429) : null;
}

export async function GET(req: NextRequest) {
  const tooMany = limited(req);
  if (tooMany) return tooMany;
  const p = provider();
  if (!p) return json({ available: false, styles: [] });
  try {
    const r = await fetch(`${p.url}/styles`, { headers: { ...p.headers, accept: "application/json" }, signal: AbortSignal.timeout(config.providerTimeoutMs()) });
    if (!r.ok) return json({ available: false, styles: [] });
    const j = (await r.json()) as { provider?: unknown; styles?: unknown };
    const styles = Array.isArray(j.styles)
      ? j.styles.flatMap((s) => {
        const o = s as Record<string, unknown>;
        return typeof o?.id === "string" && STYLE_ID.test(o.id) && typeof o.name === "string"
          ? [{ id: o.id, name: o.name.slice(0, 40), thumb: typeof o.thumb === "string" && o.thumb.startsWith("https://") ? o.thumb : undefined }]
          : [];
      }).slice(0, 60)
      : [];
    return json({ available: styles.length > 0, provider: typeof j.provider === "string" ? j.provider.slice(0, 60) : undefined, styles });
  } catch {
    return json({ available: false, styles: [] });
  }
}

export async function POST(req: NextRequest) {
  const tooMany = limited(req);
  if (tooMany) return tooMany;
  const p = provider();
  if (!p) return json({ error: "not_configured" }, 503);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const image = form.get("image");
  const style = form.get("style");
  if (!(image instanceof Blob) || !/^image\/(jpeg|png|webp)$/.test(image.type) || image.size > MAX_BYTES) return json({ error: "bad_image" }, 400);
  if (typeof style !== "string" || !STYLE_ID.test(style)) return json({ error: "bad_style" }, 400);
  const out = new FormData();
  out.set("image", image, "photo.jpg");
  out.set("style", style);
  try {
    const r = await fetch(`${p.url}/restyle`, { method: "POST", headers: p.headers, body: out, signal: AbortSignal.timeout(Math.max(config.providerTimeoutMs(), 30000)) });
    const type = r.headers.get("content-type") ?? "";
    if (!r.ok || !/^image\/(jpeg|png)/.test(type)) return json({ error: "provider_error" }, 502);
    return new Response(r.body, { headers: { "content-type": type, "cache-control": "no-store" } });
  } catch {
    return json({ error: "provider_timeout" }, 504);
  }
}
