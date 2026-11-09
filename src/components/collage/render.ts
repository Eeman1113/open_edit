// Collage geometry + 2D rendering (stands in for the Kuru "collage" engine driven by CollageController).
// The same draw() renders the on-screen preview and the full-resolution JPEG that is saved.
import { PACKS, templatesFor, type Rect, type Sel } from "./layouts";

export interface Pic { img: CanvasImageSource; w: number; h: number }

/** Per-cell image transform. tx/ty are fractions of the cell size; rot90 = Right 90° steps; ang = free rotation (deg). */
export interface Xf { s: number; tx: number; ty: number; rot90: number; ang: number; fh: boolean; fv: boolean }
export const XF0: Xf = { s: 1, tx: 0, ty: 0, rot90: 0, ang: 0, fh: false, fv: false };

export interface Scene {
  sel: Sel;
  pics: Pic[]; // photo per cell (already in cell order)
  xf: Xf[];
  border: number; // 0..1 (EditSeekBar max 1)
  color: string; // border/background colour
}

/** Border thickness at border = 1, as a fraction of the canvas' short side. */
const MAX_BORDER = 0.05;

const rotated = (p: Pic, x: Xf) => (x.rot90 % 2 ? { w: p.h, h: p.w } : { w: p.w, h: p.h });

/** Canvas aspect (W / H). Layout = pack ratio; sequences = photos laid side by side (Width) or stacked (Height). */
export function aspectOf(sc: Scene): number {
  const { sel } = sc;
  if (sel.kind === "layout") {
    const p = PACKS.find((k) => k.id === sel.pack) ?? PACKS[0];
    return p.rx / p.ry;
  }
  if (sel.kind === "width" || sel.kind === "height") {
    const as = sc.pics.map((p, i) => { const r = rotated(p, sc.xf[i] ?? XF0); return r.w / r.h; });
    if (sel.kind === "width") {
      const sum = as.reduce((a, b) => a + b, 0); // content height 1
      const g = sc.border * MAX_BORDER * Math.min(sum, 1);
      return (sum + (as.length + 1) * g) / (1 + 2 * g);
    }
    const sum = as.reduce((a, b) => a + 1 / b, 0); // content width 1
    const g = sc.border * MAX_BORDER * Math.min(sum, 1);
    return (1 + 2 * g) / (sum + (as.length + 1) * g);
  }
  return 1;
}

/** Cell rectangles in canvas pixels. Outer margin and inner gaps are both g. */
export function cellsOf(sc: Scene, W: number, H: number): Rect[] {
  const g = sc.border * MAX_BORDER * Math.min(W, H);
  const { sel } = sc;
  if (sel.kind === "width" || sel.kind === "height") {
    const n = sc.pics.length;
    const out: Rect[] = [];
    if (sel.kind === "width") {
      const h = H - 2 * g;
      let x = g;
      for (let i = 0; i < n; i++) {
        const r = rotated(sc.pics[i], sc.xf[i] ?? XF0);
        const w = i === n - 1 ? W - g - x : (h * r.w) / r.h;
        out.push([x, g, w, h]);
        x += w + g;
      }
    } else {
      const w = W - 2 * g;
      let y = g;
      for (let i = 0; i < n; i++) {
        const r = rotated(sc.pics[i], sc.xf[i] ?? XF0);
        const h = i === n - 1 ? H - g - y : (w * r.h) / r.w;
        out.push([g, y, w, h]);
        y += h + g;
      }
    }
    return out;
  }
  if (sel.kind !== "layout") return [];
  const t = templatesFor(sc.pics.length)[sel.index] ?? [];
  const e = 1e-3;
  return t.map(([x, y, w, h]) => {
    const l = x < e ? g : g / 2;
    const tp = y < e ? g : g / 2;
    const r = x + w > 1 - e ? g : g / 2;
    const b = y + h > 1 - e ? g : g / 2;
    return [x * W + l, y * H + tp, w * W - l - r, h * H - tp - b] as Rect;
  });
}

/** Cover scale of a photo in a cell (before the user zoom). */
export function coverScale(p: Pic, x: Xf, cw: number, ch: number) {
  const r = rotated(p, x);
  return Math.max(cw / r.w, ch / r.h);
}

export function drawCell(ctx: CanvasRenderingContext2D, p: Pic, x: Xf, [cx, cy, cw, ch]: Rect) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx, cy, cw, ch);
  ctx.clip();
  ctx.translate(cx + cw / 2 + x.tx * cw, cy + ch / 2 + x.ty * ch);
  ctx.scale(x.fh ? -1 : 1, x.fv ? -1 : 1);
  ctx.rotate(((x.rot90 * 90 + x.ang) * Math.PI) / 180);
  const s = coverScale(p, x, cw, ch) * x.s;
  ctx.scale(s, s);
  ctx.drawImage(p.img, -p.w / 2, -p.h / 2, p.w, p.h);
  ctx.restore();
}

export function draw(ctx: CanvasRenderingContext2D, sc: Scene, W: number, H: number, opts?: { selected?: number | null; highlight?: string; lineWidth?: number; skip?: number | null }) {
  ctx.save();
  ctx.fillStyle = sc.color;
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const cells = cellsOf(sc, W, H);
  cells.forEach((r, i) => {
    if (opts?.skip === i) return;
    const p = sc.pics[i];
    if (p) drawCell(ctx, p, sc.xf[i] ?? XF0, r);
  });
  if (opts?.selected != null && cells[opts.selected]) {
    const [x, y, w, h] = cells[opts.selected];
    const lw = opts.lineWidth ?? 2;
    ctx.strokeStyle = opts.highlight ?? "#0bd4d2";
    ctx.lineWidth = lw;
    ctx.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw);
  }
  ctx.restore();
  return cells;
}

/** Output size for the saved JPEG: keep every photo at (up to) its own resolution, long side capped at 4096. */
export function exportSize(sc: Scene): { W: number; H: number } {
  const a = aspectOf(sc);
  // try a unit canvas, then scale so the most demanding cell shows its photo 1:1
  const W0 = 1000, H0 = W0 / a;
  const cells = cellsOf(sc, W0, H0);
  let k = 1;
  cells.forEach((c, i) => {
    const p = sc.pics[i];
    if (!p) return;
    const need = 1 / (coverScale(p, sc.xf[i] ?? XF0, c[2], c[3]) * (sc.xf[i]?.s ?? 1));
    k = Math.max(k, need);
  });
  let W = W0 * k, H = H0 * k;
  const cap = 4096 / Math.max(W, H);
  if (cap < 1) { W *= cap; H *= cap; }
  return { W: Math.max(1, Math.round(W)), H: Math.max(1, Math.round(H)) };
}

export async function renderJpeg(sc: Scene): Promise<{ blob: Blob; W: number; H: number }> {
  const { W, H } = exportSize(sc);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  draw(c.getContext("2d")!, sc, W, H);
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.95));
  if (!blob) throw new Error("encode");
  return { blob, W, H };
}

export function hitCell(cells: Rect[], x: number, y: number) {
  return cells.findIndex(([cx, cy, cw, ch]) => x >= cx && x <= cx + cw && y >= cy && y <= cy + ch);
}
