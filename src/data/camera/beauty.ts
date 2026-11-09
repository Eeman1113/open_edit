// Camera beauty catalogue: Beauty / Fine-tune / Makeup tabs, face styles, skin tones, catchlights and the makeup
// looks. Every item names the engine control it drives (`target`), so faceParams.ts can map state -> engine params
// without per-item special cases. Makeup looks are procedural (src/lib/face/makeup.ts): colour, shape style, blend.
import type { MakeupLayer, LashOptions } from "@/lib/face/makeup";
import type { WarpParams, Sculpt3dKey } from "@/lib/face/warp";
import { FACE_PRESETS } from "@/lib/face/presets";
import { SKIN_TONE_DEFS } from "@/data/skintones";

/** What an item controls in the engines. */
export type BeautyTarget =
  /** Parametric reshape (k = engine units per slider unit, default 1). */
  | { warp: keyof WarpParams; k?: number }
  /** 3D sculpt (beauty3dOps key). */
  | { sculpt: Sculpt3dKey }
  /** Pixel passes of the renderer. */
  | { pixel: "smooth" | "refine" | "sharpen" | "brighten" | "skintone" }
  /** Region retouch in the makeup pass. */
  | { retouch: "teeth" | "darkCircle" | "wrinkle" | "eyeWhiten" }
  /** Body slim (pose driven). */
  | { body: "slim" }
  /** Sub-page only (no value of its own). */
  | { none: true };

export interface BeautyItem {
  key: string;
  label: string;
  /** Icon key (the UI picks a glyph from it). */
  icon: string;
  /** Default value: -1..+1 for fullDuplex items, 0..1 otherwise. */
  def: number;
  /** Two-directional slider (state holds value + 1 on a 0..2 bar). */
  fullDuplex?: boolean;
  /** Pixel-based effect run by the base renderer (no face tracking needed). */
  pixel?: boolean;
  /** Opens a sub list. */
  sub?: "face" | "skintone" | "eyelight" | "3dnose";
  target: BeautyTarget;
}

const item = (key: string, label: string, target: BeautyTarget, def = 0, o: Partial<BeautyItem> = {}): BeautyItem =>
  ({ key, label, icon: key, def, target, pixel: "pixel" in target || undefined, ...o });
const W = (warp: keyof WarpParams, k = 1): BeautyTarget => ({ warp, k });

/** Beauty tab: skin, face basics. */
export const BEAUTY_TAB: BeautyItem[] = [
  item("face", "Face style", { none: true }, 0, { sub: "face" }),
  item("smooth", "Smooth", { pixel: "smooth" }, 0.3),
  item("refine", "Refine", { pixel: "refine" }),
  item("clear", "Clarity", { pixel: "sharpen" }),
  item("brighten", "Brighten", { pixel: "brighten" }),
  item("skintone", "Skin tone", { pixel: "skintone" }, 0.4, { sub: "skintone" }),
  item("teeth", "Teeth", { retouch: "teeth" }, 0.3),
  item("undereye", "Under-eye", { retouch: "darkCircle" }, 0.4),
  item("lines", "Smile lines", { retouch: "wrinkle" }, 0.2),
  item("eyewhite", "Eye whites", { retouch: "eyeWhiten" }, 0.1),
  item("body", "Body", { body: "slim" }),
  item("head", "Head size", W("headSize", -0.8)),
  item("eyesize", "Eyes", W("eyeSize"), 0.1, { fullDuplex: true }),
  item("nosewidth", "Nose", W("noseWidth", -1), 0.1),
  item("cheekbone", "Cheekbones", W("cheekbone")),
  item("slim", "Slim", W("faceSlim")),
  item("chin", "Chin", W("chinLength"), 0, { fullDuplex: true }),
  item("forehead", "Forehead", W("forehead"), 0, { fullDuplex: true }),
  item("hair", "Hair volume", W("hairVolume")),
];

