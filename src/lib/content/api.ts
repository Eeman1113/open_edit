// Client access to the content API with a static fallback. Every `/api/*` GET from the browser goes through
// `apiJson()`: it asks `${BASE}/api/...` first and, when that route doesn't exist (404), the network fails or the
// answer isn't JSON (e.g. a static host's HTML 404 page), reads the build-time snapshot
// `${BASE}/api-static/<endpoint>.json` written by scripts/gen-static-api.mjs. Static hosting (GitHub Pages) has no
// route handlers, so it always ends up here (after one 404, remembered for the page's lifetime); a Node deployment
// only does on failure.
import { asset } from "@/lib/base";

/** Per page lifetime: once the API is known to be absent, go straight to the snapshots. */
let apiMissing = false;

const isJson = (r: Response) => /\bjson\b/i.test(r.headers.get("content-type") ?? "");
const aborted = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

/** Built-in answers for endpoints that have no snapshot file worth fetching. */
const DEFAULTS: Record<string, unknown> = { "ai/hair": { available: false, styles: [] } };

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
/** Same word match as the server's local catalogue (src/server/providers/local.ts). */
function matches(q: string, ...fields: unknown[]) {
  const hay = norm(fields.flat().filter((f): f is string => typeof f === "string").join(" "));
  return norm(q).split(/\s+/).every((w) => hay.includes(w.replace(/^#/, "")));
}

/** Applies `q` to a snapshot (snapshots hold the unfiltered first page, like the API without a query). */
function search(body: unknown, q: string): unknown {
  if (!q || !body || typeof body !== "object" || Array.isArray(body)) return body;
  const o = body as Record<string, unknown>;
  const f = <T extends Record<string, unknown>>(key: string, fields: (x: T) => unknown[]) =>
    Array.isArray(o[key]) ? { ...o, [key]: (o[key] as T[]).filter((x) => matches(q, ...fields(x))).slice(0, 100) } : o;
  if ("items" in o) return f("items", (x) => [x.name, x.kind, x.tags]);
  if ("tracks" in o) return f("tracks", (x) => [x.title, x.artist, x.mood]);
  if ("styles" in o) return f("styles", (x) => [x.name, x.about]);
  return o;
}

async function fromSnapshot(endpoint: string, q: string, signal?: AbortSignal): Promise<unknown> {
  // A search of the look-creator store spans every kind; its snapshot is the combined list.
  const file = endpoint === "looks/store" && q ? "looks/_search" : endpoint;
  try {
    const r = await fetch(asset(`/api-static/${file}.json`), { signal, headers: { accept: "application/json" } });
    if (r.ok) return search(await r.json(), q);
    if (!(endpoint in DEFAULTS)) throw new Error(`content ${endpoint}: ${r.status}`);
  } catch (e) {
    if (aborted(e) || !(endpoint in DEFAULTS)) throw e;
  }
  return DEFAULTS[endpoint];
}

/**
 * GET a content API endpoint as JSON. `path` is the API path with its query, e.g. "/api/looks/sticker?q=cat".
 * Rejects only when neither the API nor the snapshot answers (or `signal` aborts).
 */
export async function apiJson<T = unknown>(path: string, init: { signal?: AbortSignal } = {}): Promise<T> {
  const u = new URL(path, "http://x");
  const endpoint = u.pathname.replace(/^\/api\//, "").replace(/\/+$/, "");
  const q = (u.searchParams.get("q") ?? "").trim();
  if (!apiMissing) {
    try {
      const r = await fetch(asset(`/api/${endpoint}${u.search}`), { signal: init.signal, headers: { accept: "application/json" } });
      if (r.ok && isJson(r)) return (await r.json()) as T;
      // 404 or an HTML page: there is no API here. Other errors (429, 5xx) only skip it for this request.
      if (r.status === 404 || (r.ok && !isJson(r))) apiMissing = true;
    } catch (e) {
      if (aborted(e)) throw e; // otherwise a network error or a broken body: use the snapshot this time
    }
  }
  return (await fromSnapshot(endpoint, q, init.signal)) as T;
}
