// Enhance and HD Skin on Real-ESRGAN (realesr-general-x4v3) + local detail / skin passes.
import { aiCall, warm, type CallOpts } from "./client";
import { canvas, clamp, ctx2d, fromRgba, resized, rgbaOf, type Src } from "./canvas";

export type BgMode = "none" | "natural" | "detail" | "soft";
export type FaceMode = "sharp" | "natural" | "clear" | "soft";
/** Face box in source-normalized coords. */
export interface FaceBox { x: number; y: number; w: number; h: number }

const MAX_OUT = 4096;

/** Runs Real-ESRGAN x4 (tiled in the worker) on `src` downscaled to fit `maxIn`. */
export async function superRes(src: Src, maxIn: number, opts: CallOpts = {}, outScale: 1 | 2 | 4 = 4) {
  const k = Math.min(1, maxIn / Math.max(src.width, src.height));
  const inp = k < 1 ? resized(src, src.width * k, src.height * k) : src;
  const r = await aiCall({ op: "upscale", rgba: rgbaOf(inp), w: inp.width, h: inp.height, outScale }, [], opts);
  return { canvas: fromRgba(r.rgba!, r.w!, r.h!), ep: r.ep, ms: r.ms };
}

function blurred(src: Src, px: number) {
  const c = canvas(src.width, src.height);
  const g = ctx2d(c);
  g.filter = `blur(${px}px)`;
  g.drawImage(src, 0, 0);
  return c;
}

/** out = base + amount * (detail - blur(detail, px)); `detail` is resampled to base size. */
function addDetail(base: Src, detail: Src, amount: number, px: number) {
  const d = detail.width === base.width && detail.height === base.height ? detail : resized(detail, base.width, base.height);
  const b = blurred(d, px);
  const g = ctx2d(base);
  const o = g.getImageData(0, 0, base.width, base.height);
  const dd = ctx2d(d).getImageData(0, 0, d.width, d.height).data;
  const bd = ctx2d(b).getImageData(0, 0, b.width, b.height).data;
  const od = o.data;
  for (let i = 0; i < od.length; i += 4) {
    od[i] += amount * (dd[i] - bd[i]);
    od[i + 1] += amount * (dd[i + 1] - bd[i + 1]);
    od[i + 2] += amount * (dd[i + 2] - bd[i + 2]);
  }
  g.putImageData(o, 0, 0);
  return base;
}

function mixWith(base: Src, other: Src, t: number) {
  const g = ctx2d(base);
  g.globalAlpha = t; g.drawImage(other, 0, 0, base.width, base.height); g.globalAlpha = 1;
  return base;
}

/** Light local-contrast boost (clarity): large-radius unsharp at low strength. */
function clarity(c: Src, amount: number) {
  return addDetail(c, resized(c, c.width, c.height), amount, Math.max(4, c.width / 60));
}

function styleFace(c: Src, mode: FaceMode) {
  if (mode === "sharp") return addDetail(c, resized(c, c.width, c.height), 0.9, Math.max(1, c.width / 400));
  if (mode === "clear") return clarity(addDetail(c, resized(c, c.width, c.height), 0.4, Math.max(1, c.width / 400)), 0.35);
  if (mode === "soft") return mixWith(c, blurred(c, Math.max(1, c.width / 300)), 0.45);
  return c;
}

function ellipseMask(w: number, h: number, feather: number) {
  const m = canvas(w, h);
  const g = ctx2d(m);
  g.filter = `blur(${feather}px)`;
  g.fillStyle = "#fff";
  g.beginPath();
  g.ellipse(w / 2, h / 2, Math.max(1, w / 2 - feather * 1.5), Math.max(1, h / 2 - feather * 1.5), 0, 0, Math.PI * 2);
  g.fill();
  g.filter = "none"; // callers composite source-in on this context
  return m;
}

/** Square crop rect (source px) around a face box, enlarged by `k`. */
function faceRect(f: FaceBox, W: number, H: number, k = 1.7) {
  const cx = (f.x + f.w / 2) * W, cy = (f.y + f.h / 2) * H;
  const s = Math.min(Math.max(f.w * W, f.h * H) * k, W, H);
  const x = clamp(cx - s / 2, 0, W - s), y = clamp(cy - s / 2, 0, H - s);
  return { x: Math.round(x), y: Math.round(y), s: Math.round(s) };
}