/** Fine-tune tab: 3D sculpt and per-feature shaping. */
export const ADVANCED_TAB: BeautyItem[] = [
  item("lift3d", "3D lift", { sculpt: "lift" }),
  item("forehead3d", "3D forehead", { sculpt: "forehead" }),
  item("nose3d", "3D nose", { none: true }, 0, { sub: "3dnose" }),
  item("cheeks3d", "3D cheeks", { sculpt: "cheeks" }),
  item("mouth3d", "3D mouth", { sculpt: "mouth" }),
  item("lips3d", "3D lips", { sculpt: "lips" }),
  item("eyelight", "Catchlight", { none: true }, 0.5, { sub: "eyelight" }),
  item("vline", "V-line", W("vline"), 0, { fullDuplex: true }),
  item("jaw", "Jaw", W("jaw"), 0, { fullDuplex: true }),
  item("sculpt", "Sculpt", W("faceLift")),
  item("temple", "Temples", W("temple"), 0, { fullDuplex: true }),
  item("facelength", "Face length", W("faceRatio"), 0, { fullDuplex: true }),
  item("eyepos", "Eye position", W("eyePosition"), 0, { fullDuplex: true }),
  item("eyeheight", "Eye height", W("eyeHeight"), 0, { fullDuplex: true }),
  item("eyewidth", "Eye width", W("eyeWidth"), 0, { fullDuplex: true }),
  item("eyespan", "Eye distance", W("eyeDistance"), 0, { fullDuplex: true }),
  item("eyetilt", "Eye tilt", W("eyeTilt"), 0, { fullDuplex: true }),
  item("pupil", "Iris size", W("pupil"), 0, { fullDuplex: true }),
  item("eyeinner", "Inner corner", W("eyeInner"), 0, { fullDuplex: true }),
  item("eyeouter", "Outer corner", W("eyeOuter"), 0, { fullDuplex: true }),
  item("eyelower", "Lower lid", W("eyeLower"), 0, { fullDuplex: true }),
  item("nosesize", "Nose size", W("noseSize"), 0, { fullDuplex: true }),
  item("noselength", "Nose length", W("noseLength"), 0, { fullDuplex: true }),
  item("bridge", "Bridge", W("noseBridge"), 0, { fullDuplex: true }),
  item("noseroot", "Root", W("noseRoot"), 0, { fullDuplex: true }),
  item("tip", "Nose tip", W("noseTip"), 0, { fullDuplex: true }),
  item("alar", "Nostrils", W("noseAlar"), 0, { fullDuplex: true }),
  item("mouthsize", "Mouth size", W("mouthSize"), 0, { fullDuplex: true }),
  item("lipwidth", "Lip width", W("mouthWidth"), 0, { fullDuplex: true }),
  item("upperlip", "Upper lip", W("upperLip"), 0, { fullDuplex: true }),
  item("lowerlip", "Lower lip", W("lowerLip"), 0, { fullDuplex: true }),
  item("cupid", "Cupid's bow", W("cupidBow"), 0, { fullDuplex: true }),
  item("philtrum", "Philtrum", W("philtrum"), 0, { fullDuplex: true }),
  item("smile", "Smile", W("smile"), 0, { fullDuplex: true }),
  item("browthick", "Brow thickness", W("browThickness"), 0, { fullDuplex: true }),
  item("browlift", "Brow height", W("browLift"), 0, { fullDuplex: true }),
  item("browtilt", "Brow angle", W("browTilt"), 0, { fullDuplex: true }),
  item("browspan", "Brow distance", W("browDistance"), 0, { fullDuplex: true }),
];

/** 3D nose sub-page. */
export const NOSE_3D: BeautyItem[] = [
  item("nose3d_size", "Size", { sculpt: "nose" }, 0, { fullDuplex: true }),
  item("nose3d_bridge", "Bridge", { sculpt: "bridge" }),
  item("nose3d_alar", "Nostrils", { sculpt: "alar" }, 0, { fullDuplex: true }),
  item("nose3d_root", "Root", { sculpt: "root" }, 0, { fullDuplex: true }),
  item("nose3d_tip", "Tip", { sculpt: "tip" }, 0, { fullDuplex: true }),
];

/** Face styles: "original" + the reshape presets. */
export const FACE_SHAPES = [{ key: "original", label: "Original" }, ...FACE_PRESETS.map((p) => ({ key: p.key, label: p.label }))];
export const FACE_SHAPE_DEFAULT = 0.35;

/** Skin tone presets ("none" first). */
export const SKIN_TONES = [
  { key: "none", label: "None", bg: "#e4e2e0", thumb: "" },
  ...SKIN_TONE_DEFS.map((t) => ({ key: t.key, label: t.label, bg: t.color, thumb: "" })),
];

