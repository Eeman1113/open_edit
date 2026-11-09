// Provider registry and resolution. `loadCatalog()` is what the route handlers call: it picks the configured
// provider for a catalogue (env: OE_<CATALOG>_API_URL / _API_KEY / _ADAPTER, or the shared OE_CONTENT_* values),
// applies the timeout and the in-memory cache, and falls back to the built-in local catalogue on any failure.
//
// Adding an adapter: implement ContentProvider (./types.ts) and call registerAdapter("my-adapter", factory), then
// set OE_CONTENT_ADAPTER=my-adapter (or OE_<CATALOG>_ADAPTER).
import "server-only";
import { config, providerConfig, warnOnce, type CatalogName, type ProviderConfig } from "../env";
import { httpJsonProvider } from "./http-json";
import { localProvider } from "./local";
import type { CatalogQuery, ContentProvider, ProviderFactory } from "./types";

export type { CatalogQuery, ContentProvider, ProviderFactory } from "./types";
export { localProvider } from "./local";

const adapters = new Map<string, ProviderFactory>([["http-json", httpJsonProvider]]);

/** Registers a provider adapter under an id usable in OE_CONTENT_ADAPTER / OE_<CATALOG>_ADAPTER. */
export function registerAdapter(id: string, factory: ProviderFactory) {
  adapters.set(id, factory);
}

const instances = new Map<string, ContentProvider>();
function providerFor(cfg: ProviderConfig): ContentProvider | null {
  const id = `${cfg.adapter}|${cfg.url}|${cfg.key ? "k" : ""}`;
  const hit = instances.get(id);
  if (hit) return hit;
  const factory = adapters.get(cfg.adapter);
  if (!factory) {
    warnOnce(`adapter:${cfg.adapter}`, `[content] unknown adapter "${cfg.adapter}" for ${cfg.catalog}; using the local catalogue`);
    return null;
  }
  const p = factory(cfg);
  instances.set(id, p);
  return p;
}

// ---------------------------------------------------------------- response cache (provider results only)

const cache = new Map<string, { at: number; value: unknown }>();
const CACHE_MAX = 500;
function cached<T>(key: string): T | undefined {
  const ttl = config.providerCacheSeconds() * 1000;
  const e = cache.get(key);
  if (!e || !ttl) return undefined;
  if (Date.now() - e.at > ttl) { cache.delete(key); return undefined; }
  return e.value as T;
}
function store(key: string, value: unknown) {
  if (!config.providerCacheSeconds()) return;
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), value });
}

export type Source = "provider" | "local" | "local-fallback";

/**
 * Runs `call` against the configured provider for `catalog`, or against the local catalogue when none is configured,
 * the provider lacks the method, or it fails / times out (`local-fallback`).
 */
export async function loadCatalog<T>(
  catalog: CatalogName,
  cacheKey: string,
  q: Omit<CatalogQuery, "signal">,
  call: (p: ContentProvider, q: CatalogQuery) => Promise<T> | undefined,
): Promise<{ data: T; source: Source }> {
  const local = async () => {
    const r = call(localProvider, q);
    if (!r) throw new Error(`local catalogue has no ${catalog}`);
    return r;
  };
  const cfg = providerConfig(catalog);
  const provider = cfg && providerFor(cfg);
  if (!provider) return { data: await local(), source: "local" };

  const key = `${catalog}|${cacheKey}|${q.q}|${q.limit}|${q.offset}`;
  const hit = cached<T>(key);
  if (hit !== undefined) return { data: hit, source: "provider" };
  try {
    const r = call(provider, { ...q, signal: AbortSignal.timeout(config.providerTimeoutMs()) });
    if (!r) return { data: await local(), source: "local" };
    const data = await r;
    store(key, data);
    return { data, source: "provider" };
  } catch (e) {
    // Never log the provider URL or key; the catalogue name and error class are enough to debug.
    console.warn(`[content] ${catalog} provider failed (${e instanceof Error ? e.name + ": " + e.message.slice(0, 120) : "error"}); serving the local catalogue`);
    return { data: await local(), source: "local-fallback" };
  }
}

/** Which source each catalogue uses (for /api/health). No URLs or keys. */
export function providerSummary(): Record<CatalogName, string> {
  const out = {} as Record<CatalogName, string>;
  for (const c of ["music", "artStyles", "looks", "stickers", "templates", "feed"] as const) {
    const cfg = providerConfig(c);
    out[c] = cfg ? (adapters.has(cfg.adapter) ? cfg.adapter : "local (unknown adapter)") : "local";
  }
  return out;
}
