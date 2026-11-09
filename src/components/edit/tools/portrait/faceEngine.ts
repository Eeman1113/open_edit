// Editor face stage: runs the web face engine (src/lib/face, IMAGE mode) on the editor base before the regular
// filter/adjust pipeline. Values are stored per detected face and applied face by face:
//   per-face reshape (WarpParams + per-side weights + WarpOps) -> per-face makeup / retouch -> per-face skin pass
//   -> body warp (pose driven displacement grid) -> manual Reshape liquify field.
// The same stage renders the interactive preview (downscaled base) and the full-resolution export.
import {
  FaceMakeup, FacePipeline, FaceTracker, FaceWarp, IDENTITY_MAPPING, LiquifyField, StickerRuntime, parseSticker, warpActive, warpedLandmarks,
  type FaceData, type MakeupLayer, type MakeupParams, type PoseData, type ShapeWeights, type WarpOp, type WarpParams,
} from "@/lib/face";
import { COPY_FRAG, COPY_VERT, FULLSCREEN, ImageCache, Stream, Targets, compile, makeTexture, type Prog } from "@/lib/face/gl";
import { IDX } from "@/lib/face";
import { getAsset } from "@/lib/assets";
import { STICKER_BASE, findSticker } from "@/data/camera/stickers";
import type { FaceEdit, FaceVals } from "../../model";
import { beautyMarkUrl, eyeLightLayers, flippedReady, layerUrls, makeupLayers, r3dToOps, ratioToOps, reshapeToEngine } from "./faceData";

/* ------------------------------------------------------------------ detection (FaceTracker IMAGE mode) */

export interface Detection { faces: FaceData[] }
export interface PoseDetection { pose: PoseData | null; count: number }

let trackerP: Promise<FaceTracker> | null = null;
const tracker = () => (trackerP ??= FaceTracker.create({ mode: "IMAGE", maxFaces: 6 }).catch((e) => { trackerP = null; throw e; }));

const detected = new WeakMap<HTMLCanvasElement, Detection>();
const detecting = new WeakMap<HTMLCanvasElement, Promise<Detection>>();
const posed = new WeakMap<HTMLCanvasElement, PoseDetection>();
const posing = new WeakMap<HTMLCanvasElement, Promise<PoseDetection>>();

/** Detection runs on a copy of at most 1280 px (landmarks are normalized, so they fit every resolution). */
function detectSource(base: HTMLCanvasElement) {
  const k = Math.min(1, 1280 / Math.max(base.width, base.height));
  if (k === 1) return base;
  const c = document.createElement("canvas");
  c.width = Math.round(base.width * k); c.height = Math.round(base.height * k);
  const g = c.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.drawImage(base, 0, 0, c.width, c.height);
  return c;
}

export function peekFaces(base: HTMLCanvasElement | null | undefined): Detection | undefined {
  return base ? detected.get(base) : undefined;
}

/** Faces of a base image, left to right (stable indices for the per-face values). Cached per base. */
export function detectFaces(base: HTMLCanvasElement): Promise<Detection> {
  const hit = detected.get(base);
  if (hit) return Promise.resolve(hit);
  let p = detecting.get(base);
  if (!p) {
    p = tracker().then((t) => {
      const faces = t.detect(detectSource(base)).slice().sort((a, b) => a.points[3] - b.points[3]);
      const d: Detection = { faces };
      detected.set(base, d);
      return d;
    }).catch(() => {
      const d: Detection = { faces: [] };
      detected.set(base, d);
      return d;
    });
    detecting.set(base, p);
  }
  return p;
}

export function peekPose(base: HTMLCanvasElement | null | undefined) { return base ? posed.get(base) : undefined; }

