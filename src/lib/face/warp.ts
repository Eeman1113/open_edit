// Face reshape: a triangulated mesh (MediaPipe face tessellation + eye / mouth fills + 5 outer rings for falloff).
// Vertices are displaced by smooth deformation fields built from named parameters over the MediaPipe landmarks; the
// image is drawn through the mesh with texcoords = original positions and positions = displaced positions (forward
// warp, no holes because the outermost ring is pinned and a full-frame copy is drawn underneath).
// Everything is parametric: no per-landmark offset tables. A fold guard and a soft displacement limit keep strong
// settings and turned faces from tearing.
//
// Also: a liquify brush field (push / restore) for the editor's manual Reshape tool.

import { FACE_TRIS } from "./meshdata";
import { IDX, faceFrame, toPixels, type FaceData, type FaceFrame, type Vec2 } from "./landmarks";
import { COPY_FRAG, COPY_VERT, FULLSCREEN, Stream, Targets, compile, type Prog } from "./gl";

/**
 * All parameters are bipolar -1..1 (0 = off); the sign convention is "positive = more of the name".
 * Unipolar sliders use 0..1.
 */
export interface WarpParams {
  /** Narrow the lower 2/3 of the face (cheeks -> jaw). */ faceSlim: number;
  /** Widen the whole face. */ faceWidth: number;
  /** V-line: narrow and lift the jaw toward the chin. */ vline: number;
  /** Narrow the jaw angles (square jaw -> soft). */ jaw: number;
  /** Lengthen the chin (negative shortens). */ chinLength: number;
  /** Narrow the cheekbones. */ cheekbone: number;
  /** Fuller / taller forehead. */ forehead: number;
  /** Fill out the temples. */ temple: number;
  /** Scale the whole head. */ headSize: number;
  /** More hair volume (the area above the forehead expands). */ hairVolume: number;
  /** Enlarge eyes (isotropic). */ eyeSize: number;
  /** Stretch eyes horizontally. */ eyeWidth: number;
  /** Stretch eyes vertically. */ eyeHeight: number;
  /** Move the eyes apart. */ eyeDistance: number;
  /** Rotate the eyes, outer corners up. */ eyeTilt: number;
  /** Move the eyes up (negative = down). */ eyePosition: number;
  /** Extend the inner corners toward the nose. */ eyeInner: number;
  /** Extend the outer corners. */ eyeOuter: number;
  /** Lower the lower lid (rounder eye). */ eyeLower: number;
  /** Enlarge the irises only. */ pupil: number;
  /** Scale the nose. */ noseSize: number;
  /** Widen the lower nose. */ noseWidth: number;
  /** Widen the nose bridge (negative = slimmer bridge). */ noseBridge: number;
  /** Narrow the nose root between the eyes (negative widens). */ noseRoot: number;
  /** Enlarge the nose tip. */ noseTip: number;
  /** Widen the nostril wings. */ noseAlar: number;
  /** Lengthen the nose (tip moves down). */ noseLength: number;
  /** Scale the mouth. */ mouthSize: number;
  /** Widen the mouth. */ mouthWidth: number;
  /** Lift the lip corners. */ smile: number;
  /** Lengthen the philtrum (mouth moves down; negative moves it up). */ philtrum: number;
  /** Thicker lips (vertical scale of the lips). */ lipThickness: number;
  /** Fuller upper lip. */ upperLip: number;
  /** Fuller lower lip. */ lowerLip: number;
  /** Sharper cupid's bow (the two peaks of the upper lip rise). */ cupidBow: number;
  /** Raise the eyebrows. */ browLift: number;
  /** Rotate the brows, outer ends up. */ browTilt: number;
  /** Move the brows apart. */ browDistance: number;
  /** Thicker brows (vertical scale). */ browThickness: number;
  /** Lift the cheeks / jaw upward. */ faceLift: number;
  /** Lengthen the lower face (negative = shorter face). */ faceRatio: number;
}

export const ZERO_WARP: WarpParams = {
  faceSlim: 0, faceWidth: 0, vline: 0, jaw: 0, chinLength: 0, cheekbone: 0, forehead: 0, temple: 0, headSize: 0, hairVolume: 0,
  eyeSize: 0, eyeWidth: 0, eyeHeight: 0, eyeDistance: 0, eyeTilt: 0, eyePosition: 0, eyeInner: 0, eyeOuter: 0, eyeLower: 0, pupil: 0,
  noseSize: 0, noseWidth: 0, noseBridge: 0, noseRoot: 0, noseTip: 0, noseAlar: 0, noseLength: 0,
  mouthSize: 0, mouthWidth: 0, smile: 0, philtrum: 0, lipThickness: 0, upperLip: 0, lowerLip: 0, cupidBow: 0,
  browLift: 0, browTilt: 0, browDistance: 0, browThickness: 0, faceLift: 0, faceRatio: 0,
};

/**
 * Per-side reshape weights: `<WarpParams key>_left` / `<WarpParams key>_right` (image side as displayed), or a plain
 * key for both sides, e.g. { faceSlim_left: 0.4, eyeSize: 0.2 }. Unknown keys are ignored.
 */
export type ShapeWeights = Record<string, number>;

/**
 * Generic local deformation (sticker effects, 3D sculpt, editor face ratio). Distances are in IOD units (3D distance
 * between the two eye centers). Directions are in the SUBJECT face frame: x from the subject's right eye toward
 * their left eye (= image right in an unmirrored frame, image left on a mirrored preview, so effects reflect
 * correctly), y toward the chin.
 */
export interface WarpOp {
  /**
   * move3d: `amount` = [dx, dy] plus `z` (toward the camera), IOD units in the 3D head frame, projected through the
   * face pose (so z moves show as parallax on turned faces) plus a perspective cue (a forward move magnifies locally).
   */
  type: "scale" | "move" | "rotate" | "move3d";
  /** Landmark index (0..477) or a list (averaged). */
  anchor: number | number[];
  /** Offset of the center from the anchor (face-frame, eye-distance units). */
  offset?: Vec2;
  /** Radii of the elliptical influence (eye-distance units). */
  rx: number;
  ry?: number;
  /** Ellipse rotation relative to the face frame (radians). */
  angle?: number;
  /** scale: [sx-1, sy-1] relative scale, e.g. [0.2, 0.2] = 20% bigger. move: [dx, dy] eye-distance units. rotate: [theta, 0] radians. */
  amount: Vec2;
  /** Multiplier applied to amount (slider value). Default 1. */
  weight?: number;
  /** move3d only: displacement toward the camera (IOD). */
  z?: number;
}

