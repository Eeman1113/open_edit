// Makeup compositor. Everything is procedural: feathered region geometry generated from the MediaPipe landmarks
// (lips, eyeshadow, eyeliner, brows, blush, contour, highlight, iris, beauty marks), composited with blend modes;
// a procedural 3D lash strip; lip gloss sheen / glitter; region retouch (teeth and eye whitening, dark circles,
// wrinkle smoothing). Optional textures (e.g. pack art in canonical face UV space) can replace a region's geometry.
// All geometry is built in view pixels from faces in view space.

import { CANONICAL_POS, CANONICAL_UV, FACE_TRIS } from "./meshdata";
import { IDX, faceFrame, toPixels, type FaceData, type Vec2 } from "./landmarks";
import { BLEND_GLSL, COPY_FRAG, COPY_VERT, FULLSCREEN, ImageCache, Stream, Targets, blendCode, compile, hexToRgb, type Prog } from "./gl";
import { headBasis3 } from "./warp";

export type MakeupRegion = "lips" | "eyeshadow" | "eyeliner" | "lashes" | "brows" | "blush" | "contour" | "highlight" | "lens" | "face" | "mark";

/** How a makeup texture is placed on the face. */
export type TextureMapping =
  /** Use the region's own generated uv (lens: the iris disk mapped to the texture's unit square). */
  | { kind: "region" }
  /** Texture is drawn in MediaPipe canonical face UV space (canonical_face_model_uv_visualization layout). */
  | { kind: "canonical" }
  /**
   * Control-point mapping: each anchor pins a landmark (or the average of several) to a texture uv (0..1, v down).
   * dense (default true): a thin-plate spline from the canonical face to the anchors' uv gives every landmark a uv
   * and the texture is drawn on the full face mesh. dense:false = sparse piecewise-affine (Delaunay of the anchors,
   * extended to the texture corners when `extend` is not false). `offset` is in eye-distance units, face frame.
   */
  | { kind: "anchors"; anchors: { index: number | number[]; uv: Vec2; offset?: Vec2 }[]; extend?: boolean; dense?: boolean };

type Anchor = { index: number | number[]; uv: Vec2; offset?: Vec2 };

/** Procedural 3D lash strip options. */
export interface LashOptions {
  /** Draw the lower lashes too (default true). */
  lower?: boolean;
  /** Length multiplier (1 = natural). */
  length?: number;
  /** Strands per upper lid (default 34). */
  density?: number;
  /** Upward curl, 0..1 (default 0.6). */
  curl?: number;
  /** Fan the outer strands outward (cat-eye), 0..1 (default 0.3). */
  flare?: number;
}

/** Convenience: a procedural 3D lash layer. */
export function lashLayer(opacity: number, color = "#1a1210", opts: LashOptions = {}): MakeupLayer {
  return { region: "lashes", opacity, color, lash3d: opts };
}

export interface MakeupLayer {
  region: MakeupRegion;
  /** Hex color (#rrggbb). Default black. */
  color?: string;
  /** 0..1 */
  opacity: number;
  /** Blend mode name (see blendCode): normal, multiply, screen, overlay, softlight, ... */
  blend?: string;
  /** Edge softness multiplier (1 = default). */
  feather?: number;
  /**
   * Shape variant of the region:
   * lips: full | gradient | blurred; eyeshadow: lid | smoky | crease; eyeliner: thin | wing | cat | lower;
   * brows: natural | soft | bold; blush: apple | lifted | wide; contour: soft | sculpt;
   * mark: cheek | lip | eye | chin | nose (beauty mark position); lens: ring | starburst | solid (iris pattern) or
   * catch-dot | catch-soft | catch-ring | catch-window | catch-star | catch-twin (catchlight shapes).
   */
  style?: string;
  /** Lips: 0..1 luminance-driven sheen. */
  gloss?: number;
  /** Lips: extra gloss pass. glass = clear specular highlights, glitter = animated sparkles. `opacity` = strength. */
  lipGloss?: "glass" | "glitter";
  /** Draw a procedural 3D lash strip instead of a flat region. */
  lash3d?: LashOptions;
  /** Restrict to one side: "right" / "left" (subject's side). Default both. */
  side?: "right" | "left";
  /** Optional texture: replaces the region geometry with the texture mapping. */
  texture?: {
    url: string;
    mapping: TextureMapping;
    /**
     * rgba: texture colors; tint: color x texture rgb; alpha: flat color with texture alpha (or luminance if opaque);
     * r / g / b: flat color masked by that channel; contour: R channel 128 = neutral, above = highlight, below = shade.
     */
    mode?: "rgba" | "tint" | "alpha" | "r" | "g" | "b" | "contour";
  };
}

export interface MakeupParams {
  layers?: MakeupLayer[];
  /** 0..1 */ teethWhiten?: number;
  /** 0..1 brighten and neutralise the eye whites */ eyeWhiten?: number;
  /** 0..1 lighten under-eye dark circles / bags */ darkCircle?: number;
  /** 0..1 smooth nasolabial folds, forehead lines, crow's feet */ wrinkle?: number;
}

export function makeupActive(m?: MakeupParams): boolean {
  if (!m) return false;
  return !!((m.layers && m.layers.some((l) => l.opacity > 0.001)) || (m.teethWhiten ?? 0) > 0.001 || (m.eyeWhiten ?? 0) > 0.001 || (m.darkCircle ?? 0) > 0.001 || (m.wrinkle ?? 0) > 0.001);
}

// ---------- geometry ----------
/** vertex: x, y (px), u, v, alpha */
type V = [number, number, number, number, number];
type Geo = number[];

const vtx = (p: Vec2, a: number, uv: Vec2 = [0, 0]): V => [p[0], p[1], uv[0], uv[1], a];
const sstep = (e0: number, e1: number, x: number) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
/** Polyline vertices whose alpha fades to 0 at the ends (so open strips have no hard caps). */
const tv = (ps: Vec2[], a: number, edge = 0.3, ends: "both" | "start" | "end" = "both"): V[] => ps.map((p, i) => {
  const t = ps.length > 1 ? i / (ps.length - 1) : 0.5;
  const k = (ends === "end" ? 1 : sstep(0, edge, t)) * (ends === "start" ? 1 : sstep(0, edge, 1 - t));
  return vtx(p, a * k);
});
const push = (g: Geo, ...vs: V[]) => { for (const v of vs) g.push(...v); };
const strip = (g: Geo, A: V[], B: V[], closed = false) => {
  const n = closed ? A.length : A.length - 1;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % A.length;
    push(g, A[i], A[j], B[i], B[i], A[j], B[j]);
  }
};
const fan = (g: Geo, c: V, loop: V[], closed = true) => {
  const n = closed ? loop.length : loop.length - 1;
  for (let i = 0; i < n; i++) push(g, c, loop[i], loop[(i + 1) % loop.length]);
};
const centroid = (ps: Vec2[]): Vec2 => [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length];
const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
/** Offsets a polyline/loop away from `away` by d (px), using vertex normals. */
function offset(ps: Vec2[], d: number, away: Vec2, closed = true): Vec2[] {
  return ps.map((p, i) => {
    const a = ps[closed ? (i - 1 + ps.length) % ps.length : Math.max(0, i - 1)];
    const b = ps[closed ? (i + 1) % ps.length : Math.min(ps.length - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const l = Math.hypot(nx, ny) || 1;
    nx /= l; ny /= l;
    if (nx * (p[0] - away[0]) + ny * (p[1] - away[1]) < 0) { nx = -nx; ny = -ny; }
    return [p[0] + nx * d, p[1] + ny * d];
  });
}
/** Resample a polyline to n points (by arc length). */
function resample(ps: Vec2[], n: number): Vec2[] {
  const seg: number[] = [0];
  for (let i = 1; i < ps.length; i++) seg.push(seg[i - 1] + Math.hypot(ps[i][0] - ps[i - 1][0], ps[i][1] - ps[i - 1][1]));
  const L = seg[seg.length - 1] || 1, out: Vec2[] = [];
  for (let k = 0; k < n; k++) {
    const t = (k / (n - 1)) * L;
    let i = 1;
    while (i < seg.length - 1 && seg[i] < t) i++;
    const f = (t - seg[i - 1]) / ((seg[i] - seg[i - 1]) || 1);
    out.push(lerp(ps[i - 1], ps[i], f));
  }
  return out;
}
/** Filled feathered polygon: interior alpha 1, fading to 0 over `f` px outside. */
function featherPoly(g: Geo, loop: Vec2[], f: number, a = 1) {
  const c = centroid(loop);
  const inner = loop.map((p) => vtx(p, a));
  fan(g, vtx(c, a), inner);
  strip(g, inner, offset(loop, f, c).map((p) => vtx(p, 0)), true);
}
/** Soft ellipse (radial gradient), axes along ux / uy. */
function softEllipse(g: Geo, c: Vec2, rx: number, ry: number, ux: Vec2, uy: Vec2, a = 1, n = 28) {
  // gaussian-like radial profile
  const rings = [0.2, 0.4, 0.6, 0.8, 1].map((r) => Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2, x = Math.cos(t) * rx * r, y = Math.sin(t) * ry * r;
    const al = r >= 1 ? 0 : Math.exp(-r * r * 3.2) * (1 - r * r);
    return vtx([c[0] + ux[0] * x + uy[0] * y, c[1] + ux[1] * x + uy[1] * y], al * a);
  }));
  fan(g, vtx(c, a), rings[0]);
  for (let k = 0; k < rings.length - 1; k++) strip(g, rings[k], rings[k + 1], true);
}

