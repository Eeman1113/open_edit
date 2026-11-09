// Server-only configuration. Everything here is read from process.env at request time and never reaches the
// client bundle (this module imports "server-only", so importing it from a client component fails the build).
// Every variable is documented in .env.example and docs/platform.md.
import "server-only";

/** Content catalogues served by /api/**. Each can use its own provider. */
export const CATALOGS = ["music", "artStyles", "looks", "stickers", "templates", "feed"] as const;
export type CatalogName = (typeof CATALOGS)[number];

/** Env prefix per catalogue: OE_<PREFIX>_API_URL, OE_<PREFIX>_API_KEY, OE_<PREFIX>_ADAPTER. */
const PREFIX: Record<CatalogName, string> = {
  music: "MUSIC", artStyles: "ARTSTYLE", looks: "LOOKS", stickers: "STICKERS", templates: "TEMPLATES", feed: "FEED",
};

const env = (k: string): string | undefined => {
  const v = process.env[k]?.trim();
  return v ? v : undefined;
};
const int = (k: string, d: number, min: number, max: number) => {
  const n = Number(env(k));
  return Number.isFinite(n) && env(k) ? Math.min(max, Math.max(min, Math.round(n))) : d;
};

export interface ProviderConfig {
  catalog: CatalogName;
  /** Adapter id from the registry (src/server/providers). */
  adapter: string;
  /** Provider base URL (validated http/https). */
  url: string;
  /** Secret sent to the provider; never logged or returned. */
  key?: string;
}

/** Provider configuration for a catalogue, or null when it should use the built-in local catalogue. */
export function providerConfig(catalog: CatalogName): ProviderConfig | null {
  const p = PREFIX[catalog];
  const url = env(`OE_${p}_API_URL`) ?? env("OE_CONTENT_API_URL");
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("protocol");
  } catch {
    warnOnce(`config:${catalog}`, `[content] ignoring OE_${p}_API_URL / OE_CONTENT_API_URL: not an http(s) URL`);
    return null;
  }
  const key = env(`OE_${p}_API_KEY`) ?? env("OE_CONTENT_API_KEY");
  const adapter = env(`OE_${p}_ADAPTER`) ?? env("OE_CONTENT_ADAPTER") ?? "http-json";
  return { catalog, adapter, url: url.replace(/\/+$/, ""), key };
}

export const config = {
  /** Provider request timeout. */
  providerTimeoutMs: () => int("OE_PROVIDER_TIMEOUT_MS", 6000, 500, 30000),
  /** How long provider responses are kept in the in-memory cache. 0 disables it. */
  providerCacheSeconds: () => int("OE_PROVIDER_CACHE_SECONDS", 300, 0, 86400),
  /** Browser / CDN cache lifetime of API responses. */
  apiMaxAge: () => int("OE_API_CACHE_SECONDS", 300, 0, 86400),
  /** Requests per minute per session (or per IP without a session). 0 disables rate limiting. */
  rateLimitPerMinute: () => int("OE_RATE_LIMIT_PER_MINUTE", 120, 0, 100000),
  /** Trust X-Forwarded-For / X-Real-IP from a reverse proxy (on by default on Vercel). */
  trustProxy: () => (env("OE_TRUST_PROXY") ?? (process.env.VERCEL ? "1" : "0")) === "1",
  /** Anonymous session cookie: "on" (default) or "off". */
  sessionsEnabled: () => env("OE_SESSIONS") !== "off",
  /** HMAC secret for the session cookie (at least 32 characters). */
  sessionSecret: () => env("OE_SESSION_SECRET"),
};

const warned = new Set<string>();
export function warnOnce(key: string, msg: string) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(msg);
}