const WARP_KEYS = new Set(Object.keys(ZERO_WARP));

/** Splits per-side weights into { both, left, right } WarpParams. */
export function splitShape(shape?: ShapeWeights): { both: Partial<WarpParams>; left: Partial<WarpParams>; right: Partial<WarpParams> } {
  const out = { both: {} as Partial<WarpParams>, left: {} as Partial<WarpParams>, right: {} as Partial<WarpParams> };
  for (const [name, v] of Object.entries(shape ?? {})) {
    if (!v) continue;
    const m = /^(.*?)(?:_(left|right))?$/.exec(name)!;
    if (!WARP_KEYS.has(m[1])) continue;
    const k = m[1] as keyof WarpParams;
    const dst = m[2] === "left" ? out.left : m[2] === "right" ? out.right : out.both;
    dst[k] = (dst[k] ?? 0) + v;
  }
  return out;
}

export function warpActive(p?: Partial<WarpParams>, ops?: WarpOp[], shape?: ShapeWeights): boolean {
  if (ops && ops.some((o) => (o.weight ?? 1) !== 0)) return true;
  if (shape && Object.values(shape).some((v) => Math.abs(v) > 1e-3)) return true;
  if (!p) return false;
  return Object.values(p).some((v) => typeof v === "number" && Math.abs(v) > 1e-3);
}

/** Subject face frame used by WarpOps (pixel space). */
function subjectFrame(px: Float32Array) {
  const c = (a: number, b: number): [number, number, number] => [(px[a * 3] + px[b * 3]) / 2, (px[a * 3 + 1] + px[b * 3 + 1]) / 2, (px[a * 3 + 2] + px[b * 3 + 2]) / 2];
  const R = c(33, 133), L = c(263, 362);
  const O: Vec2 = [(R[0] + L[0]) / 2, (R[1] + L[1]) / 2];
  const iod = Math.hypot(L[0] - R[0], L[1] - R[1], L[2] - R[2]) || 1;
  const l2 = Math.hypot(L[0] - R[0], L[1] - R[1]) || 1;
  const X: Vec2 = [(L[0] - R[0]) / l2, (L[1] - R[1]) / l2];
  let Y: Vec2 = [-X[1], X[0]];
  const chin: Vec2 = [px[152 * 3] - O[0], px[152 * 3 + 1] - O[1]];
  if (Y[0] * chin[0] + Y[1] * chin[1] < 0) Y = [-Y[0], -Y[1]];
  return { O, X, Y, iod };
}

// ----- mesh topology (static) -----
// Outer rings spread the deformation smoothly into the background; a steep drop shows as a seam along the jaw.
const RING_SCALES = [1.12, 1.3, 1.55, 1.9, 2.4];
const RING_TAPER = [0.9, 0.72, 0.5, 0.25, 0];
const OVAL = IDX.faceOval;
const NO = OVAL.length;
const BASE = 478;
const VCOUNT = BASE + RING_SCALES.length * NO;

const INDICES: Uint16Array = (() => {
  const out: number[] = Array.from(FACE_TRIS);
  const fan = (center: number, loop: readonly number[]) => {
    for (let i = 0; i < loop.length; i++) out.push(center, loop[i], loop[(i + 1) % loop.length]);
  };
  fan(468, IDX.rightEye);
  fan(473, IDX.leftEye);
  const up = IDX.lipsInnerUpper, lo = IDX.lipsInnerLower;
  for (let i = 0; i < up.length - 1; i++) out.push(up[i], up[i + 1], lo[i], lo[i], up[i + 1], lo[i + 1]);
  const ringIdx = (k: number, j: number) => (k === 0 ? OVAL[j % NO] : BASE + (k - 1) * NO + (j % NO));
  for (let k = 0; k < RING_SCALES.length; k++) {
    for (let j = 0; j < NO; j++) {
      const a = ringIdx(k, j), b = ringIdx(k, j + 1), c = ringIdx(k + 1, j), d = ringIdx(k + 1, j + 1);
      out.push(a, b, c, c, b, d);
    }
  }
  return new Uint16Array(out);
})();

// ----- deformation fields -----
type Field = (x: number, y: number) => Vec2;

const sst = (e0: number, e1: number, x: number) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const fall = (t: number) => (t >= 1 ? 0 : (1 - t * t) * (1 - t * t));