interface Ctx { px: Float32Array; p: (i: number) => Vec2; ed: number; ux: Vec2; uy: Vec2; center: Vec2 }

function ctxOf(face: FaceData, w: number, h: number): Ctx {
  const px = toPixels(face, w, h);
  const fr = faceFrame(px);
  return { px, p: (i) => [px[i * 3], px[i * 3 + 1]], ed: fr.eyeDist, ux: fr.ux, uy: fr.uy, center: fr.center };
}

type Side = "right" | "left";
const sides = (s?: Side): Side[] => (s ? [s] : ["right", "left"]);

function regionGeometry(region: MakeupRegion, c: Ctx, feather: number, side?: Side, style?: string): Geo {
  const g: Geo = [];
  const P = (ids: readonly number[]) => ids.map(c.p);
  const F = c.ed * 0.05 * feather;
  switch (region) {
    case "lips": {
      const outer = P(IDX.lipsOuter), inner = P(IDX.lipsInner);
      const oc = centroid(outer);
      // ring between the outer and inner lip loops (open mouths stay clear; collapses when closed).
      // gradient: colour concentrated toward the inner lip; blurred: soft, diffused edge
      const edgeA = style === "gradient" ? 0.15 : 1;
      const mid = outer.map((q, i) => lerp(q, inner[i], 0.45));
      strip(g, outer.map((q) => vtx(q, edgeA)), mid.map((q) => vtx(q, 1)), true);
      strip(g, mid.map((q) => vtx(q, 1)), inner.map((q) => vtx(q, 1)), true);
      const f = style === "blurred" ? F * 1.6 : style === "gradient" ? F * 0.3 : F * 0.5;
      strip(g, outer.map((q) => vtx(q, edgeA)), offset(outer, f, oc).map((q) => vtx(q, 0)), true);
      break;
    }
    case "brows":
      for (const s of sides(side)) {
        const up = P(s === "right" ? IDX.rightBrowUpper : IDX.leftBrowUpper), lo = P(s === "right" ? IDX.rightBrowLower : IDX.leftBrowLower);
        const ctr = centroid([...up, ...lo]);
        // bold: thicker toward the head of the brow; soft: wider feather and lighter tail
        const grow = style === "bold" ? c.ed * 0.012 : 0;
        const upO = grow ? offset(up, grow, ctr, false) : up, loO = grow ? offset(lo, grow * 0.5, ctr, false) : lo;
        const loop = [...upO, ...[...loO].reverse()];
        featherPoly(g, loop, F * (style === "soft" ? 1.1 : 0.6), style === "soft" ? 0.75 : 1);
      }
      break;
    case "eyeshadow":
      for (const s of sides(side)) {
        const lid = resample(P(s === "right" ? IDX.rightEyeUpper : IDX.leftEyeUpper), 11);
        const brow = resample(P(s === "right" ? IDX.rightBrowLower : IDX.leftBrowLower), 11);
        const ec = centroid(P(s === "right" ? IDX.rightEye : IDX.leftEye));
        const lid2 = offset(lid, c.ed * 0.012, ec, false);
        const reach = style === "smoky" ? 0.75 : style === "crease" ? 0.55 : 0.6;
        const top = lid.map((q, i) => lerp(q, brow[i], reach));
        const mid = lid.map((q, i) => lerp(q, brow[i], style === "crease" ? 0.38 : 0.25));
        // crease: colour concentrated in a band above the lid; lid / smoky: strongest at the lash line
        const aLid = style === "crease" ? 0.35 : 1, aMid = style === "crease" ? 1 : 0.85;
        const out0: Vec2 = [lid[0][0] + (lid[0][0] - lid[10][0]) * 0.18 - c.uy[0] * c.ed * 0.03, lid[0][1] + (lid[0][1] - lid[10][1]) * 0.18 - c.uy[1] * c.ed * 0.03];
        strip(g, tv(lid2, aLid, 0.25, "end"), tv(mid, aMid, 0.25, "end"));
        strip(g, tv(mid, aMid, 0.25, "end"), top.map((q) => vtx(q, 0)));
        push(g, vtx(lid2[0], aLid), vtx(mid[0], aMid), vtx(out0, 0));
        // lower lash line (stronger for smoky)
        const low = P(s === "right" ? IDX.rightEyeLower : IDX.leftEyeLower);
        const lowOut = offset(low, c.ed * (style === "smoky" ? 0.07 : 0.04), ec, false);
        strip(g, tv(low, style === "smoky" ? 0.7 : 0.35, 0.35), lowOut.map((q) => vtx(q, 0)));
      }
      break;
    case "eyeliner":
    case "lashes":
      for (const s of sides(side)) {
        const ec = centroid(P(s === "right" ? IDX.rightEye : IDX.leftEye));
        if (style === "lower") {
          const low = resample(P(s === "right" ? IDX.rightEyeLower : IDX.leftEyeLower), 11);
          const out = offset(low, c.ed * 0.014, ec, false);
          strip(g, tv(low, 1, 0.3, "end"), tv(out, 0.9, 0.3, "end"));
          strip(g, tv(out, 0.9, 0.3, "end"), offset(low, c.ed * 0.03, ec, false).map((q) => vtx(q, 0)));
          continue;
        }
        const lid = resample(P(s === "right" ? IDX.rightEyeUpper : IDX.leftEyeUpper), 13); // outer -> inner
        const base = region === "lashes" ? 0.035 : style === "thin" ? 0.013 : 0.022;
        const thick = (i: number) => c.ed * base * (1 - (i / 12) * 0.7);
        const off1 = offset(lid, 1, ec, false);
        const mid = lid.map((q, i) => lerp(q, off1[i], thick(i)));
        const edge = lid.map((q, i) => lerp(q, off1[i], thick(i) * 1.7));
        const inner = offset(lid, c.ed * 0.004, ec, false).map((q, i) => lerp(q, lid[i], 2)); // tiny overlap into the lid
        strip(g, tv(inner, 1, 0.15, "end"), tv(mid, 1, 0.15, "end"));
        strip(g, tv(mid, 1, 0.15, "end"), edge.map((q) => vtx(q, 0)));
        if (style === "thin") continue;
        // wing: extends the lid line past the outer corner, upward
        const len = style === "cat" ? 0.4 : 0.22, rise = style === "cat" ? 0.1 : 0.05;
        const dir: Vec2 = [lid[0][0] - lid[12][0], lid[0][1] - lid[12][1]];
        const wing: Vec2 = [lid[0][0] + dir[0] * len - c.uy[0] * c.ed * rise, lid[0][1] + dir[1] * len - c.uy[1] * c.ed * rise];
        push(g, vtx(lid[2], 1), vtx(mid[0], 1), vtx(wing, 1));
        push(g, vtx(lid[0], 1), vtx(lid[2], 1), vtx(wing, 1));
        push(g, vtx(mid[0], 1), vtx(edge[0], 0), vtx(wing, 0.6));
      }
      break;
    case "blush":
      for (const s of sides(side)) {
        const apple = s === "right" ? lerp(c.p(205), c.p(116), 0.35) : lerp(c.p(425), c.p(345), 0.35);
        if (style === "lifted") {
          // diagonal sweep from the cheek apple toward the temple
          const temple = c.p(s === "right" ? 127 : 356);
          const a = lerp(apple, temple, 0.15), b = lerp(apple, temple, 0.55);
          const d: Vec2 = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(d[0], d[1]) || 1;
          const ax: Vec2 = [d[0] / l, d[1] / l], ay: Vec2 = [-ax[1], ax[0]];
          softEllipse(g, lerp(a, b, 0.5), c.ed * 0.4 * feather, c.ed * 0.18 * feather, ax, ay);
        } else if (style === "wide") {
          softEllipse(g, lerp(apple, c.p(s === "right" ? 234 : 454), 0.2), c.ed * 0.5 * feather, c.ed * 0.3 * feather, c.ux, c.uy);
        } else softEllipse(g, apple, c.ed * 0.36 * feather, c.ed * 0.26 * feather, c.ux, c.uy);
      }
      break;
    case "contour":
      for (const s of sides(side)) {
        const ids = s === "right" ? [162, 127, 234, 93, 132, 58, 172, 136] : [389, 356, 454, 323, 361, 288, 397, 365];
        const edge = P(ids);
        const inside = edge.map((q) => lerp(q, c.center, 0.22 * feather));
        const outside = offset(edge, c.ed * 0.02, c.center, false);
        strip(g, tv(edge, 1, 0.35), inside.map((q) => vtx(q, 0)));
        strip(g, tv(edge, 1, 0.35), outside.map((q) => vtx(q, 0)));
        if (style === "sculpt") {
          // hollow under the cheekbone: from the ear toward the mouth corner
          const ear = c.p(s === "right" ? 93 : 323), mouth = c.p(s === "right" ? 61 : 291);
          const a = lerp(ear, mouth, 0.1), b = lerp(ear, mouth, 0.55);
          const d: Vec2 = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(d[0], d[1]) || 1;
          const ax: Vec2 = [d[0] / l, d[1] / l], ay: Vec2 = [-ax[1], ax[0]];
          softEllipse(g, lerp(a, b, 0.5), l * 0.6, c.ed * 0.09, ax, ay, 0.8);
        }
      }
      break;
    case "highlight": {
      const bridge = P([168, 6, 197, 195, 5]);
      const wv = c.ed * 0.05 * feather;
      const L = bridge.map((q) => vtx([q[0] - c.ux[0] * wv, q[1] - c.ux[1] * wv], 0));
      const M = tv(bridge, 1, 0.3);
      const R = bridge.map((q) => vtx([q[0] + c.ux[0] * wv, q[1] + c.ux[1] * wv], 0));
      strip(g, L, M); strip(g, M, R);
      softEllipse(g, lerp(c.p(151), c.p(9), 0.3), c.ed * 0.22, c.ed * 0.16, c.ux, c.uy, 0.5);
      softEllipse(g, lerp(c.p(152), c.p(17), 0.45), c.ed * 0.12, c.ed * 0.07, c.ux, c.uy, 0.8);
      for (const s of sides(side)) softEllipse(g, s === "right" ? lerp(c.p(117), c.p(118), 0.5) : lerp(c.p(346), c.p(347), 0.5), c.ed * 0.24, c.ed * 0.12, c.ux, c.uy, 0.6);
      break;
    }
    case "lens":
      for (const s of sides(side)) {
        const ctr = c.p(s === "right" ? 468 : 473);
        const ring = s === "right" ? [469, 470, 471, 472] : [474, 475, 476, 477];
        const r = ring.reduce((acc, i) => acc + Math.hypot(c.p(i)[0] - ctr[0], c.p(i)[1] - ctr[1]), 0) / 4;
        const n = 32;
        const loop = Array.from({ length: n }, (_, i) => {
          const t = (i / n) * Math.PI * 2;
          return vtx([ctr[0] + Math.cos(t) * r, ctr[1] + Math.sin(t) * r], 1, [0.5 + Math.cos(t) * 0.5, 0.5 + Math.sin(t) * 0.5]);
        });
        const edge = loop.map((v) => vtx([ctr[0] + (v[0] - ctr[0]) * 1.08, ctr[1] + (v[1] - ctr[1]) * 1.08], 0, [0.5 + (v[2] - 0.5) * 1.08, 0.5 + (v[3] - 0.5) * 1.08]));
        fan(g, vtx(ctr, 1, [0.5, 0.5]), loop);
        strip(g, loop, edge, true);
      }
      break;
    case "mark": {
      // beauty mark: a small soft dot at a landmark-relative spot (subject's right side unless `side`)
      const at: Record<string, [number, number, number]> = {
        cheek: [118, 50, 0.45], lip: [40, 186, 0.6], eye: [33, 130, 1.25], chin: [175, 152, 0.4], nose: [49, 129, 0.5],
      };
      const [a, b, t] = at[style ?? "cheek"] ?? at.cheek;
      const flip = side === "left";
      const pa = c.p(flip ? MIRROR[a] ?? a : a), pb = c.p(flip ? MIRROR[b] ?? b : b);
      softEllipse(g, lerp(pa, pb, t), c.ed * 0.022 * feather, c.ed * 0.02 * feather, c.ux, c.uy, 1, 16);
      break;
    }
    case "face":
      featherPoly(g, P(IDX.faceOval), F);
      break;
  }
  return g;
}