/**
 * Enhance: a background style (natural / detail / soft) on the whole photo and a portrait style (Sharp / Natural /
 * Clear / Soft) on each face crop. Output long side = max(source, x4 result), capped at 4096.
 */
export async function enhanceCanvas(src: Src, bg: BgMode, faces: FaceBox[], face: FaceMode | null, opts: CallOpts = {}) {
  const t0 = performance.now();
  const dl = (s: "download" | "run", v: number) => { if (s === "download") opts.onProgress?.("download", v); };
  const ep = await warm("esrgan", { ...opts, onProgress: dl });
  const W = src.width, H = src.height;
  const maxIn = ep === "webgpu" ? 1024 : 512;
  const faceIn = ep === "webgpu" ? 384 : 256;
  const jobs = (bg !== "none" ? 1 : 0) + (face ? faces.length : 0);
  let done = 0;
  const step = (s: "download" | "run", v: number) => { if (s === "run") opts.onProgress?.("run", (done + v) / Math.max(1, jobs)); };
  const sc = Math.min(MAX_OUT / Math.max(W, H), Math.max(1, (Math.min(1, maxIn / Math.max(W, H)) * 4)));
  const OW = Math.round(W * sc), OH = Math.round(H * sc);
  let out: HTMLCanvasElement;
  if (bg !== "none") {
    const r = await superRes(src, maxIn, { signal: opts.signal, onProgress: step });
    done++;
    out = resized(r.canvas, OW, OH);
    // the x4 result is computed from a downscaled copy: add back the photo's own fine detail
    const back = bg === "natural" ? 0.55 : bg === "detail" ? 0.9 : 0.2;
    if (Math.max(W, H) > maxIn) addDetail(out, src, back, Math.max(1, OW / 1200));
    if (bg === "detail") addDetail(out, resized(out, OW, OH), 0.5, Math.max(1, OW / 900));
    if (bg === "soft") mixWith(out, blurred(out, Math.max(1, OW / 1400)), 0.35);
  } else {
    out = resized(src, OW, OH);
  }
  if (face) {
    for (const f of faces) {
      const r = faceRect(f, W, H);
      if (r.s < 16) { done++; continue; }
      const crop = resized(src, Math.min(faceIn, r.s), Math.min(faceIn, r.s), r.x, r.y, r.s, r.s);
      const up = await superRes(crop, faceIn, { signal: opts.signal, onProgress: step });
      done++;
      const ds = r.s * sc;
      const fc = resized(up.canvas, ds, ds);
      if (r.s * sc > faceIn * 4) addDetail(fc, resized(src, ds, ds, r.x, r.y, r.s, r.s), 0.35, Math.max(1, ds / 500));
      styleFace(fc, face);
      const m = ellipseMask(fc.width, fc.height, fc.width * 0.06);
      const mg = ctx2d(m);
      mg.globalCompositeOperation = "source-in";
      mg.drawImage(fc, 0, 0);
      ctx2d(out).drawImage(m, r.x * sc, r.y * sc);
    }
  }
  return { canvas: out, ep, ms: performance.now() - t0 };
}

/* ------------------------------------------------------------------ HD Skin */

