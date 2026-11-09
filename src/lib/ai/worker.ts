/// <reference lib="webworker" />
// AI inference worker: onnxruntime-web (self-hosted in public/ort) with WebGPU when available, WASM otherwise.
// Ops: inpaint (MI-GAN), upscale (Real-ESRGAN, tiled), depth (Depth Anything V2). Pixel buffers are transferred.
import type * as OrtNS from "onnxruntime-web";
import { MODELS, ORT_BASE, type ModelId } from "./models";
import type { AiRequest, AiResponse } from "./protocol";

type Ort = typeof OrtNS;
type Session = OrtNS.InferenceSession;
declare const self: DedicatedWorkerGlobalScope;

let ortP: Promise<Ort> | null = null;
function loadOrt(): Promise<Ort> {
  ortP ??= (async () => {
    const url = new URL(`${ORT_BASE}ort.min.mjs`, self.location.origin).href;
    const ort = (await import(/* turbopackIgnore: true */ /* webpackIgnore: true */ url)) as Ort;
    ort.env.wasm.wasmPaths = new URL(ORT_BASE, self.location.origin).href;
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
    ort.env.wasm.proxy = false;
    ort.env.logLevel = "error";
    return ort;
  })().catch((e) => { ortP = null; throw e; });
  return ortP;
}

let gpuOk: Promise<boolean> | null = null;
function hasWebGpu(): Promise<boolean> {
  gpuOk ??= (async () => {
    try {
      const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
      return !!gpu && !!(await gpu.requestAdapter());
    } catch { return false; }
  })();
  return gpuOk;
}

const post = (m: AiResponse, transfer: Transferable[] = []) => self.postMessage(m, transfer);

async function download(url: string, size: number, onProgress: (v: number) => void): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`model fetch ${res.status}`);
  const total = Number(res.headers.get("content-length")) || size;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length;
    onProgress(Math.min(1, got / total));
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

interface Loaded { s: Session; ep: "webgpu" | "wasm"; ort: Ort }
const sessions = new Map<string, Promise<Loaded>>();

function getSession(model: ModelId, onProgress: (v: number) => void, forceWasm = false): Promise<Loaded> {
  const key = `${model}:${forceWasm ? "wasm" : "auto"}`;
  let p = sessions.get(key);
  if (!p) {
    p = (async () => {
      const ort = await loadOrt();
      const info = MODELS[model];
      const gpu = !forceWasm && !!info.webgpu && (await hasWebGpu());
      const buf = await download(gpu ? info.webgpu! : info.wasm, info.size, onProgress);
      if (gpu) {
        try {
          const s = await ort.InferenceSession.create(buf, { executionProviders: ["webgpu"], graphOptimizationLevel: "all" });
          return { s, ep: "webgpu" as const, ort };
        } catch { /* fall through to WASM */ }
        const wbuf = await download(info.wasm, info.size, onProgress);
        return { s: await ort.InferenceSession.create(wbuf, { executionProviders: ["wasm"] }), ep: "wasm" as const, ort };
      }
      return { s: await ort.InferenceSession.create(buf, { executionProviders: ["wasm"], graphOptimizationLevel: "all" }), ep: "wasm" as const, ort };
    })();
    p.catch(() => sessions.delete(key));
    sessions.set(key, p);
  }
  return p;
}

const cancelled = new Set<number>();
class Cancelled extends Error {}
const check = (id: number) => { if (cancelled.has(id)) throw new Cancelled("cancelled"); };

/* ------------------------------------------------------------------ ops */

async function inpaint(id: number, rgba: Uint8ClampedArray, w: number, h: number, mask: Uint8Array) {
  const L = await getSession("migan", (v) => post({ id, type: "progress", stage: "download", value: v }));
  check(id);
  const n = w * h;
  const img = new Uint8Array(3 * n);
  for (let i = 0; i < n; i++) { img[i] = rgba[i * 4]; img[n + i] = rgba[i * 4 + 1]; img[2 * n + i] = rgba[i * 4 + 2]; }
  const t0 = performance.now();
  const out = await L.s.run({
    image: new L.ort.Tensor("uint8", img, [1, 3, h, w]),
    mask: new L.ort.Tensor("uint8", mask, [1, 1, h, w]),
  });
  const r = (out.result ?? Object.values(out)[0]).data as Uint8Array;
  const res = new Uint8ClampedArray(4 * n);
  for (let i = 0; i < n; i++) { res[i * 4] = r[i]; res[i * 4 + 1] = r[n + i]; res[i * 4 + 2] = r[2 * n + i]; res[i * 4 + 3] = 255; }
  post({ id, type: "done", rgba: res, w, h, ep: L.ep, ms: performance.now() - t0 }, [res.buffer]);
}

