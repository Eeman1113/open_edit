// Editor document model + constants ported from the APK (EPContentMenu, EPAdjustMenu, EPToolsMenu, ...).
import { SKIN_TONE_DEFS } from "@/data/skintones";
import type { EditAdjust } from "@/lib/gl/renderer";

/* ---------------------------------------------------------------- tabs */

export type TabId = "RECOMMEND" | "PORTRAIT" | "TOOLS" | "FILTER" | "ADJUST" | "EFFECT_STICKER" | "STICKER" | "STAMP" | "TEXT" | "BRUSH" | "BORDER";

/** EPContentMenu.totalMenuList order. */
export const TABS: { id: TabId; label: string }[] = [
  { id: "RECOMMEND", label: "Recommended" },
  { id: "PORTRAIT", label: "Portrait" },
  { id: "TOOLS", label: "Tools" },
  { id: "FILTER", label: "Filters" },
  { id: "ADJUST", label: "Adjust" },
  { id: "EFFECT_STICKER", label: "Effects" },
  { id: "STICKER", label: "AR filter" },
  { id: "STAMP", label: "Stickers" },
  { id: "TEXT", label: "Text" },
  { id: "BRUSH", label: "Brush" },
  { id: "BORDER", label: "Border" },
];

/* ---------------------------------------------------------------- adjust */

export type AdjustKey = "lux" | "brightness" | "brilliance" | "contrast" | "clarity" | "saturation" | "sharpen" | "texture" | "highlights" | "shadows" | "fade" | "grain" | "warmth" | "tint" | "vignette";

export interface AdjustItem { key: string; label: string; icon: string; kind: "feature" | "slide"; min?: number; max?: number }

/** EPAdjustMenu.adjustList = featureList + slideList. */
export const ADJUST_ITEMS: AdjustItem[] = [
  { key: "curves", label: "Curves", icon: "icon_edit_adjust_curves", kind: "feature" },
  { key: "split_tone", label: "Split Tone", icon: "icon_edit_adjust_split_tone", kind: "feature" },
  { key: "hsl", label: "HSL", icon: "icon_edit_adjust_hsl", kind: "feature" },
  { key: "lux", label: "Lux", icon: "icon_edit_adjust_lux", kind: "slide", min: -1, max: 1 },
  { key: "brightness", label: "Lightness", icon: "icon_edit_adjust_brightness", kind: "slide", min: -1, max: 1 },
  { key: "brilliance", label: "Brilliance", icon: "icon_edit_adjust_brilliance", kind: "slide", min: -1, max: 1 },
  { key: "contrast", label: "Contrast", icon: "icon_edit_adjust_contrast", kind: "slide", min: -1, max: 1 },
  { key: "clarity", label: "Clarity", icon: "icon_edit_adjust_clarity", kind: "slide", min: -1, max: 1 },
  { key: "saturation", label: "Saturation", icon: "icon_edit_adjust_saturation", kind: "slide", min: -1, max: 1 },
  { key: "sharpen", label: "Sharpen", icon: "icon_edit_adjust_sharpen", kind: "slide", min: 0, max: 1 },
  { key: "texture", label: "Texture", icon: "icon_edit_adjust_texture", kind: "slide", min: -1, max: 1 },
  { key: "highlights", label: "Highlights", icon: "icon_edit_adjust_highlights", kind: "slide", min: -1, max: 1 },
  { key: "shadows", label: "Shadows", icon: "icon_edit_adjust_shadows", kind: "slide", min: -1, max: 1 },
  { key: "fade", label: "Fade", icon: "icon_edit_adjust_fade", kind: "slide", min: 0, max: 1 },
  { key: "grain", label: "Grain", icon: "icon_edit_adjust_grain", kind: "slide", min: 0, max: 1 },
  { key: "warmth", label: "Warmth", icon: "icon_edit_adjust_warmth", kind: "slide", min: -1, max: 1 },
  { key: "tint", label: "Tint", icon: "icon_edit_adjust_tint", kind: "slide", min: -1, max: 1 },
  { key: "vignette", label: "Vignette", icon: "icon_edit_adjust_vignette", kind: "slide", min: -1, max: 1 },
];

