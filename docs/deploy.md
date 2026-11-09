# Deploying Open_Edit

Open_Edit is a Next.js 16 app. Everything except the small content API runs in the browser, so any host that can
run Node.js 24 works. No database, no object storage and no environment variables are required: with nothing
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

## Other static-file CDNs

If you serve `public/` from a CDN, keep the same paths, send `Cross-Origin-Resource-Policy: cross-origin` (or
serve from the same origin) so the isolated pages can load them, and keep the cache lifetimes from
`next.config.ts`.

## Updating

Pull, `npm ci`, `npm run build`, restart (or rebuild the image). Static files in `public/` don't have content
hashes; they are cached for one day (asset pack) or 30 days (models and runtimes) with background revalidation, so
change a file's name when its content changes incompatibly.
