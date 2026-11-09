// Camera screen geometry (Open_Edit layout).
//
//  ┌──────────── top toolbar (TOOLBAR_H) ────────────┐   glass icon row over the preview
//  │                                                 │
//  │                preview (ratio)                  │   full: whole screen · 9:16 / 3:4 / 1:1: under the toolbar
//  │                                                 │
//  ├──────── dock (Filters · Beauty · Effects) ──────┤
//  │   gallery        ( SHUTTER )          flip      │   shutter row, centre at shutterCenter()
//  │               Photo  ·  Video                   │   mode switch
//  └──────────────── bottom nav ─────────────────────┘

export type Ratio = "full" | "9:16" | "3:4" | "1:1";
export const RATIOS: Ratio[] = ["full", "9:16", "3:4", "1:1"];
export const RATIO_LABEL: Record<Ratio, string> = { full: "Full", "9:16": "9:16", "3:4": "3:4", "1:1": "1:1" };

export interface Rect { x: number; y: number; w: number; h: number }

export const TOOLBAR_H = 56;
export const NAV_H = 64;
export const SHUTTER = 76;
const MODE_H = 36;
const DOCK_H = 48;

/** Scale-to-fill a box of `aspect` (w/h) over `r`, centred. */
function cover(aspect: number, r: Rect): Rect {
  let w = r.w, h = r.w / aspect;
  if (h < r.h) { h = r.h; w = h * aspect; }
  return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h };
}

/** Distance from the screen bottom to the shutter centre. `nav` = bottom nav visible. */
export function shutterCenter(H: number, nav = true): number {
  const base = (nav ? NAV_H : 16) + MODE_H + SHUTTER / 2 + 6;
  // tall screens: lift the controls a little so they sit closer to the thumb's natural arc
  return base + Math.max(0, Math.min(24, (H - 760) / 4));
}

/** Bottom of the dock row (Filters / Beauty / Effects) from the screen bottom. */
export const dockBottom = (H: number, nav = true) => shutterCenter(H, nav) + SHUTTER / 2 + 10;
export const DOCK_HEIGHT = DOCK_H;

/** The camera surface (the sensor frame drawn by WebGL). Always 9:16 for full / 9:16, 3:4 otherwise. */
export function previewRect(ratio: Ratio, W: number, H: number): Rect {
  if (ratio === "full") return cover(9 / 16, { x: 0, y: 0, w: W, h: H });
  if (ratio === "9:16") {
    const h = (W * 16) / 9;
    // short screens: centre-crop the frame; otherwise hang it under the toolbar when it fits
    if (h >= H) return { x: 0, y: (H - h) / 2, w: W, h };
    return { x: 0, y: Math.min(TOOLBAR_H, H - h), w: W, h };
  }
  return { x: 0, y: TOOLBAR_H, w: W, h: (W * 4) / 3 };
}

/** What is captured: the whole screen (full), the frame, or a centred square of the 3:4 frame (1:1). */
export function visibleRect(ratio: Ratio, W: number, H: number): Rect {
  const p = previewRect(ratio, W, H);
  if (ratio === "full") return { x: 0, y: 0, w: W, h: H };
  if (ratio === "1:1") return { x: p.x, y: p.y + (p.h - p.w) / 2, w: p.w, h: p.w };
  return p;
}

/** True when the bottom controls sit on top of the picture (they then use the glass treatment). */
export function controlsOverPreview(ratio: Ratio, W: number, H: number): boolean {
  const v = visibleRect(ratio, W, H);
  return v.y + v.h > H - dockBottom(H) - DOCK_H;
}