/** Body pose of the largest person in the picture. */
export function detectPose(base: HTMLCanvasElement): Promise<PoseDetection> {
  const hit = posed.get(base);
  if (hit) return Promise.resolve(hit);
  let p = posing.get(base);
  if (!p) {
    p = tracker().then(async (t) => {
      await t.ensurePose();
      const poses = t.pose(detectSource(base));
      const size = (q: PoseData) => {
        const P = q.points, xs: number[] = [], ys: number[] = [];
        for (const i of [0, 11, 12, 23, 24, 25, 26, 27, 28]) if (P[i * 4 + 3] > 0.3) { xs.push(P[i * 4]); ys.push(P[i * 4 + 1]); }
        return xs.length < 3 ? 0 : (Math.max(...xs) - Math.min(...xs) + 0.05) * (Math.max(...ys) - Math.min(...ys));
      };
      const valid = poses.filter((q) => size(q) > 0.002 && q.points[11 * 4 + 3] > 0.3 && q.points[12 * 4 + 3] > 0.3);
      valid.sort((a, b) => size(b) - size(a));
      const faces = (await detectFaces(base)).faces.length;
      const r: PoseDetection = { pose: valid[0] ?? null, count: valid.length ? Math.max(valid.length, faces) : 0 };
      posed.set(base, r);
      return r;
    }).catch(() => { const r = { pose: null, count: 0 }; posed.set(base, r); return r; });
    posing.set(base, p);
  }
  return p;
}

/* ------------------------------------------------------------------ manual Reshape registry (undo-friendly ids) */

const liqStore = new Map<number, { aspect: number; d: Float32Array }>();
const liqFields = new Map<number, LiquifyField>();
let liqSeq = 1;
export function storeLiquify(f: LiquifyField, aspect: number): number {
  const id = liqSeq++;
  liqStore.set(id, { aspect, d: f.snapshot() });
  return id;
}
export function liquifyById(id: number | undefined): LiquifyField | null {
  if (!id) return null;
  const s = liqStore.get(id);
  if (!s) return null;
  let f = liqFields.get(id);
  if (!f) { f = new LiquifyField(s.aspect); f.restoreSnapshot(s.d); liqFields.set(id, f); }
  return f;
}
/** Drops a transient field (live drag states that never reached the undo stack). */
export function dropLiquify(id: number | undefined) {
  if (!id) return;
  liqStore.delete(id);
  liqFields.delete(id);
}

/** Resolves once the mirrored beauty-mark texture exists. */
export const flippedUrlReady = (id: string) => flippedReady(beautyMarkUrl(id));

/* ------------------------------------------------------------------ value -> engine params */

export interface FaceParams { shape: ShapeWeights; warp: Partial<WarpParams>; ops: WarpOp[]; makeup: MakeupParams; skin: SkinParams }
export interface SkinParams { pore: number; conceal: number; matte: number; texture: number; vibrance: number; glow: number; details: number; eyeDetails: number; blemish: number }

/** Quick fix preset: spot removal on, pores 0.3, lines 0.3, fine detail 0.2, under-eyes 0.3, teeth 0.2. */
export const ONE_TOUCH: Record<string, number> = { blemish: 1, balance: 0.3, wrinkle: 0.3, clarity: 0.2, eyebag: 0.3, teeth: 0.2 };

export function faceParams(v: FaceVals | undefined, corr = false): FaceParams {
  const { shape, warp, ops } = reshapeToEngine(v?.re, v?.shape, corr);
  ops.push(...ratioToOps(v?.ratio), ...r3dToOps(v?.r3d));
  if (v?.hv) warp.hairVolume = (warp.hairVolume ?? 0) + v.hv;
  const layers: MakeupLayer[] = [];
  for (const [cat, p] of Object.entries(v?.mk ?? {})) layers.push(...makeupLayers(cat, p));
  if (v?.eye) layers.push(...eyeLightLayers(v.eye.id, v.eye.v));
  const s = v?.skin ?? {};
  const g = (k: string) => s[k] ?? 0;
  if (g("plim") > 0.001) layers.push({ region: "highlight", opacity: g("plim") * 0.5, color: "#ffffff", blend: "softlight" });
  const makeup: MakeupParams = {
    layers,
    teethWhiten: g("teeth"),
    eyeWhiten: Math.min(1, g("eyewhiten") + g("clarity") * 0.6),
    darkCircle: g("eyebag"),
    wrinkle: g("wrinkle") * 0.8,
  };
  const skin: SkinParams = {
    pore: g("balance"), conceal: g("conceal"), matte: g("oilremover"), texture: g("skintexture"), vibrance: g("vibrance"),
    glow: g("glow"), details: g("details"), eyeDetails: g("eyedetails"), blemish: g("blemish"),
  };
  return { shape, warp, ops, makeup, skin };
}

