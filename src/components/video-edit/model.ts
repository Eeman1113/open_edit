// Video editor data model: tabs, limits, the edit document and the speed scale.
import type { IconName } from "@/components/ui";
import type { WarpOp } from "@/lib/face";

export type TabId = "VideoEdit" | "Speed" | "Music" | "Reshape" | "Retouch" | "Filter" | "Effects" | "Frame";

export interface TabDef {
  id: TabId;
  icon: IconName;
  title: string;
  /** Opens a full tool page (with Cancel / Apply) instead of a panel. */
  twoDepth?: boolean;
}

export const TABS: TabDef[] = [
  { id: "VideoEdit", icon: "cutout", title: "Trim" },
  { id: "Speed", icon: "speed", title: "Speed" },
  { id: "Filter", icon: "filter", title: "Filters" },
  { id: "Effects", icon: "sparkles", title: "Effects" },
  { id: "Frame", icon: "effects", title: "Face FX" },
  { id: "Reshape", icon: "face", title: "Face shape", twoDepth: true },
  { id: "Retouch", icon: "hand", title: "Liquify", twoDepth: true },
  { id: "Music", icon: "music", title: "Music" },
];

/** Longest editable section (5 min) and shortest (1 s); width of one strip frame in px. */
export const MAX_MS = 5 * 60 * 1000;
export const MIN_MS = 1000;
export const FRAME = 52;
/** Dock height (panel + tab bar) and the tab bar's height. */
export const DOCK_H = 216;
export const TAB_H = 60;

/** Speed scale: 0.25x … 1x … 4x, mapped onto a 0..4 slider position with 1x in the middle. */
export const SPEED = { min: 0.25, def: 1, max: 4 } as const;

export type Rotation = 0 | 90 | 180 | 270;

export interface Reshape {
  /** RESHAPE item values (`<key>`, `<key>_left`, `<key>_right`), engine domain. */
  re: Record<string, number>;
  shape?: { key: string; v: number };
}

export interface VDoc {
  /** Trim section in source ms. */
  start: number;
  end: number;
  speed: number;
  reverse: boolean;
  /** Original sound off. */
  muted: boolean;
  rotation: Rotation;
  filter: { key: string; strength: number };
  /** Face FX (AR sticker) id. */
  stickerId: number | null;
  /** Face shape values. */
  reshape: Reshape;
  /** Liquify: drag warps anchored to the face so they follow it. */
  retouch: WarpOp[];
  /** Whole-image creative effect (src/lib/gl/effects.ts), applied to every frame; null = none. */
  fx: { id: string; amount: number } | null;
  /** Music track mixed under the original sound (from its start, looping); null = none. */
  music: VMusic | null;
}

export interface VMusic { id: string; url: string; title: string; volume: number }

export const initialDoc = (durationMs: number): VDoc => ({
  start: 0,
  end: Math.min(durationMs, MAX_MS),
  speed: 1,
  reverse: false,
  muted: false,
  rotation: 0,
  filter: { key: "ORIGINAL", strength: 0 },
  stickerId: null,
  reshape: { re: {} },
  retouch: [],
  fx: null,
  music: null,
});

export const reshapeActive = (r: Reshape) => (!!r.shape && r.shape.v > 0.001) || Object.values(r.re).some((v) => Math.abs(v) > 0.001);

export function docModified(a: VDoc, durationMs: number): boolean {
  const b = initialDoc(durationMs);
  return a.start !== b.start || a.end !== b.end || a.speed !== 1 || a.reverse || a.muted || a.rotation !== 0
    || a.filter.key !== "ORIGINAL" || a.stickerId !== null || reshapeActive(a.reshape) || a.retouch.length > 0 || !!a.fx;
}

/** Whole seconds as "mm:ss" (or "hh:mm:ss" from one hour). */
export function fmtDuration(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h > 0 ? `${p(h)}:${p(m)}:${p(r)}` : `${p(m)}:${p(r)}`;
}

/** Slider position (0..4) → speed, rounded to 0.1 above 1x and 0.01 below. */
export function progressToSpeed(p: number): number {
  const half = 2;
  let f: number;
  if (p >= half) f = p > half ? ((p - half) / half) * (SPEED.max - SPEED.def) + SPEED.def : SPEED.def;
  else f = (p / half) * (SPEED.def - SPEED.min) + SPEED.min;
  const k = f > 1 ? 10 : 100;
  return Math.round(f * k) / k;
}

/** Speed → slider position. */
export function speedToProgress(s: number): number {
  const half = 2;
  if (s < SPEED.def) return half * ((s - SPEED.min) / (SPEED.def - SPEED.min));
  if (s <= SPEED.def) return half * SPEED.def;
  return half + (4 - half) * ((s - SPEED.def) / (SPEED.max - SPEED.def));
}

/** Speed label ("1x", "0.25x", "2.5x"). */
export const speedLabel = (s: number) => `${String(s)}x`;

/** Liquify brush sizes: warp strength and the dot size shown in the picker. */
export const BRUSHES = [
  { strength: 0.125, size: 10 },
  { strength: 0.25, size: 14 },
  { strength: 0.5, size: 18 },
  { strength: 0.75, size: 22 },
  { strength: 1, size: 26 },
];

export const STR = {
  save: "Save",
  tooltip5min: "Videos can be edited up to 5 minutes long.",
  reverse: "Play backwards",
  reversePopup: "Reversing the clip…",
  reverseMute: "Sound is off while the clip plays backwards.",
  reverseFail: "Couldn't reverse this clip.",
  saveTitle: "Saving video…",
  saveSub: "Keep this tab open until it's done.",
  saveLongSub: "Longer videos take a while. Keep this tab open until it's done.",
  saveFail: "Couldn't save the video. Please try again.",
  exporting: "Preparing to share…",
  leave: "You haven't saved this video yet. Leaving now throws the changes away.",
  leaveTitle: "Discard your edits?",
  leaveOk: "Discard",
  cancel: "Keep editing",
  manualTooltip: "Drag on a face to push it into shape",
  noFace: "No face found in the video.",
  faceCheck: "Looking for faces…",
  faceRetry: "Look again",
  size: "Brush size",
  unsupported: "This browser can't run this tool.",
  saved: "Saved",
};
