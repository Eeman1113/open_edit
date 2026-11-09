# Platform: content API, providers, sessions and privacy

Open_Edit runs almost entirely in the browser. The server has one job beyond serving the app: a small, read-only
**content API** for catalogues (music, art styles, effects, look-creator assets, templates, feeds). It can proxy an
external content service, and without one it serves the built-in catalogue from the open asset pack, so every
feature works out of the box.

```
browser ──/api/*──▶ route handler ──▶ catalogHandler (session, rate limit, validation, caching)
                                         └─▶ loadCatalog(catalog)
                                               ├─ provider configured?  adapter (http-json …) ─▶ content service
                                               │      validate + strip, cache in memory, timeout
                                               └─ otherwise / on failure ─▶ local provider (open pack, src/data)
```

## Files

| Path | Role |
| --- | --- |
| `src/app/api/**/route.ts` | Route handlers (Node.js runtime, dynamic). |
| `src/server/http.ts` | `catalogHandler()`: session cookie, rate limit, query validation, JSON errors, `Cache-Control`, `ETag` / 304. |
| `src/server/env.ts` | All server-only configuration (`import "server-only"`). |
| `src/server/session.ts` | Signed anonymous session cookie. |
| `src/server/rateLimit.ts` | In-memory fixed-window limiter and client IP detection. |
| `src/server/providers/types.ts` | `ContentProvider` adapter interface. |
| `src/server/providers/index.ts` | Adapter registry, provider resolution, cache, timeout and fallback (`loadCatalog`). |
| `src/server/providers/http-json.ts` | Default adapter for a simple REST/JSON content service. |
| `src/server/providers/local.ts` | Built-in catalogue from `public/packs/open` and `src/data`. |
| `src/lib/content/types.ts` | Response shapes shared by server and client. |
| `src/lib/content/validate.ts` | Validation / stripping of provider data (client-safe). |
| `scripts/gen-content.mjs` | Generates the built-in music library (original synthesised loops). |
| `scripts/check-client-secrets.mjs` | Fails if server-only values or modules appear in client chunks. |

Everything under `src/server/` imports `server-only`, so importing it from a client component breaks the build.

## Endpoints

All are `GET`, return JSON and accept `q` (search, ≤ 64 characters), `limit` (1–200, default 100) and `offset`
(0–10000). Invalid input returns `400 { error }`.

| Endpoint | Response | Used by | Built-in fallback |
| --- | --- | --- | --- |
| `/api/music` | `{ tracks: Track[] }` | camera and video music picker | 6 original synthesised loops (`public/packs/open/content/music/`) |
| `/api/aistyle` | `{ styles: ArtStyle[] }` | Art styles (`/aistyle`) | 10 styles (`src/data/content/artStyles.ts`) |
| `/api/looks/<kind>` | `{ items: CatalogItem[] }` | look creator (`/lens`), its search (`store`), templates (`templates`) | stickers, filters, face styles, makeup, brushes, fonts, collage templates, music, backdrops, adjustments, cutout types |
| `/api/stickers` | `StickerCategory[]` | effect panels (camera, photo editor, video editor) | the pack's effects grouped into Cute, Face paint, Eyes, Beauty, Scenes |
| `/api/templates` | `{ items: CatalogItem[] }` | templates | collage layouts with generated previews |
| `/api/feed/<home\|discover>` | feed JSON | (available for remote feeds) | `src/data/home.json`, `src/data/discover.json` |
| `/api/health` | `{ ok, version, catalogs }` | Docker / load balancer health checks | — (never cached, not rate limited, no URLs or keys) |

`<kind>` is one of `sticker accessory transform makeup filter effect cutout facepaint brush text beauty template
templates music background adjust store`.

Response headers:

- `Cache-Control`: `public, max-age=300, s-maxage=300, stale-while-revalidate=3600` (`OE_API_CACHE_SECONDS`), or
  `private` when the response sets a new session cookie, `no-store` for errors.
- `ETag` (weak, content hash); `If-None-Match` gets `304`.
- `X-OE-Source`: `local`, `provider` or `local-fallback` (provider failed or timed out).
- `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`; `429` with `Retry-After` when exceeded.

Art styles are recipes of image operations (`ArtOp`: smooth, posterize, saturate, contrast, brightness, edges,
sketch, duotone, halftone, grain, paper) that `src/lib/artstyle.ts` applies on the device. A provider can add
styles only by combining these operations, so photos are never uploaded.

## Providers

### Configuration

Each catalogue reads its provider from server-only env vars, falling back to shared values:

