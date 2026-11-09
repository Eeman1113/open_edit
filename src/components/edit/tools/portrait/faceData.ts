// Portrait face-tool catalogues (reshape, face ratio, 3D sculpt, body, catchlight) and their mapping onto the face
// engine (src/lib/face): parametric WarpParams (per side when the item supports Left / Right), local WarpOps and
// procedural makeup layers. Makeup looks are shared with the camera (src/data/camera/beauty.ts).
import { FACE_PRESETS, addPreset, beauty3dOps, type MakeupLayer, type ShapeWeights, type WarpOp, type WarpParams } from "@/lib/face";
import { EYE_LIGHTS, MAKEUP_CATEGORIES, catchlightLayers, makeupLayers as lookLayers } from "@/data/camera/beauty";

/* ------------------------------------------------------------------ Face (RESHAPE) */

/** d = two-directional (-100..100), p = per-side option (Left / Both / Right). `warp` = engine parameter. */
export interface ReshapeItem { key: string; label: string; d?: boolean; p?: boolean; warp?: keyof WarpParams; k?: number }
const R = (key: string, label: string, warp: keyof WarpParams, o: Partial<ReshapeItem> = {}): ReshapeItem => ({ key, label, warp, ...o });

export const RESHAPE_CATS: { label: string; prefix: string; items: ReshapeItem[] }[] = [
  { label: "Face", prefix: "face", items: [
    R("head", "Head size", "headSize", { k: -0.85 }), R("slim", "Slim", "faceSlim", { p: true }), R("length", "Length", "faceRatio", { d: true }),
    R("sculpt", "Sculpt", "faceLift", { p: true }), R("cheekbone", "Cheekbones", "cheekbone", { p: true }), R("temple", "Temples", "temple", { d: true, p: true }),
    R("jaw", "Jaw", "jaw", { p: true }), R("chin", "Chin", "chinLength", { d: true }), R("vline", "V-line", "vline", { d: true }), R("forehead", "Forehead", "forehead", { d: true }),
  ] },
  { label: "Eyes", prefix: "eye", items: [
    R("eyesize", "Size", "eyeSize", { d: true, p: true }), R("eyepos", "Position", "eyePosition", { d: true, p: true }), R("eyeheight", "Height", "eyeHeight", { d: true, p: true }),
    R("eyewidth", "Width", "eyeWidth", { d: true, p: true }), R("eyespan", "Distance", "eyeDistance", { d: true, p: true }), R("eyetilt", "Tilt", "eyeTilt", { d: true, p: true }),
    R("pupil", "Iris", "pupil", { d: true, p: true }), R("eyeinner", "Inner corner", "eyeInner", { d: true, p: true }), R("eyeouter", "Outer corner", "eyeOuter", { d: true, p: true }),
    R("eyelower", "Lower lid", "eyeLower", { d: true, p: true }),
  ] },
  { label: "Brows", prefix: "brow", items: [
    R("browthick", "Thickness", "browThickness", { d: true, p: true }), R("browlift", "Height", "browLift", { d: true, p: true }),
    R("browtilt", "Angle", "browTilt", { d: true, p: true }), R("browspan", "Distance", "browDistance", { d: true, p: true }),
  ] },
  { label: "Nose", prefix: "nose", items: [
    R("nosesize", "Size", "noseSize", { d: true }), R("nosewidth", "Width", "noseWidth", { d: true }), R("alar", "Nostrils", "noseAlar", { d: true }),
    R("noselength", "Length", "noseLength", { d: true }), R("bridge", "Bridge", "noseBridge", { d: true }), R("noseroot", "Root", "noseRoot", { d: true }), R("tip", "Tip", "noseTip", { d: true }),
  ] },
  { label: "Lips", prefix: "mouth", items: [
    R("mouthsize", "Size", "mouthSize", { d: true }), R("philtrum", "Philtrum", "philtrum", { d: true }), R("lipwidth", "Width", "mouthWidth", { d: true }),
    R("upperlip", "Upper lip", "upperLip", { d: true }), R("lowerlip", "Lower lip", "lowerLip", { d: true }), R("cupid", "Cupid's bow", "cupidBow", { d: true }), R("smile", "Smile", "smile", { d: true }),
  ] },
];
export const RESHAPE_ITEMS = RESHAPE_CATS.flatMap((c) => c.items.map((it) => ({ ...it, prefix: c.prefix })));
/** Face style presets: [key, label]. */
export const FACE_SHAPES: [string, string][] = FACE_PRESETS.map((p) => [p.key, p.label]);

/* ------------------------------------------------------------------ Face Ratio / 3D Face */

export const FACE_RATIO: ReshapeItem[] = [
  { key: "crown", label: "Crown", d: true }, { key: "upper", label: "Forehead", d: true }, { key: "middle", label: "Middle", d: true },
  { key: "philtrum", label: "Philtrum", d: true }, { key: "lower", label: "Lower face", d: true }, { key: "jawline", label: "Jaw", d: true },
];
export const RESHAPE3D: ReshapeItem[] = [
  { key: "lift", label: "Lift" }, { key: "forehead", label: "Forehead" }, { key: "nose", label: "Nose", d: true },
  { key: "bridge", label: "Bridge" }, { key: "alar", label: "Nostrils", d: true }, { key: "root", label: "Root", d: true },
  { key: "tip", label: "Tip", d: true }, { key: "cheeks", label: "Cheeks" }, { key: "mouth", label: "Mouth" }, { key: "lips", label: "Lips" },
];

/* ------------------------------------------------------------------ Body */

