// AR sticker runtime: face-anchored 2D / 3D sprite items (sequence or sprite-sheet animation), expression triggers,
// face-mask textures on the face mesh UVs, iris tints, segmentation-based background / hair replacement, a
// procedural head occluder, and per-sticker reshape / makeup presets.
// JSON format: see STICKER_FORMAT.md.

import { CANONICAL_UV } from "./meshdata";
import { toPixels, type FaceData, type Vec2, type ViewMapping } from "./landmarks";
import { expressions } from "./tracker";
import { headBasis3, type ShapeWeights, type WarpOp, type WarpParams } from "./warp";
import { FaceMakeup, frontFacingTris, type MakeupLayer, type MakeupParams } from "./makeup";
import { BLEND_GLSL, COPY_FRAG, COPY_VERT, FULLSCREEN, ImageCache, Stream, Targets, blendCode, compile, hexToRgb, type Prog } from "./gl";

export type StickerDrawType =
  | "FACE" | "FACE_3D" | "FACE_MASK" | "FACE_SKIN" | "COLOR_LENS" | "BACKGROUND" | "SEGMENTATION" | "FACE_DISTORTION" | "BUILT_IN"
  /**
   * Head occluder: not drawn; renders a procedural head volume to depth so FACE_3D items behind the head
   * (translateZ < 0: hats, halos, ears, collars) are hidden by it as the head turns.
   */
  | "OCCLUDER";

export type StickerTrigger =
  | "ALWAYS" | "FACE_DETECT" | "ALL_FACE_GONE" | "TWO_MORE_FACE_DETECT"
  | "MOUTH_OPEN" | "MOUTH_CLOSE" | "EYE_BLINK" | "KISS" | "BROW_JUMP" | "SMILE"
  | "MOUTH_OPEN_BEGIN" | "EYE_BLINK_BEGIN" | "KISS_BEGIN" | "PITCH_BEGIN" | "BROW_JUMP_BEGIN"
  | "EXCLUSIVE_MOUTH_OPEN_BEGIN" | "EXCLUSIVE_EYE_BLINK" | "EXCLUSIVE_KISS" | "EXCLUSIVE_PITCH_BEGIN" | "EXCLUSIVE_BROW_JUMP_BEGIN"
  | "DISAPPEAR_MOUTH_OPEN_BEGIN" | "DISAPPEAR_EYE_BLINK" | "DISAPPEAR_KISS" | "DISAPPEAR_PITCH_BEGIN" | "DISAPPEAR_BROW_JUMP_BEGIN"
  | "TOUCH_TAP" | "TOUCH_TAP_BEGIN";

export type FaceLocation =
  | "FACE" | "FACE_CENTER" | "EYES_CENTER" | "EYE_LEFT" | "EYE_RIGHT" | "NOSE" | "NOSE_B" | "NOSE_L" | "NOSE_R"
  | "MOUTH" | "MOUTH_T" | "MOUTH_B" | "CHIN" | "EYEBROW_L" | "EYEBROW_R" | "EAR_LEFT" | "EAR_RIGHT"
  | "FOREHEAD_LEFT" | "FOREHEAD_CENTER" | "FOREHEAD_RIGHT" | "HEAD_TOP";

export type AnchorType = "CENTER" | "LEFT" | "RIGHT" | "TOP" | "BOTTOM" | "LEFT_TOP" | "LEFT_BOTTOM" | "RIGHT_TOP" | "RIGHT_BOTTOM";

