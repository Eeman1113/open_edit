// Photo editor document model, tool catalogues and palettes.
import type { IconName } from "@/components/ui";
import { SKIN_TONE_DEFS } from "@/data/skintones";
import type { EditAdjust } from "@/lib/gl/renderer";

/* ---------------------------------------------------------------- tabs */

export type TabId = "PORTRAIT" | "TOOLS" | "FILTER" | "ADJUST" | "STICKER" | "STAMP" | "TEXT" | "BRUSH" | "BORDER";

/** Editor sections, in tab-bar order. STICKER is the face-filter (AR) page. */
export const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: "TOOLS", label: "Tools", icon: "tools" },
  { id: "FILTER", label: "Filters", icon: "filter" },
  { id: "ADJUST", label: "Adjust", icon: "edit" },
  { id: "PORTRAIT", label: "Portrait", icon: "face" },
  { id: "STICKER", label: "Face FX", icon: "effects" },
  { id: "STAMP", label: "Stickers", icon: "sticker" },
  { id: "TEXT", label: "Text", icon: "text" },
  { id: "BRUSH", label: "Draw", icon: "brush" },
  { id: "BORDER", label: "Frame", icon: "frame" },
];

/* ---------------------------------------------------------------- adjust */

export type AdjustKey = "lux" | "brightness" | "brilliance" | "contrast" | "clarity" | "saturation" | "sharpen" | "texture" | "highlights" | "shadows" | "fade" | "grain" | "warmth" | "tint" | "vignette";

export interface AdjustItem { key: string; label: string; icon: IconName; kind: "feature" | "slide"; min?: number; max?: number }

/** Adjust: three pages (curves, split tone, colour mix) followed by the sliders. */
export const ADJUST_ITEMS: AdjustItem[] = [
  { key: "curves", label: "Curves", icon: "curves", kind: "feature" },
  { key: "split_tone", label: "Split tone", icon: "split-tone", kind: "feature" },
  { key: "hsl", label: "Colour mix", icon: "palette", kind: "feature" },
  { key: "lux", label: "Auto light", icon: "exposure", kind: "slide", min: -1, max: 1 },
  { key: "brightness", label: "Brightness", icon: "brightness", kind: "slide", min: -1, max: 1 },
  { key: "brilliance", label: "Brilliance", icon: "brilliance", kind: "slide", min: -1, max: 1 },
  { key: "contrast", label: "Contrast", icon: "contrast", kind: "slide", min: -1, max: 1 },
  { key: "clarity", label: "Clarity", icon: "clarity", kind: "slide", min: -1, max: 1 },
  { key: "saturation", label: "Saturation", icon: "saturation", kind: "slide", min: -1, max: 1 },
  { key: "sharpen", label: "Sharpen", icon: "sharpen", kind: "slide", min: 0, max: 1 },
  { key: "texture", label: "Detail", icon: "texture", kind: "slide", min: -1, max: 1 },
  { key: "highlights", label: "Highlights", icon: "highlights", kind: "slide", min: -1, max: 1 },
  { key: "shadows", label: "Shadows", icon: "night", kind: "slide", min: -1, max: 1 },
  { key: "fade", label: "Fade", icon: "fade", kind: "slide", min: 0, max: 1 },
  { key: "grain", label: "Grain", icon: "grain", kind: "slide", min: 0, max: 1 },
  { key: "warmth", label: "Warmth", icon: "warmth", kind: "slide", min: -1, max: 1 },
  { key: "tint", label: "Tint", icon: "tint", kind: "slide", min: -1, max: 1 },
  { key: "vignette", label: "Vignette", icon: "vignette", kind: "slide", min: -1, max: 1 },
];

export type Pt = [number, number];
export interface Curves { rgb: Pt[]; red: Pt[]; green: Pt[]; blue: Pt[] }
export const DEFAULT_CURVE: Pt[] = [[0, 0], [1, 1]];
export const DEFAULT_CURVES: Curves = { rgb: DEFAULT_CURVE, red: DEFAULT_CURVE, green: DEFAULT_CURVE, blue: DEFAULT_CURVE };

