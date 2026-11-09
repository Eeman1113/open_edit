// On-device art styles: applies an ArtStyle recipe (src/data/content/artStyles.ts) to an image with plain canvas
// pixel operations. Nothing is uploaded. Sizes in the recipe (smooth radius, halftone cell) are fractions of the
// image's short side, so a style looks the same on a thumbnail and on the full photo.
import type { ArtOp, ArtStyle } from "@/lib/content/types";

type Img = { width: number; height: number };
type Buf = Float32Array<ArrayBufferLike>; // RGB interleaved, 0..1

const hex = (c: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  const n = m ? parseInt(m[1], 16) : 0;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const luma = (b: Buf, i: number) => 0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2];
const smoothstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a || 1e-6)); return t * t * (3 - 2 * t); };

/** Separable box blur, `passes` times (3 passes ≈ Gaussian). Works on `ch` interleaved channels. */
function blur(src: Buf, w: number, h: number, r: number, ch: number, passes = 3): Buf {
  if (r < 1) return src.slice();
  const a = src.slice(), b = new Float32Array(src.length);
  const win = 2 * r + 1;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) for (let c = 0; c < ch; c++) { // horizontal
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += a[(y * w + Math.min(w - 1, Math.max(0, x))) * ch + c];
      for (let x = 0; x < w; x++) {
        b[(y * w + x) * ch + c] = acc / win;
        acc += a[(y * w + Math.min(w - 1, x + r + 1)) * ch + c] - a[(y * w + Math.max(0, x - r)) * ch + c];
      }
    }
    for (let x = 0; x < w; x++) for (let c = 0; c < ch; c++) { // vertical
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += b[(Math.min(h - 1, Math.max(0, y)) * w + x) * ch + c];
      for (let y = 0; y < h; y++) {
        a[(y * w + x) * ch + c] = acc / win;
        acc += b[(Math.min(h - 1, y + r + 1) * w + x) * ch + c] - b[(Math.max(0, y - r) * w + x) * ch + c];
      }
    }
  }
  return a;
}

function grayOf(b: Buf, w: number, h: number): Buf {
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = luma(b, i * 3);
  return g;
}