export interface StickerItemDef {
  id: string;
  drawType: StickerDrawType;
  triggerType?: StickerTrigger;
  /** Anchor landmark group (FACE / FACE_3D). Left/right are screen sides of the displayed (mirrored) image. */
  faceLocationType?: FaceLocation;
  /** Which point of the image sits on the anchor. Default CENTER. */
  anchorType?: AnchorType;
  /** Offset from the anchor in eye-distance units, face frame (x toward screen right, y toward chin, z toward camera). */
  translateX?: number;
  translateY?: number;
  translateZ?: number;
  /** Item width in eye-distance units (FACE / FACE_3D). Default 2. */
  scale?: number;
  /** Extra in-plane rotation, degrees. */
  rotateZ?: number;
  /** VARIANT (default): follows head roll. INVARIANT: stays upright. */
  rotationMode?: "VARIANT" | "INVARIANT";
  /** 0..1, default 1. */
  alpha?: number;
  /** Blend mode name (see blendCode): NORMAL (default), MULTIPLY, SCREEN, ... */
  blendType?: string;
  flipHorizontally?: boolean;
  /** -1 (default) = every face, else the n-th tracked face. */
  faceIdx?: number;
  /** IMAGE (single file), SEQUENCE (one file per frame) or SPRITE (sheet). */
  resourceType?: "IMAGE" | "SEQUENCE" | "SPRITE";
  /** File (IMAGE / SPRITE) relative to the sticker basePath. */
  resourceName?: string;
  /** SEQUENCE: explicit frame list, or a printf-like pattern "fire/fire_%03d.png" with frameCount / frameStart. */
  frames?: string[];
  framePattern?: string;
  frameStart?: number;
  frameCount?: number;
  /** SPRITE sheet grid. */
  columnCount?: number;
  rowCount?: number;
  /** Default 24. */
  fps?: number;
  /** Loops of the animation per trigger. 0 = loop forever (default for continuous triggers). */
  repeatCount?: number;
  /** BACKGROUND / SEGMENTATION: which mask region receives the image (or `color`). */
  segmentation?: { target: "background" | "person" | "hair" | "skin"; color?: string; feather?: number };
  /** COLOR_LENS without a resource: procedural iris tint colour (#rrggbb) and pattern (ring | starburst | solid). */
  color?: string;
  pattern?: string;
  /** Local deformations applied while the item is on (FACE_DISTORTION / BUILT_IN items, or any item). */
  warp?: WarpOp[];
  /** Weight for `warp` (default 1). */
  warpWeight?: number;
}

export interface StickerDef {
  stickerId: number | string;
  name?: string;
  /** URL prefix for resources, e.g. "/stickers/300749/". */
  basePath: string;
  items: StickerItemDef[];
  /** Reshape applied while the sticker is on (parametric warp values and per-side weights). */
  shape?: Partial<WarpParams>;
  shapeSides?: ShapeWeights;
  /** Makeup preset applied with the sticker (e.g. the "Glam" combo). Layers are added after the user's makeup. */
  makeup?: MakeupParams;
}

const LOC: Record<string, number[]> = {
  // anchor landmarks (MediaPipe face mesh indices)
  FACE: [168], FACE_CENTER: [197], EYES_CENTER: [168], NOSE: [1], NOSE_B: [2],
  MOUTH: [78, 308, 61, 291], MOUTH_T: [0], MOUTH_B: [17], CHIN: [152],
};
/** Screen-sided pairs: [subject-right landmarks, subject-left landmarks]. */
const SIDED: Record<string, [number[], number[]]> = {
  EYE: [[33, 133, 159, 145], [263, 362, 386, 374]],
  EYEBROW: [[105], [334]],
  NOSE: [[98], [327]],
  FOREHEAD: [[54], [284]],
  EAR: [[234], [454]],
};
const ANCHOR: Record<AnchorType, Vec2> = {
  CENTER: [0.5, 0.5], LEFT: [0, 0.5], RIGHT: [1, 0.5], TOP: [0.5, 0], BOTTOM: [0.5, 1],
  LEFT_TOP: [0, 0], LEFT_BOTTOM: [0, 1], RIGHT_TOP: [1, 0], RIGHT_BOTTOM: [1, 1],
};

type V3 = [number, number, number];
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm3 = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** 3D face basis in view pixels (x toward screen right, y toward chin, z toward camera) + scale. */
export function faceBasis(px: Float32Array) {
  const v = (i: number): V3 => [px[i * 3], px[i * 3 + 1], px[i * 3 + 2]];
  let X = sub3(v(263), v(33));
  if (X[0] < 0) X = [-X[0], -X[1], -X[2]];
  const eyeDist = Math.hypot(X[0], X[1], X[2]);
  X = norm3(X);
  let Y = sub3(v(152), v(168));
  Y = norm3(sub3(Y, X.map((x) => x * dot3(Y, X)) as V3));
  // MediaPipe z is negative toward the camera: Z = X x Y points away from the screen in a y-down frame; flip
  const Z = cross3(X, Y).map((x) => -x) as V3;
  return { X, Y, Z, eyeDist };
}