const skinActive = (s: SkinParams) => Object.values(s).some((x) => x > 0.001);
const makeupOn = (m: MakeupParams) => !!((m.layers && m.layers.some((l) => l.opacity > 0.001)) || (m.teethWhiten ?? 0) > 0.001 || (m.eyeWhiten ?? 0) > 0.001 || (m.darkCircle ?? 0) > 0.001 || (m.wrinkle ?? 0) > 0.001);

/* ------------------------------------------------------------------ AR filter (sticker) */

/** Sticker runtime for an AR filter id (local starter set), or null. */
export function stickerRuntime(id: number | null | undefined): StickerRuntime | null {
  const s = findSticker(id);
  return s?.json ? new StickerRuntime(parseSticker(s.json, STICKER_BASE)) : null;
}
/**
 * Animation clock for a still photo (IMAGE mode): the runtime is primed at t = 0 and drawn at STILL_MS, so looping
 * SEQUENCE items show a frame from the middle of their animation.
 */
const STILL_MS = 1000;

export function faceEditActive(fe: FaceEdit | undefined): boolean {
  if (!fe) return false;
  if (fe.sticker != null && findSticker(fe.sticker)) return true;
  if (fe.liq) return true;
  if (fe.body && Object.values(fe.body).some((x) => Math.abs(x) > 0.001)) return true;
  return Object.values(fe.f).some((v) => {
    const p = faceParams(v, fe.corr);
    return warpActive(p.warp, p.ops, p.shape) || makeupOn(p.makeup) || skinActive(p.skin);
  });
}

/** Is any value of this face set for a given page? (modified dots / selected thumbnails use this) */
export const nonZero = (r?: Record<string, number>) => !!r && Object.values(r).some((x) => Math.abs(x) > 0.001);

/* ------------------------------------------------------------------ body warp (BodyBeautyType.*_RATIO approximation) */

const BODY_CACHE = new Map<string, LiquifyField | null>();

/**
 * Builds a backward displacement grid (LiquifyField: pixel p shows source p - d) from the biggest person's pose.
 * D items: + = more of the part (wider / bigger), so "All body" (slim -v, head -v, longleg +v) slims.
 */