export const BODY: { key: string; label: string; icon: string; d?: boolean }[] = [
  { key: "allbody", label: "Whole body", icon: "body" }, { key: "slim", label: "Slim", icon: "body-slim", d: true },
  { key: "head", label: "Head", icon: "body-head", d: true }, { key: "shoulder", label: "Shoulders", icon: "body-shoulder", d: true },
  { key: "squareshoulder", label: "Shoulder line", icon: "body-shoulder-line" }, { key: "neck", label: "Neck", icon: "body-neck" },
  { key: "chest", label: "Chest", icon: "body-chest" }, { key: "arm", label: "Arms", icon: "body-arm", d: true },
  { key: "waist", label: "Waist", icon: "body-waist" }, { key: "hip", label: "Hips", icon: "body-hip", d: true },
  { key: "leg", label: "Legs", icon: "body-leg", d: true }, { key: "longleg", label: "Leg length", icon: "body-leg-length" },
];

/* ------------------------------------------------------------------ Catchlight */

export const EYELIGHT: [string, string][] = EYE_LIGHTS.filter((e) => e.key !== "none").map((e) => [e.key, e.label]);

/* ------------------------------------------------------------------ engine mapping: reshape */

/**
 * Face (RESHAPE) values of one face -> parametric warp (both sides), per-side weights and ops.
 * `re` keys: `<key>`, `<key>_left`, `<key>_right` (engine domain, -1..1 for two-directional items).
 * `corr` (background correction) slightly tempers the contour items so the background bends less.
 */
export function reshapeToEngine(re: Record<string, number> | undefined, shape: { key: string; v: number } | undefined, corr: boolean) {
  const warp: Partial<WarpParams> = {};
  const sides: ShapeWeights = {};
  const ops: WarpOp[] = [];
  if (shape && shape.v > 0.001) addPreset(warp, shape.key, shape.v);
  for (const [k, v] of Object.entries(re ?? {})) {
    if (Math.abs(v) < 0.001) continue;
    const m = /^(.*?)(_left|_right)?$/.exec(k)!;
    const it = RESHAPE_ITEMS.find((x) => x.key === m[1]);
    if (!it?.warp) continue;
    const val = v * (it.k ?? 1);
    if (m[2]) sides[`${it.warp}${m[2]}`] = (sides[`${it.warp}${m[2]}`] ?? 0) + val;
    else warp[it.warp] = (warp[it.warp] ?? 0) + val;
  }
  if (corr) for (const k of ["faceSlim", "jaw", "vline", "cheekbone", "faceLift", "faceWidth"] as const) if (warp[k]) warp[k] = warp[k]! * 0.92;
  return { shape: sides, warp, ops };
}

/** Face Ratio as band moves (IOD units, subject frame). */
export function ratioToOps(r: Record<string, number> | undefined): WarpOp[] {
  const ops: WarpOp[] = [];
  for (const [k, v] of Object.entries(r ?? {})) {
    if (Math.abs(v) < 0.001) continue;
    switch (k) {
      case "crown": ops.push({ type: "move", anchor: 10, offset: [0, -0.55], rx: 1.7, ry: 0.85, amount: [0, -0.22 * v] }); break;
      case "upper": ops.push({ type: "move", anchor: 10, offset: [0, -0.15], rx: 1.55, ry: 0.75, amount: [0, -0.2 * v] }); break;
      case "middle": ops.push({ type: "move", anchor: [13, 14], offset: [0, 0.35], rx: 1.9, ry: 1.35, amount: [0, 0.09 * v] }); break;
      case "philtrum": ops.push({ type: "move", anchor: [13, 14], offset: [0, 0.45], rx: 1.6, ry: 0.95, amount: [0, 0.11 * v] }); break;
      case "lower": ops.push({ type: "move", anchor: 152, offset: [0, 0.05], rx: 1.25, ry: 0.6, amount: [0, 0.1 * v] }); break;
      case "jawline":
        ops.push({ type: "move", anchor: [172, 136], rx: 0.85, ry: 0.75, amount: [-0.12 * v, 0.03 * v] });
        ops.push({ type: "move", anchor: [397, 365], rx: 0.85, ry: 0.75, amount: [0.12 * v, 0.03 * v] });
        break;
    }
  }
  return ops;
}

/** 3D Face items -> sculpt ops (slider values -1..1). */
export function r3dToOps(r: Record<string, number> | undefined): WarpOp[] {
  return beauty3dOps(r ?? {});
}

/* ------------------------------------------------------------------ engine mapping: makeup */

/** Colour sub-options per category (none: every look carries its own colour). */
export const MAKEUP_SUB: Record<string, { id: string; color?: string; blend?: string }[]> = {};
/** Categories whose looks are masks tinted by a sub-option colour (none). */
export const MASK_CATS = new Set<string>();

/** Beauty marks are procedural; the "url" is just the look id. */
export const beautyMarkUrl = (id: string) => id;
/** Kept for the Mirror button flow: procedural marks need no mirrored texture. */
export const flippedReady = (url: string): Promise<string> => Promise.resolve(url);
export const flippedUrl = (url: string): string | null => url;

/** Engine layers for one makeup pick (category key + look id). `_extra` is unused (kept for the call signature). */
export function makeupLayers(cat: string, p: { id: string; sub?: string; v: number; flip?: boolean }, _extra?: unknown): MakeupLayer[] {
  void _extra;
  const c = MAKEUP_CATEGORIES.find((x) => x.key === cat);
  const ct = c?.contents.find((x) => x.key === p.id);
  return c && ct ? lookLayers(c, ct, p.v, !!p.flip) : [];
}

/** Catchlight on the iris. */
export const eyeLightLayers = (id: string, v: number): MakeupLayer[] => catchlightLayers(id, v);

/** Texture urls a layer list needs (procedural layers need none). */
export const layerUrls = (ls: MakeupLayer[]) => ls.flatMap((l) => (l.texture?.url ? [l.texture.url] : []));