/** Builds the per-face list of displacement fields (pixel space). `side` restricts them to one image side. */
function buildFields(px: Float32Array, fr: FaceFrame, p: Partial<WarpParams>, ops?: WarpOp[], side?: "left" | "right"): Field[] {
  const F: Field[] = [];
  const g = (i: number): Vec2 => [px[i * 3], px[i * 3 + 1]];
  const avg = (ids: readonly number[]): Vec2 => {
    let x = 0, y = 0;
    for (const i of ids) { x += px[i * 3]; y += px[i * 3 + 1]; }
    return [x / ids.length, y / ids.length];
  };
  const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const { ux, uy, center: C } = fr;
  const v = (k: keyof WarpParams) => Math.max(-1.5, Math.min(1.5, p[k] ?? 0));

  // face-frame normalized coordinates
  const toAB = (x: number, y: number): [number, number, number, number] => {
    const dx = x - C[0], dy = y - C[1];
    const a = dx * ux[0] + dy * ux[1], b = dx * uy[0] + dy * uy[1];
    const ha = a >= 0 ? fr.halfRight : fr.halfLeft, hb = b >= 0 ? fr.halfDown : fr.halfUp;
    return [a / ha, b / hb, ha, hb];
  };
  const fromAB = (da: number, db: number, ha: number, hb: number): Vec2 => [da * ha * ux[0] + db * hb * uy[0], da * ha * ux[1] + db * hb * uy[1]];
  /** contour envelope: grows toward the contour, fades out beyond it */
  const E = (r: number) => (r < 1 ? r * r : 1 - sst(1, 1.9, r));
  const contour = (fn: (A: number, B: number, r: number) => [number, number]): Field => (x, y) => {
    const [A, B, ha, hb] = toAB(x, y);
    const [da, db] = fn(A, B, Math.hypot(A, B));
    return fromAB(da, db, ha, hb);
  };
  const bell = (x: number, c: number, w: number) => Math.exp(-(((x - c) / w) ** 2));

  const s = {
    slim: v("faceSlim"), width: v("faceWidth"), vline: v("vline"), jaw: v("jaw"), chin: v("chinLength"), cheek: v("cheekbone"),
    forehead: v("forehead"), temple: v("temple"), hair: v("hairVolume"), lift: v("faceLift"), ratio: v("faceRatio"),
  };
  if (s.slim) F.push(contour((A, B, r) => [-A * 0.1 * s.slim * E(r) * sst(-0.35, 0.35, B), 0]));
  if (s.width) F.push(contour((A, B, r) => [A * 0.1 * s.width * E(r), 0]));
  if (s.vline) F.push(contour((A, B, r) => { const J = sst(0.15, 0.85, B) * E(r); return [-A * 0.15 * s.vline * J, -0.04 * s.vline * J * Math.min(1, Math.abs(A) * 1.5)]; }));
  if (s.jaw) F.push(contour((A, B, r) => [-A * 0.12 * s.jaw * E(r) * bell(B, 0.55, 0.3), 0]));
  if (s.chin) F.push(contour((A, B) => {
    const w = sst(0.35, 1.0, B) * (1 - sst(0.45, 0.95, Math.abs(A))) * (B > 1 ? 1 - sst(1.0, 1.7, B) : 1);
    return [0, 0.13 * s.chin * w];
  }));
  if (s.cheek) F.push(contour((A, B, r) => [-A * 0.09 * s.cheek * E(r) * bell(B, 0.05, 0.3), 0]));
  if (s.temple) F.push(contour((A, B, r) => [A * 0.07 * s.temple * E(r) * bell(B, -0.45, 0.25), 0]));
  if (s.forehead) F.push(contour((A, B, r) => {
    const w = sst(-0.25, -0.9, B) * (1 - sst(1.5, 2.1, r));
    return [A * 0.05 * s.forehead * w, -0.12 * s.forehead * w];
  }));
  if (s.hair) F.push(contour((A, B, r) => {
    const w = sst(-0.7, -1.25, B) * (1 - sst(1.9, 2.4, r));
    return [A * 0.07 * s.hair * w, -0.09 * s.hair * w];
  }));
  if (s.lift) F.push(contour((A, B, r) => [0, -0.07 * s.lift * E(r) * sst(-0.2, 0.6, B) * Math.min(1, Math.abs(A) + 0.25)]));
  if (s.ratio) F.push(contour((A, B, r) => [0, B > 0 ? B * 0.1 * s.ratio * (r < 1.05 ? 1 : 1 - sst(1.05, 1.8, r)) : 0]));

  // local elliptical ops in the face frame (pixel space)
  const local = (c: Vec2, rx: number, ry: number, fn: (lx: number, ly: number, f: number) => Vec2): Field => (x, y) => {
    const dx = x - c[0], dy = y - c[1];
    const lx = dx * ux[0] + dy * ux[1], ly = dx * uy[0] + dy * uy[1];
    const t = Math.hypot(lx / rx, ly / ry);
    if (t >= 1) return [0, 0];
    const [ox, oy] = fn(lx, ly, fall(t));
    return [ox * ux[0] + oy * uy[0], ox * ux[1] + oy * uy[1]];
  };
  const scale = (c: Vec2, rx: number, ry: number, kx: number, ky: number) => F.push(local(c, rx, ry, (lx, ly, f) => [lx * kx * f, ly * ky * f]));
  const move = (c: Vec2, rx: number, ry: number, mx: number, my: number) => F.push(local(c, rx, ry, (_lx, _ly, f) => [mx * f, my * f]));
  const rotate = (c: Vec2, rx: number, ry: number, th: number) => F.push(local(c, rx, ry, (lx, ly, f) => {
    const a = th * f, co = Math.cos(a), si = Math.sin(a);
    return [lx * co - ly * si - lx, lx * si + ly * co - ly];
  }));
  /** x position of a point in the face frame */
  const fx = (q: Vec2) => (q[0] - C[0]) * ux[0] + (q[1] - C[1]) * ux[1];

  // eyes
  const eyes = [
    { c: avg(IDX.rightEye), outer: g(33), inner: g(133), low: g(145), iris: 468 },
    { c: avg(IDX.leftEye), outer: g(263), inner: g(362), low: g(374), iris: 473 },
  ];
  const es = v("eyeSize"), eW = v("eyeWidth"), eH = v("eyeHeight"), eD = v("eyeDistance"), eT = v("eyeTilt");
  const eP = v("eyePosition"), eI = v("eyeInner"), eO = v("eyeOuter"), eL = v("eyeLower"), pu = v("pupil");
  for (const e of eyes) {
    const ew = dist(e.outer, e.inner);
    const sd = Math.sign(fx(e.c)) || 1; // -1 = image-left eye
    if (es) scale(e.c, ew * 1.05, ew * 0.95, 0.32 * es, 0.32 * es);
    if (eW) scale(e.c, ew * 1.15, ew * 0.8, 0.28 * eW, 0);
    if (eH) scale(e.c, ew * 0.95, ew * 0.85, 0, 0.35 * eH);
    if (eD) move(e.c, ew * 1.3, ew * 1.0, sd * 0.09 * ew * eD, 0);
    // outer corner up: image-left eye rotates +, image-right eye rotates - (y is down)
    if (eT) rotate(e.c, ew * 1.2, ew * 0.9, -sd * 0.14 * eT);
    if (eP) move(e.c, ew * 1.25, ew * 1.05, 0, -0.1 * ew * eP);
    if (eI) move(e.inner, ew * 0.45, ew * 0.4, -sd * 0.07 * ew * eI, 0);
    if (eO) move(e.outer, ew * 0.5, ew * 0.45, sd * 0.08 * ew * eO, 0);
    if (eL) move(e.low, ew * 0.6, ew * 0.35, 0, 0.07 * ew * eL);
    if (pu) { const ir = ew * 0.22; scale(g(e.iris), ir * 1.7, ir * 1.7, 0.3 * pu, 0.3 * pu); }
  }

  // nose
  const noseLen = dist(g(168), g(2)), alar = dist(g(98), g(327));
  const nS = v("noseSize"), nW = v("noseWidth"), nB = v("noseBridge"), nR = v("noseRoot"), nT = v("noseTip"), nA = v("noseAlar"), nL = v("noseLength");
  if (nS) scale(avg([1, 4, 5, 195]), alar * 1.0, noseLen * 0.75, 0.25 * nS, 0.25 * nS);
  if (nW) scale(g(4), alar * 1.0, noseLen * 0.55, 0.3 * nW, 0);
  if (nB) scale(g(197), alar * 0.55, noseLen * 0.4, 0.4 * nB, 0);
  if (nR) scale(g(168), alar * 0.5, noseLen * 0.35, -0.35 * nR, 0);
  if (nT) scale(g(1), alar * 0.5, alar * 0.45, 0.3 * nT, 0.3 * nT);
  if (nA) scale(g(2), alar * 0.85, noseLen * 0.28, 0.32 * nA, 0);
  if (nL) move(g(2), alar * 1.0, noseLen * 0.55, 0, 0.1 * noseLen * nL);

  // mouth
  const mc = avg([13, 14, 0, 17]), mw = dist(g(61), g(291)), lipH = Math.max(dist(g(0), g(17)), mw * 0.25);
  const mS = v("mouthSize"), mW = v("mouthWidth"), sm = v("smile"), ph = v("philtrum"), lt = v("lipThickness");
  const uL = v("upperLip"), lL = v("lowerLip"), cb = v("cupidBow");
  if (mS) scale(mc, mw * 0.85, mw * 0.65, 0.25 * mS, 0.25 * mS);
  if (mW) scale(mc, mw * 0.9, mw * 0.5, 0.28 * mW, 0);
  if (sm) for (const corner of [g(61), g(291)]) move(corner, mw * 0.32, mw * 0.32, Math.sign(fx(corner) - fx(mc)) * 0.02 * mw * sm, -0.08 * mw * sm);
  if (ph) move(mc, mw * 0.85, lipH * 1.3, 0, 0.07 * mw * ph);
  if (lt) scale(mc, mw * 0.75, lipH * 1.2, 0, 0.3 * lt);
  if (uL) move(g(0), mw * 0.55, lipH * 0.7, 0, -0.1 * lipH * uL);
  if (lL) move(g(17), mw * 0.55, lipH * 0.7, 0, 0.1 * lipH * lL);
  if (cb) for (const peak of [g(37), g(267)]) move(peak, mw * 0.16, mw * 0.13, 0, -0.035 * mw * cb);

  // brows
  const brows = [
    { c: avg([...IDX.rightBrowUpper, ...IDX.rightBrowLower]), ends: [g(46), g(55)] as Vec2[] },
    { c: avg([...IDX.leftBrowUpper, ...IDX.leftBrowLower]), ends: [g(276), g(285)] as Vec2[] },
  ];
  const bL = v("browLift"), bT = v("browTilt"), bD = v("browDistance"), bTh = v("browThickness");
  for (const b of brows) {
    const len = dist(b.ends[0], b.ends[1]);
    const sd = Math.sign(fx(b.c)) || 1;
    if (bL) move(b.c, len * 0.85, len * 0.55, 0, -0.12 * len * bL);
    if (bT) rotate(b.c, len * 0.85, len * 0.55, -sd * 0.12 * bT);
    if (bD) move(b.c, len * 0.9, len * 0.6, sd * 0.08 * len * bD, 0);
    if (bTh) scale(b.c, len * 0.75, len * 0.4, 0, 0.4 * bTh);
  }

  // generic ops (subject frame, IOD units)
  if (ops?.length) {
    const sf = subjectFrame(px);
    const SX = sf.X, SY = sf.Y, ed = sf.iod;
    const H3 = ops.some((o) => o.type === "move3d") ? headBasis3(px) : null;
    for (const op of ops) {
      const w = op.weight ?? 1;
      if (!w) continue;
      const anc = Array.isArray(op.anchor) ? avg(op.anchor) : g(op.anchor);
      const off = op.offset ?? [0, 0];
      const c: Vec2 = [anc[0] + (off[0] * SX[0] + off[1] * SY[0]) * ed, anc[1] + (off[0] * SX[1] + off[1] * SY[1]) * ed];
      const rx = op.rx * ed, ry = (op.ry ?? op.rx) * ed;
      const ang = op.angle ?? 0;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const [a0, a1] = op.amount;
      F.push((x, y) => {
        const dx = x - c[0], dy = y - c[1];
        const lx = dx * SX[0] + dy * SX[1], ly = dx * SY[0] + dy * SY[1];
        const ex = lx * ca + ly * sa, ey = -lx * sa + ly * ca;
        const t = Math.hypot(ex / rx, ey / ry);
        if (t >= 1) return [0, 0];
        const f = fall(t);
        let ox: number, oy: number;
        if (op.type === "scale") { const qx = ex * a0 * w * f, qy = ey * a1 * w * f; ox = qx * ca - qy * sa; oy = qx * sa + qy * ca; }
        else if (op.type === "move") { ox = a0 * ed * w * f; oy = a1 * ed * w * f; }
        else if (op.type === "move3d" && H3) {
          // pixel space directly: projected 3D move + perspective magnification about the op centre
          const z = op.z ?? 0, k = w * f;
          return [
            (a0 * H3.X[0] + a1 * H3.Y[0] + z * H3.Z[0]) * ed * k + dx * z * PERSPECTIVE * k,
            (a0 * H3.X[1] + a1 * H3.Y[1] + z * H3.Z[1]) * ed * k + dy * z * PERSPECTIVE * k,
          ];
        }
        else { const th = a0 * w * f, co = Math.cos(th), si = Math.sin(th); ox = lx * co - ly * si - lx; oy = lx * si + ly * co - ly; }
        return [ox * SX[0] + oy * SY[0], ox * SX[1] + oy * SY[1]];
      });
    }
  }
  if (!side) return F;
  // one-sided: fade across the face midline (image side as displayed)
  const mask = (x: number, y: number) => {
    const a = ((x - C[0]) * ux[0] + (y - C[1]) * ux[1]) / Math.max(1, fr.eyeDist);
    const t = sst(-0.08, 0.08, a);
    return side === "left" ? 1 - t : t;
  };
  return F.map((f) => (x, y) => { const m = mask(x, y); if (!m) return [0, 0]; const d = f(x, y); return [d[0] * m, d[1] * m]; });
}