/** Sobel gradient magnitude of a single-channel image (0..~1). */
function sobel(g: Buf, w: number, h: number): Buf {
  const out = new Float32Array(w * h);
  const at = (x: number, y: number) => g[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
    const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
    out[y * w + x] = Math.sqrt(gx * gx + gy * gy) / 4;
  }
  return out;
}

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function applyOp(op: ArtOp, b: Buf, src: Buf, w: number, h: number): Buf {
  const n = w * h, short = Math.min(w, h);
  switch (op.op) {
    case "smooth": return blur(b, w, h, Math.round(op.radius * short), 3, 2);
    case "posterize": {
      const L = Math.max(2, Math.min(32, Math.round(op.levels))) - 1;
      for (let i = 0; i < n * 3; i++) b[i] = Math.round(b[i] * L) / L;
      return b;
    }
    case "saturate":
      for (let i = 0; i < n * 3; i += 3) { const l = luma(b, i); for (let c = 0; c < 3; c++) b[i + c] = clamp(l + (b[i + c] - l) * op.amount); }
      return b;
    case "contrast":
      for (let i = 0; i < n * 3; i++) b[i] = clamp((b[i] - 0.5) * op.amount + 0.5);
      return b;
    case "brightness":
      for (let i = 0; i < n * 3; i++) b[i] = clamp(b[i] + op.amount * (1 - b[i]));
      return b;
    case "edges": {
      const g = blur(grayOf(src, w, h), w, h, Math.max(1, Math.round(short / 700)), 1, 1);
      const m = sobel(g, w, h), t = op.threshold ?? 0.15, col = hex(op.color ?? "#111111");
      for (let i = 0; i < n; i++) {
        const k = smoothstep(t * 0.5, t, m[i]) * op.strength;
        for (let c = 0; c < 3; c++) b[i * 3 + c] = b[i * 3 + c] * (1 - k) + col[c] * k;
      }
      return b;
    }
    case "sketch": {
      const g = grayOf(b, w, h), inv = new Float32Array(n);
      for (let i = 0; i < n; i++) inv[i] = 1 - g[i];
      const bl = blur(inv, w, h, Math.max(1, Math.round(short * 0.012)), 1);
      const s = op.strength ?? 1;
      for (let i = 0; i < n; i++) {
        const dodge = Math.min(1, g[i] / Math.max(1e-3, 1 - bl[i]));
        const v = 1 - (1 - dodge ** 2) * s;
        b[i * 3] = b[i * 3 + 1] = b[i * 3 + 2] = clamp(v);
      }
      return b;
    }
    case "duotone": {
      const d = hex(op.dark), l = hex(op.light);
      for (let i = 0; i < n * 3; i += 3) { const y = luma(b, i); for (let c = 0; c < 3; c++) b[i + c] = d[c] + (l[c] - d[c]) * y; }
      return b;
    }
    case "halftone": {
      const cell = Math.max(3, op.cell * short), ang = op.angle ?? 0.4, cs = Math.cos(ang), sn = Math.sin(ang);
      const avg = blur(b, w, h, Math.max(1, Math.round(cell / 2)), 3, 1);
      const out = new Float32Array(n * 3);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const u = (x * cs + y * sn) / cell, v = (-x * sn + y * cs) / cell;
        const cu = Math.floor(u) + 0.5, cv = Math.floor(v) + 0.5;
        const px = (cu * cs - cv * sn) * cell, py = (cu * sn + cv * cs) * cell; // cell centre in image space
        const sx = Math.min(w - 1, Math.max(0, Math.round(px))), sy = Math.min(h - 1, Math.max(0, Math.round(py)));
        const si = (sy * w + sx) * 3;
        const dark = 1 - luma(avg, si);
        const r = 0.5 * Math.sqrt(dark) * 1.3;
        const dist = Math.hypot(u - cu, v - cv);
        const k = 1 - smoothstep(r - 1 / cell, r + 1 / cell, dist);
        const o = (y * w + x) * 3;
        for (let c = 0; c < 3; c++) out[o + c] = 0.97 + (avg[si + c] * 0.85 - 0.97) * k;
      }
      return out;
    }
    case "grain": {
      const rnd = seeded(w * 31 + h);
      for (let i = 0; i < n * 3; i += 3) { const g = (rnd() - 0.5) * op.amount; for (let c = 0; c < 3; c++) b[i + c] = clamp(b[i + c] + g); }
      return b;
    }
    case "paper": {
      const p = hex(op.color);
      for (let i = 0; i < n * 3; i += 3) for (let c = 0; c < 3; c++) b[i + c] = b[i + c] * (1 - op.amount) + b[i + c] * p[c] * op.amount;
      return b;
    }
  }
}

/** Renders `style` applied to `img` into a new canvas no larger than `maxSide` on its long side. */
export function renderArtStyle(img: CanvasImageSource & Img, style: Pick<ArtStyle, "ops">, maxSide = 1600): HTMLCanvasElement {
  const s = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const src = new Float32Array(w * h * 3);
  for (let i = 0, j = 0; i < w * h; i++, j += 4) { src[i * 3] = data.data[j] / 255; src[i * 3 + 1] = data.data[j + 1] / 255; src[i * 3 + 2] = data.data[j + 2] / 255; }
  let b: Buf = src.slice();
  for (const op of style.ops) b = applyOp(op, b, src, w, h);
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    data.data[j] = Math.round(clamp(b[i * 3]) * 255);
    data.data[j + 1] = Math.round(clamp(b[i * 3 + 1]) * 255);
    data.data[j + 2] = Math.round(clamp(b[i * 3 + 2]) * 255);
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}