async function upscale(id: number, rgba: Uint8ClampedArray, w: number, h: number, outScale: 1 | 2 | 4) {
  let L = await getSession("esrgan", (v) => post({ id, type: "progress", stage: "download", value: v }));
  check(id);
  const T = L.ep === "webgpu" ? 256 : 128, P = 10, S = 4;
  const ow = w * outScale, oh = h * outScale, k = S / outScale;
  const out = new Uint8ClampedArray(ow * oh * 4);
  const tiles: [number, number][] = [];
  for (let y = 0; y < h; y += T) for (let x = 0; x < w; x += T) tiles.push([x, y]);
  const t0 = performance.now();
  for (let ti = 0; ti < tiles.length; ti++) {
    check(id);
    const [x0, y0] = tiles[ti];
    const x1 = Math.min(w, x0 + T), y1 = Math.min(h, y0 + T);
    const ex0 = Math.max(0, x0 - P), ey0 = Math.max(0, y0 - P), ex1 = Math.min(w, x1 + P), ey1 = Math.min(h, y1 + P);
    const tw = ex1 - ex0, th = ey1 - ey0, n = tw * th;
    const inp = new Float32Array(3 * n);
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      const si = ((ey0 + y) * w + ex0 + x) * 4, di = y * tw + x;
      inp[di] = rgba[si] / 255; inp[n + di] = rgba[si + 1] / 255; inp[2 * n + di] = rgba[si + 2] / 255;
    }
    let o: Float32Array;
    try {
      o = (await L.s.run({ input: new L.ort.Tensor("float32", inp, [1, 3, th, tw]) })).output.data as Float32Array;
    } catch (e) {
      if (L.ep !== "webgpu") throw e;
      // WebGPU failed at run time (driver / limits): redo on WASM
      L = await getSession("esrgan", () => undefined, true);
      o = (await L.s.run({ input: new L.ort.Tensor("float32", inp, [1, 3, th, tw]) })).output.data as Float32Array;
    }
    const OW = tw * S, ON = OW * th * S;
    // copy the inner (unpadded) region, box-averaging k x k output pixels per destination pixel
    const dx0 = x0 * outScale, dy0 = y0 * outScale, dx1 = x1 * outScale, dy1 = y1 * outScale;
    const inv = 1 / (k * k);
    for (let dy = dy0; dy < dy1; dy++) {
      const sy = (dy - ey0 * outScale) * k;
      for (let dx = dx0; dx < dx1; dx++) {
        const sx = (dx - ex0 * outScale) * k;
        let r = 0, g = 0, b = 0;
        for (let yy = 0; yy < k; yy++) {
          const row = (sy + yy) * OW + sx;
          for (let xx = 0; xx < k; xx++) { const q = row + xx; r += o[q]; g += o[ON + q]; b += o[2 * ON + q]; }
        }
        const di = (dy * ow + dx) * 4;
        out[di] = r * inv * 255; out[di + 1] = g * inv * 255; out[di + 2] = b * inv * 255; out[di + 3] = 255;
      }
    }
    post({ id, type: "progress", stage: "run", value: (ti + 1) / tiles.length });
  }
  post({ id, type: "done", rgba: out, w: ow, h: oh, ep: L.ep, ms: performance.now() - t0 }, [out.buffer]);
}

async function depth(id: number, bmp: ImageBitmap) {
  const L = await getSession("depth", (v) => post({ id, type: "progress", stage: "download", value: v }));
  check(id);
  const long = 518;
  const sc = long / Math.max(bmp.width, bmp.height);
  const w = Math.max(14, Math.round((bmp.width * sc) / 14) * 14), h = Math.max(14, Math.round((bmp.height * sc) / 14) * 14);
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const px = g.getImageData(0, 0, w, h).data;
  const n = w * h, mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
  const inp = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) for (let ch = 0; ch < 3; ch++) inp[ch * n + i] = (px[i * 4 + ch] / 255 - mean[ch]) / std[ch];
  const t0 = performance.now();
  const out = await L.s.run({ pixel_values: new L.ort.Tensor("float32", inp, [1, 3, h, w]) });
  const t = out.predicted_depth;
  const d = new Float32Array(t.data as Float32Array);
  const dh = t.dims[1], dw = t.dims[2];
  let lo = Infinity, hi = -Infinity;
  for (const v of d) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const k = 1 / Math.max(1e-6, hi - lo);
  for (let i = 0; i < d.length; i++) d[i] = (d[i] - lo) * k; // 1 = nearest
  post({ id, type: "done", depth: d, w: dw, h: dh, ep: L.ep, ms: performance.now() - t0 }, [d.buffer]);
}

self.onmessage = async (e: MessageEvent<AiRequest>) => {
  const m = e.data;
  if (m.op === "cancel") { cancelled.add(m.target); return; }
  try {
    if (m.op === "warm") {
      const L = await getSession(m.model, (v) => post({ id: m.id, type: "progress", stage: "download", value: v }));
      post({ id: m.id, type: "done", ep: L.ep, ms: 0 });
    } else if (m.op === "inpaint") await inpaint(m.id, m.rgba, m.w, m.h, m.mask);
    else if (m.op === "upscale") await upscale(m.id, m.rgba, m.w, m.h, m.outScale);
    else if (m.op === "depth") await depth(m.id, m.bitmap);
  } catch (err) {
    post({ id: m.id, type: "error", message: err instanceof Cancelled ? "cancelled" : String((err as Error)?.message ?? err) });
  } finally {
    cancelled.delete(m.id);
  }
};
