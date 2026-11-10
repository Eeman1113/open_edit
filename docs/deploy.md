# Deploying Open_Edit

Open_Edit is a Next.js 16 app. Everything except the small content API runs in the browser, so any host that can
run Node.js 24 works. It can also be exported as static files for GitHub Pages ([below](#github-pages-static)). No database, no object storage and no environment variables are required: with nothing
configured, the built-in catalogues are served from the open asset pack.

What you should know whichever host you pick:

- **HTTPS is required** in production: browsers only allow the camera on `https://` (or `localhost`).
- **Size**: `public/` is about 140 MB, mostly on-device AI models (`public/models`, `public/ort`,
  `public/mediapipe`). They are downloaded by the browser only when a tool is first used, then cached.
- **Headers** (set in `next.config.ts`, applied by every host below): cross-origin isolation (COOP/COEP) for
  multithreaded WASM, security headers, and cache lifetimes for static assets. See [platform.md](platform.md).
- **Build-time settings** are baked into the build: `NEXT_PUBLIC_ASSET_PACK`, `NEXT_PUBLIC_BASE_PATH`, `OE_COEP`.
  Everything else (`OE_*`) is read by the server at request time.
- **Health check**: `GET /api/health` returns `{ ok: true, … }`.

Configuration reference: [`.env.example`](../.env.example).

## Node.js

```sh
nvm use 24
npm ci
npm run build        # next build (standalone output) + copies public/ and .next/static into .next/standalone
npm start            # node .next/standalone/server.js, listens on $PORT (default 3000)
```

The standalone folder `.next/standalone/` is self-contained: copy it to the server and run `node server.js` with
`PORT` and `HOSTNAME` as needed. Put it behind a reverse proxy that terminates TLS (Caddy, nginx, a load balancer),
and set `OE_TRUST_PROXY=1` so rate limiting sees real client IPs:

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-For $remote_addr;   # overwrite, don't append, so clients can't spoof it
  proxy_set_header X-Real-IP $remote_addr;
}
```

Set `OE_SESSION_SECRET` (32+ characters, e.g. `openssl rand -base64 48`) so session cookies survive restarts and
are valid across instances.

## Docker

```sh
cp .env.example .env               # optional: fill in providers / secrets
docker compose up --build -d       # http://localhost:3000
```

Or without Compose:

```sh
docker build -t open_edit .
docker run -d -p 3000:3000 --env-file .env --name open_edit open_edit
```

The image is multi-stage (deps → build → runtime), runs `node server.js` from the standalone output as the
unprivileged user `openedit` (uid 1001), and has a `HEALTHCHECK` on `/api/health`. The Compose file also runs the
container with a read-only root filesystem, a tmpfs for `/tmp` and the Next.js cache, no Linux capabilities and
`no-new-privileges`.

Build-time settings are build arguments:

```sh
docker build -t open_edit \
  --build-arg NEXT_PUBLIC_ASSET_PACK=open \
  --build-arg NEXT_PUBLIC_BASE_PATH= \
  --build-arg OE_COEP=credentialless .
```

A custom asset pack must be present in `public/packs/<id>/` when the image is built (packs other than `open` are
excluded from git, so copy yours in on the build machine).

## Vercel

1. Import the repository in Vercel. The framework preset (Next.js), build command and output are detected
   automatically; no `vercel.json` is needed.
2. Optionally add the `OE_*` variables under Project Settings → Environment Variables (mark keys as sensitive).
   Set `OE_SESSION_SECRET` so sessions are valid across function instances.
3. Deploy.

Notes:

- The headers from `next.config.ts` (COOP/COEP, security, static caching) are applied by Vercel.
- `OE_TRUST_PROXY` defaults to on when `VERCEL` is set, so rate limits use the real client IP.
- The in-memory rate limiter and provider cache are per function instance. For strict limits, add Vercel's
  firewall rate limiting in front of `/api/*`.
- `npm run build` skips the standalone copy step on Vercel.

## GitHub Pages (static)

The app can also be exported as plain files and served by any static host. The workflow
[`.github/workflows/pages.yml`](../.github/workflows/pages.yml) publishes it to
<https://eeman1113.github.io/open_edit/> on every push to `main` (and on manual runs).

One-time setup: in the repository, Settings → Pages → Build and deployment → Source: **GitHub Actions**.

What the workflow does (job env `OE_STATIC_EXPORT=1`, `NEXT_PUBLIC_BASE_PATH=/open_edit`, Node 24):

1. `npm ci`. The asset pack, models, ONNX runtime and MediaPipe files are committed, so `npm run gen:assets` is
   not run; the job only checks they are present.
2. `node scripts/gen-static-api.mjs` writes `public/api-static/**.json`: the response of every content endpoint
   (`/api/music`, `/api/aistyle`, `/api/stickers`, `/api/templates`, `/api/looks/<kind>`, `/api/feed/<name>`,
   `/api/ai/hair`) exactly as the server returns it with no provider and no query, rendered by the server's own
   local catalogue code, plus `looks/_search.json` (every look-creator item, for searches). The base path is baked
   into the URLs inside, so it must match the build. The folder is git-ignored.
3. `npx next build` with the export settings from `next.config.ts` writes `out/`. `public/` is copied in whole,
   including the models (up to 28 MB each; about 140 MB in total, under GitHub Pages' 1 GB limit).
4. Checks the export (pages, snapshots, models, base path, no `api/`), adds an empty `out/.nojekyll`, then
   `actions/upload-pages-artifact` and `actions/deploy-pages` (permissions `pages: write`, `id-token: write`;
   one deployment at a time).

Export mode (`OE_STATIC_EXPORT=1`) changes only these settings; without it the Node build is unchanged:

| Setting | Export value | Why |
| --- | --- | --- |
| `output` | `"export"` | static HTML/JS/CSS in `out/` |
| `basePath`, `assetPrefix` | `NEXT_PUBLIC_BASE_PATH` | project sites live under `/<repo>/` |
| `trailingSlash` | `true` | `/edit` → `out/edit/index.html`, which GitHub Pages serves for `/edit/` |
| `images.unoptimized` | `true` | no image optimisation server |
| `pageExtensions` | `["tsx", "jsx"]` | leaves out the route handlers (see below) |
| `cacheComponents`, `partialPrefetching` | `false` | every route is prerendered to plain HTML; nothing to resume at request time |
| `headers()` | not set | a static host can't apply it |

Route handlers need a server (they read the request, cookies and env), so the export must not contain them.
Instead of moving files around during the build, export mode narrows `pageExtensions`: every page, layout and
metadata file in `src/app` is `.tsx` (including `manifest.tsx`) and every route handler is `.ts`, so only the
handlers drop out. **Keep this convention**: new pages, layouts and metadata files must be `.tsx`, and API routes
`.ts` under `src/app/api/`. The dynamic pages (`/discover/post/[id]`, `/discover/profile/[id]`,
`/discover/tag/[name]`, `/home/group/[groupId]`) list their ids with `generateStaticParams`; a dynamic page added
later needs the same, or the export fails.

In the browser, every catalogue request goes through `apiJson()` (`src/lib/content/api.ts`): it tries
`${BASE}/api/...` and, on a 404, a network error or a non-JSON answer, reads `${BASE}/api-static/....json` (a
search is applied to the snapshot on the device). After a 404 it uses the snapshots for the rest of the page's
life. `/api/ai/hair` falls back to `{ available: false, styles: [] }`. All public file URLs go through `asset()` /
`BASE` (`src/lib/base.ts`), so they carry the base path.

Limits of the static build:

- **No server API**: only the built-in catalogues, frozen at build time. No search across a remote library, no
  `/api/health`.
- **No online providers**: `OE_*` provider variables, sessions and rate limiting don't exist; AI Hair offers only
  its on-device tools.
- **No COOP/COEP**: GitHub Pages can't send headers, so pages aren't cross-origin isolated and onnxruntime-web
  runs single-threaded WASM (slower AI tools on CPU). WebGPU still works where the browser has it. The security
  headers and cache lifetimes from `next.config.ts` don't apply either (GitHub Pages caches for 10 minutes).
- The camera works because GitHub Pages is served over HTTPS.

Build it locally (needs several GB of RAM):

```sh
export OE_STATIC_EXPORT=1 NEXT_PUBLIC_BASE_PATH=/open_edit
node scripts/gen-static-api.mjs && npx next build
rm -rf /tmp/oe-site && mkdir -p /tmp/oe-site && cp -R out /tmp/oe-site/open_edit
python3 -m http.server 3000 -d /tmp/oe-site   # any static server; open http://localhost:3000/open_edit/
```

For another host or path, set `NEXT_PUBLIC_BASE_PATH` to the path the site is served under (empty for a domain
root) for both commands.

## Other static-file CDNs

If you serve `public/` from a CDN, keep the same paths, send `Cross-Origin-Resource-Policy: cross-origin` (or
serve from the same origin) so the isolated pages can load them, and keep the cache lifetimes from
`next.config.ts`.

## Updating

Pull, `npm ci`, `npm run build`, restart (or rebuild the image). Static files in `public/` don't have content
hashes; they are cached for one day (asset pack) or 30 days (models and runtimes) with background revalidation, so
change a file's name when its content changes incompatibly.
