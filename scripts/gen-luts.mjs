#!/usr/bin/env node
// Generates the filter lookup tables, their preview swatches and the engine tables of the "open" asset pack:
//   filters/<key>.png        512x512 colour lookup (8x8 tiles of 64 levels) for every look in src/data/filters.ts
//   filters/thumbs/<key>.png 120x120 swatch: a procedural test scene rendered through the same grade
//   tables/*.png             whitening, warm/cool/tan/light skin tone tables, skin tone presets, grain noise
// Every grade is defined below from the operations in gen-lib/grade.mjs. Run: node scripts/gen-luts.mjs
import { FILTER_DEFS } from "../src/data/filters.ts";
import { SKIN_TONE_DEFS } from "../src/data/skintones.ts";
import { applyGrade, clamp01, hex, lutPixels, mix, smooth } from "./gen-lib/grade.mjs";
import { encodePng } from "./gen-lib/png.mjs";
import { rng, runAsMain, updateManifest, writePack } from "./gen-lib/pack.mjs";

/** The looks. Keys must match src/data/filters.ts. */
export const LOOKS = {
  natural: [["contrast", 0.12], ["vibrance", 0.18], ["temp", 0.04]],
  clean: [["exposure", 0.12], ["temp", -0.12], ["contrast", 0.15], ["vibrance", 0.1], ["curve", [[0, 0.01], [0.5, 0.52], [1, 1]]]],
  bright: [["exposure", 0.35], ["rolloff", { knee: 0.7, amount: 0.6 }], ["saturation", -0.05], ["fade", { black: 0.03 }]],
  peach: [["temp", 0.18], ["tint", 0.22], ["split", { highlight: "#ffb48a", highlightAmt: 0.22, shadow: "#7a5a6e", shadowAmt: 0.08 }], ["exposure", 0.12], ["contrast", -0.08]],
  cream: [["temp", 0.15], ["fade", { black: 0.07, white: 0.97 }], ["saturation", -0.18], ["split", { highlight: "#fff0d0", highlightAmt: 0.2 }], ["contrast", -0.1]],
  mint: [["split", { shadow: "#3cbca0", shadowAmt: 0.18, highlight: "#f2fff6", highlightAmt: 0.08 }], ["temp", -0.08], ["hueBand", { center: 100, width: 50, shift: 18, sat: 0.1 }], ["exposure", 0.08]],
  "warm-film": [
    ["temp", 0.35], ["rgbCurves", { r: [[0, 0.06], [0.5, 0.54], [1, 0.97]], g: [[0, 0.04], [0.5, 0.5], [1, 0.95]], b: [[0, 0.08], [0.5, 0.44], [1, 0.86]] }],
    ["contrast", 0.1], ["saturation", -0.12], ["rolloff", { knee: 0.72, amount: 0.7 }],
  ],
  "cool-matte": [["temp", -0.3], ["fade", { black: 0.1, white: 0.94 }], ["saturation", -0.25], ["split", { shadow: "#4a6888", shadowAmt: 0.2 }], ["contrast", 0.05]],
  fade: [["fade", { black: 0.16, white: 0.95 }], ["saturation", -0.3], ["contrast", -0.12]],
  retro: [
    ["rgbCurves", { r: [[0, 0.02], [0.3, 0.24], [0.7, 0.8], [1, 1]], g: [[0, 0.06], [0.5, 0.55], [1, 0.96]], b: [[0, 0.18], [0.5, 0.46], [1, 0.74]] }],
    ["saturation", 0.08], ["hueBand", { center: 110, width: 60, shift: -12, sat: 0.2 }],
  ],
  golden: [["temp", 0.45], ["split", { highlight: "#ffcf6a", highlightAmt: 0.25, shadow: "#6b3b2a", shadowAmt: 0.12 }], ["contrast", 0.12], ["vibrance", 0.1]],
  polaroid: [["fade", { black: 0.08, white: 0.96 }], ["split", { shadow: "#2f8f9a", shadowAmt: 0.2, highlight: "#fff4dc", highlightAmt: 0.18 }], ["saturation", -0.1], ["exposure", 0.1]],
  dusk: [["split", { shadow: "#5b3f9e", shadowAmt: 0.3, highlight: "#ff9a52", highlightAmt: 0.28 }], ["contrast", 0.12], ["saturation", -0.05]],
  cinema: [
    ["split", { shadow: "#1f7f86", shadowAmt: 0.3, highlight: "#ffa868", highlightAmt: 0.18 }], ["contrast", 0.25],
    ["hueBand", { center: 25, width: 30, sat: 0.12 }], ["hueBand", { center: 200, width: 60, shift: 10, sat: 0.15 }], ["saturation", -0.05],
  ],
  ocean: [["temp", -0.4], ["split", { shadow: "#11507a", shadowAmt: 0.3, highlight: "#c8f2ff", highlightAmt: 0.12 }], ["hueBand", { center: 190, width: 60, sat: 0.25 }], ["contrast", 0.1]],
  forest: [["hueBand", { center: 105, width: 60, shift: -8, sat: 0.3, light: -0.1 }], ["split", { shadow: "#2d4a24", shadowAmt: 0.18 }], ["temp", 0.06], ["contrast", 0.12]],
  lilac: [["split", { shadow: "#7b62b8", shadowAmt: 0.22, highlight: "#f1e3ff", highlightAmt: 0.2 }], ["saturation", -0.15], ["exposure", 0.15], ["fade", { black: 0.05 }]],
  rose: [["tint", 0.35], ["split", { highlight: "#ffc2cf", highlightAmt: 0.25 }], ["exposure", 0.12], ["rolloff", { knee: 0.7, amount: 0.5 }], ["vibrance", 0.06]],
  mono: [["mono", { mixRgb: [0.28, 0.6, 0.12] }], ["contrast", 0.1]],
  noir: [["mono", { mixRgb: [0.45, 0.45, 0.1] }], ["curve", [[0, 0], [0.22, 0.12], [0.5, 0.5], [0.78, 0.9], [1, 1]]]],
  silver: [["mono", { mixRgb: [0.25, 0.6, 0.15], tone: "#8aa0b8", toneAmt: 0.2 }], ["fade", { black: 0.07, white: 0.97 }]],
  sepia: [["mono", { mixRgb: [0.3, 0.59, 0.11], tone: "#c08a52", toneAmt: 0.55 }], ["fade", { black: 0.05 }], ["contrast", 0.05]],
};