/** Anchor point (view px, with z) for a face location. */
export function anchorPoint(px: Float32Array, loc: FaceLocation = "FACE"): V3 {
  const avg = (ids: number[]): V3 => {
    const s: V3 = [0, 0, 0];
    for (const i of ids) { s[0] += px[i * 3]; s[1] += px[i * 3 + 1]; s[2] += px[i * 3 + 2]; }
    return [s[0] / ids.length, s[1] / ids.length, s[2] / ids.length];
  };
  const m = /^(EYE|EYEBROW|NOSE|FOREHEAD|EAR)_(LEFT|RIGHT|L|R)$/.exec(loc);
  if (m) {
    const [a, b] = SIDED[m[1]];
    const pa = avg(a), pb = avg(b);
    const wantLeft = m[2].startsWith("L");
    let p = (pa[0] < pb[0]) === wantLeft ? pa : pb;
    if (m[1] === "EAR") { const n = avg([1]); p = [n[0] + (p[0] - n[0]) * 1.12, n[1] + (p[1] - n[1]) * 1.12, p[2]]; }
    if (m[1] === "FOREHEAD") { const c = avg([168]), t = avg([10]); p = [p[0] + (t[0] - c[0]) * 0.15, p[1] + (t[1] - c[1]) * 0.15, p[2]]; }
    return p;
  }
  if (loc === "FOREHEAD_CENTER" || loc === "HEAD_TOP") {
    const t = avg([10]), c = avg([168]), k = loc === "HEAD_TOP" ? 0.5 : 0.15;
    return [t[0] + (t[0] - c[0]) * k, t[1] + (t[1] - c[1]) * k, t[2]];
  }
  return avg(LOC[loc] ?? LOC.FACE);
}

// ---------- head occluder ----------
/** Procedural head volume: an ellipsoid (unit sphere scaled per axis), latitude / longitude grid. */
const HEAD_MESH = (() => {
  const LAT = 14, LON = 24, pos: number[] = [], tris: number[] = [];
  for (let i = 0; i <= LAT; i++) {
    const th = (i / LAT) * Math.PI;
    for (let j = 0; j < LON; j++) {
      const ph = (j / LON) * Math.PI * 2;
      pos.push(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
    }
  }
  for (let i = 0; i < LAT; i++) for (let j = 0; j < LON; j++) {
    const a = i * LON + j, b = i * LON + ((j + 1) % LON), c = a + LON, d = b + LON;
    tris.push(a, c, b, b, c, d);
  }
  return { pos: new Float32Array(pos), tris: new Uint16Array(tris) };
})();
/**
 * Head occluder vertices for one face in view px (x, y, z): an ellipsoid sized from the eye distance, centred behind
 * the face (between the ears, above the eyes), oriented with the head pose and pushed back `inset` IOD so props on
 * the face itself are never hidden.
 */
export function headOccluderVertices(px: Float32Array, inset = 0.15): Float32Array {
  const B = headBasis3(px);
  const v = (i: number) => [px[i * 3], px[i * 3 + 1], px[i * 3 + 2]];
  const mid = (a: number, b: number) => { const p = v(a), q = v(b); return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2]; };
  const R = mid(33, 133), L = mid(263, 362);
  const iod = Math.hypot(L[0] - R[0], L[1] - R[1], L[2] - R[2]);
  const eyes = mid(33, 263);
  // centre: 0.35 IOD above the eye line, 1.2 IOD behind the face surface
  const C = [0, 1, 2].map((k) => eyes[k] - B.Y[k] * 0.35 * iod - B.Z[k] * (1.2 + inset) * iod);
  const ax = 1.45 * iod, ay = 1.9 * iod, az = 1.5 * iod; // half widths: ear to ear, chin to crown, front to back
  const P = HEAD_MESH.pos, out = new Float32Array(P.length);
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) out[i + k] = C[k] + B.X[k] * P[i] * ax - B.Y[k] * P[i + 1] * ay + B.Z[k] * P[i + 2] * az;
  return out;
}

interface ItemState { active: boolean; start: number; prev: boolean; done: boolean; prevPitch?: number }

const BEGIN_RE = /_BEGIN$|^EXCLUSIVE_EYE_BLINK$|^EXCLUSIVE_KISS$/;

/** Runtime for one sticker: trigger state + animation clocks per (item, face). */
export class StickerRuntime {
  private states = new Map<string, ItemState>();
  private tapAt = -1;
  constructor(readonly def: StickerDef) {}