export function bodyField(pose: PoseData | null, body: Record<string, number> | undefined, aspect: number): LiquifyField | null {
  if (!pose || !body || !Object.values(body).some((x) => Math.abs(x) > 0.001)) return null;
  const key = `${aspect.toFixed(4)}|${JSON.stringify(body)}|${pose.points[0]}|${pose.points[1]}`;
  if (BODY_CACHE.has(key)) return BODY_CACHE.get(key)!;
  const P = pose.points;
  const pt = (i: number): [number, number] => [P[i * 4], P[i * 4 + 1]];
  const vis = (i: number) => P[i * 4 + 3];
  const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const ax = aspect; // x distances in "height units": dx * aspect
  const lS = pt(11), rS = pt(12), lH = pt(23), rH = pt(24);
  const sC = mid(lS, rS), hC = mid(lH, rH);
  const sW = Math.hypot((lS[0] - rS[0]) * ax, lS[1] - rS[1]); // shoulder width (height units)
  const hipY = hC[1];
  const torsoLen = Math.max(0.05, hipY - sC[1]);
  const ear = vis(7) > 0.3 && vis(8) > 0.3 ? mid(pt(7), pt(8)) : pt(0);
  const headR = Math.max(sW * 0.45, Math.hypot((pt(0)[0] - sC[0]) * ax, pt(0)[1] - sC[1]) * 0.9);
  const neck: [number, number] = mid(sC, ear);
  const b = (k: string) => body[k] ?? 0;
  const slim = b("slim"), head = b("head"), shoulder = b("shoulder"), sq = b("squareshoulder"), neckV = b("neck"), chest = b("chest"),
    arm = b("arm"), waist = b("waist"), hip = b("hip"), leg = b("leg"), longleg = b("longleg");
  const lower = vis(27) > 0.2 || vis(28) > 0.2 ? Math.max(pt(27)[1], pt(28)[1]) : Math.min(1, hipY + torsoLen * 1.9);
  const sst = (e0: number, e1: number, x: number) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const fall = (t: number) => (t >= 1 ? 0 : (1 - t * t) * (1 - t * t));
  /** distance (height units) from p to segment ab, and the parameter along it */
  const seg = (x: number, y: number, a: [number, number], c: [number, number]) => {
    const vx = (c[0] - a[0]) * ax, vy = c[1] - a[1], wx = (x - a[0]) * ax, wy = y - a[1];
    const l2 = vx * vx + vy * vy || 1e-6;
    const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / l2));
    const px = wx - vx * t, py = wy - vy * t;
    return { d: Math.hypot(px, py), t, nx: px, ny: py };
  };
  const f = new LiquifyField(aspect, 128);
  const W = f.cols + 1;
  let any = false;
  for (let j = 0; j <= f.rows; j++) for (let i = 0; i <= f.cols; i++) {
    const x = i / f.cols, y = j / f.rows;
    let dx = 0, dy = 0; // in height units (dx later / aspect)
    // slim: horizontal squeeze of the torso and legs toward the body axis
    if (slim) {
      const axisX = y < hipY ? sC[0] + (hC[0] - sC[0]) * Math.max(0, (y - sC[1]) / torsoLen) : hC[0];
      const Xa = (x - axisX) * ax;
      const band = sst(sC[1] - torsoLen * 0.2, sC[1] + torsoLen * 0.1, y) * (1 - sst(lower, lower + 0.05, y));
      const wfall = 1 - sst(sW * 0.9, sW * 1.6, Math.abs(Xa));
      dx += -Xa * 0.12 * slim * band * wfall;
    }
    // waist: narrow at ~60% between shoulders and hips
    if (waist) {
      const wy = sC[1] + torsoLen * 0.68;
      const Xa = (x - (sC[0] + hC[0]) / 2) * ax;
      const k = fall(Math.abs(y - wy) / (torsoLen * 0.45)) * (1 - sst(sW * 0.6, sW * 1.1, Math.abs(Xa)));
      dx += Xa * 0.16 * waist * k; // backward offset toward outside = narrower
    }
    // hips: widen (+) / narrow (-) at the hips
    if (hip) {
      const Xa = (x - hC[0]) * ax;
      const k = fall(Math.abs(y - hipY) / (torsoLen * 0.5)) * (1 - sst(sW * 0.7, sW * 1.3, Math.abs(Xa)));
      dx += -Xa * 0.14 * hip * k;
    }
    // shoulders: widen / narrow; square shoulders: lift the shoulder tips
    for (const S of [lS, rS]) {
      const rx = (x - S[0]) * ax, ry = y - S[1];
      const t = Math.hypot(rx, ry) / (sW * 0.45);
      if (t < 1) {
        const k = fall(t);
        if (shoulder) dx += -Math.sign(S[0] - sC[0]) * sW * 0.08 * shoulder * k;
        if (sq) dy += sW * 0.06 * sq * k * sst(0, sW * 0.2, Math.abs((x - sC[0]) * ax));
      }
    }
    // neck muscle: slimmer neck
    if (neckV) {
      const t = Math.hypot((x - neck[0]) * ax / (sW * 0.38), (y - neck[1]) / (Math.abs(sC[1] - ear[1]) * 0.7 + 1e-3));
      if (t < 1) dx += (x - neck[0]) * ax * 0.25 * neckV * fall(t);
    }
    // chest: enlarge around the chest centre
    if (chest) {
      const c: [number, number] = [sC[0], sC[1] + torsoLen * 0.3];
      const t = Math.hypot((x - c[0]) * ax, y - c[1]) / (sW * 0.6);
      if (t < 1) { const k = fall(t) * 0.12 * chest; dx += -(x - c[0]) * ax * k; dy += -(y - c[1]) * k; }
    }
    // head: scale around the neck
    if (head) {
      const t = Math.hypot((x - pt(0)[0]) * ax, y - pt(0)[1]) / (headR * 2.2);
      if (t < 1) { const k = 0.14 * head * fall(t); dx += -(x - neck[0]) * ax * k; dy += -(y - neck[1]) * k; }
    }
    // arms: squeeze toward the arm bones
    if (arm) {
      for (const [a, e, wv] of [[11, 13, 15], [12, 14, 16]] as const) {
        if (vis(e) < 0.3) continue;
        for (const [p0, p1] of [[a, e], [e, wv]] as const) {
          if (vis(p1) < 0.2) continue;
          const s = seg(x, y, pt(p0), pt(p1));
          const r = sW * 0.22;
          if (s.d < r) { const k = fall(s.d / r) * 0.35 * arm; dx += -s.nx * k; dy += -s.ny * k; }
        }
      }
    }
    // legs: squeeze toward the leg bones
    if (leg) {
      for (const [h, kn, an] of [[23, 25, 27], [24, 26, 28]] as const) {
        if (vis(kn) < 0.3) continue;
        for (const [p0, p1] of [[h, kn], [kn, an]] as const) {
          if (vis(p1) < 0.2) continue;
          const s = seg(x, y, pt(p0), pt(p1));
          const r = sW * 0.42;
          if (s.d < r) { const k = fall(s.d / r) * 0.25 * leg; dx += -s.nx * k; dy += 0; }
        }
      }
    }
    // longer legs: vertical stretch below the hips
    if (longleg && y > hipY) {
      const k = 0.12 * longleg;
      dy += (y - hipY) * (1 - 1 / (1 + k)) * (1 - sst(0.97, 1, y) * 0);
    }
    if (dx || dy) any = true;
    f.d[(j * W + i) * 2] = dx / ax;
    f.d[(j * W + i) * 2 + 1] = dy;
  }
  const out = any ? f : null;
  BODY_CACHE.set(key, out);
  if (BODY_CACHE.size > 16) BODY_CACHE.delete(BODY_CACHE.keys().next().value!);
  return out;
}