// ---------- engine tables ----------

/** Pseudo skin likelihood of a colour (warm, mid-saturated hues). */
function skinness(c) {
  const [r, g, b] = c;
  const cb = -0.169 * r - 0.331 * g + 0.5 * b, cr = 0.5 * r - 0.419 * g - 0.081 * b;
  const d = Math.hypot((cb + 0.08) / 0.09, (cr - 0.1) / 0.08);
  return clamp01(1 - (d - 0.6) / 0.9) * smooth(0.08, 0.25, r);
}

const TABLES = {
  /** Brighten / whiten: lifts mids, cools and slightly desaturates warm tones. */
  whiten: (c) => {
    const k = 0.5 + 0.5 * skinness(c);
    const o = applyGrade([["curve", [[0, 0], [0.25, 0.33], [0.6, 0.74], [1, 1]]], ["temp", -0.12], ["tint", 0.06]], c);
    const y = 0.3 * o[0] + 0.59 * o[1] + 0.11 * o[2];
    return o.map((v) => mix(v, y, 0.12 * k)).map(clamp01);
  },
  "skin-warm": (c) => applyGrade([["temp", 0.55], ["vibrance", 0.1]], c),
  "skin-cool": (c) => applyGrade([["temp", -0.5], ["tint", 0.12]], c),
  "skin-light": (c) => applyGrade([["curve", [[0, 0], [0.3, 0.38], [0.7, 0.8], [1, 1]]], ["saturation", -0.08]], c),
  "skin-tan": (c) => applyGrade([["exposure", -0.35], ["temp", 0.3], ["saturation", 0.15]], c),
};

function rgbToHsl([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslToRgb([h, s, l]) {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

/** Skin table: moves skin-like colours toward the preset's hue / saturation and shifts their lightness. */
function skinToneTable(def) {
  const t = rgbToHsl(hex(def.target));
  return (c) => {
    const k = skinness(c);
    if (k <= 0) return c;
    const h = rgbToHsl(c);
    let dh = t[0] - h[0];
    if (dh > 0.5) dh -= 1;
    if (dh < -0.5) dh += 1;
    const o = [(h[0] + dh * 0.7 * k + 1) % 1, mix(h[1], t[1], 0.55 * k), clamp01(h[2] + def.light * 0.18 * k * (1 - Math.abs(h[2] - 0.5)))];
    return hslToRgb(o).map(clamp01);
  };
}
const bgTable = (def) => (c) => applyGrade([["temp", def.bgTemp * 0.4], ["contrast", 0.04]], c);

/** Film-grain noise, 256x256, tileable (independent per pixel, lightly softened with wrap-around). */
function noisePixels() {
  const N = 256, r = rng(612), g = new Float32Array(N * N * 3);
  const gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += r(); return (s - 2) / 1.15; };
  for (let i = 0; i < g.length; i++) g[i] = gauss();
  const px = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) for (let k = 0; k < 3; k++) {
    let s = 0, w = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const wt = dx || dy ? (dx && dy ? 0.25 : 0.5) : 1;
      s += g[(((y + dy + N) % N) * N + ((x + dx + N) % N)) * 3 + k] * wt; w += wt;
    }
    px[(y * N + x) * 4 + k] = 128 + (s / w) * 70;
    px[(y * N + x) * 4 + 3] = 255;
  }
  return { w: N, h: N, px };
}