/** Left/right counterparts of the landmarks used for beauty marks. */
const MIRROR: Record<number, number> = { 118: 347, 50: 280, 40: 270, 186: 410, 33: 263, 130: 359, 175: 175, 152: 152, 49: 279, 129: 358 };

/** Bowyer-Watson Delaunay triangulation (small point sets). Returns index triples. */
export function delaunay(pts: Vec2[]): number[] {
  const n = pts.length;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const d = Math.max(maxX - minX, maxY - minY) * 20 || 1, mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
  const P = [...pts, [mx - d, my - d] as Vec2, [mx + d, my - d] as Vec2, [mx, my + d] as Vec2];
  let tris: [number, number, number][] = [[n, n + 1, n + 2]];
  const circ = (t: [number, number, number], p: Vec2) => {
    const [a, b, c] = t.map((i) => P[i]);
    const ax = a[0] - p[0], ay = a[1] - p[1], bx = b[0] - p[0], by = b[1] - p[1], cx = c[0] - p[0], cy = c[1] - p[1];
    const det = (ax * ax + ay * ay) * (bx * cy - cx * by) - (bx * bx + by * by) * (ax * cy - cx * ay) + (cx * cx + cy * cy) * (ax * by - bx * ay);
    const orient = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    return orient > 0 ? det > 0 : det < 0;
  };
  for (let i = 0; i < n; i++) {
    const bad = tris.filter((t) => circ(t, P[i]));
    const edges: [number, number][] = [];
    for (const t of bad) for (let k = 0; k < 3; k++) {
      const e: [number, number] = [t[k], t[(k + 1) % 3]];
      const shared = bad.some((o) => o !== t && o.includes(e[0]) && o.includes(e[1]));
      if (!shared) edges.push(e);
    }
    tris = tris.filter((t) => !bad.includes(t));
    for (const [a, b] of edges) tris.push([a, b, i]);
  }
  return tris.filter((t) => t.every((i) => i < n)).flat();
}