/** Catchlight shapes (procedural highlights on the iris). */
export const EYE_LIGHTS = [
  { key: "none", label: "None", bg: "#e4e2e0", thumb: "" },
  { key: "dot", label: "Dot", bg: "#b9c4cc", thumb: "" },
  { key: "soft", label: "Soft", bg: "#c9c2bd", thumb: "" },
  { key: "ring", label: "Ring", bg: "#b7bccc", thumb: "" },
  { key: "window", label: "Window", bg: "#c0c8c2", thumb: "" },
  { key: "star", label: "Star", bg: "#cbbfcc", thumb: "" },
  { key: "twin", label: "Twin", bg: "#c4c6bd", thumb: "" },
];

// ---------- makeup ----------

/** One makeup look: layer templates (opacity is multiplied by the category slider). */
export interface MakeupContent {
  key: string;
  label: string;
  /** Swatch colour. */
  bg?: string;
  layers: Partial<MakeupLayer>[];
}

export interface MakeupCategory {
  key: string;
  label: string;
  /** Short id (thumbnails / analytics). */
  short: string;
  /** Category swatch colour. */
  bg: string;
  /** Default slider value. */
  def: number;
  /** Default look ("none" = off). */
  defContent: string;
  /** Supports the Mirror button (beauty marks). */
  flip?: boolean;
  /** Region of every look in this category. */
  region: MakeupLayer["region"];
  contents: MakeupContent[];
}

const look = (key: string, label: string, color: string, extra: Partial<MakeupLayer> = {}, more: Partial<MakeupLayer>[] = []): MakeupContent =>
  ({ key, label, bg: color, layers: [{ color, ...extra }, ...more] });
const lash = (key: string, label: string, o: LashOptions, color = "#1a1210"): MakeupContent => ({ key, label, bg: "#d9cfc8", layers: [{ color, lash3d: o }] });
const NONE: MakeupContent = { key: "none", label: "None", bg: "#e4e2e0", layers: [] };
const cat = (key: string, label: string, region: MakeupLayer["region"], bg: string, def: number, defContent: string, contents: MakeupContent[], o: Partial<MakeupCategory> = {}): MakeupCategory =>
  ({ key, label, short: key, region, bg, def, defContent, contents: [NONE, ...contents], ...o });