export interface SplitTone { shadow: { color: string | null; value: number; memo: Record<string, number> }; highlight: { color: string | null; value: number; memo: Record<string, number> } }
export const DEFAULT_SPLIT: SplitTone = { shadow: { color: null, value: 0, memo: {} }, highlight: { color: null, value: 0, memo: {} } };
/** Split-tone swatches: deep tints for the shadows, pastel tints for the highlights (hue order matches). */
const hsl = (h: number, sat: number, l: number) => {
  const a = sat * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h / 30) % 12; return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255); };
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
};
const SPLIT_HUES = [8, 30, 50, 140, 195, 228, 285];
export const SPLIT_SHADOW_COLORS = SPLIT_HUES.map((h) => hsl(h, 0.72, 0.5));
export const SPLIT_HIGHLIGHT_COLORS = SPLIT_HUES.map((h) => hsl(h, 0.85, 0.8));

/** Colour mix bands: the swatch and the hue / saturation / lightness slider gradients of each band. */
const BAND = (name: string, h: number, prev: number, next: number) => ({
  name, c: hsl(h, 0.78, 0.52),
  hue: [hsl(prev, 0.78, 0.52), hsl(h, 0.78, 0.52), hsl(next, 0.78, 0.52)],
  sat: ["#808080", hsl(h, 0.6, 0.52), hsl(h, 1, 0.5)],
  light: [hsl(h, 0.78, 0.3), hsl(h, 0.78, 0.52), "#FFFFFF"],
});
export const HSL_COLORS = [
  BAND("Red", 0, 330, 30), BAND("Orange", 30, 0, 55), BAND("Yellow", 55, 30, 120), BAND("Green", 120, 55, 220),
  BAND("Blue", 220, 120, 300), BAND("Purple", 300, 220, 330), BAND("Pink", 330, 300, 360),
];

/* ---------------------------------------------------------------- portrait */

export interface Beauty {
  smooth: number; smoother: number; glow: number; clear: number;
  coolWarm: number; tanLight: number;
  skinTone: string | null; skinToneValue: number;
  /** Face-engine edits (face shape, proportions, sculpt, liquify, makeup, body, eye light, hair volume, per-face retouch). */
  face?: FaceEdit;
}

/** Makeup pick for one category: look id, optional colour option, strength, mirrored. */
export interface MakeupPick { id: string; sub?: string; v: number; flip?: boolean }

/** Values for one detected face (every portrait value is stored per face). */
export interface FaceVals {
  /** face shape preset (only one at a time) and its value 0..1 */
  shape?: { key: string; v: number };
  /** Face shape items: `<key>` (both sides) / `<key>_left` / `<key>_right`, engine domain (-1..1 for two-way items) */
  re?: Record<string, number>;
  /** Proportion items (-1..1) */
  ratio?: Record<string, number>;
  /** Sculpt items */
  r3d?: Record<string, number>;
  /** Makeup by category key */
  mk?: Record<string, MakeupPick>;
  /** Eye light look + value */
  eye?: { id: string; v: number };
  /** Hair volume 0..1 */
  hv?: number;
  /** per-face retouch items (0..1), plus the "blemish" / "onetouch" toggles as 0/1 */
  skin?: Record<string, number>;
}

export interface FaceEdit {
  /** per detected face (index into the detection list of the current base) */
  f: Record<number, FaceVals>;
  /** liquify field id in the face engine registry */
  liq?: number;
  /** Body items (largest person) */
  body?: Record<string, number>;
  /** Face shape: keep straight lines in the background */
  corr?: boolean;
  /** Face filter (AR sticker) id from the built-in set (src/data/camera/stickers.ts). */
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
  { id: "normal", label: "Normal" }, { id: "multiply", label: "Multiply" }, { id: "color-burn", label: "Colour burn" },
  { id: "darken", label: "Darken" }, { id: "lighten", label: "Lighten" }, { id: "screen", label: "Screen" },
  { id: "overlay", label: "Overlay" }, { id: "soft-light", label: "Soft light" }, { id: "hard-light", label: "Hard light" },
  { id: "difference", label: "Difference" },
];

