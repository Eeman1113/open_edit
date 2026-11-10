import type { NextConfig } from "next";

// Values read here are fixed when the app is built (`next build` serialises this config), so set them at build time.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

// Static export for GitHub Pages and other plain file hosts (OE_STATIC_EXPORT=1, see docs/deploy.md). There is no
// server, so:
// - Route handlers (src/app/api/**/route.ts) are left out by `pageExtensions`: only .tsx/.jsx files are routes, pages
//   and layouts, and every page, layout and metadata file in src/app is .tsx while every route handler is .ts. The
//   client reads build-time JSON snapshots instead (scripts/gen-static-api.mjs, src/lib/content/api.ts).
// - Cache Components / partial prerendering are off: every route is prerendered to plain HTML at build time.
// - headers() can't be applied by a static host, so it is not set (no COOP/COEP: WASM runs single-threaded).
const staticExport = process.env.OE_STATIC_EXPORT === "1";

// Cross-origin isolation lets onnxruntime-web use multithreaded WASM (SharedArrayBuffer). "credentialless" keeps
// cross-origin images and audio from content providers working without CORP headers; Safari ignores it and simply
// runs single-threaded. "require-corp" is stricter (every cross-origin resource needs CORP/CORS); "off" disables.
const coep = (process.env.OE_COEP ?? "credentialless").trim();
const isolation =
  coep === "off"
    ? []
    : [
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Cross-Origin-Embedder-Policy", value: coep === "require-corp" ? "require-corp" : "credentialless" },
      ];

const security = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The camera, microphone (video sound) and location (optional photo tags) are used by this origin only.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self)" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
];

const day = 86400;
const cache = (maxAge: number, swr = maxAge * 7) => [{ key: "Cache-Control", value: `public, max-age=${maxAge}, stale-while-revalidate=${swr}` }];

const exportOptions: NextConfig = {
  output: "export",
  assetPrefix: basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  pageExtensions: ["tsx", "jsx"],
  cacheComponents: false,
  partialPrefetching: false,
};

const nextConfig: NextConfig = {
  basePath,
  output: "standalone",
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  ...(staticExport ? exportOptions : {}),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  headers: staticExport ? undefined : async () => {
    return [
      // Every response, so pages, their workers and same-origin assets share one isolation context.
      { source: "/:path*", headers: [...security, ...isolation] },
      // Static files in public/ have stable names but no content hash: cache, then revalidate in the background.
      { source: "/packs/:path*", headers: cache(day) },
      { source: "/models/:path*", headers: cache(30 * day) },
      { source: "/ort/:path*", headers: cache(30 * day) },
      { source: "/mediapipe/:path*", headers: cache(30 * day) },
    ];
  },
};

export default nextConfig;
