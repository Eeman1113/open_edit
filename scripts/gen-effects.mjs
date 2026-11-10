#!/usr/bin/env node
// Generates the overlay textures of the whole-image Effects (photo and video editors), kind "fx" of the "open" pack.
// The effects themselves are shaders in src/lib/gl/effects.ts; these textures only feed the overlay-based ones.
//   lightleak  512x512  warm light spilling in from the left and top edges, black elsewhere (screen-blended)
//   dust       1024x1024 tileable: R = bright specks, G = dark specks, fibres and fine scratches (film dust)
//   bokeh      512x512  soft out-of-focus discs in warm and cool colours on black (screen-blended)
// Everything is drawn from seeded random numbers, so a rerun writes identical files.
// Run: node scripts/gen-effects.mjs
import { encodePng } from "./gen-lib/png.mjs";
import { rng, runAsMain, updateManifest, writePack } from "./gen-lib/pack.mjs";

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sst = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Float RGB buffer -> RGBA PNG (opaque). */
function toPng(w, h, f) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    px[i * 4] = clamp01(f[i * 3]) * 255 + 0.5;
    px[i * 4 + 1] = clamp01(f[i * 3 + 1]) * 255 + 0.5;
    px[i * 4 + 2] = clamp01(f[i * 3 + 2]) * 255 + 0.5;
    px[i * 4 + 3] = 255;
  }
  return encodePng(w, h, px, 4);
}

/* ------------------------------------------------------------------ light leak */

function lightLeak() {
  const N = 512, f = new Float32Array(N * N * 3), R = rng(1207);
  // a few large anisotropic glows hugging the left and top edges
  const blobs = [
    { x: -0.08, y: 0.32, rx: 0.42, ry: 0.62, c: [1.0, 0.42, 0.12], k: 1.05 },
    { x: 0.1, y: -0.1, rx: 0.55, ry: 0.3, c: [1.0, 0.7, 0.25], k: 0.85 },
    { x: -0.1, y: 0.85, rx: 0.3, ry: 0.4, c: [0.95, 0.2, 0.35], k: 0.7 },
    { x: 0.55, y: -0.12, rx: 0.25, ry: 0.18, c: [1.0, 0.85, 0.55], k: 0.5 },
  ];
  for (let i = 0; i < 5; i++) blobs.push({ x: -0.05 + R() * 0.2, y: R(), rx: 0.08 + R() * 0.12, ry: 0.1 + R() * 0.2, c: [1, 0.5 + R() * 0.3, 0.2 + R() * 0.2], k: 0.25 + R() * 0.25 });
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = (x + 0.5) / N, v = (y + 0.5) / N, i = (y * N + x) * 3;
    let r = 0, g = 0, b = 0;
    for (const o of blobs) {
      const d = ((u - o.x) / o.rx) ** 2 + ((v - o.y) / o.ry) ** 2;
      const a = Math.exp(-d * 1.6) * o.k;
      r += o.c[0] * a; g += o.c[1] * a; b += o.c[2] * a;
    }
    // a soft diagonal streak of light
    const s = Math.exp(-(((u * 0.8 + v * 0.6) - 0.42) ** 2) / 0.004) * sst(0.75, 0.0, u) * 0.35;
    r += s; g += s * 0.75; b += s * 0.4;
    // tone-map so overlaps roll off instead of clipping
    f[i] = 1 - Math.exp(-r * 1.3); f[i + 1] = 1 - Math.exp(-g * 1.3); f[i + 2] = 1 - Math.exp(-b * 1.3);
  }
  return toPng(N, N, f);
}

/* ------------------------------------------------------------------ film dust */