const WARP_VERT = `
attribute vec2 position;
attribute vec2 texCoord;
varying vec2 vUv;
void main() { vUv = texCoord; gl_Position = vec4(position, 0.0, 1.0); }`;

/** Perspective cue for move3d: a move of z IOD toward the camera magnifies by 1 + z * PERSPECTIVE (focal ~3 IOD). */
const PERSPECTIVE = 0.33;

/** 3D head basis in pixels: X subject right eye -> left eye, Y toward the chin, Z toward the camera (unit vectors). */
export function headBasis3(px: Float32Array) {
  const v = (i: number) => [px[i * 3], px[i * 3 + 1], px[i * 3 + 2]];
  const mid = (a: number, b: number) => { const p = v(a), q = v(b); return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2]; };
  const nrm = (a: number[]) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const R = mid(33, 133), L = mid(263, 362);
  const X = nrm([L[0] - R[0], L[1] - R[1], L[2] - R[2]]);
  const c = v(152), g = v(168);
  let Y = [c[0] - g[0], c[1] - g[1], c[2] - g[2]];
  const d = Y[0] * X[0] + Y[1] * X[1] + Y[2] * X[2];
  Y = nrm([Y[0] - X[0] * d, Y[1] - X[1] * d, Y[2] - X[2] * d]);
  let Z = [X[1] * Y[2] - X[2] * Y[1], X[2] * Y[0] - X[0] * Y[2], X[0] * Y[1] - X[1] * Y[0]];
  // toward the camera = the side the nose tip sticks out to
  const n = v(1), e = [(R[0] + L[0]) / 2, (R[1] + L[1]) / 2, (R[2] + L[2]) / 2];
  if ((n[0] - e[0]) * Z[0] + (n[1] - e[1]) * Z[1] + (n[2] - e[2]) * Z[2] < 0) Z = [-Z[0], -Z[1], -Z[2]];
  return { X, Y, Z };
}

