// In-memory fixed-window rate limiter. Buckets live in this process only: with several instances (serverless, a
// load-balanced cluster) each instance counts separately, which is fine for abuse protection of read-only
// catalogue endpoints. Put a shared limiter (e.g. at the CDN) in front for stricter limits.
import "server-only";
import { config } from "./env";

interface Bucket { count: number; reset: number }
const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const MAX_BUCKETS = 50_000;

function sweep(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [k, b] of buckets) if (b.reset <= now) buckets.delete(k);
  if (buckets.size >= MAX_BUCKETS) buckets.clear(); // under attack: start over rather than grow without bound
}

export interface RateResult { ok: boolean; limit: number; remaining: number; resetSeconds: number }

/** Counts one request against `key` with `limit` requests per minute. */
export function hit(key: string, limit: number): RateResult {
  const now = Date.now();
  sweep(now);
  let b = buckets.get(key);
  if (!b || b.reset <= now) { b = { count: 0, reset: now + WINDOW_MS }; buckets.set(key, b); }
  b.count++;
  return { ok: b.count <= limit, limit, remaining: Math.max(0, limit - b.count), resetSeconds: Math.ceil((b.reset - now) / 1000) };
}

/** Best-effort client IP. Proxy headers are only trusted with OE_TRUST_PROXY=1 (default on Vercel). */
export function clientIp(req: Request): string {
  const h = req.headers;
  const xff = h.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  if (config.trustProxy()) return h.get("x-real-ip")?.trim() || xff[0] || "unknown";
  // Without a trusted proxy, use the hop closest to this server (added by the Next.js server itself).
  return xff[xff.length - 1] || "unknown";
}

/**
 * Applies the limits for one API request:
 * - with a session: `limit` per session, plus 5 × `limit` per IP (so minting many sessions does not help);
 * - without one: `limit` per IP.
 */
export function limitRequest(req: Request, sessionId: string | null): RateResult | null {
  const limit = config.rateLimitPerMinute();
  if (!limit) return null;
  const ip = clientIp(req);
  const perIp = hit(`ip:${ip}`, sessionId ? limit * 5 : limit);
  if (!sessionId || !perIp.ok) return perIp;
  return hit(`s:${sessionId}`, limit);
}
