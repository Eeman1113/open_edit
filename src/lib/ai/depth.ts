// DSLR: Depth Anything V2 depth map + depth-aware lens blur.
import { aiCall, type CallOpts } from "./client";
import { canvas, clamp, ctx2d, smoothstep, type Src } from "./canvas";

export interface DepthMap {
  /** relative inverse depth, 0 = far, 1 = nearest */
  data: Float32Array;
  w: number;
  h: number;
  ep: "webgpu" | "wasm";
  ms: number;
}

const cache = new WeakMap<object, Promise<DepthMap>>();

/** Depth map for `src` (cached per source canvas). */
export function depthMap(src: Src, opts: CallOpts = {}): Promise<DepthMap> {
  let p = cache.get(src);
  if (!p) {
    p = (async () => {
      const bitmap = await createImageBitmap(src);
      const r = await aiCall({ op: "depth", bitmap }, [bitmap], opts);
      return { data: r.depth!, w: r.w!, h: r.h!, ep: r.ep, ms: r.ms };
    })();
    p.catch(() => cache.delete(src));
    cache.set(src, p);
  }
  return p;
}

/** Box filter (running sums, clamped edges). */
export function box(src: Float32Array, w: number, h: number, r: number) {
  const n = w * h, tmp = new Float32Array(n), out = new Float32Array(n), d = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let s = 0;
    for (let x = -r; x <= r; x++) s += src[row + clamp(x, 0, w - 1)];
    for (let x = 0; x < w; x++) { tmp[row + x] = s / d; s += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)]; }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[clamp(y, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) { out[y * w + x] = s / d; s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; }
  }
  return out;
}

/** Guided filter: refines the (low-res, upsampled) depth so its edges follow the photo. */
export function guided(I: Float32Array, p: Float32Array, w: number, h: number, r: number, eps: number) {
  const n = w * h;
  const Ip = new Float32Array(n), II = new Float32Array(n);
  for (let i = 0; i < n; i++) { Ip[i] = I[i] * p[i]; II[i] = I[i] * I[i]; }
  const mI = box(I, w, h, r), mp = box(p, w, h, r), mIp = box(Ip, w, h, r), mII = box(II, w, h, r);
  const a = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const cov = mIp[i] - mI[i] * mp[i], v = mII[i] - mI[i] * mI[i];
    a[i] = cov / (v + eps); b[i] = mp[i] - a[i] * mI[i];
  }
  const ma = box(a, w, h, r), mb = box(b, w, h, r);
  const q = new Float32Array(n);
  for (let i = 0; i < n; i++) q[i] = clamp(ma[i] * I[i] + mb[i], 0, 1);
  return q;
}

/** Depth resampled to w x h (bilinear) and edge-refined with the photo as guide. */
export function depthAt(dm: DepthMap, img: ImageData) {
  const { width: w, height: h, data } = img;
  const d = new Float32Array(w * h);
  const sx = (dm.w - 1) / Math.max(1, w - 1), sy = (dm.h - 1) / Math.max(1, h - 1);
  for (let y = 0; y < h; y++) {
    const fy = y * sy, y0 = Math.floor(fy), y1 = Math.min(dm.h - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = x * sx, x0 = Math.floor(fx), x1 = Math.min(dm.w - 1, x0 + 1), tx = fx - x0;
      const a = dm.data[y0 * dm.w + x0], b = dm.data[y0 * dm.w + x1], c = dm.data[y1 * dm.w + x0], e = dm.data[y1 * dm.w + x1];
      d[y * w + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + e * tx) * ty;
    }
  }
  const I = new Float32Array(w * h);
  for (let i = 0; i < I.length; i++) I[i] = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) / 255;
  return guided(I, d, w, h, Math.max(2, Math.round(Math.max(w, h) / 160)), 1e-3);
}

export interface BokehParams {
  /** max blur radius in px (from the f-stop ruler) */
  maxR: number;
  /** focus point, normalized */
  fx: number; fy: number;
  /** Focus slider 0..1: width of the in-focus depth band */
  focus: number;
  /** Depth slider 0..1: how fast blur grows outside the band (1 = shallow depth of field) */
  depth: number;
  /** Blur Edges 0..1: softens the subject edge transition */
  edges: number;
}