export type Pt = [number, number];
export interface Curves { rgb: Pt[]; red: Pt[]; green: Pt[]; blue: Pt[] }
export const DEFAULT_CURVE: Pt[] = [[0, 0], [1, 1]];
export const DEFAULT_CURVES: Curves = { rgb: DEFAULT_CURVE, red: DEFAULT_CURVE, green: DEFAULT_CURVE, blue: DEFAULT_CURVE };

export interface SplitTone { shadow: { color: string | null; value: number; memo: Record<string, number> }; highlight: { color: string | null; value: number; memo: Record<string, number> } }
export const DEFAULT_SPLIT: SplitTone = { shadow: { color: null, value: 0, memo: {} }, highlight: { color: null, value: 0, memo: {} } };
export const SPLIT_SHADOW_COLORS = ["#fe4d4c", "#f48022", "#fecc02", "#80d281", "#71c5d5", "#963a8d"];
export const SPLIT_HIGHLIGHT_COLORS = ["#ffb6b5", "#ffc393", "#feea97", "#b7f3b7", "#9dd9e5", "#bf8bdb"];

/** EPHSLColor: swatch + hue/sat/light gradient stops. */
export const HSL_COLORS = [
  { name: "Red", c: "#E51919", hue: ["#E5197F", "#E51919", "#E57F19"], sat: ["#7F7F7F", "#E51919", "#FF0000"], light: ["#B81414", "#E51919", "#FFFFFF"] },
  { name: "Orange", c: "#E57F19", hue: ["#E51919", "#E57F19", "#E5C319"], sat: ["#7F7F7F", "#E57F19", "#FF7F00"], light: ["#B86614", "#E57F19", "#FFFFFF"] },
  { name: "Yellow", c: "#E5C319", hue: ["#E57F19", "#E5C319", "#19E519"], sat: ["#7F7F7F", "#E5C319", "#FFD400"], light: ["#B89D14", "#E5C319", "#FFFFFF"] },
  { name: "Green", c: "#19E519", hue: ["#E5C319", "#19E519", "#195DE5"], sat: ["#7F7F7F", "#19E519", "#00FF00"], light: ["#14B814", "#19E519", "#FFFFFF"] },
  { name: "Blue", c: "#195DE5", hue: ["#19E519", "#195DE5", "#E519E5"], sat: ["#7F7F7F", "#195DE5", "#0055FF"], light: ["#144BB8", "#195DE5", "#FFFFFF"] },
  { name: "Purple", c: "#E519E5", hue: ["#195DE5", "#E519E5", "#E5197F"], sat: ["#7F7F7F", "#E519E5", "#FF00FF"], light: ["#B814B8", "#E519E5", "#FFFFFF"] },
  { name: "Magenta", c: "#E5197F", hue: ["#E519E5", "#E5197F", "#E51919"], sat: ["#7F7F7F", "#E5197F", "#FF007F"], light: ["#B81466", "#E5197F", "#FFFFFF"] },
];

/* ---------------------------------------------------------------- portrait */

export interface Beauty {
  smooth: number; smoother: number; glow: number; clear: number;
  coolWarm: number; tanLight: number;
  skinTone: string | null; skinToneValue: number;
  /** Face-engine edits (Face / Face Ratio / 3D Face / Reshape / Makeup / Body / Reflection / Volume / per-face Auto Skin). */
  face?: FaceEdit;
}

/** Makeup selection of one category (makeup_data_edit.json content id, sub-content id, intensity, mirror). */
export interface MakeupPick { id: string; sub?: string; v: number; flip?: boolean }

