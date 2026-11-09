// Face data types, MediaPipe 478-point landmark indices and a named landmark map.
// Coordinates: normalized, x right, y down. "source" space = the tracked image/video frame (unmirrored);
// "view" space = the renderer's canvas after cover-crop + mirror (see `toViewSpace`).

export const LANDMARK_COUNT = 478;

export interface FacePose {
  /** Radians. yaw > 0: face turned to its own left (image right in an unmirrored frame). */
  yaw: number;
  /** Radians. pitch > 0: chin up. */
  pitch: number;
  /** Radians. In-plane rotation of the eye line (screen space, clockwise positive since y is down). */
  roll: number;
}

export interface FaceData {
  /** Stable id while the face stays tracked. */
  id: number;
  /** 478 x [x, y, z]. x/y normalized 0..1, z in units of image width (negative = toward camera). */
  points: Float32Array;
  /** ARKit-style blendshape scores 0..1 (jawOpen, eyeBlinkLeft, browInnerUp, mouthSmileLeft, ...). */
  blendshapes: Record<string, number>;
  /** MediaPipe facial transformation matrix, 4x4 column-major (canonical face cm -> camera space). */
  matrix: Float32Array | null;
  pose: FacePose;
}

/** Ordered loops/polylines (MediaPipe face_mesh_connections). "Right"/"left" = the subject's own side. */
export const IDX = {
  faceOval: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109],
  lipsOuter: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146],
  lipsInner: [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95],
  /** Upper/lower inner lip from corner 78 to corner 308 (same length, for strips). */
  lipsInnerUpper: [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308],
  lipsInnerLower: [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308],
  lipsOuterUpper: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291],
  lipsOuterLower: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291],
  rightEye: [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7],
  leftEye: [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249],
  /** Upper lid from outer to inner corner. */
  rightEyeUpper: [33, 246, 161, 160, 159, 158, 157, 173, 133],
  rightEyeLower: [33, 7, 163, 144, 145, 153, 154, 155, 133],
  leftEyeUpper: [263, 466, 388, 387, 386, 385, 384, 398, 362],
  leftEyeLower: [263, 249, 390, 373, 374, 380, 381, 382, 362],
  /** Brow upper edge outer->inner, lower edge outer->inner. */
  rightBrowUpper: [70, 63, 105, 66, 107],
  rightBrowLower: [46, 53, 52, 65, 55],
  leftBrowUpper: [300, 293, 334, 296, 336],
  leftBrowLower: [276, 283, 282, 295, 285],
  rightIris: [468, 469, 470, 471, 472],
  leftIris: [473, 474, 475, 476, 477],
  noseBridge: [168, 6, 197, 195, 5, 4, 1],
  noseBottom: [98, 97, 2, 326, 327],
} as const;

/** Single landmark indices. */
export const P = {
  foreheadTop: 10, glabella: 168, noseTip: 1, noseBottom: 2, subnasale: 164, chin: 152,
  rightEyeOuter: 33, rightEyeInner: 133, leftEyeOuter: 263, leftEyeInner: 362,
  rightEyeTop: 159, rightEyeBottom: 145, leftEyeTop: 386, leftEyeBottom: 374,
  rightIris: 468, leftIris: 473,
  mouthRight: 61, mouthLeft: 291, upperLipTop: 0, upperLipInner: 13, lowerLipInner: 14, lowerLipBottom: 17,
  rightAlar: 98, leftAlar: 327, rightAlarWing: 129, leftAlarWing: 358,
  rightCheek: 205, leftCheek: 425, rightCheekbone: 116, leftCheekbone: 345,
  rightFaceEdge: 234, leftFaceEdge: 454, rightJaw: 172, leftJaw: 397, rightJawAngle: 58, leftJawAngle: 288,
  rightTemple: 54, leftTemple: 284, rightBrowPeak: 105, leftBrowPeak: 334,
} as const;

export type Vec2 = [number, number];

/** Point i as [x, y] (normalized). */
export function pt(f: FaceData | Float32Array, i: number): Vec2 {
  const a = f instanceof Float32Array ? f : f.points;
  return [a[i * 3], a[i * 3 + 1]];
}