const anchorTriCache = new WeakMap<object, number[]>();
const tpsCache = new WeakMap<object, Float32Array>();

/** Canonical winding sign of each FACE_TRIS triangle (frontal face, y down). */
const CANON_SIGN = (() => {
  const out = new Int8Array(FACE_TRIS.length / 3);
  for (let t = 0; t < out.length; t++) {
    const [a, b, c] = [FACE_TRIS[t * 3], FACE_TRIS[t * 3 + 1], FACE_TRIS[t * 3 + 2]];
    const ax = CANONICAL_POS[a * 3], ay = -CANONICAL_POS[a * 3 + 1];
    const cr = (CANONICAL_POS[b * 3] - ax) * (-CANONICAL_POS[c * 3 + 1] - ay) - (-CANONICAL_POS[b * 3 + 1] - ay) * (CANONICAL_POS[c * 3] - ax);
    out[t] = cr >= 0 ? 1 : -1;
  }
  return out;
})();

/**
 * FACE_TRIS indices without the triangles that face away from the camera (folded over on turned faces), so
 * face-mapped textures don't smear on the far cheek. Works on mirrored views (orientation is taken from the majority).
 */
export function frontFacingTris(p: (i: number) => Vec2): number[] {
  const n = FACE_TRIS.length / 3, signs = new Int8Array(n);
  let sum = 0;
  for (let t = 0; t < n; t++) {
    const A = p(FACE_TRIS[t * 3]), B = p(FACE_TRIS[t * 3 + 1]), C = p(FACE_TRIS[t * 3 + 2]);
    const cr = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
    signs[t] = (cr >= 0 ? 1 : -1) * CANON_SIGN[t];
    sum += signs[t];
  }
  const want = sum >= 0 ? 1 : -1, out: number[] = [];
  for (let t = 0; t < n; t++) if (signs[t] === want) out.push(FACE_TRIS[t * 3], FACE_TRIS[t * 3 + 1], FACE_TRIS[t * 3 + 2]);
  return out;
}

/** Canonical (frontal) 2D position of landmark i, y down, in canonical IOD units. */
function canon(i: number): Vec2 {
  if (i === 468 || i === 473) {
    const loop = i === 468 ? IDX.rightEye : IDX.leftEye;
    return centroid(loop.map((k) => canon(k)));
  }
  return [CANONICAL_POS[i * 3] / CANON_IOD, -CANONICAL_POS[i * 3 + 1] / CANON_IOD];
}
const CANON_IOD = (() => {
  const c = (a: number, b: number) => [(CANONICAL_POS[a * 3] + CANONICAL_POS[b * 3]) / 2, (CANONICAL_POS[a * 3 + 1] + CANONICAL_POS[b * 3 + 1]) / 2];
  const r = c(33, 133), l = c(263, 362);
  return Math.hypot(l[0] - r[0], l[1] - r[1]);
})();

/** Thin-plate spline canonical-face -> template uv, evaluated for all 478 landmarks (cached per mapping). */
function tpsUv(mapping: { anchors: Anchor[] }): Float32Array {
  const hit = tpsCache.get(mapping);
  if (hit) return hit;
  const src = mapping.anchors.map((a) => {
    const ids = Array.isArray(a.index) ? a.index : [a.index];
    const q = centroid(ids.map(canon));
    const o = a.offset ?? [0, 0];
    return [q[0] + o[0], q[1] + o[1]] as Vec2;
  });
  const n = src.length, N = n + 3;
  const U = (r2: number) => (r2 < 1e-12 ? 0 : r2 * Math.log(r2) * 0.5);
  const M: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) M[i][j] = U((src[i][0] - src[j][0]) ** 2 + (src[i][1] - src[j][1]) ** 2) + (i === j ? 1e-4 : 0);
    M[i][n] = M[n][i] = 1; M[i][n + 1] = M[n + 1][i] = src[i][0]; M[i][n + 2] = M[n + 2][i] = src[i][1];
  }
  const solve = (b: number[]) => {
    const m = M.map((r, i) => [...r, b[i]]);
    for (let i = 0; i < N; i++) {
      let piv = i;
      for (let r = i + 1; r < N; r++) if (Math.abs(m[r][i]) > Math.abs(m[piv][i])) piv = r;
      [m[i], m[piv]] = [m[piv], m[i]];
      const d = m[i][i] || 1e-12;
      for (let r = 0; r < N; r++) if (r !== i) { const f = m[r][i] / d; if (f) for (let k = i; k <= N; k++) m[r][k] -= f * m[i][k]; }
    }
    return m.map((r, i) => r[N] / (r[i] || 1e-12));
  };
  const cu = solve([...mapping.anchors.map((a) => a.uv[0]), 0, 0, 0]);
  const cv = solve([...mapping.anchors.map((a) => a.uv[1]), 0, 0, 0]);
  const out = new Float32Array(478 * 2);
  for (let k = 0; k < 478; k++) {
    const [x, y] = canon(k < 468 ? k : k < 473 ? 468 : 473);
    let u = cu[n] + cu[n + 1] * x + cu[n + 2] * y, v = cv[n] + cv[n + 1] * x + cv[n + 2] * y;
    for (let i = 0; i < n; i++) { const w = U((x - src[i][0]) ** 2 + (y - src[i][1]) ** 2); u += cu[i] * w; v += cv[i] * w; }
    out[k * 2] = u; out[k * 2 + 1] = v;
  }
  tpsCache.set(mapping, out);
  return out;
}

/** Least-squares affine map uv -> px: returns [a, b, c, d, e, f] with x = a u + b v + c, y = d u + e v + f. */
function affineFit(uv: Vec2[], px: Vec2[]): number[] {
  // normal equations for [u v 1]
  let suu = 0, suv = 0, su = 0, svv = 0, sv = 0, n = 0;
  const bx = [0, 0, 0], by = [0, 0, 0];
  uv.forEach(([u, v], i) => {
    suu += u * u; suv += u * v; su += u; svv += v * v; sv += v; n++;
    bx[0] += u * px[i][0]; bx[1] += v * px[i][0]; bx[2] += px[i][0];
    by[0] += u * px[i][1]; by[1] += v * px[i][1]; by[2] += px[i][1];
  });
  const M = [[suu, suv, su], [suv, svv, sv], [su, sv, n]];
  const solve = (b: number[]) => {
    const m = M.map((r, i) => [...r, b[i]]);
    for (let i = 0; i < 3; i++) {
      let piv = i;
      for (let r = i + 1; r < 3; r++) if (Math.abs(m[r][i]) > Math.abs(m[piv][i])) piv = r;
      [m[i], m[piv]] = [m[piv], m[i]];
      const d = m[i][i] || 1e-9;
      for (let r = 0; r < 3; r++) if (r !== i) { const f = m[r][i] / d; for (let k = i; k < 4; k++) m[r][k] -= f * m[i][k]; }
    }
    return [m[0][3] / (m[0][0] || 1e-9), m[1][3] / (m[1][1] || 1e-9), m[2][3] / (m[2][2] || 1e-9)];
  };
  return [...solve(bx), ...solve(by)];
}