// ---------- preview scene ----------

/** Procedural 120x120 test scene: sky, sun, hills, sand, a flower and a grey ramp. */
function scene(x, y, S) {
  const u = x / S, v = y / S;
  let c;
  if (v < 0.55) {
    c = [mix(0.42, 0.98, v / 0.55), mix(0.62, 0.78, v / 0.55), mix(0.92, 0.7, v / 0.55)];
    const sd = Math.hypot(u - 0.7, v - 0.32);
    if (sd < 0.11) c = [1, 0.93, 0.72];
    else if (sd < 0.2) c = c.map((q, i) => mix(q, [1, 0.88, 0.62][i], (0.2 - sd) / 0.09 * 0.6));
  } else c = [0.86, 0.72, 0.52];
  const hill = 0.55 + 0.06 * Math.sin(u * 7.5 + 1) + 0.03 * Math.sin(u * 17);
  if (v > hill && v < 0.74) c = [mix(0.18, 0.3, (v - hill) * 6), mix(0.45, 0.55, (v - hill) * 4), mix(0.33, 0.4, u)];
  const fd = Math.hypot(u - 0.28, v - 0.72);
  if (fd < 0.08) c = fd < 0.03 ? [0.98, 0.8, 0.25] : [0.92, 0.38, 0.52];
  const sk = Math.hypot((u - 0.55) / 0.12, (v - 0.8) / 0.09);
  if (sk < 1) c = [0.89, 0.67, 0.55].map((q) => q * (1 - 0.15 * sk));
  if (v > 0.9) c = [u, u, u];
  return c;
}

function thumbPixels(ops, S = 120) {
  const px = new Uint8ClampedArray(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const c = ops ? applyGrade(ops, scene(x, y, S)) : scene(x, y, S);
    const i = (y * S + x) * 4;
    px[i] = c[0] * 255 + 0.5; px[i + 1] = c[1] * 255 + 0.5; px[i + 2] = c[2] * 255 + 0.5; px[i + 3] = 255;
  }
  return px;
}

export function generate() {
  const filter = {}, thumbs = {}, table = {};
  thumbs.original = { path: writePack("filters/thumbs/original.png", encodePng(120, 120, thumbPixels(null))) };
  for (const d of FILTER_DEFS) {
    const ops = LOOKS[d.key];
    if (!ops) throw new Error(`no grade for filter ${d.key}`);
    filter[d.key] = { path: writePack(`filters/${d.key}.png`, encodePng(512, 512, lutPixels((c) => applyGrade(ops, c)))), meta: { name: d.name, group: d.group, strength: d.strength } };
    thumbs[d.key] = { path: writePack(`filters/thumbs/${d.key}.png`, encodePng(120, 120, thumbPixels(ops))) };
  }
  table.identity = { path: writePack("tables/identity.png", encodePng(512, 512, lutPixels((c) => c))) };
  for (const [k, fn] of Object.entries(TABLES)) table[k] = { path: writePack(`tables/${k}.png`, encodePng(512, 512, lutPixels(fn))) };
  for (const def of SKIN_TONE_DEFS) {
    table[`skintone-${def.key}-skin`] = { path: writePack(`tables/skintone-${def.key}-skin.png`, encodePng(512, 512, lutPixels(skinToneTable(def)))) };
    table[`skintone-${def.key}-bg`] = { path: writePack(`tables/skintone-${def.key}-bg.png`, encodePng(512, 512, lutPixels(bgTable(def)))) };
  }
  const n = noisePixels();
  table.grain = { path: writePack("tables/grain.png", encodePng(n.w, n.h, n.px)) };
  updateManifest({ filter, "filter-thumb": thumbs, table });
  return { filters: Object.keys(filter).length, tables: Object.keys(table).length };
}

if (runAsMain(import.meta.url)) console.log("gen-luts:", generate());