/* ------------------------------------------------------------------ skin pass (per face, landmark masks) */

const BLUR_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tex;
uniform vec2 dir;
void main() {
  vec4 c = texture2D(tex, vUv) * 0.2270270270;
  c += (texture2D(tex, vUv + dir * 1.3846153846) + texture2D(tex, vUv - dir * 1.3846153846)) * 0.3162162162;
  c += (texture2D(tex, vUv + dir * 3.2307692308) + texture2D(tex, vUv - dir * 3.2307692308)) * 0.0702702703;
  gl_FragColor = c;
}`;

const SKIN_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tex, blurTex, maskTex, grainTex;
uniform vec2 texel, grainScale;
uniform float pore, conceal, matte, texAmt, vib, glow, det, eyeDet, blemish;
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec4 src = texture2D(tex, vUv);
  vec3 c = src.rgb;
  vec4 m = texture2D(maskTex, vUv);
  float skin = m.r, eyes = m.g, face = m.b;
  vec3 b = texture2D(blurTex, vUv).rgb;
  vec2 o = texel * 2.0;
  vec3 s = (texture2D(tex, vUv + vec2(o.x, 0.0)).rgb + texture2D(tex, vUv - vec2(o.x, 0.0)).rgb + texture2D(tex, vUv + vec2(0.0, o.y)).rgb + texture2D(tex, vUv - vec2(0.0, o.y)).rgb) * 0.25;
  float l = lum(c), lb = lum(b);
  c = mix(c, mix(c, s, 0.85), clamp(pore, 0.0, 1.0) * skin);
  float spot = smoothstep(0.015, 0.06, lb - l);
  c = mix(c, b + (c - s) * 0.25, blemish * skin * spot);
  c = mix(c, b * 1.02 + (c - b) * 0.4, conceal * 0.75 * skin);
  c -= vec3(max(0.0, lum(c) - lb)) * matte * 1.1 * skin;
  float g = texture2D(grainTex, fract(vUv * grainScale)).r - 0.5;
  c += g * 0.1 * texAmt * skin;
  float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  vec3 gray = vec3(lum(c));
  c = mix(gray, c, 1.0 + vib * 0.6 * (1.0 - sat) * skin);
  c = mix(c, 1.0 - (1.0 - c) * (1.0 - b * 0.55), glow * 0.55 * skin);
  c += (src.rgb - s) * det * 1.4 * face;
  c += (src.rgb - s) * eyeDet * 2.2 * eyes;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), src.a);
}`;