const avg = (ps: Vec2[]): Vec2 => [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length];
const lerp2 = (a: Vec2, b: Vec2, t: number): Vec2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Named landmark groups (normalized coords, same space as the input face). */
export interface NamedLandmarks {
  faceContour: Vec2[]; jaw: Vec2[]; chin: Vec2; cheekRight: Vec2; cheekLeft: Vec2; cheekboneRight: Vec2; cheekboneLeft: Vec2;
  eyeRight: Vec2[]; eyeLeft: Vec2[]; eyeRightCenter: Vec2; eyeLeftCenter: Vec2; eyesCenter: Vec2;
  irisRight: Vec2; irisLeft: Vec2; irisRightRadius: number; irisLeftRadius: number;
  browRight: Vec2[]; browLeft: Vec2[]; browRightCenter: Vec2; browLeftCenter: Vec2;
  noseBridge: Vec2[]; noseTip: Vec2; noseBottom: Vec2; nostrilRight: Vec2; nostrilLeft: Vec2;
  lipsOuter: Vec2[]; lipsInner: Vec2[]; mouthCenter: Vec2; mouthRight: Vec2; mouthLeft: Vec2; mouthTop: Vec2; mouthBottom: Vec2;
  /** Estimated forehead points (the mesh stops at the hairline-ish row 10/109/338): left, center, right, and a raised top. */
  foreheadLeft: Vec2; foreheadCenter: Vec2; foreheadRight: Vec2; foreheadTop: Vec2;
  /** Ear estimates (outside the mesh, extrapolated from the face edge). */
  earRight: Vec2; earLeft: Vec2;
  faceCenter: Vec2;
}

export function named(f: FaceData): NamedLandmarks {
  const p = (i: number) => pt(f, i);
  const map = (ids: readonly number[]) => ids.map(p);
  const eyeR = map(IDX.rightEye), eyeL = map(IDX.leftEye);
  const irisR = p(468), irisL = p(473);
  const rad = (c: Vec2, ids: readonly number[]) => ids.slice(1).reduce((s, i) => s + Math.hypot(p(i)[0] - c[0], p(i)[1] - c[1]), 0) / 4;
  const eyesCenter = avg([avg(eyeR), avg(eyeL)]);
  const chin = p(152), top = p(10);
  // forehead: extend the chin->brow axis above landmark 10 by ~35% of the eye-to-top distance
  const fc = lerp2(eyesCenter, top, 1.0);
  const up: Vec2 = [top[0] - chin[0], top[1] - chin[1]];
  const foreheadTop: Vec2 = [top[0] + up[0] * 0.18, top[1] + up[1] * 0.18];
  const edgeR = p(234), edgeL = p(454);
  return {
    faceContour: map(IDX.faceOval),
    jaw: map([234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454]),
    chin, cheekRight: p(205), cheekLeft: p(425), cheekboneRight: p(116), cheekboneLeft: p(345),
    eyeRight: eyeR, eyeLeft: eyeL, eyeRightCenter: avg(eyeR), eyeLeftCenter: avg(eyeL), eyesCenter,
    irisRight: irisR, irisLeft: irisL, irisRightRadius: rad(irisR, IDX.rightIris), irisLeftRadius: rad(irisL, IDX.leftIris),
    browRight: map([...IDX.rightBrowUpper, ...[...IDX.rightBrowLower].reverse()]),
    browLeft: map([...IDX.leftBrowUpper, ...[...IDX.leftBrowLower].reverse()]),
    browRightCenter: avg(map([105, 66, 52, 65])), browLeftCenter: avg(map([334, 296, 282, 295])),
    noseBridge: map(IDX.noseBridge), noseTip: p(1), noseBottom: p(2), nostrilRight: p(98), nostrilLeft: p(327),
    lipsOuter: map(IDX.lipsOuter), lipsInner: map(IDX.lipsInner), mouthCenter: avg([p(13), p(14)]),
    mouthRight: p(61), mouthLeft: p(291), mouthTop: p(0), mouthBottom: p(17),
    foreheadLeft: p(284), foreheadCenter: fc, foreheadRight: p(54), foreheadTop,
    earRight: lerp2(p(1), edgeR, 1.12), earLeft: lerp2(p(1), edgeL, 1.12),
    faceCenter: avg(map(IDX.faceOval)),
  };
}

/** Pose from landmarks (independent of the matrix convention). Works in any space with consistent x/y/z scaling. */
export function poseFromPoints(a: Float32Array, aspect = 1): FacePose {
  // aspect = width / height of the space, so that y is scaled to x units
  const v = (i: number) => [a[i * 3], a[i * 3 + 1] / aspect, a[i * 3 + 2]];
  const sub = (x: number[], y: number[]) => [x[0] - y[0], x[1] - y[1], x[2] - y[2]];
  const norm = (x: number[]) => { const l = Math.hypot(x[0], x[1], x[2]) || 1; return [x[0] / l, x[1] / l, x[2] / l]; };
  const X = norm(sub(v(263), v(33)));            // subject right eye -> left eye
  const down = norm(sub(v(152), v(168)));        // glabella -> chin
  const roll = Math.atan2(X[1], X[0]);
  const yaw = Math.asin(Math.max(-1, Math.min(1, -X[2])));
  const pitch = Math.asin(Math.max(-1, Math.min(1, down[2])));
  return { yaw, pitch, roll };
}