/**
 * Head size: uniform scale of the whole head (face + hair) about a pivot just below the chin (0.3 IOD toward the
 * neck); k = 0.12 per unit. Full strength over the head, fading out over the outer mesh rings and below the chin so
 * the neck and shoulders stay put. Not tapered like the contour fields (a tapered scale would squash the hair).
 */
function headScale(px: Float32Array, fr: FaceFrame, orig: Float32Array, disp: Float32Array, head: number) {
  const sf = subjectFrame(px);
  const piv: Vec2 = [px[152 * 3] + fr.uy[0] * sf.iod * 0.3, px[152 * 3 + 1] + fr.uy[1] * sf.iod * 0.3];
  const k = 0.12 * head, C = fr.center;
  for (let i = 0; i < PINNED_FROM; i++) {
    const x = orig[i * 2], y = orig[i * 2 + 1];
    const dx = x - C[0], dy = y - C[1];
    const a = dx * fr.ux[0] + dy * fr.ux[1], b = dx * fr.uy[0] + dy * fr.uy[1];
    const A = a / (a >= 0 ? fr.halfRight : fr.halfLeft), B = b / (b >= 0 ? fr.halfDown : fr.halfUp);
    const m = (1 - sst(1.55, 2.3, Math.hypot(A, B))) * (1 - sst(1.0, 1.35, B));
    if (m <= 0) continue;
    disp[i * 2] += (x - piv[0]) * k * m;
    disp[i * 2 + 1] += (y - piv[1]) * k * m;
  }
}

/** 3D sculpt keys accepted by beauty3dOps (a "3d_" prefix is also accepted). */
export const SCULPT_3D_KEYS = ["lift", "forehead", "cheeks", "mouth", "lips", "nose", "bridge", "alar", "root", "tip"] as const;
export type Sculpt3dKey = (typeof SCULPT_3D_KEYS)[number];

/**
 * 3D sculpt: depth-aware moves in the head frame (`move3d`), so they read as volume when the head turns.
 * `values` are slider values by key (-1..1; positive = more of the name: fuller forehead, smaller nose for "nose",
 * higher bridge, narrower alar, higher root, smaller lifted tip, plumper lips...).
 */
export function beauty3dOps(values: Record<string, number>): WarpOp[] {
  const ops: WarpOp[] = [];
  for (const [k0, w] of Object.entries(values)) {
    if (!w || Math.abs(w) < 1e-3) continue;
    const key = k0.replace(/^3d_/, "");
    const m3 = (anchor: number | number[], rx: number, dx: number, dy: number, z: number, ry?: number, offset?: Vec2): WarpOp => ({ type: "move3d", anchor, rx, ry, offset, amount: [dx, dy], z, weight: w });
    const sc = (anchor: number | number[], rx: number, ry: number, sx: number, sy: number, offset?: Vec2): WarpOp => ({ type: "scale", anchor, rx, ry, offset, amount: [sx, sy], weight: w });
    switch (key) {
      case "lift": // jaw line up and slightly in
        for (const a of [58, 172, 136, 150]) ops.push(m3(a, 0.45, 0.03, -0.05, 0));
        for (const a of [288, 397, 365, 379]) ops.push(m3(a, 0.45, -0.03, -0.05, 0));
        break;
      case "forehead": // rounder forehead
        ops.push(m3(151, 1.0, 0, -0.025, 0.08, 0.55, [0, -0.2]));
        break;
      case "cheeks": // fuller cheek apples
        ops.push(m3([205, 50], 0.36, 0, -0.012, 0.06, 0.3), m3([425, 280], 0.36, 0, -0.012, 0.06, 0.3));
        break;
      case "mouth": // mouth centre forward, corners back and up
        ops.push(m3([13, 14], 0.3, 0, 0, 0.03, 0.22), m3(61, 0.18, 0.012, -0.01, -0.03), m3(291, 0.18, -0.012, -0.01, -0.03));
        break;
      case "lips": // plumper lips
        ops.push(m3([13, 14], 0.42, 0, 0, 0.08, 0.26), sc([13, 14], 0.42, 0.26, 0.06, 0.18));
        break;
      case "nose": // smaller nose (negative = bigger)
        ops.push(sc([1, 4, 5, 195], 0.5, 0.65, -0.15, -0.15), m3(1, 0.3, 0, 0, -0.025));
        break;
      case "bridge": // higher, slimmer bridge
        ops.push(m3([6, 197, 195], 0.3, 0, 0, 0.05, 0.6), sc([6, 197], 0.26, 0.55, -0.18, 0));
        break;
      case "alar": // narrower nostril wings
        ops.push(sc(2, 0.45, 0.25, -0.3, 0, [0, -0.05]));
        break;
      case "root": // higher, narrower root between the eyes
        ops.push(m3([168, 6], 0.3, 0, 0, 0.05, 0.35), sc(168, 0.28, 0.3, -0.2, 0));
        break;
      case "tip": // smaller, lifted tip
        ops.push(m3(1, 0.28, 0, -0.03, -0.02), sc(1, 0.25, 0.22, -0.15, -0.15));
        break;
    }
  }
  return ops;
}