/** Per-face values (B612 stores every portrait value per face trackId). */
export interface FaceVals {
  /** face shape preset (only one at a time) and its value 0..1 */
  shape?: { key: string; v: number };
  /** Face (RESHAPE) items: `<key>` (Both) / `<key>_left` / `<key>_right`, engine domain (-1..1 for duplex items) */
  re?: Record<string, number>;
  /** Face Ratio items (-1..1) */
  ratio?: Record<string, number>;
  /** 3D Face items */
  r3d?: Record<string, number>;
  /** Makeup by category key */
  mk?: Record<string, MakeupPick>;
  /** Reflection (eye light) content + value */
  eye?: { id: string; v: number };
  /** Volume (hair_hairvolume) 0..1 */
  hv?: number;
  /** per-face Auto Skin items (0..1), plus "blemish" / "onetouch" toggles as 0/1 */
  skin?: Record<string, number>;
}

export interface FaceEdit {
  /** per detected face (index into the detection list of the current base) */
  f: Record<number, FaceVals>;
  /** manual Reshape (liquify) field id in the face engine registry */
  liq?: number;
  /** Body items (largest person) */
  body?: Record<string, number>;
  /** Face: background correction toggle */
  corr?: boolean;
  /** AR filter (EPStickerFragment): applied sticker id from the local starter set (src/data/camera/stickers.ts). */
  sticker?: number | null;
}
export const DEFAULT_BEAUTY: Beauty = { smooth: 0, smoother: 0, glow: 0, clear: 0, coolWarm: 0, tanLight: 0, skinTone: null, skinToneValue: 0.4 };

/* ---------------------------------------------------------------- border */

export type BorderFill = { type: "color"; color: string; source: "builtin" | "picker" | "palette" } | { type: "blur" };
export interface Border { ratio: [number, number] | null; fill: BorderFill | null }
export const DEFAULT_BORDER: Border = { ratio: null, fill: null };

/* ---------------------------------------------------------------- layers */

export type Blend = "normal" | "multiply" | "color-burn" | "darken" | "lighten" | "screen" | "overlay" | "soft-light" | "hard-light" | "difference";
export const BLENDS: { id: Blend; label: string }[] = [
  { id: "normal", label: "Normal" }, { id: "multiply", label: "Multiply" }, { id: "color-burn", label: "Color Burn" },
  { id: "darken", label: "Darken" }, { id: "lighten", label: "Lighten" }, { id: "screen", label: "Screen" },
  { id: "overlay", label: "Overlay" }, { id: "soft-light", label: "Soft Light" }, { id: "hard-light", label: "Hard Light" },
  { id: "difference", label: "Difference" },
];

export interface LayerAdjust { brightness: number; contrast: number; saturation: number; sharpen: number; highlights: number; shadows: number; warmth: number; tint: number }
export const ZERO_LAYER_ADJUST: LayerAdjust = { brightness: 0, contrast: 0, saturation: 0, sharpen: 0, highlights: 0, shadows: 0, warmth: 0, tint: 0 };
export const LAYER_ADJUST_ITEMS: { key: keyof LayerAdjust; label: string; icon: string; min: number }[] = [
  { key: "brightness", label: "Lightness", icon: "icon_edit_adjust_brightness", min: -1 },
  { key: "contrast", label: "Contrast", icon: "icon_edit_adjust_contrast", min: -1 },
  { key: "saturation", label: "Saturation", icon: "icon_edit_adjust_saturation", min: -1 },
  { key: "sharpen", label: "Sharpen", icon: "icon_edit_adjust_sharpen", min: 0 },
  { key: "highlights", label: "Highlights", icon: "icon_edit_adjust_highlights", min: -1 },
  { key: "shadows", label: "Shadows", icon: "icon_edit_adjust_shadows", min: -1 },
  { key: "warmth", label: "Warmth", icon: "icon_edit_adjust_warmth", min: -1 },
  { key: "tint", label: "Tint", icon: "icon_edit_adjust_tint", min: -1 },
];