/** Depth of the focus point (median of a small window, robust to edges). */
export function focusDepth(d: Float32Array, w: number, h: number, fx: number, fy: number) {
  const cx = Math.round(fx * (w - 1)), cy = Math.round(fy * (h - 1)), r = Math.max(2, Math.round(Math.max(w, h) / 100));
  const v: number[] = [];
  for (let y = Math.max(0, cy - r); y <= Math.min(h - 1, cy + r); y++) for (let x = Math.max(0, cx - r); x <= Math.min(w - 1, cx + r); x++) v.push(d[y * w + x]);
  v.sort((a, b) => a - b);
  return v[v.length >> 1] ?? 0.5;
}

/**
 * Depth-aware lens blur. Blur radius per pixel = maxR * f(|depth - focusDepth|). Blur levels are built with
 * normalized convolution (in-focus pixels are excluded from the blur source), so the sharp subject doesn't
 * bleed into the background, then each pixel interpolates between the two levels around its radius.
 */
export function bokeh(src: Src, d: Float32Array, p: BokehParams): HTMLCanvasElement {
  const W = src.width, H = src.height, n = W * H;
  const fd = focusDepth(d, W, H, p.fx, p.fy);
  const band = 0.02 + 0.2 * p.focus;
  const ramp = 0.04 + 0.5 * (1 - p.depth);
  let coc = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const dd = d[i] - fd;
    // nearer than the focus plane blurs a bit less (as with a real lens focused on the subject)
    const k = smoothstep(band, band + ramp, Math.abs(dd)) * (dd > 0 ? 0.75 : 1);
    coc[i] = k * p.maxR;
  }
  if (p.edges > 0) {
    const r = Math.max(1, Math.round(p.edges * Math.max(W, H) / 120));
    coc = box(box(coc, W, H, r), W, H, r);
  }
  const out = canvas(W, H);
  const og = ctx2d(out);
  og.drawImage(src, 0, 0);
  const base = og.getImageData(0, 0, W, H);
  if (p.maxR < 0.6) return out;
  // weight layer: alpha = how much the pixel may feed the blur (0 for the in-focus subject)
  const wl = canvas(W, H);
  const wg = ctx2d(wl);
  const wimg = new ImageData(W, H);
  for (let i = 0; i < n; i++) {
    const a = smoothstep(0.3, 1.5, coc[i]);
    wimg.data[i * 4] = base.data[i * 4]; wimg.data[i * 4 + 1] = base.data[i * 4 + 1]; wimg.data[i * 4 + 2] = base.data[i * 4 + 2];
    wimg.data[i * 4 + 3] = Math.max(1, a * 255);
  }
  wg.putImageData(wimg, 0, 0);
  const N = 5;
  const radii = Array.from({ length: N + 1 }, (_, i) => (p.maxR * i) / N);
  const levels: Uint8ClampedArray[] = [base.data];
  for (let i = 1; i <= N; i++) {
    const c = canvas(W, H);
    const g = ctx2d(c);
    g.filter = `blur(${radii[i] / 2}px)`;
    g.drawImage(wl, 0, 0);
    levels.push(g.getImageData(0, 0, W, H).data);
  }
  const o = base.data;
  const res = new ImageData(W, H);
  const rd = res.data;
  for (let i = 0; i < n; i++) {
    const c = coc[i];
    const q = i * 4;
    if (c < 0.3) { rd[q] = o[q]; rd[q + 1] = o[q + 1]; rd[q + 2] = o[q + 2]; rd[q + 3] = 255; continue; }
    const f = Math.min(N - 1e-4, (c / p.maxR) * N), li = Math.floor(f), t = f - li;
    const A = levels[li], B = levels[li + 1];
    // where the blur source had no weight (deep inside the subject) fall back to the photo
    const wa = li === 0 ? 1 : A[q + 3] / 255, wb = B[q + 3] / 255;
    for (let ch = 0; ch < 3; ch++) {
      const va = wa > 0.02 ? A[q + ch] : o[q + ch], vb = wb > 0.02 ? B[q + ch] : o[q + ch];
      rd[q + ch] = va + (vb - va) * t;
    }
    rd[q + 3] = 255;
  }
  og.putImageData(res, 0, 0);
  return out;
}
