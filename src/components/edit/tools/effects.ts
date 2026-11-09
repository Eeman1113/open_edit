// Bitmap effects for the brush tools (pixelate / blur brushes, retouch brushes, depth blur, local fill).
// All operate on 2D canvases.
import { clamp, lerp, newCanvas } from "./common";

type Src = HTMLCanvasElement;

export function blurCanvas(src: Src, r: number, pad = true): Src {
  const c = newCanvas(src.width, src.height);
  const g = c.getContext("2d")!;
  if (r <= 0.3) { g.drawImage(src, 0, 0); return c; }
  g.filter = `blur(${r}px)`;
  if (pad) {
    // mirror-free edge padding: draw slightly enlarged so the blur doesn't fade to transparent at the edges
    const e = Math.ceil(r * 2);
    g.drawImage(src, -e, -e, src.width + e * 2, src.height + e * 2);
  }
  g.drawImage(src, 0, 0);
  return c;
}

export function filtered(src: Src, filter: string): Src {
  const c = newCanvas(src.width, src.height);
  const g = c.getContext("2d")!;
  g.filter = filter;
  g.drawImage(src, 0, 0);
  return c;
}

/** MOSAIC_Square: nearest-neighbour pixelation. */
export function pixelate(src: Src, cell: number): Src {
  const sw = Math.max(1, Math.round(src.width / cell)), sh = Math.max(1, Math.round(src.height / cell));
  const s = newCanvas(sw, sh);
  const sg = s.getContext("2d")!;
  sg.imageSmoothingQuality = "medium";
  sg.drawImage(src, 0, 0, sw, sh);
  const c = newCanvas(src.width, src.height);
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  g.drawImage(s, 0, 0, src.width, src.height);
  return c;
}

function sampler(src: Src, cell: number) {
  const sw = Math.max(1, Math.ceil(src.width / cell) * 2), sh = Math.max(1, Math.ceil(src.height / cell) * 2);
  const s = newCanvas(sw, sh);
  const sg = s.getContext("2d")!;
  sg.drawImage(src, 0, 0, sw, sh);
  const data = sg.getImageData(0, 0, sw, sh).data;
  return (x: number, y: number) => {
    const i = (clamp(Math.floor((y / src.height) * sh), 0, sh - 1) * sw + clamp(Math.floor((x / src.width) * sw), 0, sw - 1)) * 4;
    return `rgb(${data[i]},${data[i + 1]},${data[i + 2]})`;
  };
}

/**
 * Polygon mosaics. `base` is the cell size as a fraction of the image width. Every pixel takes the colour at the centre
 * of the cell it falls in:
 *  - hex: pointy-top hexagons; pixel -> axial coordinates -> cube rounding -> hexagon centre.
 *  - tri: equilateral triangles; pixel -> skewed lattice (u, v); the cell's lower-left or upper-right half picks the
 *    triangle, whose centroid is mapped back to pixels.
 */
export function polyMosaic(src: Src, base: number, shape: "tri" | "hex"): Src {
  const W = src.width, H = src.height;
  const sd = src.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, W, H).data;
  const c = newCanvas(W, H);
  const g = c.getContext("2d")!;
  const out = g.createImageData(W, H);
  const od = out.data;
  const R3 = Math.sqrt(3);
  const r = Math.max(2, base * W * (shape === "hex" ? 1 : 1.4));
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const x = px + 0.5, y = py + 0.5;
      let cx: number, cy: number;
      if (shape === "hex") {
        // fractional axial coordinates of a pointy-top hex grid, then round in cube space
        const q = ((R3 / 3) * x - y / 3) / r, rr = ((2 / 3) * y) / r, sq = -q - rr;
        const rs = Math.round(sq);
        let rq = Math.round(q), rv = Math.round(rr);
        const dq = Math.abs(rq - q), ds = Math.abs(rs - sq), dr = Math.abs(rv - rr);
        if (dq > dr && dq > ds) rq = -rv - rs; else if (dr > ds) rv = -rq - rs;
        cx = r * R3 * (rq + rv / 2); cy = r * 1.5 * rv;
      } else {
        const v = (2 * y) / (R3 * r), u = x / r - v / 2;
        const i = Math.floor(u), j = Math.floor(v);
        const upper = u - i + (v - j) > 1;
        const cu = i + (upper ? 2 / 3 : 1 / 3), cv = j + (upper ? 2 / 3 : 1 / 3);
        cx = (cu + cv / 2) * r; cy = (cv * R3 * r) / 2;
      }
      const sx = clamp(Math.floor(cx), 0, W - 1), sy = clamp(Math.floor(cy), 0, H - 1);
      const si = (sy * W + sx) * 4, oi = (py * W + px) * 4;
      od[oi] = sd[si]; od[oi + 1] = sd[si + 1]; od[oi + 2] = sd[si + 2]; od[oi + 3] = sd[si + 3];
    }
  }
  g.putImageData(out, 0, 0);
  return c;
}