/** R: skin (face oval minus eyes / brows / lips), G: eyes, B: whole face. Canvas rows top-down. */
function faceMask(face: FaceData, w: number, h: number): HTMLCanvasElement {
  const k = Math.min(1, 640 / Math.max(w, h));
  const W = Math.max(8, Math.round(w * k)), H = Math.max(8, Math.round(h * k));
  const P = face.points;
  const poly = (g: CanvasRenderingContext2D, ids: readonly number[], grow = 1) => {
    let cx = 0, cy = 0;
    for (const i of ids) { cx += P[i * 3]; cy += P[i * 3 + 1]; }
    cx /= ids.length; cy /= ids.length;
    g.beginPath();
    ids.forEach((i, n) => {
      const x = (cx + (P[i * 3] - cx) * grow) * W, y = (cy + (P[i * 3 + 1] - cy) * grow) * H;
      if (n) g.lineTo(x, y); else g.moveTo(x, y);
    });
    g.closePath(); g.fill();
  };
  const iod = Math.hypot((P[263 * 3] - P[33 * 3]) * W, (P[263 * 3 + 1] - P[33 * 3 + 1]) * H);
  const layer = (draw: (g: CanvasRenderingContext2D) => void, blur: number) => {
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d")!;
    g.filter = `blur(${Math.max(1, blur)}px)`;
    g.fillStyle = "#fff";
    draw(g);
    return g.getImageData(0, 0, W, H).data;
  };
  const brow = (u: readonly number[], l: readonly number[]) => [...u, ...[...l].reverse()];
  const skin = layer((g) => {
    poly(g, IDX.faceOval, 0.97);
    g.globalCompositeOperation = "destination-out";
    poly(g, IDX.rightEye, 1.5); poly(g, IDX.leftEye, 1.5);
    poly(g, brow(IDX.rightBrowUpper, IDX.rightBrowLower), 1.25); poly(g, brow(IDX.leftBrowUpper, IDX.leftBrowLower), 1.25);
    poly(g, IDX.lipsOuter, 1.12);
  }, iod * 0.06);
  const eyes = layer((g) => { poly(g, IDX.rightEye, 1.25); poly(g, IDX.leftEye, 1.25); }, iod * 0.03);
  const all = layer((g) => poly(g, IDX.faceOval, 1.0), iod * 0.08);
  const out = document.createElement("canvas"); out.width = W; out.height = H;
  const og = out.getContext("2d")!;
  const img = og.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    img.data[i * 4] = skin[i * 4 + 3]; img.data[i * 4 + 1] = eyes[i * 4 + 3]; img.data[i * 4 + 2] = all[i * 4 + 3]; img.data[i * 4 + 3] = 255;
  }
  og.putImageData(img, 0, 0);
  return out;
}

/* ------------------------------------------------------------------ stage */

export class FaceStage {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGLRenderingContext;
  readonly images: ImageCache;
  private warp: FaceWarp;
  private makeup: FaceMakeup;
  private targets: Targets;
  private stream: Stream;
  private copy: Prog;
  private blur: Prog;
  private skin: Prog;
  private srcTex: WebGLTexture;
  private maskTex: WebGLTexture;
  private grainTex: WebGLTexture | null = null;
  private flip = 0;
  /** Face pipeline for AR filter stickers (sticker sprites / lenses / skins, sticker makeup and distortions). */
  private pipe: FacePipeline | null = null;