  /** WarpOps of the items that carry `warp` (scaled by `warpWeight`). */
  distortionOps(): WarpOp[] {
    const out: WarpOp[] = [];
    for (const it of this.def.items) {
      const k = it.warpWeight ?? 1;
      for (const op of it.warp ?? []) out.push(k === 1 ? op : { ...op, weight: (op.weight ?? 1) * k });
    }
    return out;
  }

  /** Call on a screen tap (TOUCH_TAP triggers). */
  tap(now = performance.now()) { this.tapAt = now; }
  /** Restart all animations. */
  reset() { this.states.clear(); }

  frameUrls(it: StickerItemDef): string[] {
    const base = this.def.basePath.endsWith("/") || !this.def.basePath ? this.def.basePath : this.def.basePath + "/";
    if (it.resourceType === "SEQUENCE") {
      if (it.frames?.length) return it.frames.map((f) => base + f);
      if (it.framePattern && it.frameCount) {
        const s = it.frameStart ?? 0;
        return Array.from({ length: it.frameCount }, (_, i) => base + it.framePattern!.replace(/%0?(\d*)d/, (_m, w: string) => String(i + s).padStart(Number(w || 0), "0")));
      }
    }
    return it.resourceName ? [base + it.resourceName] : [];
  }

  private condition(trig: string, f: FaceData | undefined, faces: FaceData[], st: ItemState, now: number): boolean {
    if (trig === "ALWAYS") return true;
    if (trig === "ALL_FACE_GONE") return faces.length === 0;
    if (trig === "TWO_MORE_FACE_DETECT") return faces.length >= 2;
    if (trig.startsWith("TOUCH_TAP")) return this.tapAt >= 0 && now - this.tapAt < 200;
    if (!f) return false;
    const e = expressions(f);
    const core = trig.replace(/^(EXCLUSIVE_|DISAPPEAR_)/, "").replace(/_BEGIN$/, "");
    switch (core) {
      case "FACE_DETECT": return true;
      case "MOUTH_OPEN": return e.mouthOpen;
      case "MOUTH_CLOSE": return !e.mouthOpen;
      case "EYE_BLINK": return e.eyeBlink;
      case "KISS": return e.kiss;
      case "BROW_JUMP": return e.browRaise;
      case "SMILE": return e.smile;
      case "PITCH": {
        const p = f.pose.pitch, prev = st.prevPitch ?? p;
        st.prevPitch = prev * 0.8 + p * 0.2;
        return Math.abs(p - prev) > 0.12;
      }
    }
    return true;
  }

  /**
   * Resolves which items are visible on which faces and the frame to show.
   * Returns draw entries { item, face (or undefined for screen items), frame }.
   */
  update(faces: FaceData[], now = performance.now()) {
    const out: { item: StickerItemDef; face?: FaceData; frame: number }[] = [];
    for (const it of this.def.items) {
      const trig = it.triggerType ?? (it.drawType === "BACKGROUND" || it.drawType === "SEGMENTATION" ? "ALWAYS" : "FACE_DETECT");
      const perFace = it.drawType !== "BACKGROUND" && it.drawType !== "SEGMENTATION";
      const targets: (FaceData | undefined)[] = perFace ? (it.faceIdx !== undefined && it.faceIdx >= 0 ? (faces[it.faceIdx] ? [faces[it.faceIdx]] : []) : faces) : [faces[0]];
      for (const f of targets) {
        const key = `${it.id}:${perFace ? f?.id ?? 0 : 0}`;
        let st = this.states.get(key);
        if (!st) { st = { active: false, start: now, prev: false, done: false }; this.states.set(key, st); }
        const cond = this.condition(trig, f, faces, st, now);
        const fps = it.fps ?? 24;
        const count = Math.max(1, it.resourceType === "SPRITE" ? it.frameCount ?? (it.columnCount ?? 1) * (it.rowCount ?? 1) : it.resourceType === "SEQUENCE" ? it.frameCount ?? it.frames?.length ?? 1 : 1);
        const rising = cond && !st.prev;
        st.prev = cond;
        let visible: boolean;
        if (trig.startsWith("DISAPPEAR_")) {
          if (rising) { st.done = true; st.start = now; }
          visible = !st.done;
        } else if (BEGIN_RE.test(trig)) {
          if (rising) { st.active = true; st.start = now; }
          const reps = it.repeatCount ?? 1;
          if (st.active && reps > 0 && (now - st.start) * fps / 1000 >= count * reps) st.active = false;
          visible = st.active;
        } else {
          if (rising) st.start = now;
          visible = cond;
        }
        if (!visible) continue;
        const reps = BEGIN_RE.test(trig) ? it.repeatCount ?? 1 : it.repeatCount ?? 0;
        let frame = Math.floor(((now - st.start) * fps) / 1000);
        frame = reps > 0 && frame >= count * reps ? count - 1 : frame % count;
        out.push({ item: it, face: perFace ? f : undefined, frame });
      }
    }
    return out;
  }
}