export interface LayerAdjust { brightness: number; contrast: number; saturation: number; sharpen: number; highlights: number; shadows: number; warmth: number; tint: number }
export const ZERO_LAYER_ADJUST: LayerAdjust = { brightness: 0, contrast: 0, saturation: 0, sharpen: 0, highlights: 0, shadows: 0, warmth: 0, tint: 0 };
export const LAYER_ADJUST_ITEMS: { key: keyof LayerAdjust; label: string; icon: IconName; min: number }[] = [
  { key: "brightness", label: "Brightness", icon: "brightness", min: -1 },
  { key: "contrast", label: "Contrast", icon: "contrast", min: -1 },
  { key: "saturation", label: "Saturation", icon: "saturation", min: -1 },
  { key: "sharpen", label: "Sharpen", icon: "sharpen", min: 0 },
  { key: "highlights", label: "Highlights", icon: "highlights", min: -1 },
  { key: "shadows", label: "Shadows", icon: "night", min: -1 },
  { key: "warmth", label: "Warmth", icon: "warmth", min: -1 },
  { key: "tint", label: "Tint", icon: "tint", min: -1 },
];

/** Stroke in normalized coords (x/y in 0..1 of the target box, size relative to its width). */
export interface Stroke {
  pts: number[]; size: number; color: string; kind: "pen" | "highlighter" | "outline" | "eraser" | "restore"; opacity?: number;
  /**
   * Textured brushes: `tex` = brush tip id (asset kind "brush", stamped along the path), `interval` = dab spacing as a
   * fraction of the dab size, `rot` = dabs follow the stroke direction, `outline` = tip of the outer glow for neon
   * brushes, `inner` = their core colour. Absent on plain round strokes.
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

/* ---------------------------------------------------------------- curves math (monotone cubic spline) */

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

/** Curves as a 256-entry RGBA table: R = master, G = red, B = green, A = blue curve. */
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

/** A light-to-deep ramp of one hue (used to build the swatch palettes). */
const ramp = (h: number, sat: number) => [0.86, 0.72, 0.58, 0.44, 0.3].map((l) => hsl(h, sat, l));
const PALETTE_HUES: [number, number][] = [[0, 0.75], [22, 0.85], [44, 0.9], [340, 0.8], [290, 0.5], [225, 0.7], [195, 0.75], [160, 0.5], [95, 0.45], [30, 0.35]];

/** Frame fill colours: white and black, then ten hue ramps, then greys. */
export const BORDER_COLORS = ["#FFFFFF", "#000000", ...PALETTE_HUES.flatMap(([h, sat]) => ramp(h, sat)), "#C8C8C8", "#5A5A5A", "#262626"];
/** Text colours: greys first, then the same hue ramps. */
export const TEXT_COLORS = ["#FFFFFF", "#C8C8C8", "#5A5A5A", "#262626", "#000000", ...PALETTE_HUES.flatMap(([h, sat]) => ramp(h, sat))];
/** Drawing colours: a compact set of vivid and neutral pens. */
export const BRUSH_COLORS = [
  "#FFFFFF", "#000000", ...[0, 18, 38, 52, 100, 150, 190, 215, 245, 275, 310, 335].map((h) => hsl(h, 0.85, 0.55)),
  ...[0, 38, 150, 215, 275, 335].map((h) => hsl(h, 0.7, 0.8)), "#9A9A9A", "#5C4033",
];

/** Frame aspect ratios. [0,0] = the photo's own ratio. */
export const BORDER_RATIOS: { label: string; r: [number, number] }[] = [
  { label: "Photo", r: [0, 0] },
  { label: "1:1", r: [1, 1] },
  { label: "2:3", r: [2, 3] },
  { label: "3:4", r: [3, 4] },
  { label: "4:5", r: [4, 5] },
  { label: "9:16", r: [9, 16] },
  { label: "3:2", r: [3, 2] },
  { label: "4:3", r: [4, 3] },
  { label: "5:4", r: [5, 4] },
  { label: "16:9", r: [16, 9] },
];

/** Crop ratios: ratio = w/h, null = free, 0 = the photo's own ratio; `rev` = index of the rotated ratio. */
export const CROP_RATIOS: { label: string; ratio: number | null; rev?: number }[] = [
  { label: "Photo", ratio: 0 },
  { label: "Free", ratio: null },
  { label: "1:1", ratio: 1 },
  { label: "2:3", ratio: 2 / 3, rev: 7 },
  { label: "3:4", ratio: 3 / 4, rev: 8 },
  { label: "4:5", ratio: 4 / 5, rev: 9 },
  { label: "9:16", ratio: 9 / 16, rev: 10 },
  { label: "3:2", ratio: 3 / 2, rev: 3 },
  { label: "4:3", ratio: 4 / 3, rev: 4 },
  { label: "5:4", ratio: 5 / 4, rev: 5 },
  { label: "16:9", ratio: 16 / 9, rev: 6 },
];

/** Tools tab. Keys are also the `?tool=` values of the editor URL. */
export const TOOLS: { key: string; label: string; icon: IconName; about: string }[] = [
  { key: "crop", label: "Crop", icon: "crop", about: "Crop, rotate and straighten" },
  { key: "enhance", label: "Enhance", icon: "enhance", about: "Sharpen details on device" },
  { key: "remove", label: "Erase", icon: "remove", about: "Paint over things to remove them" },
  { key: "generativefill", label: "Expand", icon: "expand", about: "Extend the photo past its edges" },
  { key: "dslr", label: "Depth blur", icon: "depth", about: "Blur the background like a big lens" },
  { key: "cutout", label: "Cutout", icon: "cutout", about: "Cut the subject out" },
  { key: "mosaic", label: "Pixelate", icon: "grid-2", about: "Hide details with blocks or blur" },
];

/** Portrait tab. */
export const PORTRAIT: { key: string; label: string; icon: IconName }[] = [
  { key: "RETOUCH_AUTO", label: "Retouch", icon: "beauty" },
  { key: "RESHAPE", label: "Face shape", icon: "face" },
  { key: "MAKEUP", label: "Makeup", icon: "palette" },
  { key: "HDSKIN", label: "Skin detail", icon: "clarity" },
  { key: "SKIN_RETOUCH", label: "Skin brush", icon: "brush" },
  { key: "SKINTONE", label: "Skin tone", icon: "skin-tone" },
  { key: "FACE_RATIO", label: "Proportions", icon: "ratio" },
  { key: "RESHAPE3D", label: "Sculpt", icon: "face-3d" },
  { key: "RETOUCH", label: "Liquify", icon: "hand" },
  { key: "BODY", label: "Body", icon: "body" },
  { key: "PAINT", label: "Colour", icon: "paint" },
  { key: "EYELIGHT", label: "Eye light", icon: "eye" },
  { key: "HAIRCOLOR", label: "Hair colour", icon: "hair" },
  { key: "HAIRVOLUME", label: "Volume", icon: "wind" },
];

/** Auto retouch items. `web` = a whole-photo pixel pass; the others are applied per face. */
export const AUTO_SKIN: { key: string; label: string; web?: keyof Beauty; row?: "tone" | "blemish" | "toggle" }[] = [
  { key: "onetouch", label: "Quick fix", row: "toggle" },
  { key: "blemish", label: "Spots", row: "blemish" },
  { key: "smooth", label: "Smooth", web: "smooth" },
  { key: "balance", label: "Pores" },
  { key: "clear", label: "Clarity", web: "clear" },
  { key: "conceal", label: "Conceal" },
  { key: "wrinkle", label: "Lines" },
  { key: "smoother", label: "Extra smooth", web: "smoother" },
  { key: "oilremover", label: "Shine" },
  { key: "skintexture", label: "Texture" },
  { key: "skintoneup", label: "Skin tone", row: "tone" },
  { key: "vibrance", label: "Vibrance" },
  { key: "glow", label: "Glow" },
  { key: "details", label: "Fine detail" },
  { key: "clarity", label: "Definition" },
  { key: "eyewhiten", label: "Bright eyes" },
  { key: "eyedetails", label: "Eye detail" },
  { key: "eyebag", label: "Under-eyes" },
  { key: "plim", label: "Eye smile" },
  { key: "teeth", label: "Teeth" },
];

/** Skin tone presets (lookup tables generated by scripts/gen-luts.mjs). */
export const SKIN_TONES = SKIN_TONE_DEFS.map((t) => ({ key: t.key, label: t.label, color: t.color }));

export const NOT_ON_WEB = "This browser can't run this tool.";
export const NETWORK_ERROR = "That didn't load. Check your connection and try again.";
