#!/usr/bin/env node
// Generates the brush tips of the "open" asset pack (kind "brush"): 128x128 white PNGs whose alpha is the coverage.
// The drawing tool stamps a tip along the stroke and tints it with the brush colour.
//   round        hard round pen (anti-aliased edge)
//   soft         gaussian airbrush falloff
//   marker       chisel marker: flat rounded rectangle with a slightly streaky body
//   marker-soft  the marker tip, blurred
//   neon         bright core with a wide glow (outline / neon strokes)
//   dashed       capsule dash, stamped far apart for dashed lines
//   spray        scattered droplets
// Run: node scripts/gen-brushes.mjs
import { encodePng } from "./gen-lib/png.mjs";
import { rng, runAsMain, updateManifest, writePack } from "./gen-lib/pack.mjs";

const N = 128;
const sst = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function tip(alpha) {
  const px = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = (x + 0.5) / N * 2 - 1, v = (y + 0.5) / N * 2 - 1;
    const a = Math.max(0, Math.min(1, alpha(u, v, x, y)));
    const i = (y * N + x) * 4;
    px[i] = px[i + 1] = px[i + 2] = 255;
    px[i + 3] = a * 255 + 0.5;
  }
  return px;
}

/** Signed distance to a rounded rectangle of half size (hx, hy) and corner radius r. */
const rrect = (u, v, hx, hy, r) => {
  const qx = Math.abs(u) - hx + r, qy = Math.abs(v) - hy + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};

function blur(px, radius) {
  const a = new Float32Array(N * N), b = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) a[i] = px[i * 4 + 3];
  const pass = (src, dst, dx, dy) => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let s = 0, w = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = x + dx * k, yy = y + dy * k;
        if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
        const wt = Math.exp(-(k * k) / (radius * radius * 0.5));
        s += src[yy * N + xx] * wt; w += wt;
      }
      dst[y * N + x] = s / w;
    }
  };
  pass(a, b, 1, 0); pass(b, a, 0, 1);
  for (let i = 0; i < N * N; i++) px[i * 4 + 3] = a[i];
  return px;
}

export const BRUSHES = {
  round: () => tip((u, v) => 1 - sst(0.9, 0.97, Math.hypot(u, v))),
  soft: () => tip((u, v) => { const r = Math.hypot(u, v); return Math.exp(-r * r * 4.5) * (1 - sst(0.85, 1, r)); }),
  marker: () => {
    const r = rng(5), streak = Array.from({ length: N }, () => 0.82 + r() * 0.18);
    return tip((u, v, x) => (1 - sst(-0.02, 0.03, rrect(u, v, 0.32, 0.92, 0.22))) * streak[x]);
  },
  "marker-soft": () => blur(BRUSHES.marker(), 6),
  neon: () => tip((u, v) => { const r = Math.hypot(u, v); return Math.min(1, (1 - sst(0.25, 0.35, r)) + Math.exp(-r * r * 3.2) * 0.55) * (1 - sst(0.9, 1, r)); }),
  dashed: () => tip((u, v) => 1 - sst(-0.02, 0.03, rrect(u, v, 0.92, 0.3, 0.3))),
  spray: () => {
    const r = rng(9), drops = Array.from({ length: 90 }, () => {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.88;
      return [Math.cos(a) * d, Math.sin(a) * d, 0.025 + r() * 0.05 * (1 - d * 0.6)];
    });
    return tip((u, v) => drops.reduce((m, [x, y, s]) => Math.max(m, 1 - sst(s * 0.6, s, Math.hypot(u - x, v - y))), 0));
  },
};

export function generate() {
  const brush = {};
  for (const [id, make] of Object.entries(BRUSHES)) brush[id] = { path: writePack(`brushes/${id}.png`, encodePng(N, N, make())) };
  updateManifest({ brush });
  return { brushes: Object.keys(brush).length };
}

if (runAsMain(import.meta.url)) console.log("gen-brushes:", generate());