/** Geometry for a textured layer (alpha 1, uv from the mapping). */
function textureGeometry(mapping: TextureMapping, c: Ctx): Geo {
  const g: Geo = [];
  if (mapping.kind === "region") return g;
  if (mapping.kind === "canonical") {
    for (const i of frontFacingTris(c.p)) push(g, vtx(c.p(i), 1, [CANONICAL_UV[i * 2], CANONICAL_UV[i * 2 + 1]]));
    return g;
  }
  if (mapping.dense !== false) {
    const uvs = tpsUv(mapping);
    for (const i of frontFacingTris(c.p)) push(g, vtx(c.p(i), 1, [uvs[i * 2], uvs[i * 2 + 1]]));
    return g;
  }
  const pos = mapping.anchors.map((a) => {
    const ids = Array.isArray(a.index) ? a.index : [a.index];
    const q = centroid(ids.map(c.p));
    const o = a.offset ?? [0, 0];
    return [q[0] + (o[0] * c.ux[0] + o[1] * c.uy[0]) * c.ed, q[1] + (o[0] * c.ux[1] + o[1] * c.uy[1]) * c.ed] as Vec2;
  });
  const uvs = mapping.anchors.map((a) => a.uv);
  if (mapping.extend !== false) {
    // least-squares affine uv -> px from the anchors, used to place the texture border
    const fit = affineFit(uvs, pos);
    for (const [u, v] of [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]] as Vec2[]) {
      uvs.push([u, v]);
      pos.push([fit[0] * u + fit[1] * v + fit[2], fit[3] * u + fit[4] * v + fit[5]]);
    }
  }
  let tris = anchorTriCache.get(mapping);
  if (!tris) { tris = delaunay(uvs); anchorTriCache.set(mapping, tris); }
  for (const i of tris) push(g, vtx(pos[i], 1, uvs[i]));
  return g;
}

/** Deterministic per-strand jitter (0..1). */
const jitter = (i: number, k: number) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };

/**
 * Procedural 3D lash strip on one eye. Strands are rooted along the lid (arc length, outer -> inner corner) and grow
 * in the lid frame: out of the lid (away from the eye), up the head and toward the camera, curling upward. Each
 * strand is a tapered ribbon of 4 segments, projected orthographically with the head pose. uv.x = across the strand
 * (0..1), uv.y = along it (0 root .. 1 tip); the lash shader turns that into a soft tapered hair.
 */
function lashGeometry(g: Geo, c: Ctx, side: Side, o: LashOptions) {
  const B = headBasis3(c.px);
  const P3 = (i: number): [number, number, number] => [c.px[i * 3], c.px[i * 3 + 1], c.px[i * 3 + 2]];
  const lids: [readonly number[], boolean][] = [[side === "right" ? IDX.rightEyeUpper : IDX.leftEyeUpper, true]];
  if (o.lower !== false) lids.push([side === "right" ? IDX.rightEyeLower : IDX.leftEyeLower, false]);
  const curl = o.curl ?? 0.6, flare = o.flare ?? 0.3, lenK = o.length ?? 1;
  for (const [ids, upper] of lids) {
    const lid = ids.map(P3); // outer -> inner
    const seg = [0];
    for (let i = 1; i < lid.length; i++) seg.push(seg[i - 1] + Math.hypot(lid[i][0] - lid[i - 1][0], lid[i][1] - lid[i - 1][1], lid[i][2] - lid[i - 1][2]));
    const L = seg[seg.length - 1] || 1;
    const at = (f: number): [number, number, number] => {
      const t = f * L;
      let i = 1;
      while (i < seg.length - 1 && seg[i] < t) i++;
      const k = (t - seg[i - 1]) / ((seg[i] - seg[i - 1]) || 1);
      return [0, 1, 2].map((d) => lid[i - 1][d] + (lid[i][d] - lid[i - 1][d]) * k) as [number, number, number];
    };
    const a = lid[0], b = lid[lid.length - 1];
    const chord = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1;
    const ex = [(b[0] - a[0]) / chord, (b[1] - a[1]) / chord, (b[2] - a[2]) / chord]; // outer -> inner
    const up = [-B.Y[0], -B.Y[1], -B.Y[2]], z = B.Z;
    const vert = upper ? 1 : -1;
    // eye centre (3D): average of both lids' corners
    const ctr = [0, 1, 2].map((d) => (a[d] + b[d]) / 2);
    const n = Math.round((o.density ?? 34) * (upper ? 1 : 0.4));
    const len = chord * (upper ? 0.24 : 0.1) * lenK, wid = chord * (upper ? 0.011 : 0.008);
    const unit = (v: number[]) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return v.map((x) => x / l); };
    for (let s = 0; s < n; s++) {
      const f = (s + 0.5 + (jitter(s, 1) - 0.5) * 0.7) / n;
      const root = at(Math.min(0.98, Math.max(0.02, f)));
      // longer toward the outer third of the lid, short at both corners
      const prof = Math.pow(Math.sin(Math.PI * Math.min(1, f * 1.1)), 0.6) * (0.7 + 0.45 * (1 - f)) * (0.8 + 0.4 * jitter(s, 2));
      const l = len * prof;
      // start direction: away from the eye centre (radial in the lid plane), lifted toward the camera
      const radial = unit([root[0] - ctr[0], root[1] - ctr[1], root[2] - ctr[2]]);
      const out = unit([radial[0] + up[0] * vert * 0.6 + z[0] * 0.5, radial[1] + up[1] * vert * 0.6 + z[1] * 0.5, radial[2] + up[2] * vert * 0.6 + z[2] * 0.5]);
      // fan: outer strands lean toward the outer corner (flare), with a little random spread
      const fan = (-(1 - f) * flare * 0.8 + (jitter(s, 3) - 0.5) * 0.18) * vert;
      const pts: number[][] = [root];
      let p = root, dir = out;
      for (let k = 1; k <= 4; k++) {
        // curl: bend the strand toward "up" (away from the eye for the lower lid) along its length
        const c = curl * 0.55 * (k / 4);
        dir = unit([dir[0] + up[0] * vert * c + ex[0] * fan * 0.35, dir[1] + up[1] * vert * c + ex[1] * fan * 0.35, dir[2] + up[2] * vert * c + ex[2] * fan * 0.35]);
        p = [p[0] + dir[0] * l / 4, p[1] + dir[1] * l / 4, p[2] + dir[2] * l / 4];
        pts.push(p);
      }
      for (let k = 0; k < 4; k++) {
        const p0 = pts[k], p1 = pts[k + 1];
        const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dl = Math.hypot(dx, dy) || 1;
        const nx = -dy / dl, ny = dx / dl;
        const w0 = wid * (1 - k / 4) + wid * 0.12, w1 = wid * (1 - (k + 1) / 4) + wid * 0.12;
        const v0 = k / 4, v1 = (k + 1) / 4;
        const A: V = [p0[0] - nx * w0, p0[1] - ny * w0, 0, v0, 1], Bv: V = [p0[0] + nx * w0, p0[1] + ny * w0, 1, v0, 1];
        const Cv: V = [p1[0] - nx * w1, p1[1] - ny * w1, 0, v1, 1], D: V = [p1[0] + nx * w1, p1[1] + ny * w1, 1, v1, 1];
        push(g, A, Bv, Cv, Cv, Bv, D);
      }
    }
  }
}

// ---------- shaders ----------
const LAYER_VERT = `
attribute vec2 position;
attribute vec2 texCoord;
attribute float alpha;
uniform highp vec2 res;
varying vec2 vTc;
varying float vA;
void main() {
  vTc = texCoord; vA = alpha;
  gl_Position = vec4(position.x / res.x * 2.0 - 1.0, 1.0 - position.y / res.y * 2.0, 0.0, 1.0);
}`;