/** Stroke in normalized coords (x/y in 0..1 of the target box, size relative to its width). */
export interface Stroke {
  pts: number[]; size: number; color: string; kind: "pen" | "highlighter" | "outline" | "eraser" | "restore"; opacity?: number;
  /**
   * Kuru BrushConfig for textured brushes (KuruRenderChainWrapper.BrushConfig): `tex` = brushPath (a bundled
   * assets/kuru/masks/*.png name, stamped along the path), `interval` = stampInterval (dab spacing / dab size),
   * `rot` = useDirection (dabs follow the stroke direction), `outline` = outlinePath for OUTLINE brushes,
   * `inner` = inner colour when usesInnerColorType. Absent on plain round strokes.
   */
  tex?: string; interval?: number; rot?: boolean; outline?: string; inner?: string;
}

export interface TextStyle {
  text: string; font: string;
  color: string; colorAlpha: number;
  stroke: string | null; strokeV: number;
  shadow: string | null; shadowV: number;
  bg: string | null; bgV: number;
  align: "left" | "center" | "right";
  letter: number; line: number;
}
export const DEFAULT_TEXT_STYLE: Omit<TextStyle, "text"> = {
  font: "default", color: "#FFFFFF", colorAlpha: 1, stroke: null, strokeV: 0.05, shadow: null, shadowV: 0.5, bg: null, bgV: 1, align: "center", letter: 0, line: 0,
};

interface LayerCommon {
  id: number;
  /** center in frame-normalized coords */
  x: number; y: number;
  /** width as a fraction of the frame width */
  s: number;
  rot: number;
  flip: boolean;
  opacity: number;
  blend: Blend;
  hidden: boolean;
  adjust: LayerAdjust;
  erase: Stroke[];
}
export type Layer =
  | (LayerCommon & { kind: "stamp"; src: string; aspect: number })
  | (LayerCommon & { kind: "text"; style: TextStyle; aspect: number })
  | (LayerCommon & { kind: "brush"; strokes: Stroke[]; aspect: number });

/* ---------------------------------------------------------------- doc */

export interface Doc {
  /** Index into the base-image store (crop/rotate results are new bases). */
  base: number;
  filter: { key: string; strength: number };
  adjust: Record<AdjustKey, number>;
  curves: Curves;
  hsl: number[]; // 7 x (h, s, l)
  split: SplitTone;
  beauty: Beauty;
  border: Border;
  layers: Layer[];
}

export const ZERO_ADJ: Record<AdjustKey, number> = {
  lux: 0, brightness: 0, brilliance: 0, contrast: 0, clarity: 0, saturation: 0, sharpen: 0, texture: 0, highlights: 0, shadows: 0, fade: 0, grain: 0, warmth: 0, tint: 0, vignette: 0,
};

export const initialDoc = (): Doc => ({
  base: 0,
  filter: { key: "ORIGINAL", strength: 0 },
  adjust: { ...ZERO_ADJ },
  curves: DEFAULT_CURVES,
  hsl: new Array(21).fill(0),
  split: DEFAULT_SPLIT,
  beauty: DEFAULT_BEAUTY,
  border: DEFAULT_BORDER,
  layers: [],
});

/* ---------------------------------------------------------------- curves math (p000/lfo.java) */

