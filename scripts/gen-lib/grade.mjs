// Colour-grade maths for the generated lookup tables. A grade is a list of plain operations applied in order to an
// sRGB colour (0..1). All looks in gen-luts.mjs are defined with these building blocks; nothing is sampled from
// another product.

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const mix = (a, b, t) => a + (b - a) * t;
export const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
export const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
export const hex = (h) => { const n = parseInt(h.replace("#", ""), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

/** Monotone cubic (Fritsch-Carlson) through control points [[x, y], ...], x ascending in 0..1. */
export function curve(points) {
  const p = [...points].sort((a, b) => a[0] - b[0]);
  const n = p.length, d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((p[i + 1][1] - p[i][1]) / (p[i + 1][0] - p[i][0] || 1e-6));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x) => {
    if (x <= p[0][0]) return p[0][1];
    if (x >= p[n - 1][0]) return p[n - 1][1];
    let i = 0;
    while (x > p[i + 1][0]) i++;
    const h = p[i + 1][0] - p[i][0], t = (x - p[i][0]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * p[i][1] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * p[i + 1][1] + (t3 - t2) * h * m[i + 1];
  };
}

function rgbToHsl([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslToRgb([h, s, l]) {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

/** Operation catalogue. Each takes (colour, arg) and returns a new colour. */
const OPS = {
  /** Exposure in stops (applied in an approximate linear space). */
  exposure: (c, ev) => c.map((v) => Math.pow(clamp01(Math.pow(v, 2.2) * Math.pow(2, ev)), 1 / 2.2)),
  /** White balance: + = warmer (amber), - = cooler (blue). */
  temp: (c, t) => [c[0] * (1 + 0.12 * t), c[1] * (1 + 0.02 * t), c[2] * (1 - 0.14 * t)],
  /** Tint: + = magenta, - = green. */
  tint: (c, t) => [c[0] * (1 + 0.05 * t), c[1] * (1 - 0.08 * t), c[2] * (1 + 0.05 * t)],
  /** Contrast as an S-curve on luma around 0.5 (preserves hue). */
  contrast: (c, k) => {
    const y = luma(c), s = y + k * (smooth(0, 1, y) - y) * 1.6;
    const g = y > 1e-4 ? s / y : 1;
    return y > 1e-4 ? c.map((v) => v * g) : c;
  },
  /** Saturation multiplier delta (-1 = grey). */
  saturation: (c, k) => { const y = luma(c); return c.map((v) => y + (v - y) * (1 + k)); },
  /** Vibrance: boosts low-saturation colours more than saturated ones. */
  vibrance: (c, k) => {
    const y = luma(c), sat = Math.max(...c) - Math.min(...c);
    const f = 1 + k * (1 - clamp01(sat * 1.6));
    return c.map((v) => y + (v - y) * f);
  },
  /** Lift / gamma / gain per channel ([r, g, b] each, neutral 0 / 1 / 1). */
  lgg: (c, { lift = [0, 0, 0], gamma = [1, 1, 1], gain = [1, 1, 1] }) =>
    c.map((v, i) => Math.pow(clamp01(lift[i] + (gain[i] - lift[i]) * clamp01(v)), 1 / gamma[i])),
  /** Raise the black point and lower the white point (matte look). */
  fade: (c, { black = 0.08, white = 1 }) => c.map((v) => black + (white - black) * clamp01(v)),
  /** Tint the shadows / highlights toward a colour (luma-masked, soft). */
  split: (c, { shadow, shadowAmt = 0, highlight, highlightAmt = 0, balance = 0 }) => {
    const y = luma(c);
    const ms = (1 - smooth(0, 0.55 + balance * 0.3, y)) * shadowAmt, mh = smooth(0.45 + balance * 0.3, 1, y) * highlightAmt;
    let o = c;
    if (shadow && ms) { const t = hex(shadow); o = o.map((v, i) => v + (t[i] - 0.5) * ms); }
    if (highlight && mh) { const t = hex(highlight); o = o.map((v, i) => v + (t[i] - 0.5) * mh); }
    return o;
  },
  /** Monochrome from a channel mix, optionally toned (tone = colour of the midtones, amount 0..1). */
  mono: (c, { mixRgb = [0.3, 0.55, 0.15], tone, toneAmt = 0 }) => {
    const y = clamp01(c[0] * mixRgb[0] + c[1] * mixRgb[1] + c[2] * mixRgb[2]);
    let o = [y, y, y];
    if (tone && toneAmt) { const t = hex(tone), w = 4 * y * (1 - y) * toneAmt; o = o.map((v, i) => v + (t[i] - 0.5) * w); }
    return o;
  },
  /** Master tone curve (control points). */
  curve: (c, pts) => { const f = curveCache(pts); return c.map((v) => f(clamp01(v))); },
  /** Per-channel curves { r, g, b } (control points). */
  rgbCurves: (c, { r, g, b }) => [r ? curveCache(r)(clamp01(c[0])) : c[0], g ? curveCache(g)(clamp01(c[1])) : c[1], b ? curveCache(b)(clamp01(c[2])) : c[2]],
  /** Rotate hues inside a band: { center (deg), width (deg), shift (deg), sat (delta), light (delta) }. */
  hueBand: (c, { center, width = 40, shift = 0, sat = 0, light = 0 }) => {
    const hsl = rgbToHsl(c.map(clamp01));
    let d = hsl[0] * 360 - center;
    d = ((d + 540) % 360) - 180;
    const w = Math.max(0, 1 - Math.abs(d) / width) * clamp01(hsl[1] * 3);
    if (!w) return c;
    hsl[0] = (hsl[0] + (shift * w) / 360 + 1) % 1;
    hsl[1] = clamp01(hsl[1] * (1 + sat * w));
    hsl[2] = clamp01(hsl[2] + light * w * hsl[2] * (1 - hsl[2]) * 2);
    return hslToRgb(hsl);
  },
  /** Soft shoulder: compresses highlights above `knee`. */
  rolloff: (c, { knee = 0.75, amount = 0.5 }) => c.map((v) => (v <= knee ? v : knee + (v - knee) / (1 + ((v - knee) / (1 - knee)) * amount * 2))),
};

const cache = new Map();
function curveCache(pts) {
  const k = JSON.stringify(pts);
  if (!cache.has(k)) cache.set(k, curve(pts));
  return cache.get(k);
}

/** Apply a grade ([[op, arg], ...]) to one colour. */
export function applyGrade(ops, c) {
  let o = c;
  for (const [name, arg] of ops) {
    const f = OPS[name];
    if (!f) throw new Error(`unknown grade op ${name}`);
    o = f(o, arg);
  }
  return o.map(clamp01);
}

/** 512x512 lookup table: 8x8 tiles of 64x64, tile index = blue level, x = red, y = green (all 0..63). */
export function lutPixels(fn) {
  const W = 512, px = new Uint8ClampedArray(W * W * 4);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const b = Math.floor(y / 64) * 8 + Math.floor(x / 64);
    const c = fn([(x % 64) / 63, (y % 64) / 63, b / 63]);
    const i = (y * W + x) * 4;
    px[i] = c[0] * 255 + 0.5; px[i + 1] = c[1] * 255 + 0.5; px[i + 2] = c[2] * 255 + 0.5; px[i + 3] = 255;
  }
  return px;
}