/** Paint: overlapping oriented dabs sampled from a softened copy. */
export function oil(src: Src, cell: number): Src {
  const base = blurCanvas(src, cell * 0.25);
  const c = newCanvas(src.width, src.height);
  const g = c.getContext("2d")!;
  g.drawImage(base, 0, 0);
  const at = sampler(base, cell * 0.6);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const step = cell * 0.5;
  for (let y = 0; y < src.height + step; y += step) {
    for (let x = 0; x < src.width + step; x += step) {
      const px = x + (rnd() - 0.5) * step, py = y + (rnd() - 0.5) * step;
      g.fillStyle = at(px, py);
      g.beginPath();
      g.ellipse(px, py, cell * 0.55, cell * 0.28, rnd() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
  }
  return c;
}

/** Motion / streak blur: averaged offset copies along an angle. */
export function directional(src: Src, len: number, angle: number): Src {
  const c = newCanvas(src.width, src.height);
  const g = c.getContext("2d")!;
  g.drawImage(src, 0, 0);
  const n = 14;
  for (let i = 1; i <= n; i++) {
    const t = (i / n - 0.5) * len;
    g.globalAlpha = 1 / (i + 1);
    g.drawImage(src, Math.cos(angle) * t, Math.sin(angle) * t);
  }
  return c;
}

/** Colour tint: the multiplied colour with 80% of the overlay-blended colour on top. */
export function tint(src: Src, color: string): Src {
  const mul = newCanvas(src.width, src.height);
  const mg = mul.getContext("2d")!;
  mg.drawImage(src, 0, 0);
  mg.globalCompositeOperation = "multiply"; mg.fillStyle = color; mg.fillRect(0, 0, src.width, src.height);
  const ov = newCanvas(src.width, src.height);
  const og = ov.getContext("2d")!;
  og.drawImage(src, 0, 0);
  og.globalCompositeOperation = "overlay"; og.fillStyle = color; og.fillRect(0, 0, src.width, src.height);
  mg.globalCompositeOperation = "source-over"; mg.globalAlpha = 0.8; mg.drawImage(ov, 0, 0);
  return mul;
}

export function mix(a: Src, b: Src, t: number): Src {
  const c = newCanvas(a.width, a.height);
  const g = c.getContext("2d")!;
  g.drawImage(a, 0, 0);
  g.globalAlpha = clamp(t, 0, 1);
  g.drawImage(b, 0, 0, a.width, a.height);
  return c;
}

/* ------------------------------------------------------------------ mosaic catalogue */

export type MosaicType = "MOSAIC_Square" | "MOSAIC_Triangle" | "MOSAIC_Hexagon" | "MOSAIC_OIL" | "MOSAIC_OIL_COLOR" | "BLUR_Gaussian" | "BLUR_Motion" | "BLUR_Horizontal";
export const isBlurType = (t: MosaicType) => t.startsWith("BLUR") || t.startsWith("MOSAIC_OIL");

export function mosaicEffect(src: Src, type: MosaicType, intensity: number, color: string | null, filter: number): Src {
  const m = Math.min(src.width, src.height);
  // cell size: 1% to 5% of the image width with the Block size slider
  const size = lerp(0.01, 0.05, clamp(intensity, 0, 1));
  let s: Src;
  switch (type) {
    case "MOSAIC_Square": s = pixelate(src, Math.max(1, size * src.width)); break;
    case "MOSAIC_Triangle": s = polyMosaic(src, size, "tri"); break;
    case "MOSAIC_Hexagon": s = polyMosaic(src, size * 0.5, "hex"); break;
    case "MOSAIC_OIL": case "MOSAIC_OIL_COLOR": s = oil(src, Math.max(3, m * 0.03)); break;
    case "BLUR_Gaussian": s = blurCanvas(src, m * 0.02); break;
    case "BLUR_Motion": s = directional(src, m * 0.12, Math.PI / 4); break;
    case "BLUR_Horizontal": {
      s = directional(src, m * 0.16, 0);
      if (filter > 0) s = mix(s, filtered(s, "brightness(1.35) saturate(1.2)"), filter);
      break;
    }
  }
  if (color) s = tint(s, color);
  // blur / oil types: Strength mixes the effect with the source
  if (isBlurType(type) && intensity < 1) s = mix(src, s, intensity);
  return s;
}

/* ------------------------------------------------------------------ local inpaint (Remove, standard) */

/**
 * Fill the masked pixels from their surroundings with coarse-to-fine pyramid diffusion (a quick local fill).
 * `mask` is white where pixels must be replaced.
 */
export function inpaint(src: Src, mask: Src): Src {
  const W = src.width, H = src.height;
  const out = newCanvas(W, H);
  const og = out.getContext("2d", { willReadFrequently: true })!;
  og.drawImage(src, 0, 0);
  const img = og.getImageData(0, 0, W, H);
  const mg = newCanvas(W, H).getContext("2d", { willReadFrequently: true })!;
  mg.drawImage(mask, 0, 0, W, H);
  const md = mg.getImageData(0, 0, W, H).data;
  // bounding box of the mask
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (md[(y * W + x) * 4] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return out;
  const pad = Math.ceil(Math.max(x1 - x0, y1 - y0) * 0.6) + 4;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const px = new Float32Array(bw * bh * 3), known = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const i = ((y + y0) * W + x + x0) * 4, j = y * bw + x;
    known[j] = md[i] > 20 ? 0 : 1;
    px[j * 3] = img.data[i]; px[j * 3 + 1] = img.data[i + 1]; px[j * 3 + 2] = img.data[i + 2];
  }
  // pyramid: downsample known pixels, solve coarse, upsample as initial guess, relax at each level
  const solve = (w: number, h: number, p: Float32Array, k: Uint8Array): Float32Array => {
    if (w > 8 && h > 8) {
      const w2 = Math.ceil(w / 2), h2 = Math.ceil(h / 2);
      const p2 = new Float32Array(w2 * h2 * 3), k2 = new Uint8Array(w2 * h2), cnt = new Float32Array(w2 * h2);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const j = y * w + x;
        if (!k[j]) continue;
        const q = (y >> 1) * w2 + (x >> 1);
        p2[q * 3] += p[j * 3]; p2[q * 3 + 1] += p[j * 3 + 1]; p2[q * 3 + 2] += p[j * 3 + 2]; cnt[q]++;
      }
      for (let q = 0; q < w2 * h2; q++) if (cnt[q]) { p2[q * 3] /= cnt[q]; p2[q * 3 + 1] /= cnt[q]; p2[q * 3 + 2] /= cnt[q]; k2[q] = 1; }
      const s2 = solve(w2, h2, p2, k2);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const j = y * w + x;
        if (k[j]) continue;
        const q = (Math.min(h2 - 1, y >> 1)) * w2 + Math.min(w2 - 1, x >> 1);
        p[j * 3] = s2[q * 3]; p[j * 3 + 1] = s2[q * 3 + 1]; p[j * 3 + 2] = s2[q * 3 + 2];
      }
    }
    for (let it = 0; it < 6; it++) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const j = y * w + x;
        if (k[j]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const q = yy * w + xx;
          r += p[q * 3]; g += p[q * 3 + 1]; b += p[q * 3 + 2]; n++;
        }
        if (n) { p[j * 3] = r / n; p[j * 3 + 1] = g / n; p[j * 3 + 2] = b / n; }
      }
    }
    return p;
  };
  const res = solve(bw, bh, px, known);
  // light grain so the fill doesn't look plastic
  let seed = 11;
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const j = y * bw + x;
    if (known[j]) continue;
    const i = ((y + y0) * W + x + x0) * 4;
    seed = (seed * 16807) % 2147483647;
    const n = ((seed / 2147483647) - 0.5) * 6;
    img.data[i] = res[j * 3] + n; img.data[i + 1] = res[j * 3 + 1] + n; img.data[i + 2] = res[j * 3 + 2] + n;
  }
  og.putImageData(img, 0, 0);
  // feather: blend the filled result back through a softened mask
  const soft = newCanvas(W, H);
  const sg = soft.getContext("2d")!;
  sg.filter = "blur(1.5px)"; sg.drawImage(mask, 0, 0, W, H);
  sg.filter = "none"; sg.globalCompositeOperation = "source-in"; sg.drawImage(out, 0, 0);
  const fin = newCanvas(W, H);
  const fg = fin.getContext("2d")!;
  fg.drawImage(src, 0, 0); fg.drawImage(soft, 0, 0);
  return fin;
}