export function splineFn(points: Pt[]): (x: number) => number {
  const pts = [...points].sort((a, b) => a[0] - b[0]).filter((p, i, arr) => i === 0 || p[0] !== arr[i - 1][0]);
  const n = pts.length;
  if (n < 2) return () => (n ? pts[0][1] : 0);
  const x = pts.map((p) => p[0]), y = pts.map((p) => p[1]);
  const dd: number[] = [], m: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) dd[i] = (y[i + 1] - y[i]) / (x[i + 1] - x[i]);
  m[0] = dd[0]; m[n - 1] = dd[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = (dd[i - 1] + dd[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (dd[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / dd[i], b = m[i + 1] / dd[i], hh = Math.hypot(a, b);
    if (hh > 3) { const t = 3 / hh; m[i] = t * a * dd[i]; m[i + 1] = t * b * dd[i]; }
  }
  return (v) => {
    if (v <= x[0]) return y[0];
    if (v >= x[n - 1]) return y[n - 1];
    let i = 0;
    while (i < n - 2 && v > x[i + 1]) i++;
    const h = x[i + 1] - x[i], t = (v - x[i]) / h;
    return (y[i] * (1 + 2 * t) + m[i] * h * t) * (1 - t) * (1 - t) + (y[i + 1] * (3 - 2 * t) + h * m[i + 1] * (t - 1)) * t * t;
  };
}

const isIdentity = (p: Pt[]) => p.length === 2 && p[0][0] === 0 && p[0][1] === 0 && p[1][0] === 1 && p[1][1] === 1;
export const curvesModified = (c: Curves) => !(isIdentity(c.rgb) && isIdentity(c.red) && isIdentity(c.green) && isIdentity(c.blue));

/** v16.java: byte[4*256] with lut[ordinal + 4*i] (R=master, G=red, B=green, A=blue). */
export function curvesLut(c: Curves): Uint8Array | null {
  if (!curvesModified(c)) return null;
  const out = new Uint8Array(1024);
  [c.rgb, c.red, c.green, c.blue].forEach((pts, ch) => {
    const f = splineFn(pts);
    for (let i = 0; i < 256; i++) out[ch + 4 * i] = Math.round(Math.min(1, Math.max(0, f(i / 255))) * 255);
  });
  return out;
}

export const hexRgb = (h: string): [number, number, number] => {
  const n = parseInt(h.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

export function toEditAdjust(doc: Doc): EditAdjust {
  const sp = doc.split;
  return {
    ...doc.adjust,
    curves: curvesLut(doc.curves),
    hsl: doc.hsl,
    split: sp.shadow.color || sp.highlight.color ? {
      shadowColor: sp.shadow.color ? hexRgb(sp.shadow.color) : [0, 0, 0], shadow: sp.shadow.color ? sp.shadow.value : 0,
      highlightColor: sp.highlight.color ? hexRgb(sp.highlight.color) : [0, 0, 0], highlight: sp.highlight.color ? sp.highlight.value : 0,
    } : null,
  };
}

/* ---------------------------------------------------------------- palettes */

/** Border colours (EPBorderColorModel) and Text FontStyleColor (same 49 order apart from the greys). */
export const BORDER_COLORS = [
  "#FFFFFF", "#000000",
  "#FFD7CC", "#FBAB9C", "#EF5B5D", "#CD3041", "#CF1310",
  "#FEF4C3", "#FEE46B", "#F6AF51", "#F48431", "#F33D01",
  "#FFF1F1", "#FFE1E3", "#FFA5B6", "#FF659F", "#FE2677",
  "#E9D4E5", "#D3A5D8", "#BA63B2", "#A8368E", "#651B8E",
  "#96D1FA", "#7FACEC", "#2360AA", "#102B7D", "#121283",
  "#A3E7F8", "#74E4FF", "#00B1D4", "#008AC2", "#024480",
  "#DEEFE9", "#B1D0C4", "#4BAEA2", "#168A7A", "#04674E",
  "#D2E5A2", "#A9CF85", "#A4B02C", "#6C841F", "#35622F",
  "#E4D8BF", "#D5C48E", "#A48157", "#74462C", "#3E3129",
  "#BBBBBB", "#4E4E4E", "#212121",
];
export const TEXT_COLORS = [
  "#FFFFFF", "#BBBBBB", "#4E4E4E", "#212121", "#000000",
  "#FFD7CC", "#FBAB9C", "#EF5B5D", "#CD3041", "#CF1310",
  "#FEF4C3", "#FEE46B", "#F6AF51", "#F48431", "#F33D01",
  "#FFF1F1", "#FFE1E3", "#FFA5B6", "#FF659F", "#FE2677",
  "#E9D4E5", "#D3A5D8", "#BA63B2", "#A8368E", "#651B8E",
  "#96D1FA", "#7FACEC", "#2360AA", "#102B7D", "#121283",
  "#A3E7F8", "#74E4FF", "#00B1D4", "#008AC2", "#024480",
  "#DEEFE9", "#B1D0C4", "#4BAEA2", "#168A7A", "#04674E",
  "#D2E5A2", "#A9CF85", "#A4B02C", "#6C841F", "#35622F",
  "#E4D8BF", "#D5C48E", "#A48157", "#74462C", "#3E3129",
];
export const BRUSH_COLORS = [
  "#FFFFFF", "#FF3827", "#FF7421", "#FFC300", "#6CC037", "#32C5FF", "#0041E6", "#7D4FB5",
  "#DB3AB7", "#C8C8C8", "#8C8C8C", "#000000", "#E6C38F", "#986632", "#552D02", "#FBB6B6",
  "#F4787B", "#EF524A", "#C7A5E1", "#A650A4", "#620961", "#94D3C4", "#1E9D80", "#0B5C4C",
];

/** Border ratios (EPBorderRatio). [0,0] = Original. */
export const BORDER_RATIOS: { label: string; icon: string; r: [number, number] }[] = [
  { label: "Original", icon: "edit_crop_ratio_original", r: [0, 0] },
  { label: "Square", icon: "edit_crop_ratio_1_1", r: [1, 1] },
  { label: "2:3", icon: "edit_crop_ratio_2_3", r: [2, 3] },
  { label: "3:4", icon: "edit_crop_ratio_3_4", r: [3, 4] },
  { label: "4:5", icon: "edit_crop_ratio_4_5", r: [4, 5] },
  { label: "9:16", icon: "edit_crop_ratio_9_16", r: [9, 16] },
  { label: "3:2", icon: "edit_crop_ratio_3_2", r: [3, 2] },
  { label: "4:3", icon: "edit_crop_ratio_4_3", r: [4, 3] },
  { label: "5:4", icon: "edit_crop_ratio_5_4", r: [5, 4] },
  { label: "16:9", icon: "edit_crop_ratio_16_9", r: [16, 9] },
];

/** Crop ratios (EPCropViewModel / CropType). ratio = w/h, null = free, 0 = original. */
export const CROP_RATIOS: { label: string; icon: string; ratio: number | null; rev?: number }[] = [
  { label: "Original", icon: "icon_edit_crop_ratio_original", ratio: 0 },
  { label: "Free", icon: "icon_edit_crop_ratio_free", ratio: null },
  { label: "Square", icon: "icon_edit_crop_ratio_1_1", ratio: 1 },
  { label: "2:3", icon: "icon_edit_crop_ratio_2_3", ratio: 2 / 3, rev: 7 },
  { label: "3:4", icon: "icon_edit_crop_ratio_3_4", ratio: 3 / 4, rev: 8 },
  { label: "4:5", icon: "icon_edit_crop_ratio_4_5", ratio: 4 / 5, rev: 9 },
  { label: "9:16", icon: "icon_edit_crop_ratio_9_16", ratio: 9 / 16, rev: 10 },
  { label: "3:2", icon: "icon_edit_crop_ratio_3_2", ratio: 3 / 2, rev: 3 },
  { label: "4:3", icon: "icon_edit_crop_ratio_4_3", ratio: 4 / 3, rev: 4 },
  { label: "5:4", icon: "icon_edit_crop_ratio_5_4", ratio: 5 / 4, rev: 5 },
  { label: "16:9", icon: "icon_edit_crop_ratio_16_9", ratio: 16 / 9, rev: 6 },
];

/** EPToolsMenu.toolsList */
export const TOOLS = [
  { key: "crop", label: "Crop", icon: "icon_edit_tab_crop" },
  { key: "remove", label: "Remove", icon: "icon_edit_tab_remove" },
  { key: "generativefill", label: "AI Expand", icon: "icon_edit_tab_generativefill" },
  { key: "mosaic", label: "Mosaic", icon: "icon_edit_tab_mosaic" },
  { key: "enhance", label: "Enhance", icon: "icon_edit_tab_enhance" },
  { key: "dslr", label: "DSLR", icon: "icon_edit_tab_dslr" },
  { key: "cutout", label: "Cutout", icon: "icon_edit_tab_cutout" },
];

/** EPPortraitMenu.portraitList (smali order) */
export const PORTRAIT = [
  { key: "RESHAPE", label: "Face", icon: "icon_edit_tab_reshape" },
  { key: "FACE_RATIO", label: "Face Ratio", icon: "icon_edit_tab_faceratio" },
  { key: "RESHAPE3D", label: "3D Face", icon: "icon_edit_tab_reshape3d" },
  { key: "RETOUCH", label: "Reshape", icon: "icon_edit_tab_retouch" },
  { key: "MAKEUP", label: "Makeup", icon: "icon_edit_tab_makeup" },
  { key: "HDSKIN", label: "HD Skin", icon: "icon_edit_tab_hdskin" },
  { key: "RETOUCH_AUTO", label: "Auto Skin", icon: "icon_edit_tab_retouch_auto" },
  { key: "SKIN_RETOUCH", label: "Manual Skin", icon: "icon_edit_tab_skin_retouch" },
  { key: "SKINTONE", label: "Skin Tone", icon: "icon_edit_tab_skintone" },
  { key: "BODY", label: "Body", icon: "icon_edit_tab_body" },
  { key: "PAINT", label: "Paint", icon: "icon_edit_tab_paint" },
  { key: "EYELIGHT", label: "Reflection", icon: "icon_edit_tab_eyelight" },
  { key: "HAIRCOLOR", label: "Hair color", icon: "icon_edit_tab_haircolor" },
  { key: "HAIRVOLUME", label: "Volume", icon: "icon_edit_tab_hairvolume" },
  { key: "AI_HAIR", label: "AI Hair", icon: "icon_edit_tab_ai_hair" },
];

/** Auto Skin items (edit_beauty.json "skin"). `web` = has a pixel-only implementation here. */
export const AUTO_SKIN: { key: string; label: string; web?: keyof Beauty; row?: "tone" | "blemish" | "toggle" }[] = [
  { key: "onetouch", label: "One touch", row: "toggle" },
  { key: "blemish", label: "Blemish", row: "blemish" },
  { key: "smooth", label: "Skin", web: "smooth" },
  { key: "balance", label: "Pore" },
  { key: "clear", label: "Clarity", web: "clear" },
  { key: "conceal", label: "Conceal" },
  { key: "wrinkle", label: "Wrinkles" },
  { key: "smoother", label: "Smoother", web: "smoother" },
  { key: "oilremover", label: "Matte" },
  { key: "skintexture", label: "Texture" },
  { key: "skintoneup", label: "Brighten", row: "tone" },
  { key: "vibrance", label: "Vibrance" },
  { key: "glow", label: "Glow" },
  { key: "details", label: "Details" },
  { key: "clarity", label: "Details" },
  { key: "eyewhiten", label: "Eye Whiten" },
  { key: "eyedetails", label: "Eye Details" },
  { key: "eyebag", label: "Eye bags" },
  { key: "plim", label: "Eye Smile" },
  { key: "teeth", label: "Whiten" },
];

/** Skin tone presets (lookup tables generated by scripts/gen-luts.mjs). */
export const SKIN_TONES = SKIN_TONE_DEFS.map((t) => ({ key: t.key, label: t.label, color: t.color }));

/** alert_not_support_device */
export const NOT_ON_WEB = "This feature is not supported on your device.";
export const NETWORK_ERROR = "You are not connected to the network.\nPlease connect and try again.";
