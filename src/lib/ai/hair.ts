// Hair color: MediaPipe selfie_multiclass hair mask (via the face engine), edge-refined with a guided filter, plus a
// luminance-preserving recolor and a texture (detail) pass.
import { canvas, clamp, ctx2d, type Src } from "./canvas";
import { guided } from "./depth";

/** Hair alpha (0..1) at `src` size, refined so strands follow the photo's edges. */
export function refineMask(src: Src, mask: HTMLCanvasElement, edits?: HTMLCanvasElement | null): Float32Array {
  const W = src.width, H = src.height;
  const m = canvas(W, H);
  const mg = ctx2d(m);
  mg.imageSmoothingQuality = "high";
  mg.drawImage(mask, 0, 0, W, H);
  const md = mg.getImageData(0, 0, W, H).data;
  const sd = ctx2d(src).getImageData(0, 0, W, H).data;
  const n = W * H;
  const I = new Float32Array(n), p = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    I[i] = (sd[i * 4] * 0.299 + sd[i * 4 + 1] * 0.587 + sd[i * 4 + 2] * 0.114) / 255;
    p[i] = md[i * 4 + 3] / 255;
  }
  const q = guided(I, p, W, H, Math.max(2, Math.round(Math.max(W, H) / 200)), 4e-3);
  for (let i = 0; i < n; i++) q[i] = clamp((q[i] - 0.15) / 0.7, 0, 1);
  if (edits) {
    // Correction strokes: red channel = brush (add), green = eraser (remove)
    const ed = (() => { const c = canvas(W, H); const g = ctx2d(c); g.drawImage(edits, 0, 0, W, H); return g.getImageData(0, 0, W, H).data; })();
    for (let i = 0; i < n; i++) {
      const a = ed[i * 4 + 3] / 255;
      if (!a) continue;
      if (ed[i * 4] > ed[i * 4 + 1]) q[i] = Math.max(q[i], a); else q[i] = Math.min(q[i], 1 - a);
    }
  }
  return q;
}

const hex = (h: string) => { const n = parseInt(h.replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

/**
 * Recolor: keeps each pixel's relative luminance (strand texture / shine), shifts the hair's mean lightness
 * toward the target colour's and tints with its chroma. `strength` 0..1, `texture` 0..1 adds strand detail.
 */
export function recolorHair(src: Src, alpha: Float32Array, color: string | null, strength: number, texture: number): HTMLCanvasElement {
  const W = src.width, H = src.height, n = W * H;
  const out = canvas(W, H);
  const g = ctx2d(out);
  g.drawImage(src, 0, 0);
  if ((!color || strength <= 0) && texture <= 0) return out;
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  let sum = 0, wsum = 0;
  for (let i = 0; i < n; i++) { const a = alpha[i]; if (a > 0.5) { sum += (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) * a; wsum += a; } }
  const mean = wsum > 0 ? sum / wsum / 255 : 0.3;
  const [tr, tg, tb] = color ? hex(color) : [0, 0, 0];
  const tl = (tr * 0.299 + tg * 0.587 + tb * 0.114) / 255;
  // texture: high-pass of luminance (3x3 box) on the hair
  let hp: Float32Array | null = null;
  if (texture > 0) {
    hp = new Float32Array(n);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      let s = 0;
      for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) { const j = (i + yy * W + xx) * 4; s += d[j] * 0.299 + d[j + 1] * 0.587 + d[j + 2] * 0.114; }
      const c = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
      hp[i] = c - s / 9;
    }
  }
  for (let i = 0; i < n; i++) {
    const a = alpha[i];
    if (a <= 0.003) continue;
    const q = i * 4;
    let r = d[q], gg = d[q + 1], b = d[q + 2];
    if (color && strength > 0) {
      const l = (r * 0.299 + gg * 0.587 + b * 0.114) / 255;
      // lightness: relative to the hair mean, re-centred on the target's lightness (lifting dark hair)
      const nl = clamp(tl * 0.85 + (l - mean) * (0.9 + tl * 0.8) + 0.04, 0, 1);
      const k = nl / Math.max(0.04, tl);
      const cr = clamp(tr * k, 0, 255), cg = clamp(tg * k, 0, 255), cb = clamp(tb * k, 0, 255);
      // toward white for highlights that overflow the chroma
      const over = Math.max(0, nl - tl) * 0.6;
      const t = a * strength;
      r += (cr + (255 - cr) * over - r) * t; gg += (cg + (255 - cg) * over - gg) * t; b += (cb + (255 - cb) * over - b) * t;
    }
    if (hp) { const e = hp[i] * texture * 1.6 * a; r += e; gg += e; b += e; }
    d[q] = r; d[q + 1] = gg; d[q + 2] = b;
  }
  g.putImageData(img, 0, 0);
  return out;
}

/** Built-in hair colour catalogue (id, label, swatch colour, default strength). */
export const HAIR_COLORS: { id: string; label: string; color: string; def: number }[] = [
  { id: "black", label: "Black", color: "#1C1A1A", def: 0.7 },
  { id: "darkbrown", label: "Choco", color: "#4A2C20", def: 0.7 },
  { id: "brown", label: "Brown", color: "#7A4A2E", def: 0.7 },
  { id: "ash", label: "Ash", color: "#8C8A86", def: 0.7 },
  { id: "khaki", label: "Khaki", color: "#8A7A52", def: 0.7 },
  { id: "blonde", label: "Blonde", color: "#D8B47A", def: 0.7 },
  { id: "milktea", label: "Milk tea", color: "#B89478", def: 0.7 },
  { id: "orange", label: "Orange", color: "#C8642C", def: 0.7 },
  { id: "red", label: "Red", color: "#A8283A", def: 0.7 },
  { id: "wine", label: "Wine", color: "#6A1E34", def: 0.7 },
  { id: "pink", label: "Pink", color: "#E08EA5", def: 0.7 },
  { id: "purple", label: "Purple", color: "#7A5AA8", def: 0.7 },
  { id: "blue", label: "Blue", color: "#385798", def: 0.7 },
  { id: "mint", label: "Mint", color: "#6FB8A4", def: 0.7 },
  { id: "silver", label: "Silver", color: "#C9CBD0", def: 0.7 },
];