  constructor() {
    this.canvas = document.createElement("canvas");
    const gl = this.canvas.getContext("webgl", { preserveDrawingBuffer: true, premultipliedAlpha: false, antialias: false });
    if (!gl) throw new Error("webgl");
    this.gl = gl;
    this.images = new ImageCache(gl);
    this.warp = new FaceWarp(gl);
    this.makeup = new FaceMakeup(gl, this.images);
    this.targets = new Targets(gl);
    this.stream = new Stream(gl);
    this.copy = compile(gl, COPY_VERT, COPY_FRAG, ["tex"], ["position"]);
    this.blur = compile(gl, COPY_VERT, BLUR_FRAG, ["tex", "dir"], ["position"]);
    this.skin = compile(gl, COPY_VERT, SKIN_FRAG, ["tex", "blurTex", "maskTex", "grainTex", "texel", "grainScale", "pore", "conceal", "matte", "texAmt", "vib", "glow", "det", "eyeDet", "blemish"], ["position"]);
    this.srcTex = makeTexture(gl);
    this.maskTex = makeTexture(gl);
    const grain = new Image();
    grain.onload = () => {
      const t = makeTexture(gl);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, grain);
      this.grainTex = t;
    };
    grain.src = getAsset("table", "grain");
  }

  private pass(prog: Prog, input: WebGLTexture, fb: WebGLFramebuffer | null, w: number, h: number, setup?: () => void) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.useProgram(prog.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(prog.u.tex, 0);
    setup?.();
    this.stream.draw(FULLSCREEN, [[prog.a.position, 2]]);
  }
  /** Copies a pass result into our own ping-pong target (engine passes return textures they reuse). */
  private keep(t: WebGLTexture, w: number, h: number): WebGLTexture {
    this.flip ^= 1;
    const dst = this.targets.get(this.flip ? "p1" : "p0", w, h);
    this.pass(this.copy, t, dst.fb, w, h);
    return dst.tex;
  }

  private skinPass(input: WebGLTexture, w: number, h: number, face: FaceData, s: SkinParams): WebGLTexture {
    const gl = this.gl;
    const bw = Math.max(4, Math.round(w / 6)), bh = Math.max(4, Math.round(h / 6));
    const a = this.targets.get("ba", bw, bh), b = this.targets.get("bb", bw, bh);
    this.pass(this.copy, input, a.fb, bw, bh);
    for (let n = 0; n < 2; n++) {
      this.pass(this.blur, a.tex, b.fb, bw, bh, () => gl.uniform2f(this.blur.u.dir, 1.5 / bw, 0));
      this.pass(this.blur, b.tex, a.fb, bw, bh, () => gl.uniform2f(this.blur.u.dir, 0, 1.5 / bh));
    }
    const m = faceMask(face, w, h);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, m);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    this.flip ^= 1;
    const dst = this.targets.get(this.flip ? "p1" : "p0", w, h);
    const iodPx = Math.hypot((face.points[263 * 3] - face.points[33 * 3]) * w, (face.points[263 * 3 + 1] - face.points[33 * 3 + 1]) * h);
    this.pass(this.skin, input, dst.fb, w, h, () => {
      const u = this.skin.u;
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, a.tex); gl.uniform1i(u.blurTex, 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.maskTex); gl.uniform1i(u.maskTex, 2);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.grainTex ?? this.maskTex); gl.uniform1i(u.grainTex, 3);
      const tex = Math.max(1, iodPx / 140);
      gl.uniform2f(u.texel, tex / w, tex / h);
      gl.uniform2f(u.grainScale, w / (500 * tex), h / (500 * tex));
      gl.uniform1f(u.pore, s.pore); gl.uniform1f(u.conceal, s.conceal); gl.uniform1f(u.matte, s.matte);
      gl.uniform1f(u.texAmt, this.grainTex ? s.texture : 0); gl.uniform1f(u.vib, s.vibrance); gl.uniform1f(u.glow, s.glow);
      gl.uniform1f(u.det, s.details); gl.uniform1f(u.eyeDet, s.eyeDetails); gl.uniform1f(u.blemish, s.blemish);
      gl.activeTexture(gl.TEXTURE0);
    });
    return dst.tex;
  }

  /** Renders `src` with the face edits into this.canvas (same size as src). */
  render(src: HTMLCanvasElement, fe: FaceEdit, faces: FaceData[], pose: PoseData | null): HTMLCanvasElement {
    const gl = this.gl, w = src.width, h = src.height;
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    let cur = this.keep(this.srcTex, w, h);
    const params = faces.map((_, i) => faceParams(fe.f[i], fe.corr));
    const warped = faces.slice();
    faces.forEach((face, i) => {
      const p = params[i];
      if (!warpActive(p.warp, p.ops, p.shape)) return;
      cur = this.keep(this.warp.apply(cur, w, h, [face], p.warp, p.ops, p.shape), w, h);
      warped[i] = warpedLandmarks(face, w, h, p.warp, p.ops, p.shape);
    });
    warped.forEach((face, i) => {
      const p = params[i];
      if (makeupOn(p.makeup)) cur = this.keep(this.makeup.apply(cur, w, h, [face], p.makeup), w, h);
      if (skinActive(p.skin)) cur = this.skinPass(cur, w, h, face, p.skin);
    });
    const bf = bodyField(pose, fe.body, w / h);
    if (bf) cur = this.keep(this.warp.applyLiquify(cur, w, h, bf, "body"), w, h);
    const lf = liquifyById(fe.liq);
    if (lf) cur = this.keep(this.warp.applyLiquify(cur, w, h, lf, "liq"), w, h);
    // AR filter: the sticker is drawn last, on the edited face (its makeup preset / distortions included)
    const rt = fe.sticker != null ? stickerRuntime(fe.sticker) : null;
    if (rt && warped.length) {
      rt.update(warped, 0);
      const out = this.stickerPipe().run(cur, w, h, { faces: warped, space: "view", stickers: [rt], now: STILL_MS }, IDENTITY_MAPPING);
      if (out !== cur) cur = this.keep(out, w, h);
    }
    this.pass(this.copy, cur, null, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return this.canvas;
  }

  private stickerPipe(): FacePipeline { return (this.pipe ??= new FacePipeline(this.gl)); }
  /** Loads an AR filter sticker's resources into this stage (frames, makeup textures). */
  preloadSticker(id: number | null | undefined): Promise<void> {
    const rt = stickerRuntime(id);
    return rt ? this.stickerPipe().preloadSticker(rt).catch(() => undefined) : Promise.resolve();
  }

  dispose() {
    this.pipe?.dispose();
    this.warp.dispose();
    this.makeup.dispose();
    this.targets.dispose();
    this.stream.dispose();
    this.images.dispose();
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

let preview: FaceStage | null = null;
let previewFailed = false;
function previewStage() {
  if (!preview && !previewFailed) {
    try { preview = new FaceStage(); } catch { previewFailed = true; }
  }
  return preview;
}

/** Urls the edits need (textures / LUTs), for preloading. */
export function faceEditUrls(fe: FaceEdit | undefined): string[] {
  if (!fe) return [];
  const urls = new Set<string>();
  for (const v of Object.values(fe.f)) for (const u of layerUrls(faceParams(v).makeup.layers ?? [])) urls.add(u);
  return [...urls];
}

/** Loads everything the edits need into the preview stage (textures, sticker art). */
export async function ensureFaceAssets(fe: FaceEdit | undefined): Promise<void> {
  const st = previewStage();
  await Promise.all([st ? st.images.preload(faceEditUrls(fe)) : undefined, st && fe?.sticker != null ? st.preloadSticker(fe.sticker) : undefined]);
}

/** AR filter: loads a sticker's resources into the preview stage (resolves when it can be drawn). */
export function preloadStickerPreview(id: number): Promise<void> {
  return previewStage()?.preloadSticker(id) ?? Promise.resolve();
}

/**
 * Preview hook for pipeline.ts: returns the face-edited preview source, or `src` when nothing applies or the base
 * has not been analysed yet (pages detect on open, so the data is ready before any value can be set).
 */
export function faceStageSource(base: HTMLCanvasElement | null, src: HTMLCanvasElement, fe: FaceEdit | undefined): HTMLCanvasElement {
  if (!base || !fe || !faceEditActive(fe)) return src;
  const det = detected.get(base);
  const st = previewStage();
  if (!st) return src;
  try {
    return st.render(src, fe, det?.faces ?? [], posed.get(base)?.pose ?? null);
  } catch (e) {
    console.error("face stage failed", e);
    return src;
  }
}

/** Export hook for pipeline.ts: full-resolution face stage (fresh GL context, every asset awaited). */
export async function exportFaceStage(base: HTMLCanvasElement, src: HTMLCanvasElement, fe: FaceEdit | undefined): Promise<{ canvas: HTMLCanvasElement; dispose: () => void } | null> {
  if (!fe || !faceEditActive(fe)) return null;
  const det = await detectFaces(base);
  const pose = fe.body && nonZero(fe.body) ? (await detectPose(base)).pose : null;
  let st: FaceStage;
  try { st = new FaceStage(); } catch { return null; }
  await Promise.all([st.images.preload(faceEditUrls(fe)), st.preloadSticker(fe.sticker)]);
  const canvas = st.render(src, fe, det.faces, pose);
  return { canvas, dispose: () => st.dispose() };
}