/** Soft limit: no landmark moves more than ~this many eye distances (compressed smoothly with tanh). */
const SOFT_LIMIT = 0.22;
/** Lid / lip pairs that must not cross. */
const GUARDS: [number, number][] = [
  ...IDX.rightEyeUpper.slice(1, -1).map((u, i) => [u, IDX.rightEyeLower[i + 1]] as [number, number]),
  ...IDX.leftEyeUpper.slice(1, -1).map((u, i) => [u, IDX.leftEyeLower[i + 1]] as [number, number]),
  ...IDX.lipsInnerUpper.slice(1, -1).map((u, i) => [u, IDX.lipsInnerLower[i + 1]] as [number, number]),
];

/** Original + displaced vertex positions (pixels) for one face. Exposed for makeup / stickers that follow the warp. */
export function warpVertices(face: FaceData, w: number, h: number, params: Partial<WarpParams>, ops?: WarpOp[], shape?: ShapeWeights) {
  const px = toPixels(face, w, h);
  const fr = faceFrame(px);
  const orig = new Float32Array(VCOUNT * 2);
  for (let i = 0; i < BASE; i++) { orig[i * 2] = px[i * 3]; orig[i * 2 + 1] = px[i * 3 + 1]; }
  const C = fr.center;
  for (let k = 0; k < RING_SCALES.length; k++) {
    for (let j = 0; j < NO; j++) {
      const o = OVAL[j], q = (BASE + k * NO + j) * 2;
      let dx = px[o * 3] - C[0], dy = px[o * 3 + 1] - C[1];
      // the top of the mesh (row 10) is low on the forehead; push the upper rings further up
      const up = -(dx * fr.uy[0] + dy * fr.uy[1]) > 0 ? 1.15 : 1;
      dx *= RING_SCALES[k] * up; dy *= RING_SCALES[k] * up;
      orig[q] = C[0] + dx; orig[q + 1] = C[1] + dy;
    }
  }
  const sp = splitShape(shape);
  const both: Partial<WarpParams> = { ...params };
  for (const [k, v] of Object.entries(sp.both)) both[k as keyof WarpParams] = (both[k as keyof WarpParams] ?? 0) + (v ?? 0);
  const fields = [
    ...buildFields(px, fr, both, ops),
    ...(Object.keys(sp.left).length ? buildFields(px, fr, sp.left, undefined, "left") : []),
    ...(Object.keys(sp.right).length ? buildFields(px, fr, sp.right, undefined, "right") : []),
  ];
  const disp = new Float32Array(orig);
  if (fields.length) {
    const cap = fr.eyeDist * SOFT_LIMIT;
    for (let i = 0; i < VCOUNT; i++) {
      const x = orig[i * 2], y = orig[i * 2 + 1];
      let dx = 0, dy = 0;
      for (const f of fields) { const d = f(x, y); dx += d[0]; dy += d[1]; }
      // soft limit: linear for normal strengths, compressed when many settings stack up
      const m = Math.hypot(dx, dy);
      if (m > 1e-6) { const k = (cap * Math.tanh(m / cap)) / m; dx *= k; dy *= k; }
      const taper = i < BASE ? 1 : RING_TAPER[Math.floor((i - BASE) / NO)];
      disp[i * 2] = x + dx * taper; disp[i * 2 + 1] = y + dy * taper;
    }
  }
  const head = Math.max(-1.5, Math.min(1.5, (params.headSize ?? 0) + (sp.both.headSize ?? 0)));
  if (head) headScale(px, fr, orig, disp, head);
  if (fields.length) {
    // guards: lids / lips never cross (measured along the face's chin axis)
    const Y = fr.uy;
    for (const [u, l] of GUARDS) {
      const gap = (disp[l * 2] - disp[u * 2]) * Y[0] + (disp[l * 2 + 1] - disp[u * 2 + 1]) * Y[1];
      if (gap < 0) {
        const mx = (disp[u * 2] + disp[l * 2]) / 2, my = (disp[u * 2 + 1] + disp[l * 2 + 1]) / 2;
        disp[u * 2] = disp[l * 2] = mx; disp[u * 2 + 1] = disp[l * 2 + 1] = my;
      }
    }
    limitFolds(orig, disp, INDICES, fr.eyeDist);
  }
  return { orig, disp, indices: INDICES, frame: fr };
}

/** Vertex adjacency of the warp mesh (static). */
const NEIGHBORS: Uint16Array[] = (() => {
  const s: Set<number>[] = Array.from({ length: VCOUNT }, () => new Set());
  for (let i = 0; i < INDICES.length; i += 3) {
    const a = INDICES[i], b = INDICES[i + 1], c = INDICES[i + 2];
    s[a].add(b).add(c); s[b].add(a).add(c); s[c].add(a).add(b);
  }
  return s.map((x) => Uint16Array.from(x));
})();
/** Eye fans + inner-mouth strip: they collapse legally (blinks, closed lips, lid guards). */
const SOFT_TRIS: [number, number] = [FACE_TRIS.length / 3, FACE_TRIS.length / 3 + IDX.rightEye.length + IDX.leftEye.length + (IDX.lipsInnerUpper.length - 1) * 2];
/** Outermost ring: always pinned. */
const PINNED_FROM = BASE + (RING_SCALES.length - 1) * NO;