// ---------- GL ----------
const SPRITE_VERT = `
attribute vec3 position;
attribute vec2 texCoord;
attribute float alpha;
uniform highp vec2 res;
uniform highp float zScale;
varying vec2 vTc;
varying float vA;
void main() {
  vTc = texCoord; vA = alpha;
  gl_Position = vec4(position.x / res.x * 2.0 - 1.0, 1.0 - position.y / res.y * 2.0, clamp(position.z * zScale, -0.99, 0.99), 1.0);
}`;
const DEPTH_FRAG = `
precision mediump float;
void main() { gl_FragColor = vec4(0.0); }`;
const SPRITE_FRAG = `
precision mediump float;
varying vec2 vTc;
varying float vA;
uniform sampler2D base;
uniform sampler2D tex;
uniform highp vec2 res;
uniform int mode;
uniform float opacity;
${BLEND_GLSL}
void main() {
  vec4 t = texture2D(tex, vTc);
  vec3 b = texture2D(base, gl_FragCoord.xy / res).rgb;
  gl_FragColor = vec4(blendMode(b, t.rgb, mode), t.a * vA * opacity);
}`;
const BG_FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D tex;
uniform sampler2D bg;
uniform sampler2D mask;
uniform vec4 map;      // sx, sy, mirror, unused
uniform vec4 bgFit;    // cover scale for the bg image: sx, sy
uniform int channel;   // 0 background, 1 person, 2 hair, 3 skin
uniform vec3 color;
uniform float useColor;
uniform float opacity;
${BLEND_GLSL}
void main() {
  vec4 base = texture2D(tex, vUv);
  vec2 view = vec2(vUv.x, 1.0 - vUv.y);
  float u = (view.x - 0.5) / map.x + 0.5;
  if (map.z > 0.5) u = 1.0 - u;
  vec2 src = vec2(u, (view.y - 0.5) / map.y + 0.5);
  vec4 m = texture2D(mask, src);
  float k = channel == 0 ? 1.0 - m.r : channel == 1 ? m.r : channel == 2 ? m.g : m.b;
  k = smoothstep(0.3, 0.7, k) * opacity;
  vec3 over;
  if (useColor > 0.5) over = channel == 2 ? setLum(color, lumOf(base.rgb) * 0.8 + lumOf(color) * 0.2) : color;
  else over = texture2D(bg, (view - 0.5) / bgFit.xy + 0.5).rgb;
  gl_FragColor = vec4(mix(base.rgb, over, k), base.a);
}`;

/** Draws sticker items. Owns its FBOs; shares an ImageCache (pass the pipeline's). */
export class StickerRenderer {
  private sprite: Prog;
  private depth: Prog;
  private bgProg: Prog;
  private copy: Prog;
  private lens?: FaceMakeup;
  private stream: Stream;
  private targets: Targets;
  readonly images: ImageCache;

  constructor(readonly gl: WebGLRenderingContext, images?: ImageCache) {
    this.sprite = compile(gl, SPRITE_VERT, SPRITE_FRAG, ["base", "tex", "res", "mode", "opacity", "zScale"], ["position", "texCoord", "alpha"]);
    this.depth = compile(gl, SPRITE_VERT, DEPTH_FRAG, ["res", "zScale"], ["position", "texCoord", "alpha"]);
    this.bgProg = compile(gl, COPY_VERT, BG_FRAG, ["tex", "bg", "mask", "map", "bgFit", "channel", "color", "useColor", "opacity"], ["position"]);
    this.copy = compile(gl, COPY_VERT, COPY_FRAG, ["tex"], ["position"]);
    this.stream = new Stream(gl);
    this.targets = new Targets(gl);
    this.images = images ?? new ImageCache(gl);
  }

  /** Preloads every resource of a sticker (resolves when loaded). */
  preload(rt: StickerRuntime): Promise<void> {
    return this.images.preload(rt.def.items.filter((it) => it.drawType !== "OCCLUDER").flatMap((it) => rt.frameUrls(it)));
  }

  private blit(input: WebGLTexture, fb: WebGLFramebuffer, w: number, h: number) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.useProgram(this.copy.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(this.copy.u.tex, 0);
    this.stream.draw(FULLSCREEN, [[this.copy.a.position, 2]]);
  }

  /** Quad corners (view px) for a FACE / FACE_3D item. */
  static quad(it: StickerItemDef, face: FaceData, w: number, h: number, aspect: number): Vec2[] {
    return StickerRenderer.quad3(it, face, w, h, aspect).map((p) => [p[0], p[1]] as Vec2);
  }

  /** Quad corners with depth (view px; z like the landmarks: smaller = nearer the camera). */
  static quad3(it: StickerItemDef, face: FaceData, w: number, h: number, aspect: number): V3[] {
    const px = toPixels(face, w, h);
    const { X, Y, Z, eyeDist } = faceBasis(px);
    const A = anchorPoint(px, it.faceLocationType ?? "FACE");
    const flat = it.drawType !== "FACE_3D";
    // 2D items use the in-plane basis only (roll), 3D items the full rotation (orthographic projection)
    let ex: V3 = X, ey: V3 = Y;
    if (flat) {
      const l = Math.hypot(X[0], X[1]) || 1;
      ex = [X[0] / l, X[1] / l, 0]; ey = [-ex[1], ex[0], 0];
    }
    if (it.rotationMode === "INVARIANT") { ex = [1, 0, 0]; ey = [0, 1, 0]; }
    const rz = ((it.rotateZ ?? 0) * Math.PI) / 180;
    if (rz) {
      const c = Math.cos(rz), s = Math.sin(rz);
      const nx: V3 = [ex[0] * c + ey[0] * s, ex[1] * c + ey[1] * s, ex[2] * c + ey[2] * s];
      const ny: V3 = [-ex[0] * s + ey[0] * c, -ex[1] * s + ey[1] * c, -ex[2] * s + ey[2] * c];
      ex = nx; ey = ny;
    }
    const W = (it.scale ?? 2) * eyeDist, H = W / aspect;
    const [ax, ay] = ANCHOR[it.anchorType ?? "CENTER"];
    const tx = (it.translateX ?? 0) * eyeDist, ty = (it.translateY ?? 0) * eyeDist, tz = (it.translateZ ?? 0) * eyeDist;
    const o: V3 = [A[0] + ex[0] * tx + ey[0] * ty + Z[0] * tz, A[1] + ex[1] * tx + ey[1] * ty + Z[1] * tz, A[2] + ex[2] * tx + ey[2] * ty + Z[2] * tz];
    const corner = (u: number, v: number): V3 => {
      const dx = (u - ax) * W, dy = (v - ay) * H;
      return [o[0] + ex[0] * dx + ey[0] * dy, o[1] + ex[1] * dx + ey[1] * dy, o[2] + ex[2] * dx + ey[2] * dy];
    };
    return [corner(0, 0), corner(1, 0), corner(0, 1), corner(1, 1)];
  }

  /**
   * Renders the visible items onto `input`. faces are in view space; `masks` is the uploaded segmentation texture
   * (source space) and `mapping` maps source -> view (for BACKGROUND / SEGMENTATION items).
   * Returns a texture owned by this object, or `input` when nothing was drawn.
   */
  render(input: WebGLTexture, w: number, h: number, rt: StickerRuntime, faces: FaceData[], masks: WebGLTexture | null, mapping: ViewMapping, now = performance.now()): WebGLTexture {
    const gl = this.gl;
    const entries = rt.update(faces, now);
    if (!entries.length) return input;
    let src = input, flip = 0;
    const next = () => this.targets.get(flip++ % 2 ? "b" : "a", w, h);
    const urlFor = (it: StickerItemDef, frame: number) => {
      const urls = rt.frameUrls(it);
      if (it.resourceType === "SEQUENCE") {
        // show the newest frame that has loaded so far (progressive loading)
        for (let f = frame; f >= 0; f--) if (this.images.get(urls[f])) return urls[f];
        return undefined;
      }
      return urls[0];
    };

    // 1) background / segmentation items
    for (const e of entries.filter((x) => x.item.drawType === "BACKGROUND" || x.item.drawType === "SEGMENTATION")) {
      const seg = e.item.segmentation ?? { target: "background" as const };
      if (!masks) continue;
      const url = seg.color ? undefined : urlFor(e.item, e.frame);
      const img = url ? this.images.get(url) : undefined;
      if (!seg.color && !img) continue;
      const t = next();
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
      gl.viewport(0, 0, w, h);
      gl.disable(gl.BLEND);
      const p = this.bgProg;
      gl.useProgram(p.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src); gl.uniform1i(p.u.tex, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, img?.tex ?? src); gl.uniform1i(p.u.bg, 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, masks); gl.uniform1i(p.u.mask, 2);
      gl.uniform4f(p.u.map, mapping.sx, mapping.sy, mapping.mirror ? 1 : 0, 0);
      const ia = img ? img.w / img.h : 1, va = w / h;
      gl.uniform4f(p.u.bgFit, ia > va ? ia / va : 1, ia > va ? 1 : va / ia, 0, 0);
      gl.uniform1i(p.u.channel, { background: 0, person: 1, hair: 2, skin: 3 }[seg.target]);
      const col = hexToRgb(seg.color ?? "#000000");
      gl.uniform3f(p.u.color, col[0], col[1], col[2]);
      gl.uniform1f(p.u.useColor, seg.color ? 1 : 0);
      gl.uniform1f(p.u.opacity, e.item.alpha ?? 1);
      this.stream.draw(FULLSCREEN, [[p.a.position, 2]]);
      src = t.tex;
    }

    // 2) colour lenses (iris disc, clipped by the eye opening), one makeup lens layer per item
    const lensEntries = entries.filter((x) => x.face && x.item.drawType === "COLOR_LENS");
    if (lensEntries.length) {
      this.lens ??= new FaceMakeup(gl, this.images);
      const byFace = new Map<FaceData, MakeupLayer[]>();
      for (const e of lensEntries) {
        const url = urlFor(e.item, e.frame);
        const ls = byFace.get(e.face!) ?? [];
        if (url) ls.push({ region: "lens", opacity: e.item.alpha ?? 1, blend: e.item.blendType, texture: { url, mapping: { kind: "region" }, mode: "rgba" } });
        else if (e.item.color) ls.push({ region: "lens", opacity: e.item.alpha ?? 1, blend: e.item.blendType, color: e.item.color, style: e.item.pattern });
        else continue;
        byFace.set(e.face!, ls);
      }
      for (const [f, layers] of byFace) src = this.lens.apply(src, w, h, [f], { layers });
    }

    // 3) face-mask / face-skin + sprites, alpha-blended onto one target (base sampled from the pre-sticker image)
    const faceEntries = entries.filter((x) => x.face && (x.item.drawType === "FACE" || x.item.drawType === "FACE_3D" || x.item.drawType === "FACE_MASK" || x.item.drawType === "FACE_SKIN"));
    if (!faceEntries.length) return src;
    const occFaces = new Set(entries.filter((x) => x.face && x.item.drawType === "OCCLUDER").map((x) => x.face!));
    const useDepth = occFaces.size > 0 && faceEntries.some((x) => x.item.drawType === "FACE_3D");
    const t = useDepth ? this.targets.get("occ", w, h, true) : next();
    this.blit(src, t.fb, w, h);
    const zScale = 1 / (w + h);
    if (useDepth) {
      gl.clearDepth(1);
      gl.clear(gl.DEPTH_BUFFER_BIT);
    }
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const p = this.sprite;
    gl.useProgram(p.p);
    gl.uniform2f(p.u.res, w, h);
    gl.uniform1f(p.u.zScale, zScale);
    let occDrawn = false;
    const drawOccluders = () => {
      occDrawn = true;
      const d = this.depth;
      gl.useProgram(d.p);
      gl.uniform2f(d.u.res, w, h);
      gl.uniform1f(d.u.zScale, zScale);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true);
      // Depth-only by output, not by colorMask: alpha 0 under the active SRC_ALPHA blend leaves the colour untouched.
      // (With colorMask(false) some backends - ANGLE/SwiftShader - skip the depth writes too.)
      for (const f of occFaces) {
        const vtx = headOccluderVertices(toPixels(f, w, h));
        const data = new Float32Array((vtx.length / 3) * 6);
        for (let i = 0; i < vtx.length / 3; i++) data.set([vtx[i * 3], vtx[i * 3 + 1], vtx[i * 3 + 2], 0, 0, 1], i * 6);
        this.stream.draw(data, [[d.a.position, 3], [d.a.texCoord, 2], [d.a.alpha, 1]], HEAD_MESH.tris);
      }
      gl.depthMask(false);
      gl.useProgram(p.p);
    };
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src); gl.uniform1i(p.u.base, 0);
    // face masks under sprites
    const isSkin = (x: { item: StickerItemDef }) => x.item.drawType === "FACE_MASK" || x.item.drawType === "FACE_SKIN";
    const ordered = [...faceEntries.filter(isSkin), ...faceEntries.filter((x) => !isSkin(x))];
    for (const e of ordered) {
      const it = e.item, face = e.face!;
      const url = urlFor(it, e.frame);
      const img = url ? this.images.get(url) : undefined;
      if (!img) continue;
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, img.tex); gl.uniform1i(p.u.tex, 1);
      gl.uniform1i(p.u.mode, blendCode(it.blendType));
      gl.uniform1f(p.u.opacity, it.alpha ?? 1);
      if (isSkin(e)) {
        const uvs = CANONICAL_UV;
        const flip = it.flipHorizontally;
        const tris = frontFacingTris((i) => [face.points[i * 3] * w, face.points[i * 3 + 1] * h]);
        const data6 = new Float32Array(tris.length * 6);
        tris.forEach((i, k) => {
          data6.set([face.points[i * 3] * w, face.points[i * 3 + 1] * h, 0, flip ? 1 - uvs[i * 2] : uvs[i * 2], uvs[i * 2 + 1], 1], k * 6);
        });
        this.stream.draw(data6, [[p.a.position, 3], [p.a.texCoord, 2], [p.a.alpha, 1]]);
        continue;
      }
      // sprite sheet cell
      let u0 = 0, v0 = 0, u1 = 1, v1 = 1, fw = img.w, fh = img.h;
      if (it.resourceType === "SPRITE") {
        const cols = it.columnCount ?? 1, rows = it.rowCount ?? 1;
        const c = e.frame % cols, r = Math.floor(e.frame / cols) % rows;
        u0 = c / cols; u1 = (c + 1) / cols; v0 = r / rows; v1 = (r + 1) / rows;
        fw = img.w / cols; fh = img.h / rows;
      }
      if (it.flipHorizontally) [u0, u1] = [u1, u0];
      const is3d = it.drawType === "FACE_3D";
      if (is3d && useDepth && !occDrawn) drawOccluders();
      if (is3d && useDepth) { gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(false); }
      else gl.disable(gl.DEPTH_TEST);
      const q = StickerRenderer.quad3(it, face, w, h, fw / fh);
      if (!is3d) for (const c of q) c[2] = 0;
      const d = new Float32Array([
        ...q[0], u0, v0, 1, ...q[1], u1, v0, 1, ...q[2], u0, v1, 1,
        ...q[2], u0, v1, 1, ...q[1], u1, v0, 1, ...q[3], u1, v1, 1,
      ]);
      this.stream.draw(d, [[p.a.position, 3], [p.a.texCoord, 2], [p.a.alpha, 1]]);
    }
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    return t.tex;
  }

  dispose() {
    this.targets.dispose();
    this.stream.dispose();
    for (const p of [this.sprite, this.depth, this.bgProg, this.copy]) this.gl.deleteProgram(p.p);
    this.lens?.dispose();
  }
}

/** Parses / normalizes sticker JSON (see STICKER_FORMAT.md). Resource names resolve against `basePath`. */
export function parseSticker(json: unknown, basePath: string): StickerDef {
  const r = json as { stickerId?: number | string; id?: number | string; name?: unknown; items?: StickerItemDef[]; shape?: Partial<WarpParams>; shapeSides?: ShapeWeights; makeup?: MakeupParams };
  const name = typeof r.name === "string" ? r.name : undefined;
  return {
    stickerId: r.stickerId ?? r.id ?? 0, name, basePath, shape: r.shape, shapeSides: r.shapeSides, makeup: r.makeup,
    items: (r.items ?? []).map((it, i) => ({ ...it, id: String(it.id ?? i) })),
  };
}