const LAYER_FRAG = `
precision mediump float;
varying vec2 vTc;
varying float vA;
uniform sampler2D base;
uniform sampler2D tex;
uniform sampler2D mask;
uniform highp vec2 res;
uniform vec3 color;
uniform float opacity;
uniform int mode;
uniform int texMode; // 0 none, 1 rgba, 2 tint, 3 alpha, 4 r, 5 g, 6 b, 7 contour, 8 procedural iris
uniform int iris;    // iris pattern: 0 ring, 1 starburst, 2 solid
uniform float useMask;
uniform float gloss;
${BLEND_GLSL}
float hash11(float n) { return fract(sin(n * 91.3458) * 47453.5453); }
// procedural iris: radial fibres, a darker limbal ring and a clear pupil, in the disk uv of the lens region
vec4 irisPattern(vec2 uv, vec3 tint) {
  vec2 p = uv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float fib = 0.5 + 0.5 * sin(a * 37.0 + sin(a * 11.0) * 2.0) * 0.6 + 0.2 * sin(a * 83.0);
  vec3 c = tint;
  if (iris == 0) c *= mix(1.15, 0.55, smoothstep(0.62, 0.98, r)) * mix(0.85, 1.1, fib);
  else if (iris == 1) c = mix(c * 0.7, min(c * 1.6 + 0.1, 1.0), smoothstep(0.75, 0.2, r) * fib);
  float pupil = smoothstep(0.26, 0.36, r);
  if (iris >= 3) {
    // catchlights: white highlight shapes, upper left of the iris
    vec2 q = p - vec2(-0.32, -0.34);
    float k = 0.0;
    if (iris == 3) k = 1.0 - smoothstep(0.12, 0.2, length(q));
    else if (iris == 4) k = (1.0 - smoothstep(0.05, 0.42, length(q))) * 0.75;
    else if (iris == 5) k = 1.0 - smoothstep(0.03, 0.08, abs(r - 0.62));
    else if (iris == 6) { vec2 b = abs(q) - vec2(0.17, 0.15); float box = 1.0 - smoothstep(0.0, 0.03, max(b.x, b.y)); float bars = smoothstep(0.012, 0.03, abs(q.x)) * smoothstep(0.012, 0.03, abs(q.y)); k = box * bars; }
    else if (iris == 7) { vec2 a = abs(q); k = 1.0 - smoothstep(0.0, 0.025, min(a.x * (1.0 + a.y * 14.0), a.y * (1.0 + a.x * 14.0)) - 0.012); k *= 1.0 - smoothstep(0.18, 0.3, length(q)); }
    else k = max(1.0 - smoothstep(0.08, 0.13, length(q)), 1.0 - smoothstep(0.04, 0.08, length(p - vec2(0.3, 0.32))));
    return vec4(vec3(1.0), k * (1.0 - smoothstep(0.95, 1.0, r)));
  }
  return vec4(c, pupil * (1.0 - smoothstep(0.97, 1.0, r)));
}
void main() {
  vec2 uv = gl_FragCoord.xy / res;
  vec4 b = texture2D(base, uv);
  vec3 src = color;
  float a = vA * opacity;
  vec3 o;
  if (texMode > 0 && texMode < 8 && (vTc.x < 0.0 || vTc.y < 0.0 || vTc.x > 1.0 || vTc.y > 1.0)) a = 0.0;
  if (texMode == 7) {
    vec4 t = texture2D(tex, vTc);
    o = b.rgb + (t.r - 0.5) * 2.0 * 0.5;
    a *= t.a;
  } else {
    if (texMode == 8) {
      vec4 ip = irisPattern(vTc, color);
      src = ip.rgb; a *= ip.a;
    } else if (texMode > 0) {
      vec4 t = texture2D(tex, vTc);
      if (texMode == 1) { src = t.rgb; a *= t.a; }
      else if (texMode == 2) { src = src * t.rgb; a *= t.a; }
      else if (texMode == 3) { a *= t.a < 0.999 ? t.a : lumOf(t.rgb); }
      else if (texMode == 4) { a *= t.r * t.a; }
      else if (texMode == 5) { a *= t.g * t.a; }
      else { a *= t.b * t.a; }
    }
    o = blendMode(b.rgb, src, mode);
  }
  if (useMask > 0.5) a *= texture2D(mask, uv).r;
  if (gloss > 0.0) o += gloss * 0.45 * smoothstep(0.45, 0.85, lumOf(b.rgb));
  gl_FragColor = vec4(mix(b.rgb, clamp(o, 0.0, 1.0), clamp(a, 0.0, 1.0)), b.a);
}`;