| Catalogue | URL | Key | Adapter |
| --- | --- | --- | --- |
| music | `OE_MUSIC_API_URL` | `OE_MUSIC_API_KEY` | `OE_MUSIC_ADAPTER` |
| art styles | `OE_ARTSTYLE_API_URL` | `OE_ARTSTYLE_API_KEY` | `OE_ARTSTYLE_ADAPTER` |
| look-creator assets | `OE_LOOKS_API_URL` | `OE_LOOKS_API_KEY` | `OE_LOOKS_ADAPTER` |
| stickers / effects | `OE_STICKERS_API_URL` | `OE_STICKERS_API_KEY` | `OE_STICKERS_ADAPTER` |
| templates | `OE_TEMPLATES_API_URL` | `OE_TEMPLATES_API_KEY` | `OE_TEMPLATES_ADAPTER` |
| feeds | `OE_FEED_API_URL` | `OE_FEED_API_KEY` | `OE_FEED_ADAPTER` |
| all (fallback) | `OE_CONTENT_API_URL` | `OE_CONTENT_API_KEY` | `OE_CONTENT_ADAPTER` (default `http-json`) |

Also: `OE_PROVIDER_TIMEOUT_MS` (default 6000), `OE_PROVIDER_CACHE_SECONDS` (default 300). Values are read per
request, so changing them needs a restart only where the host requires it. Never use `NEXT_PUBLIC_` for any of
these.

### The `http-json` adapter

Calls `GET {url}/music`, `/art-styles`, `/looks/{kind}`, `/stickers`, `/templates`, `/feed/{name}` with
`?q=&limit=&offset=`, `Accept: application/json` and `Authorization: Bearer {key}`. Responses may be the documented
object or a bare array. Each entry is validated and stripped (`src/lib/content/validate.ts`): required fields
checked, strings trimmed and capped, numbers clamped, media URLs resolved against the base URL and limited to
`http(s)`, in-app `href`s limited to site-relative paths, art-style operations whitelisted, at most 500 items and
2 MB per response. Sticker definitions are passed through as data (≤ 64 KB each) and resolve their resources
against the active asset pack.

### Writing an adapter

```ts
// src/server/providers/my-service.ts
import "server-only";
import type { ContentProvider, ProviderFactory } from "./types";
import { cleanTracks } from "@/lib/content/validate";

export const myService: ProviderFactory = (cfg) => ({
  name: "my-service",
  async music(q) {
    const r = await fetch(`${cfg.url}/v2/tracks?search=${encodeURIComponent(q.q)}`, {
      headers: { "x-api-key": cfg.key ?? "" },
      signal: q.signal,                       // carries OE_PROVIDER_TIMEOUT_MS
    });
    if (!r.ok) throw new Error(`status ${r.status}`); // any throw → local fallback
    return cleanTracks((await r.json()).results, cfg.url);
  },
  // implement only the catalogues the service has; the others use the local catalogue
});
```

Register it in `src/server/providers/index.ts` with `registerAdapter("my-service", myService)` and set
`OE_MUSIC_ADAPTER=my-service`. Always run provider data through the `clean*` validators.

## Anonymous sessions

- There are **no accounts**. The only server-side identity is an optional anonymous session: a random 128-bit id
  in the cookie `oe_sid`, signed with HMAC-SHA256 (`OE_SESSION_SECRET`), `HttpOnly`, `SameSite=Lax`, `Secure` on
  HTTPS, `Path=/api`, expiring after 24 hours.
- It is issued by the first API response and used only to give each browser its own rate-limit bucket (isolation
  from other users behind the same IP). It is not stored, logged or linked to anything on the server.
- `OE_SESSIONS=off` disables it; limits then apply per IP only.
- Without `OE_SESSION_SECRET` a random per-process secret is used (a warning is logged in production): sessions
  reset on restart and differ between instances, which is harmless but weakens per-session limits.

## Rate limiting

Fixed one-minute windows, in memory per server instance:

- requests without a valid session (including the one that mints it): `OE_RATE_LIMIT_PER_MINUTE` (default 120)
  per IP;
- with a session: the limit per session, plus 5 × the limit per IP, so minting many cookies does not help.

Client IPs come from `X-Real-IP` / the first `X-Forwarded-For` hop only when `OE_TRUST_PROXY=1` (default on
Vercel). Otherwise the last `X-Forwarded-For` hop is used, which the Node server sets from the socket; a client
talking to Node directly can forge that header, so run behind a proxy that overwrites it in production (see
`docs/deploy.md`). Serverless and multi-instance deployments count per instance; put a CDN or firewall limit in
front for strict quotas.

## Privacy model

