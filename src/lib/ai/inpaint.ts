// Remove (inpainting) and AI Expand (outpainting) on MI-GAN.
import { aiCall, type CallOpts } from "./client";
import { canvas, clamp, ctx2d, fromRgba, pixels, resized, rgbaOf, type Src } from "./canvas";

/** Max side of the crop sent to the model (the MI-GAN pipeline itself works at 512 around the hole). */
const MAX_CROP = 1024;

/**
 * Removes the masked area. `hole` is a canvas of any size covering the image (alpha/white > 0 = remove).
 * Crops around the mask bbox (with context), inpaints, and pastes the fill back through a feathered mask.
 */
export async function inpaintCanvas(src: Src, hole: HTMLCanvasElement, opts: CallOpts = {}): Promise<HTMLCanvasElement> {
  const W = src.width, H = src.height;
  // bbox at a reduced resolution
  const probeK = Math.min(1, 1024 / Math.max(W, H));
  const probe = resized(hole, W * probeK, H * probeK);
  const pd = pixels(probe);
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < probe.height; y++) for (let x = 0; x < probe.width; x++) {
    if (pd[(y * probe.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  const out = canvas(W, H);
  ctx2d(out).drawImage(src, 0, 0);
  if (x1 < 0) return out;
  x0 = (x0 - 1) / probeK; y0 = (y0 - 1) / probeK; x1 = (x1 + 2) / probeK; y1 = (y1 + 2) / probeK;
  const bw = x1 - x0, bh = y1 - y0;
  const margin = Math.max(48, 0.6 * Math.max(bw, bh));
  let cx0 = x0 - margin, cy0 = y0 - margin, cx1 = x1 + margin, cy1 = y1 + margin;
  // at least 512 px of context when the photo allows it
  const grow = (a: number, b: number, lim: number): [number, number] => {
    const need = Math.min(lim, 512) - (b - a);
    if (need > 0) { a -= need / 2; b += need / 2; }
    if (a < 0) { b -= a; a = 0; }
    if (b > lim) { a -= b - lim; b = lim; }
    return [Math.max(0, Math.floor(a)), Math.min(lim, Math.ceil(b))];
  };
  [cx0, cx1] = grow(cx0, cx1, W);
  [cy0, cy1] = grow(cy0, cy1, H);
  const cw = cx1 - cx0, ch = cy1 - cy0;
  const k = Math.min(1, MAX_CROP / Math.max(cw, ch));
  const tw = Math.max(8, Math.round(cw * k)), th = Math.max(8, Math.round(ch * k));
  const crop = resized(src, tw, th, cx0, cy0, cw, ch);
  // model mask: slightly dilated hole -> 0, known -> 255
  const mk = canvas(tw, th);
  const mg = ctx2d(mk);
  mg.filter = "blur(1.5px)";
  mg.drawImage(hole, cx0 * (hole.width / W), cy0 * (hole.height / H), cw * (hole.width / W), ch * (hole.height / H), 0, 0, tw, th);
  const md = pixels(mk);
  const mask = new Uint8Array(tw * th);
  for (let i = 0; i < mask.length; i++) mask[i] = md[i * 4 + 3] > 4 ? 0 : 255;
  const r = await aiCall({ op: "inpaint", rgba: rgbaOf(crop), w: tw, h: th, mask }, [], opts);
  const fill = fromRgba(r.rgba!, r.w!, r.h!);
  // feathered paste: dilated + blurred hole mask, source-in the fill
  const feather = Math.max(1.5, 3 / k);
  const layer = canvas(cw, ch);
  const lg = ctx2d(layer);
  lg.filter = `blur(${feather}px)`;
  lg.drawImage(hole, cx0 * (hole.width / W), cy0 * (hole.height / H), cw * (hole.width / W), ch * (hole.height / H), 0, 0, cw, ch);
  lg.drawImage(layer, 0, 0); // a second pass widens the opaque core so the hole is fully covered
  lg.filter = "none";
  lg.globalCompositeOperation = "source-in";
  lg.imageSmoothingQuality = "high";
  lg.drawImage(fill, 0, 0, cw, ch);
  ctx2d(out).drawImage(layer, cx0, cy0);
  return out;
}

export interface Extension { l: number; t: number; r: number; b: number }

/**
 * AI Expand: pads the canvas by `ext` (fractions of the image size per side) and fills the new area with
 * MI-GAN in overlapping 512 px tiles, starting with the tiles that have the most known context
 * (next to the photo) and moving outward. Returns the expanded image (long side capped at `maxSide`).
 */
export async function outpaintCanvas(src: Src, ext: Extension, opts: CallOpts & { maxSide?: number } = {}): Promise<HTMLCanvasElement> {
  const W = src.width, H = src.height;
  const FW = W * (1 + ext.l + ext.r), FH = H * (1 + ext.t + ext.b);
  const cap = Math.min(1, (opts.maxSide ?? 4096) / Math.max(FW, FH));
  // working resolution: 512 px tiles over a canvas whose long side is <= 1280
  const ws = Math.min(cap, 1280 / Math.max(FW, FH));
  const WW = Math.max(16, Math.round(FW * ws)), WH = Math.max(16, Math.round(FH * ws));
  const ix = Math.round(ext.l * W * ws), iy = Math.round(ext.t * H * ws);
  const iw = Math.min(WW - ix, Math.round(W * ws)), ih = Math.min(WH - iy, Math.round(H * ws));
  const work = canvas(WW, WH);
  const wg = ctx2d(work);
  wg.imageSmoothingQuality = "high";
  // seed the new area with stretched edges (the model ignores hole pixels, this only helps the seams)
  wg.drawImage(src, 0, 0, W, H, 0, 0, WW, WH);
  wg.filter = "blur(24px)"; wg.drawImage(work, 0, 0); wg.filter = "none";
  wg.drawImage(src, ix, iy, iw, ih);
  const known = new Uint8Array(WW * WH);
  // 1 px inset: the resampled photo border is not trusted
  for (let y = iy + 1; y < iy + ih - 1; y++) known.fill(1, y * WW + ix + 1, y * WW + ix + iw - 1);
  let unknown = WW * WH - known.reduce((a, b) => a + b, 0);
  const total = Math.max(1, unknown);
  const T = Math.min(512, WW, WH), TW = Math.min(512, WW), TH = Math.min(512, WH);
  const stride = Math.round(T * 0.66);
  const grid = (len: number, t: number) => {
    const v: number[] = [];
    for (let p = 0; p + t < len; p += stride) v.push(p);
    v.push(len - t);
    return [...new Set(v)];
  };
  const tiles = grid(WH, TH).flatMap((y) => grid(WW, TW).map((x) => ({ x, y })));
  // MI-GAN is weaker near a tile's border, so a tile only writes its inner region (except on canvas edges)
  const M = 24;
  const inner = (t: { x: number; y: number }) => ({
    x0: t.x === 0 ? 0 : M, y0: t.y === 0 ? 0 : M,
    x1: t.x + TW >= WW ? TW : TW - M, y1: t.y + TH >= WH ? TH : TH - M,
  });
  const stat = (t: { x: number; y: number }) => {
    let k = 0, open = 0;
    const r = inner(t);
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
      const v = known[(t.y + y) * WW + t.x + x];
      k += v;
      if (!v && x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1) open++;
    }
    return { k, open };
  };
  while (unknown > 0) {
    let best: { x: number; y: number } | null = null, bestK = -1;
    for (const t of tiles) {
      const { k, open } = stat(t);
      if (!open || k === 0) continue;
      if (k > bestK) { bestK = k; best = t; }
    }
    if (!best) break;
    const tile = canvas(TW, TH);
    ctx2d(tile).drawImage(work, best.x, best.y, TW, TH, 0, 0, TW, TH);
    const mask = new Uint8Array(TW * TH);
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) mask[y * TW + x] = known[(best.y + y) * WW + best.x + x] ? 255 : 0;
    const r = await aiCall({ op: "inpaint", rgba: rgbaOf(tile), w: TW, h: TH, mask }, [], {
      signal: opts.signal,
      onProgress: (s, v) => { if (s === "download") opts.onProgress?.("download", v); },
    });
    // write back only the newly filled pixels
    const cur = wg.getImageData(best.x, best.y, TW, TH);
    const res = r.rgba!;
    const ir = inner(best);
    for (let y = ir.y0; y < ir.y1; y++) for (let x = ir.x0; x < ir.x1; x++) {
      const gi = (best.y + y) * WW + best.x + x;
      if (known[gi]) continue;
      const i = (y * TW + x) * 4;
      cur.data[i] = res[i]; cur.data[i + 1] = res[i + 1]; cur.data[i + 2] = res[i + 2]; cur.data[i + 3] = 255;
      known[gi] = 1; unknown--;
    }
    wg.putImageData(cur, best.x, best.y);
    opts.onProgress?.("run", clamp(1 - unknown / total, 0, 1));
  }
  // full-resolution result: upscaled fill + the untouched photo on top
  const out = canvas(FW * cap, FH * cap);
  const og = ctx2d(out);
  og.imageSmoothingQuality = "high";
  og.drawImage(work, 0, 0, out.width, out.height);
  const px = (ix / WW) * out.width, py = (iy / WH) * out.height, pw = (iw / WW) * out.width, ph = (ih / WH) * out.height;
  // soft 2-step edge so the resampled fill and the sharp photo meet without a visible line
  const edge = Math.max(2, Math.round(Math.min(pw, ph) * 0.004));
  const photo = canvas(pw, ph);
  const pg = ctx2d(photo);
  pg.fillStyle = "#fff";
  pg.filter = `blur(${edge / 2}px)`;
  pg.fillRect(edge, edge, photo.width - edge * 2, photo.height - edge * 2);
  pg.filter = "none";
  pg.globalCompositeOperation = "source-in";
  pg.imageSmoothingQuality = "high";
  pg.drawImage(src, 0, 0, photo.width, photo.height);
  og.drawImage(photo, px, py);
  return out;
}