export const MAKEUP_CATEGORIES: MakeupCategory[] = [
  cat("lips", "Lips", "lips", "#e88a8f", 0.35, "none", [
    look("nude", "Nude", "#c98473", { blend: "softlight" }),
    look("coral", "Coral", "#f07a62", { blend: "multiply", gloss: 0.15 }),
    look("rose", "Rose", "#d4566e", { blend: "multiply" }),
    look("berry", "Berry", "#9b2d4f", { blend: "multiply" }),
    look("red", "Classic red", "#c21e2c", { blend: "multiply", gloss: 0.1 }),
    look("plum", "Plum", "#6e2448", { blend: "multiply" }),
    look("peach-fade", "Peach fade", "#f28c7a", { blend: "multiply", style: "gradient" }),
    look("cherry-blur", "Cherry blur", "#b5172f", { blend: "multiply", style: "blurred" }),
    look("glass", "Glass", "#e8828c", { blend: "softlight" }, [{ lipGloss: "glass", color: "#ffffff" }]),
    look("sparkle", "Sparkle", "#d46a7e", { blend: "multiply" }, [{ lipGloss: "glitter", color: "#ffe9f0" }]),
  ]),
  cat("blush", "Blush", "blush", "#f2a8a8", 0.3, "none", [
    look("peach", "Peach", "#f4a48a", { blend: "multiply", opacity: 0.8 }),
    look("pink", "Pink", "#f28fa6", { blend: "multiply", opacity: 0.8 }),
    look("coral", "Coral lift", "#f08a70", { blend: "multiply", style: "lifted", opacity: 0.7 }),
    look("rose", "Rose wash", "#d97a8a", { blend: "multiply", style: "wide" }),
    look("berry", "Berry lift", "#b8566e", { blend: "multiply", style: "lifted", opacity: 0.6 }),
  ]),
  cat("contour", "Contour", "contour", "#b08a78", 0.3, "none", [
    look("soft", "Soft", "#8a5a44", { blend: "multiply" }),
    look("sculpt", "Sculpt", "#7a4c3a", { blend: "multiply", style: "sculpt" }),
    look("cool", "Cool shade", "#6e5a58", { blend: "multiply", style: "sculpt" }),
  ]),
  cat("highlight", "Highlight", "highlight", "#f3e2c8", 0.3, "none", [
    look("pearl", "Pearl", "#fff4f0", { blend: "screen" }),
    look("champagne", "Champagne", "#f6dcb4", { blend: "screen" }),
    look("gold", "Gold", "#f0c070", { blend: "softlight" }),
  ]),
  cat("eyeshadow", "Eyeshadow", "eyeshadow", "#c99a8a", 0.45, "none", [
    look("taupe", "Taupe", "#8c6e62", { blend: "multiply" }),
    look("peach", "Peach", "#e8a07a", { blend: "multiply" }),
    look("rosegold", "Rose gold", "#c98272", { blend: "multiply", style: "crease" }, [{ color: "#ffe6d6", blend: "screen", opacity: 0.4 }]),
    look("smoky", "Smoky", "#3b3333", { blend: "multiply", style: "smoky" }),
    look("plum", "Plum", "#7b4a6b", { blend: "multiply", style: "crease" }),
    look("bronze", "Bronze", "#9a6233", { blend: "multiply" }, [{ color: "#ffd9a0", blend: "screen", opacity: 0.3 }]),
    look("ocean", "Ocean", "#4e6e9e", { blend: "multiply" }),
  ]),
  cat("eyeliner", "Eyeliner", "eyeliner", "#7d6a64", 0.5, "none", [
    look("thin", "Thin", "#1a1414", { blend: "multiply", style: "thin" }),
    look("wing", "Wing", "#1a1414", { blend: "multiply", style: "wing" }),
    look("cat", "Cat eye", "#141010", { blend: "multiply", style: "cat" }),
    look("brown", "Brown wing", "#4a2c1e", { blend: "multiply", style: "wing" }),
    look("lower", "Lower line", "#2a2020", { blend: "multiply", style: "lower" }),
  ]),
  cat("lashes", "Lashes", "lashes", "#a59690", 0.6, "none", [
    lash("natural", "Natural", { length: 0.8, density: 30, curl: 0.5 }),
    lash("volume", "Volume", { length: 1, density: 44, curl: 0.7 }),
    lash("doll", "Doll", { length: 1.25, density: 40, curl: 0.85, flare: 0.15 }),
    lash("flare", "Flare", { length: 1.1, density: 36, curl: 0.6, flare: 0.65 }),
    lash("brown", "Soft brown", { length: 0.9, density: 34, curl: 0.6 }, "#4a3024"),
  ]),
  cat("brows", "Brows", "brows", "#8a705e", 0.35, "none", [
    look("soft", "Soft brown", "#6b4a36", { blend: "multiply", style: "soft" }),
    look("natural", "Natural", "#4e3a2e", { blend: "multiply" }),
    look("bold", "Bold", "#3a2a22", { blend: "multiply", style: "bold" }),
    look("ash", "Ash", "#4a4a4a", { blend: "multiply" }),
  ]),
  cat("iris", "Iris tint", "lens", "#9fb0bf", 0.5, "none", [
    look("hazel", "Hazel", "#a8743c", { blend: "overlay", style: "ring", opacity: 0.8 }),
    look("grey", "Grey", "#9aa6b2", { blend: "softlight", style: "ring", opacity: 0.9 }),
    look("blue", "Blue", "#4a86c8", { blend: "overlay", style: "starburst", opacity: 0.75 }),
    look("green", "Green", "#5e9a6a", { blend: "overlay", style: "ring", opacity: 0.75 }),
    look("violet", "Violet", "#8a6ac0", { blend: "overlay", style: "starburst", opacity: 0.75 }),
    look("brown", "Brown", "#6a4430", { blend: "multiply", style: "solid" }),
    look("ice", "Ice", "#b8d8e8", { blend: "softlight", style: "starburst", opacity: 0.9 }),
  ]),
  cat("beauty_mark", "Beauty mark", "mark", "#8a6a5a", 0.8, "none", [
    look("cheek", "Cheek", "#3a2620", { style: "cheek", blend: "multiply" }),
    look("lip", "Lip", "#3a2620", { style: "lip", blend: "multiply" }),
    look("eye", "Eye", "#3a2620", { style: "eye", blend: "multiply" }),
    look("chin", "Chin", "#3a2620", { style: "chin", blend: "multiply" }),
    look("nose", "Nose", "#3a2620", { style: "nose", blend: "multiply" }),
  ], { flip: true }),
];