function dust() {
  const N = 1024, f = new Float32Array(N * N * 3), R = rng(4431);
  /** Soft round dab, wrapped so the texture tiles. ch 0 = bright, 1 = dark. */
  const dab = (cx, cy, rad, ch, a) => {
    const e = Math.ceil(rad + 2);
    for (let y = -e; y <= e; y++) for (let x = -e; x <= e; x++) {
      const d = Math.hypot(x + (cx % 1), y + (cy % 1)) / rad;
      if (d >= 1.4) continue;
      const px = (((Math.floor(cx) + x) % N) + N) % N, py = (((Math.floor(cy) + y) % N) + N) % N;
      const i = (py * N + px) * 3 + ch;
      f[i] = Math.max(f[i], a * sst(1.4, 0.6, d));
    }
  };
  // bright specks (dust on the print) and dark specks (dust on the negative)
  for (let k = 0; k < 260; k++) dab(R() * N, R() * N, 0.6 + R() ** 3 * 3.2, 0, 0.55 + R() * 0.45);
  for (let k = 0; k < 340; k++) dab(R() * N, R() * N, 0.6 + R() ** 3 * 2.6, 1, 0.5 + R() * 0.5);
  // fibres: thin wandering curves
  for (let k = 0; k < 26; k++) {
    let x = R() * N, y = R() * N, ang = R() * Math.PI * 2;
    const len = 20 + R() * 90, w = 0.5 + R() * 0.6, ch = R() < 0.7 ? 1 : 0, a = 0.5 + R() * 0.4;
    for (let s = 0; s < len; s += 0.5) {
      ang += (R() - 0.5) * 0.25;
      x += Math.cos(ang) * 0.5; y += Math.sin(ang) * 0.5;
      dab(x, y, w, ch, a);
    }
  }
  // fine vertical scratches
  for (let k = 0; k < 7; k++) {
    const x0 = R() * N, y0 = R() * N, len = 120 + R() * 500, ch = R() < 0.5 ? 1 : 0, a = 0.25 + R() * 0.3;
    for (let s = 0; s < len; s += 0.7) dab(x0 + Math.sin(s * 0.01 + k) * 2, y0 + s, 0.45, ch, a * sst(0, 40, s) * sst(len, len - 40, s));
  }
  return toPng(N, N, f);
}

/* ------------------------------------------------------------------ bokeh */

function bokeh() {
  const N = 512, f = new Float32Array(N * N * 3), R = rng(9020);
  const palette = [[1, 0.72, 0.35], [1, 0.55, 0.45], [1, 0.88, 0.6], [0.55, 0.75, 1], [0.85, 0.6, 1], [0.6, 1, 0.85]];
  const discs = [];
  for (let k = 0; k < 46; k++) {
    // more and larger discs toward the top and the sides, keeping the centre clearer
    const x = R(), y = R() ** 1.4, edge = Math.max(Math.abs(x - 0.5), Math.abs(y - 0.5)) * 2;
    discs.push({ x, y, r: (0.025 + R() ** 2 * 0.07) * (0.6 + edge * 0.7), c: palette[Math.floor(R() * palette.length)], a: (0.18 + R() * 0.4) * (0.35 + edge * 0.65) });
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = (x + 0.5) / N, v = (y + 0.5) / N, i = (y * N + x) * 3;
    let r = 0, g = 0, b = 0;
    for (const d of discs) {
      const t = Math.hypot(u - d.x, v - d.y) / d.r;
      if (t > 1.15) continue;
      // flat disc with a slightly brighter rim, anti-aliased edge
      const a = d.a * sst(1.08, 0.94, t) * (0.8 + 0.35 * sst(0.55, 0.98, t));
      r += d.c[0] * a; g += d.c[1] * a; b += d.c[2] * a;
    }
    f[i] = 1 - Math.exp(-r * 1.5); f[i + 1] = 1 - Math.exp(-g * 1.5); f[i + 2] = 1 - Math.exp(-b * 1.5);
  }
  return toPng(N, N, f);
}

export function generate() {
  const files = { lightleak: lightLeak(), dust: dust(), bokeh: bokeh() };
  const kind = {};
  for (const [id, png] of Object.entries(files)) {
    kind[id] = { path: writePack(`effects/${id}.png`, png), meta: { repeat: id === "dust" } };
  }
  updateManifest({ fx: kind });
  return { textures: Object.keys(kind).length };
}

if (runAsMain(import.meta.url)) console.log(generate());
