// Camera Beauty / Fine-tune / Makeup state -> face engine params (src/lib/face). Every beauty item names its engine
// target in src/data/camera/beauty.ts; this file only sums them up:
//   warp targets    -> WarpParams (+ the selected face style preset)
//   sculpt targets  -> beauty3d (3D sculpt ops)
//   retouch targets -> MakeupParams retouch values
//   makeup looks    -> procedural makeup layers (+ catchlight)
import { addPreset, type MakeupLayer, type MakeupParams, type ShapeWeights, type WarpOp, type WarpParams } from "@/lib/face";
import {
  ADVANCED_TAB, BEAUTY_TAB, EYE_LIGHTS, MAKEUP_CATEGORIES, NOSE_3D, beautyRetouch, catchlightLayers, itemValue, makeupLayers,
  type BeautyState,
} from "@/data/camera/beauty";

export interface BeautyFace {
  /** Per-side reshape weights (the camera uses both sides, so this stays empty). */
  shape: ShapeWeights;
  warp: Partial<WarpParams>;
  warpOps: WarpOp[];
  /** 3D sculpt sliders by sculpt key. */
  beauty3d: Record<string, number>;
  makeup: MakeupParams;
  /** Kept for API compatibility: beauty marks are now makeup layers, so this is always null. */
  beautyMark: { url: string; alpha: number; flip: boolean } | null;
  /** Texture URLs in use (procedural makeup needs none). */
  urls: string[];
}

/**
 * Beauty state -> face params. `makeupOn` = the "Makeup" switch: when off, the Makeup tab looks are not applied
 * (retouch items of the Beauty tab still are).
 */
export function beautyFaceParams(s: BeautyState, makeupOn: boolean): BeautyFace {
  const warp: Partial<WarpParams> = {};
  const beauty3d: Record<string, number> = {};
  const layers: MakeupLayer[] = [];

  if (s.faceShape && s.faceShape !== "original" && s.faceShapePower > 0) addPreset(warp, s.faceShape, s.faceShapePower);

  for (const it of [...BEAUTY_TAB, ...ADVANCED_TAB, ...NOSE_3D]) {
    const t = it.target;
    if (!("warp" in t) && !("sculpt" in t)) continue;
    const v = itemValue(s, it.key);
    if (Math.abs(v) < 1e-3) continue;
    if ("warp" in t) warp[t.warp] = (warp[t.warp] ?? 0) + v * (t.k ?? 1);
    else beauty3d[t.sculpt] = (beauty3d[t.sculpt] ?? 0) + v;
  }

  const r = beautyRetouch(s);
  const makeup: MakeupParams = { teethWhiten: r.teeth, darkCircle: r.darkCircle, wrinkle: r.wrinkle, eyeWhiten: r.eyeWhiten };

  const el = s.eyeLight ?? "none";
  if (EYE_LIGHTS.some((e) => e.key === el)) layers.push(...catchlightLayers(el, s.values.eyelight ?? 0));

  if (makeupOn) {
    for (const c of MAKEUP_CATEGORIES) {
      const ct = c.contents.find((x) => x.key === (s.makeup?.[c.key] ?? c.defContent));
      if (!ct) continue;
      layers.push(...makeupLayers(c, ct, s.values[c.key] ?? c.def, !!s.beautyMarkFlip));
    }
  }
  makeup.layers = layers;
  return { shape: {}, warp, warpOps: [], beauty3d, makeup, beautyMark: null, urls: [] };
}

/** Body slim value of a beauty state (0..1). */
export const bodySlimValue = (s: BeautyState) => Math.min(1, Math.max(0, beautyRetouch(s).body));