/** Full-screen composite of a coverage mask (max-blended region geometry) with colour, sheen and glitter. */
const COMP_FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D base;
uniform sampler2D cov;
uniform sampler2D mask;
uniform highp vec2 res;
uniform vec3 color;
uniform float opacity;
uniform int mode;
uniform float useMask;
uniform float gloss;
uniform float glitter;
uniform float time;
${BLEND_GLSL}
float hash21(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
void main() {
  vec4 b = texture2D(base, vUv);
  float a = texture2D(cov, vUv).r * opacity;
  if (useMask > 0.5) a *= texture2D(mask, vUv).r;
  if (a <= 0.0) { gl_FragColor = b; return; }
  // glitter adds sparkles only (no colour wash)
  vec3 o = glitter > 0.0 ? b.rgb : blendMode(b.rgb, color, mode);
  if (gloss > 0.0) o += gloss * 0.45 * smoothstep(0.45, 0.85, lumOf(b.rgb));
  if (glitter > 0.0) {
    // sparse sparkle cells (about 3 px), each twinkling on its own phase
    vec2 q = vUv * res / 4.0;
    vec2 cell = floor(q);
    float h = hash21(cell);
    float spark = 1.0 - smoothstep(0.15, 0.45, length(fract(q) - 0.5));
    float tw = step(0.93, h) * spark * (0.55 + 0.45 * sin(time * 6.0 + h * 40.0));
    o += glitter * tw * mix(vec3(1.0), color, 0.3) * 1.3 + glitter * 0.04;
  }
  gl_FragColor = vec4(mix(b.rgb, clamp(o, 0.0, 1.0), clamp(a, 0.0, 1.0)), b.a);
}`;

/** Lash strands: colour with a soft, tapered hair profile from the strand uv. */
const LASH_FRAG = `
precision mediump float;
varying vec2 vTc;
varying float vA;
uniform vec3 color;
uniform float opacity;
void main() {
  float across = 1.0 - pow(abs(vTc.x * 2.0 - 1.0), 1.5);
  float along = 1.0 - smoothstep(0.45, 1.0, vTc.y);
  gl_FragColor = vec4(color * (0.8 + 0.4 * vTc.y), clamp(across * (0.35 + 0.65 * along), 0.0, 1.0) * vA * opacity);
}`;

const MASK_FRAG = `
precision mediump float;
varying float vA;
varying vec2 vTc;
void main() { gl_FragColor = vec4(vA); }`;

const RETOUCH_FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D tex;
uniform sampler2D mask;
uniform vec2 texel;
uniform float teeth, eyeW, dark, wrinkle, scale;
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec4 src = texture2D(tex, vUv);
  vec3 c = src.rgb;
  vec4 m = texture2D(mask, vUv);
  float l = lum(c);
  float sat = max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
  if (eyeW > 0.0 && m.r > 0.0) {
    // sclera only (bright, low saturation): neutralise the redness and lift a little
    float k = m.r * eyeW * smoothstep(0.2, 0.45, l) * (1.0 - smoothstep(0.25, 0.5, sat));
    vec3 w = mix(vec3(l), c, 0.4);
    w = w + (1.0 - w) * 0.18;
    c = mix(c, w, k);
  }
  if (teeth > 0.0 && m.g > 0.0) {
    float k = m.g * teeth * smoothstep(0.25, 0.55, l);
    vec3 w = mix(vec3(l), c, 0.35);               // take out the yellow
    w = w + (1.0 - w) * 0.25;                     // lift
    w.b += 0.02;
    c = mix(c, w, k);
  }
  if (wrinkle > 0.0 && m.a > 0.0) {
    vec3 sum = vec3(0.0); float ws = 0.0;
    for (int x = -3; x <= 3; x++) for (int y = -3; y <= 3; y++) {
      vec2 o = vec2(float(x), float(y)) * texel * scale;
      vec3 s = texture2D(tex, vUv + o).rgb;
      float wgt = exp(-float(x*x + y*y) / 8.0) * exp(-dot(s - src.rgb, s - src.rgb) * 20.0);
      sum += s * wgt; ws += wgt;
    }
    vec3 sm = sum / ws;
    // lighten the folds (dark detail) more than the rest
    c = mix(c, max(c, sm), m.a * wrinkle);
    c = mix(c, sm, m.a * wrinkle * 0.6);
  }
  if (dark > 0.0 && m.b > 0.0) {
    float k = m.b * dark;
    vec3 sum = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785398;
      sum += texture2D(tex, vUv + vec2(cos(a), sin(a)) * texel * scale * 6.0).rgb;
    }
    vec3 avg = sum / 8.0;
    vec3 lifted = c + max(vec3(0.0), avg - c) * 1.2 + vec3(0.05, 0.045, 0.035) * (1.0 - smoothstep(0.35, 0.8, l));
    c = mix(c, lifted, k);
  }
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), src.a);
}`;

const IRIS_CODE: Record<string, number> = { ring: 0, starburst: 1, solid: 2, "catch-dot": 3, "catch-soft": 4, "catch-ring": 5, "catch-window": 6, "catch-star": 7, "catch-twin": 8 };

// ---------- compositor ----------

export class FaceMakeup {
  private layer: Prog;
  private maskProg: Prog;
  private retouch: Prog;
  private comp: Prog;
  private lash: Prog;
  private minmax: EXT_blend_minmax | null;
  private copy: Prog;
  private stream: Stream;
  private targets: Targets;
  readonly images: ImageCache;

  constructor(readonly gl: WebGLRenderingContext, images?: ImageCache) {
    this.layer = compile(gl, LAYER_VERT, LAYER_FRAG, ["base", "tex", "mask", "res", "color", "opacity", "mode", "texMode", "iris", "useMask", "gloss"], ["position", "texCoord", "alpha"]);
    this.maskProg = compile(gl, LAYER_VERT, MASK_FRAG, ["res"], ["position", "texCoord", "alpha"]);
    this.retouch = compile(gl, COPY_VERT, RETOUCH_FRAG, ["tex", "mask", "texel", "teeth", "eyeW", "dark", "wrinkle", "scale"], ["position"]);
    this.copy = compile(gl, COPY_VERT, COPY_FRAG, ["tex"], ["position"]);
    this.comp = compile(gl, COPY_VERT, COMP_FRAG, ["base", "cov", "mask", "res", "color", "opacity", "mode", "useMask", "gloss", "glitter", "time"], ["position"]);
    this.lash = compile(gl, LAYER_VERT, LASH_FRAG, ["res", "color", "opacity"], ["position", "texCoord", "alpha"]);
    this.minmax = gl.getExtension("EXT_blend_minmax");
    this.stream = new Stream(gl);
    this.targets = new Targets(gl);
    this.images = images ?? new ImageCache(gl);
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

  private drawGeo(prog: Prog, g: Geo, w: number, h: number) {
    if (!g.length) return;
    this.gl.uniform2f(prog.u.res, w, h);
    this.stream.draw(new Float32Array(g), [[prog.a.position, 2], [prog.a.texCoord, 2], [prog.a.alpha, 1]]);
  }

  /**
   * Region mask texture (R eye openings, G mouth interior, B under-eye, A wrinkle zones) at half resolution.
   * Exposed for other effects (e.g. sticker occlusion, iris tint).
   */
  regionMask(faces: Ctx[], w: number, h: number): WebGLTexture {
    const gl = this.gl;
    const mw = Math.max(2, w >> 1), mh = Math.max(2, h >> 1);
    const t = this.targets.get("mask", mw, mh);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    gl.viewport(0, 0, mw, mh);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.maskProg.p);
    const chan = (r: boolean, g: boolean, b: boolean, a: boolean, geo: Geo) => { gl.colorMask(r, g, b, a); this.drawGeo(this.maskProg, geo, w, h); };
    for (const c of faces) {
      const P = (ids: readonly number[]) => ids.map(c.p);
      const eyes: Geo = [];
      for (const ids of [IDX.rightEye, IDX.leftEye]) {
        const loop = P(ids), ctr = centroid(loop);
        fan(eyes, vtx(ctr, 1), loop.map((q) => vtx(q, 1)));
        strip(eyes, loop.map((q) => vtx(q, 1)), offset(loop, c.ed * 0.008, ctr).map((q) => vtx(q, 1)), true);
      }
      chan(true, false, false, false, eyes);
      const mouth: Geo = [];
      const inner = P(IDX.lipsInner);
      fan(mouth, vtx(centroid(inner), 1), inner.map((q) => vtx(q, 1)));
      chan(false, true, false, false, mouth);
      const under: Geo = [];
      for (const [ids, cheek] of [[IDX.rightEyeLower, 118], [IDX.leftEyeLower, 347]] as const) {
        const low = P(ids), ch = c.p(cheek);
        const lowOff = low.map((q) => lerp(q, ch, 0.12));
        const bottom = low.map((q) => lerp(q, ch, 0.75));
        strip(under, low.map((q) => vtx(q, 0)), tv(lowOff, 1, 0.3));
        strip(under, tv(lowOff, 1, 0.3), bottom.map((q) => vtx(q, 0)));
      }
      chan(false, false, true, false, under);
      const wr: Geo = [];
      // nasolabial folds: from the alar wing to the mouth corner
      for (const [a, b] of [[129, 61], [358, 291]] as const) {
        const A = c.p(a), B = c.p(b);
        const n: Vec2 = [-(B[1] - A[1]), B[0] - A[0]], l = Math.hypot(n[0], n[1]) || 1, d = c.ed * 0.09;
        const line = [0, 0.25, 0.5, 0.75, 1].map((t) => lerp(A, B, t));
        const L = line.map((q) => vtx([q[0] + (n[0] / l) * d, q[1] + (n[1] / l) * d], 0));
        const M = tv(line, 1, 0.3);
        const R = line.map((q) => vtx([q[0] - (n[0] / l) * d, q[1] - (n[1] / l) * d], 0));
        strip(wr, L, M); strip(wr, M, R);
      }
      softEllipse(wr, lerp(c.p(151), c.p(10), 0.2), c.ed * 0.5, c.ed * 0.17, c.ux, c.uy);
      for (const q of [c.p(33), c.p(263)]) {
        const out: Vec2 = [q[0] + (q[0] - c.center[0]) * 0.12, q[1] + (q[1] - c.center[1]) * 0.12];
        softEllipse(wr, out, c.ed * 0.1, c.ed * 0.12, c.ux, c.uy);
      }
      chan(false, false, false, true, wr);
    }
    gl.colorMask(true, true, true, true);
    gl.disable(gl.BLEND);
    return t.tex;
  }

  /** Coverage of region geometry (max-blended so overlapping pieces never cut each other). */
  private coverage(geo: Geo, w: number, h: number) {
    const gl = this.gl;
    const cov = this.targets.get("cov", w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, cov.fb);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    if (this.minmax) { gl.blendEquation(this.minmax.MAX_EXT); gl.blendFunc(gl.ONE, gl.ONE); }
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
    gl.useProgram(this.maskProg.p);
    this.drawGeo(this.maskProg, geo, w, h);
    gl.blendEquation(gl.FUNC_ADD);
    gl.disable(gl.BLEND);
    return cov.tex;
  }

  private composite(src: WebGLTexture, cov: WebGLTexture, mask: WebGLTexture | null, t: { fb: WebGLFramebuffer }, w: number, h: number, o: { color: [number, number, number]; opacity: number; mode: number; useMask: boolean; gloss: number; glitter: number }) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    gl.viewport(0, 0, w, h);
    const p = this.comp;
    gl.useProgram(p.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src); gl.uniform1i(p.u.base, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, cov); gl.uniform1i(p.u.cov, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, mask ?? src); gl.uniform1i(p.u.mask, 2);
    gl.uniform2f(p.u.res, w, h);
    gl.uniform3f(p.u.color, o.color[0], o.color[1], o.color[2]);
    gl.uniform1f(p.u.opacity, o.opacity);
    gl.uniform1i(p.u.mode, o.mode);
    gl.uniform1f(p.u.useMask, o.useMask ? 1 : 0);
    gl.uniform1f(p.u.gloss, o.gloss);
    gl.uniform1f(p.u.glitter, o.glitter);
    gl.uniform1f(p.u.time, (performance.now() / 1000) % 1000);
    this.stream.draw(FULLSCREEN, [[p.a.position, 2]]);
  }

  /**
   * Apply makeup to every face (view space). Returns a texture owned by this object (valid until the next call),
   * or `input` when nothing is active.
   */
  apply(input: WebGLTexture, w: number, h: number, faces: FaceData[], m: MakeupParams): WebGLTexture {
    if (!faces.length || !makeupActive(m)) return input;
    const gl = this.gl;
    const ctxs = faces.map((f) => ctxOf(f, w, h));
    const layers = (m.layers ?? []).filter((l) => l.opacity > 0.001);
    const needMask = layers.some((l) => l.region === "lens") || (m.teethWhiten ?? 0) > 0 || (m.eyeWhiten ?? 0) > 0 || (m.darkCircle ?? 0) > 0 || (m.wrinkle ?? 0) > 0;
    const mask = needMask ? this.regionMask(ctxs, w, h) : null;
    let src = input;
    let flip = 0;
    const next = () => this.targets.get(flip++ % 2 ? "b" : "a", w, h);

    // retouch first (operates on skin), then colour layers on top
    if ((m.teethWhiten ?? 0) > 0 || (m.eyeWhiten ?? 0) > 0 || (m.darkCircle ?? 0) > 0 || (m.wrinkle ?? 0) > 0) {
      const t = next();
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
      gl.viewport(0, 0, w, h);
      gl.disable(gl.BLEND);
      const p = this.retouch;
      gl.useProgram(p.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src); gl.uniform1i(p.u.tex, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, mask!); gl.uniform1i(p.u.mask, 1);
      gl.uniform2f(p.u.texel, 1 / w, 1 / h);
      gl.uniform1f(p.u.scale, Math.max(1, (ctxs[0]?.ed ?? 100) / 120));
      gl.uniform1f(p.u.teeth, m.teethWhiten ?? 0);
      gl.uniform1f(p.u.eyeW, m.eyeWhiten ?? 0);
      gl.uniform1f(p.u.dark, m.darkCircle ?? 0);
      gl.uniform1f(p.u.wrinkle, m.wrinkle ?? 0);
      this.stream.draw(FULLSCREEN, [[p.a.position, 2]]);
      src = t.tex;
    }

    for (const l of layers) {
      const col = hexToRgb(l.color ?? "#000000");
      const collect = (fn: (c: Ctx) => Geo) => {
        const geo: Geo = [];
        for (const c of ctxs) { const part = fn(c); for (let i = 0; i < part.length; i++) geo.push(part[i]); } // no spread: large meshes
        return geo;
      };

      if (l.lipGloss) {
        // glass: clear highlights on the lip centres + a strong luminance sheen; glitter: sparkles over the lips
        const glass = l.lipGloss === "glass";
        const cov = this.coverage(collect((c) => regionGeometry(glass ? "lips" : "lips", c, 0.6, l.side)), w, h);
        let t = next();
        this.composite(src, cov, null, t, w, h, { color: col, opacity: glass ? l.opacity * 0.15 : l.opacity * 0.9, mode: blendCode("screen"), useMask: false, gloss: glass ? l.opacity * 1.4 : 0, glitter: glass ? 0 : l.opacity });
        src = t.tex;
        if (glass) {
          const shine = this.coverage(collect((c) => lipShineGeometry(c)), w, h);
          t = next();
          this.composite(src, shine, null, t, w, h, { color: [1, 1, 1], opacity: l.opacity * 0.55, mode: blendCode("screen"), useMask: false, gloss: 0, glitter: 0 });
          src = t.tex;
        }
        continue;
      }

      if (l.lash3d) {
        const geo = collect((c) => { const g: Geo = []; for (const sd of sides(l.side)) lashGeometry(g, c, sd, l.lash3d!); return g; });
        if (!geo.length) continue;
        const t = next();
        this.blit(src, t.fb, w, h);
        const p = this.lash;
        gl.useProgram(p.p);
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
        gl.uniform3f(p.u.color, col[0], col[1], col[2]);
        gl.uniform1f(p.u.opacity, Math.min(1, l.opacity));
        this.drawGeo(p, geo, w, h);
        gl.disable(gl.BLEND);
        src = t.tex;
        continue;
      }

      const img = l.texture ? this.images.get(l.texture.url) : undefined;
      if (l.texture && !img) continue; // still loading
      const textured = !!l.texture && l.texture.mapping.kind !== "region";
      const geo = collect((c) => (textured ? textureGeometry(l.texture!.mapping, c) : regionGeometry(l.region, c, l.feather ?? 1, l.side, l.style)));
      if (!geo.length) continue;
      const lens = l.region === "lens";
      if (!l.texture && !lens) {
        const cov = this.coverage(geo, w, h);
        const t = next();
        this.composite(src, cov, mask, t, w, h, { color: col, opacity: l.opacity, mode: blendCode(l.blend), useMask: false, gloss: l.region === "lips" ? l.gloss ?? 0 : 0, glitter: 0 });
        src = t.tex;
        continue;
      }
      // textured layers and the procedural iris
      const t = next();
      this.blit(src, t.fb, w, h);
      const p = this.layer;
      gl.useProgram(p.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src); gl.uniform1i(p.u.base, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, img?.tex ?? src); gl.uniform1i(p.u.tex, 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, mask ?? src); gl.uniform1i(p.u.mask, 2);
      gl.uniform3f(p.u.color, col[0], col[1], col[2]);
      gl.uniform1f(p.u.opacity, l.opacity);
      gl.uniform1i(p.u.mode, blendCode(l.blend));
      gl.uniform1i(p.u.texMode, l.texture ? ({ rgba: 1, tint: 2, alpha: 3, r: 4, g: 5, b: 6, contour: 7 } as const)[l.texture.mode ?? "rgba"] : 8);
      gl.uniform1i(p.u.iris, IRIS_CODE[l.style ?? "ring"] ?? 0);
      gl.uniform1f(p.u.useMask, lens && mask ? 1 : 0);
      gl.uniform1f(p.u.gloss, l.region === "lips" ? l.gloss ?? 0 : 0);
      this.drawGeo(p, geo, w, h);
      src = t.tex;
    }
    return src;
  }

  dispose() {
    this.targets.dispose();
    this.stream.dispose();
    for (const p of [this.layer, this.maskProg, this.retouch, this.copy, this.comp, this.lash]) this.gl.deleteProgram(p.p);
  }
}

/** Lip shine highlights: a soft streak on the lower-lip centre and a smaller one on the upper lip. */
function lipShineGeometry(c: Ctx): Geo {
  const g: Geo = [];
  const lowC = lerp(c.p(14), c.p(17), 0.45), upC = lerp(c.p(13), c.p(0), 0.55);
  const mw = Math.hypot(c.p(291)[0] - c.p(61)[0], c.p(291)[1] - c.p(61)[1]);
  softEllipse(g, lowC, mw * 0.2, mw * 0.045, c.ux, c.uy, 1, 20);
  softEllipse(g, [lowC[0] - c.ux[0] * mw * 0.22, lowC[1] - c.ux[1] * mw * 0.22], mw * 0.06, mw * 0.025, c.ux, c.uy, 0.7, 14);
  softEllipse(g, upC, mw * 0.12, mw * 0.025, c.ux, c.uy, 0.6, 16);
  return g;
}