/**
 * A strong warp on a turned face can flip triangles over their neighbours, which shows as a hard tear / smear.
 * 1) Triangles that are near-degenerate at rest (closed lids, closed lips, nostril slivers) are ignored: they can
 *    legally collapse and are below a pixel or two.
 * 2) Folded / collapsed triangles (area < 15%) are fixed locally: the displacement of their vertices (and 1-ring) is
 *    relaxed toward the neighbour average, a few rounds, so the effect is kept everywhere else.
 * 3) Only if folds remain, scale the whole displacement back to the strongest fraction that keeps the mesh intact
 *    (bisection), as before.
 */
function limitFolds(orig: Float32Array, disp: Float32Array, idx: Uint16Array, eyeDist = 0) {
  const area = (p: Float32Array, a: number, b: number, c: number) =>
    (p[b * 2] - p[a * 2]) * (p[c * 2 + 1] - p[a * 2 + 1]) - (p[c * 2] - p[a * 2]) * (p[b * 2 + 1] - p[a * 2 + 1]);
  const minArea = Math.max(1e-3, (eyeDist * 0.025) ** 2);
  const rest = new Float32Array(idx.length / 3);
  for (let t = 0; t < rest.length; t++) rest[t] = idx === INDICES && t >= SOFT_TRIS[0] && t < SOFT_TRIS[1] ? 0 : area(orig, idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]);
  const bad = (p: Float32Array, out?: number[]) => {
    let n = 0;
    for (let t = 0; t < rest.length; t++) {
      const a0 = rest[t];
      if (Math.abs(a0) < minArea) continue;
      if (area(p, idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]) / a0 < 0.15) { n++; out?.push(t); }
    }
    return n;
  };
  const tris: number[] = [];
  if (!bad(disp, tris)) return;
  // local relaxation of the displacement field around the folds
  for (let round = 0; round < 24 && tris.length; round++) {
    const set = new Set<number>();
    for (const t of tris) for (let k = 0; k < 3; k++) { const v = idx[t * 3 + k]; set.add(v); for (const n of NEIGHBORS[v]) set.add(n); }
    for (let it = 0; it < 2; it++) for (const v of set) {
      if (v >= PINNED_FROM) continue;
      const nb = NEIGHBORS[v];
      let sx = 0, sy = 0;
      for (const n of nb) { sx += disp[n * 2] - orig[n * 2]; sy += disp[n * 2 + 1] - orig[n * 2 + 1]; }
      const dx = disp[v * 2] - orig[v * 2], dy = disp[v * 2 + 1] - orig[v * 2 + 1];
      disp[v * 2] = orig[v * 2] + dx + 0.6 * (sx / nb.length - dx);
      disp[v * 2 + 1] = orig[v * 2 + 1] + dy + 0.6 * (sy / nb.length - dy);
    }
    tris.length = 0;
    bad(disp, tris);
  }
  if (!tris.length) return;
  const scaled = (s: number) => {
    const t = new Float32Array(disp.length);
    for (let i = 0; i < t.length; i++) t[i] = orig[i] + (disp[i] - orig[i]) * s;
    return t;
  };
  let lo = 0, hi = 1;
  for (let k = 0; k < 6; k++) { const m = (lo + hi) / 2; if (!bad(scaled(m))) lo = m; else hi = m; }
  for (let i = 0; i < disp.length; i++) disp[i] = orig[i] + (disp[i] - orig[i]) * lo;
}

/**
 * Warps a point set through the face's displacement (e.g. to move makeup/sticker anchors with the reshaped face).
 * Returns pixel positions of the 478 landmarks after the warp.
 */
export function warpedLandmarks(face: FaceData, w: number, h: number, params: Partial<WarpParams>, ops?: WarpOp[], shape?: ShapeWeights): FaceData {
  if (!warpActive(params, ops, shape)) return face;
  const { disp } = warpVertices(face, w, h, params, ops, shape);
  const pts = new Float32Array(face.points);
  for (let i = 0; i < BASE; i++) { pts[i * 3] = disp[i * 2] / w; pts[i * 3 + 1] = disp[i * 2 + 1] / h; }
  return { ...face, points: pts };
}

// ----- liquify -----

/** Displacement grid for manual Reshape (editor). Coordinates are view-normalized (x right, y down). */
export class LiquifyField {
  readonly cols: number;
  readonly rows: number;
  /** Backward offsets per vertex: the pixel at p shows the source at p - d. */
  d: Float32Array;
  constructor(aspect = 1, density = 72) {
    this.cols = aspect >= 1 ? density : Math.max(8, Math.round(density * aspect));
    this.rows = aspect >= 1 ? Math.max(8, Math.round(density / aspect)) : density;
    this.d = new Float32Array((this.cols + 1) * (this.rows + 1) * 2);
  }
  get isIdentity() { return !this.d.some((v) => v !== 0); }
  reset() { this.d.fill(0); }
  snapshot(): Float32Array { return new Float32Array(this.d); }
  restoreSnapshot(s: Float32Array) { if (s.length === this.d.length) this.d.set(s); }
  private sample(src: Float32Array, x: number, y: number): Vec2 {
    const fx = Math.max(0, Math.min(this.cols, x * this.cols)), fy = Math.max(0, Math.min(this.rows, y * this.rows));
    const i0 = Math.min(this.cols - 1, Math.floor(fx)), j0 = Math.min(this.rows - 1, Math.floor(fy));
    const tx = fx - i0, ty = fy - j0, W = this.cols + 1;
    const at = (i: number, j: number, c: number) => src[(j * W + i) * 2 + c];
    const lerp = (c: number) => (at(i0, j0, c) * (1 - tx) + at(i0 + 1, j0, c) * tx) * (1 - ty) + (at(i0, j0 + 1, c) * (1 - tx) + at(i0 + 1, j0 + 1, c) * tx) * ty;
    return [lerp(0), lerp(1)];
  }
  /**
   * Push brush: content under `from` follows the drag to `to`.
   * radius is in view-normalized units of the short side (aspect is the view's w/h), strength 0..1.
   */
  push(from: Vec2, to: Vec2, radius: number, strength = 1, aspect = 1) {
    const old = new Float32Array(this.d), W = this.cols + 1;
    const ax = aspect >= 1 ? aspect : 1, ay = aspect >= 1 ? 1 : 1 / aspect;
    const dx = to[0] - from[0], dy = to[1] - from[1];
    for (let j = 0; j <= this.rows; j++) for (let i = 0; i <= this.cols; i++) {
      const x = i / this.cols, y = j / this.rows;
      const t = Math.hypot((x - to[0]) * ax, (y - to[1]) * ay) / radius;
      if (t >= 1) continue;
      const f = fall(t) * strength;
      const mx = dx * f, my = dy * f;
      const prev = this.sample(old, x - mx, y - my);
      this.d[(j * W + i) * 2] = mx + prev[0];
      this.d[(j * W + i) * 2 + 1] = my + prev[1];
    }
  }
  /** Restore brush: blends offsets back toward zero around `at`. */
  restore(at: Vec2, radius: number, strength = 0.5, aspect = 1) {
    const W = this.cols + 1;
    const ax = aspect >= 1 ? aspect : 1, ay = aspect >= 1 ? 1 : 1 / aspect;
    for (let j = 0; j <= this.rows; j++) for (let i = 0; i <= this.cols; i++) {
      const t = Math.hypot((i / this.cols - at[0]) * ax, (j / this.rows - at[1]) * ay) / radius;
      if (t >= 1) continue;
      const k = 1 - fall(t) * strength;
      this.d[(j * W + i) * 2] *= k;
      this.d[(j * W + i) * 2 + 1] *= k;
    }
  }
}