- **Photos and videos never leave the device.** Capture, editing, the AI tools and art styles all run in the
  browser. No API endpoint accepts uploads.
- **Local data**: the gallery (IndexedDB), preferences (`localStorage`, `oe.*` keys), Discover likes / follows /
  hides and downloaded models (Cache Storage) stay in the browser. Settings → Privacy → Clear local data deletes all
  of it and starts a fresh session.
- **Server data**: none is persisted. The server keeps only in-memory rate-limit counters (keyed by IP or the
  anonymous session id, expiring after a minute) and an in-memory cache of provider responses (catalogue data, no
  user data). Request logs are whatever your host keeps; the app logs no IPs, cookies or provider URLs/keys.
- **Third parties**: the browser talks only to this site. Provider requests are made by the server with the
  server's key and carry no user data except the search text typed into a catalogue search. Media from a provider
  (track audio, thumbnails) may be loaded by the browser directly from the provider's URLs, which then sees the
  visitor's IP like any image host.
- **Cookies**: only `oe_sid` (above). No analytics or tracking scripts are included.

## Security headers and isolation

Set in `next.config.ts` for every response:

- `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` make pages
  cross-origin isolated (`crossOriginIsolated === true`), so onnxruntime-web runs multithreaded WASM (the AI worker
  picks `numThreads` from it). `credentialless` still lets cross-origin images and audio without CORP headers load
  (they are fetched without cookies), so provider media and the camera keep working. Safari ignores
  `credentialless` and falls back to single-threaded WASM. `OE_COEP=require-corp` is stricter (every cross-origin
  resource then needs CORP or CORS); `OE_COEP=off` removes both headers. Build-time setting.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`,
  `Permissions-Policy: camera=(self), microphone=(self), geolocation=(self)`.
- Static caching: `public/packs/**` one day, `public/models|ort|mediapipe/**` 30 days, both with
  `stale-while-revalidate`; `/_next/static` is immutable (set by Next.js).

## Client-side secret check

`npm run audit:secrets` (`scripts/check-client-secrets.mjs`) scans the client chunks (`.next/static`, or
`.next/dev/static` after `next dev`) for the values of all `OE_*KEY`, `OE_*SECRET` and `OE_*_URL` variables in the
environment, for the names of the server-only variables and for markers of the server modules. CI builds with
dummy secrets and runs it. Verified locally against the `next dev` client chunks: no matches, while the same
markers are present in the server chunks.

## Settings storage keys

App preferences live in `localStorage` under namespaced keys, defined once in `SETTINGS` (`src/lib/settings.ts`):

| Constant | Key | Default |
| --- | --- | --- |
| `highResolution` | `oe.camera.highResolution` | false |
| `mirrorFront` | `oe.camera.mirrorFront` | true |
| `antiBlemish` | `oe.camera.antiBlemish` | false |
| `gridLines` | `oe.camera.gridLines` | false |
| `gridBadge` | `oe.camera.gridBadge` | false |
| `locationExif` | `oe.capture.locationExif` | false |
| `watermark` | `oe.capture.watermark` | false |
| `optimiseMaleMakeup` | `oe.beauty.optimiseMaleMakeup` | true |
| `storageOptimisation` | `oe.storage.optimise` | true |

`migrateLegacySettings()` runs once per browser when the module loads (flag `oe.settings.migrated`) and removes the
un-namespaced keys written by pre-release builds. Values are not carried over.

## End-to-end tests

`scripts/e2e` drives one headless Chrome over the DevTools protocol (`npm run e2e [flow…]`, server at `E2E_BASE`,
default `http://localhost:3700`). Shared helpers are in `scripts/e2e/h.mjs`: `window.__oeShoot()` (dev-only camera
hook), `navTab(href)`, `reviewUp`, `TEST_PHOTO` / `TEST_VIDEO` (`E2E_PHOTO` / `E2E_VIDEO`, defaulting to the pack's
generated sample media), `GALLERY_DB`. Scratch files and screenshots go to `E2E_SCRATCH` / `E2E_OUT` (default under
the OS temp folder). Flows 01–10, 13 and 14 target the current UI; the editor-internal steps of flows 11, 12, 15 and
16 still use pre-reskin labels and need re-baselining once the photo and video editors are restyled.

## External credentials

None are required. Integrations that need credentials only if you choose to use them:

- a content service for any catalogue (`OE_*_API_URL` + `OE_*_API_KEY`), e.g. a licensed music library or a
  sticker/template CMS, behind the `http-json` contract or a custom adapter;
- `OE_SESSION_SECRET`, a random string you generate (not an external credential, but required for stable
  sessions across restarts and instances).