/** Mapping from source-normalized coords into the renderer's view (cover crop + optional horizontal mirror). */
export interface ViewMapping {
  /** Cover scale per axis (>= 1 on the cropped axis), as computed by Renderer.render. */
  sx: number;
  sy: number;
  mirror: boolean;
}

export const IDENTITY_MAPPING: ViewMapping = { sx: 1, sy: 1, mirror: false };

/** Cover-fit mapping for a source of sw x sh shown in a view of w x h (same math as Renderer.render). */
export function coverMapping(sw: number, sh: number, w: number, h: number, mirror: boolean): ViewMapping {
  const sa = sw / sh, da = w / h;
  return sa > da ? { sx: sa / da, sy: 1, mirror } : { sx: 1, sy: da / sa, mirror };
}

export function mapPoint(x: number, y: number, m: ViewMapping): Vec2 {
  const u = m.mirror ? 1 - x : x;
  return [(u - 0.5) * m.sx + 0.5, (y - 0.5) * m.sy + 0.5];
}

/** Inverse of mapPoint: view-normalized -> source-normalized. */
export function unmapPoint(x: number, y: number, m: ViewMapping): Vec2 {
  const u = (x - 0.5) / m.sx + 0.5;
  return [m.mirror ? 1 - u : u, (y - 0.5) / m.sy + 0.5];
}

/** Returns a copy of the face with points mapped into view space (z scaled like x). */
export function toViewSpace(f: FaceData, m: ViewMapping): FaceData {
  if (m.sx === 1 && m.sy === 1 && !m.mirror) return f;
  const out = new Float32Array(f.points.length);
  for (let i = 0; i < f.points.length; i += 3) {
    const [x, y] = mapPoint(f.points[i], f.points[i + 1], m);
    out[i] = x; out[i + 1] = y; out[i + 2] = f.points[i + 2] * m.sx;
  }
  const pose = m.mirror ? { yaw: -f.pose.yaw, pitch: f.pose.pitch, roll: -f.pose.roll } : f.pose;
  return { ...f, points: out, pose };
}

/** Landmarks in pixels: 478 x [x*w, y*h, z*w]. */
export function toPixels(f: FaceData, w: number, h: number): Float32Array {
  const a = f.points, out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i += 3) { out[i] = a[i] * w; out[i + 1] = a[i + 1] * h; out[i + 2] = a[i + 2] * w; }
  return out;
}

/** Face-aligned frame in pixel space. ux = toward image-right along the eye line, uy = ux rotated +90 deg (toward chin). */
export interface FaceFrame {
  center: Vec2;
  ux: Vec2;
  uy: Vec2;
  /** Half widths to the left/right face edges (along ux), and half heights up (forehead) / down (chin) along uy. */
  halfLeft: number; halfRight: number; halfUp: number; halfDown: number;
  /** Rotation-invariant face size: 3D distance between outer eye corners, px. */
  eyeDist: number;
}

export function faceFrame(px: Float32Array): FaceFrame {
  const g = (i: number): Vec2 => [px[i * 3], px[i * 3 + 1]];
  const a = g(33), b = g(263);
  // ux always points toward image right so stickers are never mirrored
  let ux: Vec2 = [b[0] - a[0], b[1] - a[1]];
  if (ux[0] < 0) ux = [-ux[0], -ux[1]];
  const l = Math.hypot(ux[0], ux[1]) || 1;
  ux = [ux[0] / l, ux[1] / l];
  const uy: Vec2 = [-ux[1], ux[0]];
  // center: on the glabella-chin axis, at the eye/cheek level (landmark 6 ~ upper nose)
  const c0 = g(6);
  const center: Vec2 = c0;
  const proj = (p: Vec2): Vec2 => [(p[0] - center[0]) * ux[0] + (p[1] - center[1]) * ux[1], (p[0] - center[0]) * uy[0] + (p[1] - center[1]) * uy[1]];
  let minX = 0, maxX = 0;
  for (const i of IDX.faceOval) { const q = proj(g(i)); minX = Math.min(minX, q[0]); maxX = Math.max(maxX, q[0]); }
  const up = -proj(g(10))[1], down = proj(g(152))[1];
  const eyeDist = Math.hypot(px[263 * 3] - px[33 * 3], px[263 * 3 + 1] - px[33 * 3 + 1], px[263 * 3 + 2] - px[33 * 3 + 2]);
  return { center, ux, uy, halfLeft: Math.max(1, -minX), halfRight: Math.max(1, maxX), halfUp: Math.max(1, up * 1.25), halfDown: Math.max(1, down), eyeDist };
}
