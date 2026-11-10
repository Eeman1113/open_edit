// On-device hair edits for the AI Hair page, built on the hair mask (src/lib/ai: refineMask / recolorHair):
// - highlights: thin colour streaks that follow the hair downward (a smooth 1D noise across the hair, gently waved)
// - ombre: colour that fades in from the mid-lengths to the ends (by height inside the hair's bounding box)
// - smoothing: a strand-direction (mostly vertical) blur blended in on the hair, separately for the fringe (hair over
//   the forehead) and the lengths (hair below the eyes and beside the face)
// Every function works on canvases of any size, so the preview and the full-size bake match.

type Src = HTMLCanvasElement;

const sst = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash1 = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
/** Smooth value noise along one axis. */
const noise1 = (x: number) => { const i = Math.floor(x), f = x - i; const u = f * f * (3 - 2 * f); return hash1(i) * (1 - u) + hash1(i + 1) * u; };

export interface FaceBoxN { x: number; y: number; w: number; h: number }

/** Rows that hold hair: top and bottom (0..1 of the height) of the pixels with alpha > 0.5. */
function hairRows(alpha: Float32Array, W: number, H: number): [number, number] | null {
  let top = -1, bottom = -1;
  for (let y = 0; y < H; y++) {
    let on = false;
    for (let x = 0; x < W; x += 2) if (alpha[y * W + x] > 0.5) { on = true; break; }
    if (on) { if (top < 0) top = y; bottom = y; }
  }
  return top < 0 ? null : [top / H, (bottom + 1) / H];
}

/** Hair alpha limited to highlight streaks. `density` 0..1 (thin and sparse .. wide and many). */
export function streakAlpha(alpha: Float32Array, W: number, H: number, density = 0.5): Float32Array {
  const out = new Float32Array(alpha.length);
  const rows = hairRows(alpha, W, H);
  if (!rows) return out;
  const [top, bottom] = rows, hh = Math.max(1e-3, bottom - top);
  const aspect = W / H;
  const strands = 55; // across the short side
  const lo = 0.62 - density * 0.18;
  for (let y = 0; y < H; y++) {
    const v = y / H;
    const root = sst(top, top + hh * 0.12, v);
    if (root <= 0) continue;
    for (let x = 0; x < W; x++) {
      const i = y * W + x, a = alpha[i];
      if (a <= 0.003) continue;
      const u = (x / W) * Math.min(1, aspect);
      const s = (u + 0.012 * Math.sin(v * 16 + u * 5)) * strands;
      const n = noise1(s) * 0.6 + noise1(s * 0.35 + 17.3) * 0.4;
      out[i] = a * root * sst(lo, lo + 0.14, n);
    }
  }
  return out;
}

/** Hair alpha ramped from the mid-lengths (none) to the ends (full). `start` 0..1 moves where the fade begins. */
export function ombreAlpha(alpha: Float32Array, W: number, H: number, start = 0.35): Float32Array {
  const out = new Float32Array(alpha.length);
  const rows = hairRows(alpha, W, H);
  if (!rows) return out;
  const [top, bottom] = rows, hh = Math.max(1e-3, bottom - top);
  for (let y = 0; y < H; y++) {
    const t = sst(top + hh * start, top + hh * 0.98, y / H);
    if (t <= 0) continue;
    for (let x = 0; x < W; x++) { const i = y * W + x; out[i] = alpha[i] * t; }
  }
  return out;
}

/** Blur along the strands: several vertical offsets averaged, then a light all-round blur. */
function strandBlur(src: Src): Src {
  const W = src.width, H = src.height;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  const step = Math.max(1, Math.round(Math.min(W, H) * 0.0035));
  const taps = [0, -1, 1, -2, 2, -3, 3, -4, 4];
  taps.forEach((k, n) => { g.globalAlpha = 1 / (n + 1); g.drawImage(src, 0, k * step); });
  g.globalAlpha = 1;
  const out = document.createElement("canvas");
  out.width = W; out.height = H;
  const og = out.getContext("2d")!;
  og.filter = `blur(${Math.max(0.5, Math.min(W, H) * 0.0015)}px)`;
  og.drawImage(c, 0, 0);
  return out;
}

/**
 * Smooths frizz and flyaway texture on the hair. `fringe` acts on hair over the forehead, `lengths` on hair below
 * the eyes and beside the face (everything when no face was found). Both 0..1.
 */
export function smoothHair(src: Src, alpha: Float32Array, faces: FaceBoxN[], fringe: number, lengths: number): Src {
  const W = src.width, H = src.height;
  const out = document.createElement("canvas");
  out.width = W; out.height = H;
  const g = out.getContext("2d")!;
  g.drawImage(src, 0, 0);
  if (fringe <= 0.001 && lengths <= 0.001) return out;
  const bl = strandBlur(src).getContext("2d")!.getImageData(0, 0, W, H).data;
  const img = g.getImageData(0, 0, W, H), d = img.data;
  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const i = y * W + x, a = alpha[i];
      if (a <= 0.003) continue;
      const u = x / W;
      let fw = 0, below = faces.length ? 0 : 1;
      for (const f of faces) {
        // fringe: from just above the face box down to the brows, across the face width
        const inX = sst(f.x - f.w * 0.15, f.x + f.w * 0.05, u) * sst(f.x + f.w * 1.15, f.x + f.w * 0.95, u);
        const inY = sst(f.y - f.h * 0.4, f.y - f.h * 0.15, v) * sst(f.y + f.h * 0.42, f.y + f.h * 0.3, v);
        fw = Math.max(fw, inX * inY);
        // lengths: below the eye line, or beside the face
        const side = Math.min(1, Math.abs(u - (f.x + f.w / 2)) / (f.w * 0.5));
        below = Math.max(below, sst(f.y + f.h * 0.35, f.y + f.h * 0.6, v), sst(1.05, 1.35, side));
      }
      const k = Math.min(1, a * (fringe * fw + lengths * below * (1 - fw))) * 0.9;
      if (k <= 0.002) continue;
      const q = i * 4;
      d[q] += (bl[q] - d[q]) * k; d[q + 1] += (bl[q + 1] - d[q + 1]) * k; d[q + 2] += (bl[q + 2] - d[q + 2]) * k;
    }
  }
  g.putImageData(img, 0, 0);
  return out;
}