/** Self-guided filter (He et al.) on one RGBA buffer: edge-preserving smoothing used for skin. */
function guidedSmooth(img: ImageData, r: number, eps: number) {
  const { width: w, height: h, data } = img;
  const n = w * h;
  const box = (src: Float32Array) => {
    // separable box filter with clamped edges via running sums
    const tmp = new Float32Array(n), out = new Float32Array(n);
    for (let y = 0; y < h; y++) {
      let s = 0;
      const row = y * w;
      for (let x = -r; x <= r; x++) s += src[row + clamp(x, 0, w - 1)];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = s / (2 * r + 1);
        s += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += tmp[clamp(y, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = s / (2 * r + 1);
        s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
    return out;
  };
  const res = new ImageData(w, h);
  for (let c = 0; c < 3; c++) {
    const I = new Float32Array(n), I2 = new Float32Array(n);
    for (let i = 0; i < n; i++) { const v = data[i * 4 + c] / 255; I[i] = v; I2[i] = v * v; }
    const mI = box(I), mI2 = box(I2);
    const a = new Float32Array(n), b = new Float32Array(n);
    for (let i = 0; i < n; i++) { const v = mI2[i] - mI[i] * mI[i]; a[i] = v / (v + eps); b[i] = mI[i] - a[i] * mI[i]; }
    const ma = box(a), mb = box(b);
    for (let i = 0; i < n; i++) res.data[i * 4 + c] = (ma[i] * I[i] + mb[i]) * 255;
  }
  for (let i = 0; i < n; i++) res.data[i * 4 + 3] = 255;
  return res;
}

/** Face-skin mask (any size, white/alpha = skin) or null. */
export interface SkinMask { canvas: HTMLCanvasElement }

/**
 * HD Skin: per face, Real-ESRGAN detail restoration of the face crop, then edge-preserving skin smoothing on the
 * face-skin mask with a little original texture kept. Returns a full-size result the slider blends over the photo.
 */
export async function hdSkinCanvas(src: Src, faces: FaceBox[], skin: HTMLCanvasElement | null, opts: CallOpts = {}) {
  const t0 = performance.now();
  const dl = (s: "download" | "run", v: number) => { if (s === "download") opts.onProgress?.("download", v); };
  const ep = await warm("esrgan", { ...opts, onProgress: dl });
  const W = src.width, H = src.height;
  const faceIn = ep === "webgpu" ? 384 : 256;
  const out = canvas(W, H);
  ctx2d(out).drawImage(src, 0, 0);
  const boxes = faces.length ? faces : [{ x: 0, y: 0, w: 1, h: 1 }];
  let done = 0;
  for (const f of boxes) {
    const r = faces.length ? faceRect(f, W, H, 1.5) : { x: 0, y: 0, s: Math.min(W, H) };
    const rw = faces.length ? r.s : W, rh = faces.length ? r.s : H;
    if (rw < 16) continue;
    const k = Math.min(1, faceIn / Math.max(rw, rh));
    const crop = resized(src, rw * k, rh * k, r.x, r.y, rw, rh);
    const up = await superRes(crop, faceIn, {
      signal: opts.signal,
      onProgress: (s, v) => { if (s === "run") opts.onProgress?.("run", (done + v * 0.8) / boxes.length); },
    });
    // working size for smoothing: at most 1024 px
    const ws = Math.min(1, 1024 / Math.max(rw, rh));
    const cw = Math.round(rw * ws), ch = Math.round(rh * ws);
    const restored = resized(up.canvas, cw, ch);
    addDetail(restored, resized(src, cw, ch, r.x, r.y, rw, rh), 0.25, Math.max(1, cw / 400));
    const g = ctx2d(restored);
    const sm = guidedSmooth(g.getImageData(0, 0, cw, ch), Math.max(2, Math.round(cw * 0.012)), 0.0016);
    const smooth = canvas(cw, ch);
    ctx2d(smooth).putImageData(sm, 0, 0);
    // keep 30% of the high-frequency texture so skin doesn't look plastic
    addDetail(smooth, restored, 0.3, Math.max(1, cw / 500));
    // skin mask for this crop (fallback: an inner face ellipse)
    const m = canvas(cw, ch);
    const mg = ctx2d(m);
    mg.filter = `blur(${Math.max(1, cw * 0.01)}px)`;
    if (skin) mg.drawImage(skin, (r.x / W) * skin.width, (r.y / H) * skin.height, (rw / W) * skin.width, (rh / H) * skin.height, 0, 0, cw, ch);
    else { mg.fillStyle = "#fff"; mg.beginPath(); mg.ellipse(cw / 2, ch / 2, cw * 0.28, ch * 0.36, 0, 0, Math.PI * 2); mg.fill(); }
    mg.filter = "none";
    mg.globalCompositeOperation = "source-in";
    mg.drawImage(smooth, 0, 0);
    // restored face (outside skin) + smoothed skin, pasted with a feathered ellipse
    ctx2d(restored).drawImage(m, 0, 0);
    const e = ellipseMask(cw, ch, cw * 0.06);
    const eg = ctx2d(e);
    eg.globalCompositeOperation = "source-in";
    eg.drawImage(restored, 0, 0);
    ctx2d(out).drawImage(e, 0, 0, cw, ch, r.x, r.y, rw, rh);
    done++;
    opts.onProgress?.("run", done / boxes.length);
  }
  return { canvas: out, ep, ms: performance.now() - t0 };
}