/* ------------------------------------------------------------------ DSLR lens blur (depth-free) */

export interface DslrParams { strength: number; focus: number; depth: number; edges: number; fx: number; fy: number }

/** Strength value (0.01..1) -> f-stop via the piecewise index map (0.01 -> f/22, 0.6 -> f/4, 1 -> f/1.4). */
/** Aperture ruler: 35 f-numbers on a geometric scale from f/22 (no blur) to f/1.4 (strongest blur). */
export const F_STOPS = Array.from({ length: 35 }, (_, i) => Math.round(22 * Math.pow(1.4 / 22, i / 34) * 10) / 10);
export const strengthToIndex = (v: number) => (v <= 0.6 ? ((v - 0.01) / 0.59) * 21 : 21 + ((v - 0.6) / 0.4) * 13);
export const indexToStrength = (i: number) => (i <= 21 ? 0.01 + (i / 21) * 0.59 : 0.6 + ((i - 21) / 13) * 0.4);

/**
 * Radial focus model: the in-focus region is an ellipse around (fx, fy) whose size follows Focus; Depth sets
 * how fast blur ramps up outside it; Blur Edges adds an extra vignette blur. Blur radius follows the f-stop.
 */
export function dslr(src: Src, p: DslrParams): Src {
  const W = src.width, H = src.height, m = Math.min(W, H);
  const fIdx = strengthToIndex(p.strength);
  const maxR = (fIdx / 34) * m * 0.03 + 0.5;
  const levels = [maxR * 0.33, maxR * 0.66, maxR].map((r) => blurCanvas(src, r));
  const out = newCanvas(W, H);
  const g = out.getContext("2d")!;
  g.drawImage(levels[2], 0, 0);
  // focus mask: radial gradient (white = sharp)
  const cx = p.fx * W, cy = p.fy * H;
  const inner = lerp(0.08, 0.6, p.focus) * Math.hypot(W, H) * 0.5;
  const outer = inner + lerp(0.6, 0.05, p.depth) * Math.hypot(W, H) * 0.5;
  const drawLevel = (img: Src, r0: number, r1: number) => {
    const m2 = newCanvas(W, H);
    const mg = m2.getContext("2d")!;
    const grad = mg.createRadialGradient(cx, cy, Math.max(0, r0), cx, cy, Math.max(r0 + 1, r1));
    grad.addColorStop(0, "rgba(255,255,255,1)"); grad.addColorStop(1, "rgba(255,255,255,0)");
    mg.fillStyle = grad; mg.fillRect(0, 0, W, H);
    mg.globalCompositeOperation = "source-in"; mg.drawImage(img, 0, 0);
    g.drawImage(m2, 0, 0);
  };
  drawLevel(levels[1], inner + (outer - inner) * 0.4, outer);
  drawLevel(levels[0], inner + (outer - inner) * 0.15, inner + (outer - inner) * 0.6);
  drawLevel(src, inner, inner + (outer - inner) * 0.3);
  if (p.edges > 0) {
    const e = blurCanvas(src, maxR * 1.6 + m * 0.01 * p.edges);
    const m2 = newCanvas(W, H);
    const mg = m2.getContext("2d")!;
    const rr = Math.hypot(W, H) / 2;
    const grad = mg.createRadialGradient(W / 2, H / 2, rr * lerp(1, 0.35, p.edges), W / 2, H / 2, rr);
    grad.addColorStop(0, "rgba(255,255,255,0)"); grad.addColorStop(1, "rgba(255,255,255,1)");
    mg.fillStyle = grad; mg.fillRect(0, 0, W, H);
    mg.globalCompositeOperation = "source-in"; mg.drawImage(e, 0, 0);
    g.drawImage(m2, 0, 0);
  }
  return out;
}
