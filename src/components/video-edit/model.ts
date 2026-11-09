// Video editor (EditActivity in video mode → VideoEditFragment, photoend_video_edit_fragment.xml) data model.
import type { WarpOp } from "@/lib/face";

/** VideoEditTabType, in VideoEditFeatureMenuAdapter order (Ad / NONE are not menu items). */
export type TabId = "VideoEdit" | "Speed" | "Music" | "Reshape" | "Retouch" | "Filter" | "Effect" | "Frame";

export interface TabDef {
  id: TabId;
  /** thumbnailResId */
  icon: string;
  /** title (gallery_end_video_menu_*) — used for accessibility; the bar shows icons only. */
  title: string;
  /** editMenu (getTagName = "edit_video_" + editMenu) */
  editMenu: string;
  /** 2-depth fragment (two_depth_fragment_container) that covers the bottom menu. */
  twoDepth?: boolean;
}

export const TABS: TabDef[] = [
  { id: "VideoEdit", icon: "edit_tab_cut", title: "Trim", editMenu: "trim" },
  { id: "Speed", icon: "edit_tab_speed", title: "Speed", editMenu: "speed" },
  { id: "Music", icon: "edit_tab_music", title: "Music", editMenu: "music" },
  { id: "Reshape", icon: "icon_edit_video_tab_reshape", title: "Beauty", editMenu: "reshape", twoDepth: true },
  { id: "Retouch", icon: "edit_tab_touchbeauty", title: "Reshape", editMenu: "retouch", twoDepth: true },
  { id: "Filter", icon: "edit_tab_filter", title: "Filters", editMenu: "filter" },
  { id: "Effect", icon: "edit_tab_effect", title: "Effects", editMenu: "effect_sticker" },
  { id: "Frame", icon: "edit_tab_sticker", title: "AR filter", editMenu: "sticker" },
];

/** AbstractC14771e: max editable 5 min, min 1 s; frame cell = gallery_video_frame_list_height (54dp). */
export const MAX_MS = 5 * 60 * 1000;
export const MIN_MS = 1000;
export const FRAME = 54;
/** photoend_video_edit_fragment: bottom_menu_guideline = video_edit_feature_tab_height (200dp), menu 52dp. */
export const TAB_H = 200;
export const MENU_H = 52;
export const PRIMARY = "#0bd4d2";

/** VideoSpeedSeekBar: min 0.25, default 1, max 4 (progress 0..4, center 2 = 1x). */
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
  /** top_sound_icon_btn selected = original sound off. */
  muted: boolean;
  rotation: Rotation;
  filter: { key: string; strength: number };
  /** AR filter (Frame tab) sticker id. */
  stickerId: number | null;
  /** Beauty (Reshape tab). */
  reshape: Reshape;
  /** Reshape (Retouch tab): manual drag warps, face-anchored so they follow the face. */
  retouch: WarpOp[];
}

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
});

export const reshapeActive = (r: Reshape) => (!!r.shape && r.shape.v > 0.001) || Object.values(r.re).some((v) => Math.abs(v) > 0.001);

export function docModified(a: VDoc, durationMs: number): boolean {
  const b = initialDoc(durationMs);
  return a.start !== b.start || a.end !== b.end || a.speed !== 1 || a.reverse || a.muted || a.rotation !== 0
    || a.filter.key !== "ORIGINAL" || a.stickerId !== null || reshapeActive(a.reshape) || a.retouch.length > 0;
}

/** i87.m125358a: floor to whole seconds, "mm:ss" (or "HH:mm:ss" from one hour). */
export function fmtDuration(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h > 0 ? `${p(h)}:${p(m)}:${p(r)}` : `${p(m)}:${p(r)}`;
}

/** VideoSpeedSeekBar.m62246R: progress (0..4) → speed, rounded to 0.1 above 1x and 0.01 below. */
export function progressToSpeed(p: number): number {
  const half = 2;
  let f: number;
  if (p >= half) f = p > half ? ((p - half) / half) * (SPEED.max - SPEED.def) + SPEED.def : SPEED.def;
  else f = (p / half) * (SPEED.def - SPEED.min) + SPEED.min;
  const k = f > 1 ? 10 : 100;
  return Math.round(f * k) / k;
}

/** VideoSpeedSeekBar.m62249P: speed → progress. */
export function speedToProgress(s: number): number {
  const half = 2;
  if (s < SPEED.def) return half * ((s - SPEED.min) / (SPEED.def - SPEED.min));
  if (s <= SPEED.def) return half * SPEED.def;
  return half + (4 - half) * ((s - SPEED.def) / (SPEED.max - SPEED.def));
}

/** Kotlin Float.toString for the speed label ("1.0x", "0.25x", "2.5x"). */
export const speedLabel = (s: number) => `${Number.isInteger(s) ? s.toFixed(1) : String(s)}x`;

/** CommonBrushSize: strength + UI size (dp). */
export const BRUSHES = [
  { strength: 0.125, size: 10 },
  { strength: 0.25, size: 14 },
  { strength: 0.5, size: 18 },
  { strength: 0.75, size: 22 },
  { strength: 1, size: 26 },
];

export const STR = {
  save: "SAVE",
  chooseMusic: "Choose music",
  tooltip5min: "You can edit up to 5 minutes of video.",
  reverse: "Reverse",
  reversePopup: "Setting Reverse…",
  reverseMute: "Video sound is set to silent.",
  reverseFail: "Reverse setting failed.",
  saveTitle: "Saving video...",
  saveSub: "Do not close B612 or switch to other apps.",
  saveLongSub: "The video will take time to save due to the duration. Do not close B612 or switch to another app.",
  saveFail: "Failed to save a video.",
  exporting: "Exporting...",
  leave: "Are you sure you want to leave without saving?",
  leaveOk: "Leave",
  cancel: "Cancel",
  networkBar: "Not connected to network.",
  retry: "Retry",
  effectsTooltip: "Hold to apply",
  store: "Store",
  manualTooltip: "Tap and drag your finger to edit wherever you want!",
  noFace: "No face was found.",
  areaTooltip: "Only the selected face will be reshaped.",
  faceCheck: "Loading face",
  faceRetry: "Retry face recognition",
  size: "Size",
  musicNetwork: "You are not connected to network.\nPlease check your network settings and try again.",
  addMusic: "Add Music",
  unsupported: "This feature is not supported on your device.",
  saved: "Saved!",
};