// ----- GL -----

export class FaceWarp {
  private prog: Prog;
  private copy: Prog;
  private stream: Stream;
  private targets: Targets;
  private grids = new Map<string, Uint16Array>();

  constructor(readonly gl: WebGLRenderingContext) {
    this.prog = compile(gl, WARP_VERT, COPY_FRAG, ["tex"], ["position", "texCoord"]);
    this.copy = compile(gl, COPY_VERT, COPY_FRAG, ["tex"], ["position"]);
    this.stream = new Stream(gl);
    this.targets = new Targets(gl);
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

  private drawMesh(input: WebGLTexture, orig: Float32Array, disp: Float32Array, indices: Uint16Array, w: number, h: number) {
    const gl = this.gl;
    const n = orig.length / 2;
    const data = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      data[i * 4] = (disp[i * 2] / w) * 2 - 1;
      data[i * 4 + 1] = 1 - (disp[i * 2 + 1] / h) * 2;
      data[i * 4 + 2] = orig[i * 2] / w;
      data[i * 4 + 3] = 1 - orig[i * 2 + 1] / h;
    }
    gl.useProgram(this.prog.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(this.prog.u.tex, 0);
    this.stream.draw(data, [[this.prog.a.position, 2], [this.prog.a.texCoord, 2]], indices);
  }

  /**
   * Reshape every face. `faces` must be in view space (see toViewSpace). Returns a texture owned by this object
   * (valid until the next call), or `input` when nothing is active.
   */
  apply(input: WebGLTexture, w: number, h: number, faces: FaceData[], params: Partial<WarpParams>, ops?: WarpOp[], shape?: ShapeWeights): WebGLTexture {
    if (!faces.length || !warpActive(params, ops, shape)) return input;
    let src = input;
    this.lastWarped = [];
    faces.forEach((face, i) => {
      const t = this.targets.get(i % 2 ? "b" : "a", w, h);
      this.blit(src, t.fb, w, h);
      const { orig, disp, indices } = warpVertices(face, w, h, params, ops, shape);
      this.drawMesh(src, orig, disp, indices, w, h);
      const pts = new Float32Array(face.points);
      for (let k = 0; k < BASE; k++) { pts[k * 3] = disp[k * 2] / w; pts[k * 3 + 1] = disp[k * 2 + 1] / h; }
      this.lastWarped.push({ ...face, points: pts });
      src = t.tex;
    });
    return src;
  }

  /**
   * The reshaped landmarks of the faces of the last apply() (same order), so makeup / stickers can follow the warp
   * without evaluating the deformation a second time. Empty when the last apply() was a no-op.
   */
  lastWarped: FaceData[] = [];

  /** Applies a liquify field over the whole frame. Returns `input` when the field is identity. */
  applyLiquify(input: WebGLTexture, w: number, h: number, field: LiquifyField, slot = "liq"): WebGLTexture {
    if (field.isIdentity) return input;
    const gl = this.gl;
    const { cols, rows } = field;
    const key = `${cols}x${rows}`;
    let gridIdx = this.grids.get(key);
    if (!gridIdx) {
      const idx: number[] = [];
      const W = cols + 1;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const a = j * W + i;
        idx.push(a, a + 1, a + W, a + W, a + 1, a + W + 1);
      }
      gridIdx = new Uint16Array(idx);
      this.grids.set(key, gridIdx);
    }
    const n = (cols + 1) * (rows + 1);
    const orig = new Float32Array(n * 2), disp = new Float32Array(n * 2);
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      const k = j * (cols + 1) + i;
      disp[k * 2] = (i / cols) * w; disp[k * 2 + 1] = (j / rows) * h;
      orig[k * 2] = (i / cols - field.d[k * 2]) * w; orig[k * 2 + 1] = (j / rows - field.d[k * 2 + 1]) * h;
    }
    const t = this.targets.get(slot, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    this.drawMesh(input, orig, disp, gridIdx, w, h);
    return t.tex;
  }

  dispose() {
    this.targets.dispose();
    this.stream.dispose();
    this.gl.deleteProgram(this.prog.p);
    this.gl.deleteProgram(this.copy.p);
  }
}

const cache = new WeakMap<WebGLRenderingContext, FaceWarp>();

/** Convenience: warp with a per-context shared FaceWarp. Faces in view space; returns the output texture. */
export function applyWarp(gl: WebGLRenderingContext, inputTex: WebGLTexture, w: number, h: number, faces: FaceData[], params: Partial<WarpParams>, ops?: WarpOp[], shape?: ShapeWeights): WebGLTexture {
  let fw = cache.get(gl);
  if (!fw) { fw = new FaceWarp(gl); cache.set(gl, fw); }
  return fw.apply(inputTex, w, h, faces, params, ops, shape);
}