/** Makeup tab = the categories. */
export const MAKEUP_TAB: BeautyItem[] = MAKEUP_CATEGORIES.map((c) => ({ key: c.key, label: c.label, icon: c.key, def: c.def, target: { none: true } as BeautyTarget }));

/** Makeup engine layers of one look at slider value `w` (0..1). `flip` mirrors one-sided looks (beauty marks). */
export function makeupLayers(c: MakeupCategory, ct: MakeupContent, w: number, flip = false): MakeupLayer[] {
  if (ct.key === "none" || w <= 0.001) return [];
  return ct.layers.map((l) => ({
    region: c.region,
    ...l,
    opacity: (l.opacity ?? 1) * w,
    ...(c.flip ? { side: flip ? "left" : "right" } : {}),
  }) as MakeupLayer);
}

/** Catchlight layer (procedural shape on the iris, screen blended). */
export function catchlightLayers(key: string, w: number): MakeupLayer[] {
  if (!key || key === "none" || w <= 0.001) return [];
  return [{ region: "lens", style: `catch-${key}`, color: "#ffffff", blend: "screen", opacity: w }];
}

/** Swatch colour for a makeup look. */
export const makeupThumb = (c: MakeupCategory, content: MakeupContent) => content.bg ?? c.bg;

export type BeautyTab = "BEAUTY" | "ADVANCED_BEAUTY" | "MAKEUP";

export interface BeautyState {
  tab: BeautyTab;
  /**
   * Slider values by item key: 0..1, or value + 1 (0..2) for fullDuplex items. Makeup categories hold their
   * intensity 0..1 under the category key.
   */
  values: Record<string, number>;
  faceShape: string;
  faceShapePower: number;
  skinTone: string;
  /** Catchlight shape ("none" or an EYE_LIGHTS key). */
  eyeLight?: string;
  /** Selected look per makeup category ("none" or a content key). */
  makeup?: Record<string, string>;
  /** Mirror one-sided looks (beauty marks). */
  beautyMarkFlip?: boolean;
}

export const ALL_ITEMS = (): BeautyItem[] => [...BEAUTY_TAB, ...ADVANCED_TAB, ...NOSE_3D, ...MAKEUP_TAB];

export function defaultBeautyState(): BeautyState {
  const values: Record<string, number> = {};
  for (const it of ALL_ITEMS()) if (!("none" in it.target) || it.key === "eyelight" || MAKEUP_CATEGORIES.some((c) => c.key === it.key)) values[it.key] = it.fullDuplex ? 1 + it.def : it.def;
  const makeup: Record<string, string> = {};
  for (const c of MAKEUP_CATEGORIES) makeup[c.key] = c.defContent;
  return { tab: "BEAUTY", values, faceShape: "natural", faceShapePower: FACE_SHAPE_DEFAULT, skinTone: "none", eyeLight: "none", makeup, beautyMarkFlip: false };
}

/** Engine value of an item: -1..+1 for fullDuplex (slider - 1), else 0..1. */
export function itemValue(s: BeautyState, key: string): number {
  const v = s.values[key] ?? 0;
  const it = ALL_ITEMS().find((x) => x.key === key);
  return it?.fullDuplex ? v - 1 : v;
}

/** Value of the item driving a pixel / retouch / body target (0 when absent). */
function targetValue(s: BeautyState, test: (t: BeautyTarget) => boolean): number {
  const it = [...BEAUTY_TAB, ...ADVANCED_TAB].find((x) => test(x.target));
  return it ? itemValue(s, it.key) : 0;
}

/** Pixel-pass values for the renderer: smoothing, brighten, clarity, skin tone preset. */
export function beautyRenderParams(s: BeautyState) {
  const px = (k: string) => targetValue(s, (t) => "pixel" in t && t.pixel === k);
  return {
    smooth: Math.min(1, px("smooth") + px("refine") * 0.5),
    whiten: px("brighten"),
    sharpen: px("sharpen"),
    skinTone: s.skinTone !== "none" ? s.skinTone : null,
    skinToneValue: px("skintone"),
  };
}

/** Retouch / body values. */
export function beautyRetouch(s: BeautyState) {
  const r = (k: string) => targetValue(s, (t) => "retouch" in t && t.retouch === k);
  return { teeth: r("teeth"), darkCircle: r("darkCircle"), wrinkle: r("wrinkle"), eyeWhiten: r("eyeWhiten"), body: targetValue(s, (t) => "body" in t) };
}
