// Shared plumbing for the content API route handlers: session cookie, rate limit, query validation, caching
// headers (Cache-Control + ETag / 304) and uniform JSON errors.
import "server-only";
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { config } from "./env";
import { limitRequest, type RateResult } from "./rateLimit";
import { getSession, SESSION_COOKIE } from "./session";
import type { Source } from "./providers";

export interface ValidQuery { q: string; limit: number; offset: number }

export class BadRequest extends Error {}

/** Validates the common query parameters: q (≤ 64 chars), limit (1..200, default 100), offset (0..10000). */
export function parseQuery(req: NextRequest): ValidQuery {
  const sp = req.nextUrl.searchParams;
  const rawQ = sp.get("q") ?? "";
  if (rawQ.length > 64) throw new BadRequest("q must be at most 64 characters");
  const q = rawQ.replace(/[\u0000-\u001f\u007f<>]/g, "").trim();
  const int = (name: string, d: number, min: number, max: number) => {
    const v = sp.get(name);
    if (v == null || v === "") return d;
    if (!/^\d{1,6}$/.test(v)) throw new BadRequest(`${name} must be a whole number`);
    const n = Number(v);
    if (n < min || n > max) throw new BadRequest(`${name} must be between ${min} and ${max}`);
    return n;
  };
  return { q, limit: int("limit", 100, 1, 200), offset: int("offset", 0, 0, 10000) };
}

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff", ...headers } });

const rateHeaders = (r: RateResult | null): Record<string, string> =>
  r ? { "ratelimit-limit": String(r.limit), "ratelimit-remaining": String(r.remaining), "ratelimit-reset": String(r.resetSeconds) } : {};

/**
 * Wraps a catalogue handler. The handler receives the validated query and returns the body and its source; the
 * wrapper handles sessions, rate limiting, errors and caching.
 */
export function catalogHandler<P = Record<string, never>>(
  handler: (req: NextRequest, query: ValidQuery, params: P) => Promise<{ body: unknown; source: Source }>,
) {
  return async (req: NextRequest, ctx: { params: Promise<P> }): Promise<Response> => {
    const session = getSession(req, req.cookies.get(SESSION_COOKIE)?.value, true);
    // A session minted by this very request proves nothing yet: count it against the IP like a cookie-less client.
    const rate = limitRequest(req, session.setCookie ? null : session.id);
    const base: Record<string, string> = { ...rateHeaders(rate) };
    if (session.setCookie) base["set-cookie"] = session.setCookie;
    if (rate && !rate.ok) return json({ error: "Too many requests. Try again in a moment." }, 429, { ...base, "retry-after": String(rate.resetSeconds), "cache-control": "no-store" });

    let result: { body: unknown; source: Source };
    try {
      result = await handler(req, parseQuery(req), await ctx.params);
    } catch (e) {
      if (e instanceof BadRequest) return json({ error: e.message }, 400, { ...base, "cache-control": "no-store" });
      console.error("[api] handler failed", e instanceof Error ? e.message : e);
      return json({ error: "Something went wrong." }, 500, { ...base, "cache-control": "no-store" });
    }

    const text = JSON.stringify(result.body);
    const etag = `W/"${createHash("sha1").update(text).digest("base64url").slice(0, 27)}"`;
    const maxAge = config.apiMaxAge();
    // Responses that carry a fresh session cookie must not be stored by shared caches.
    const cacheControl = !maxAge ? "no-store"
      : session.setCookie ? `private, max-age=${maxAge}`
      : `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 12}`;
    const headers = { ...base, "cache-control": cacheControl, etag, vary: "accept-encoding", "x-oe-source": result.source };
    if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
    return new Response(text, { status: 200, headers: { ...headers, "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff" } });
  };
}

export { json as jsonResponse };
