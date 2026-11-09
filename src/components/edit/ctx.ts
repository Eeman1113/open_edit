"use client";

import { createContext, useContext, type RefObject } from "react";
import type { Doc, TabId } from "./model";

/** Tool pages opened over the editor. While one is open the top bar shows its Cancel / title / Apply bar. */
export type Sub =
  | "crop" | "curves" | "hsl" | "split" | "autoskin" | "skintone"
  | "stamp-add" | "text-add" | "text-edit" | "brush-add" | "layer-adjust" | "layer-eraser"
  /** Tools and Portrait pages, routed by tools/ExtSub ("x:<page>"). */
  | `x:${string}`
  | null;

export interface Rect { x: number; y: number; w: number; h: number }

/** Pointer handlers for the preview, in frame-normalised coordinates. */
export interface PreviewTool {
  down?: (x: number, y: number, e: PointerEvent) => void;
  move?: (x: number, y: number, e: PointerEvent) => void;
  up?: (x: number, y: number, e: PointerEvent) => void;
}

export interface EditCtxValue {
  doc: Doc;
  /** Transient preview state (slider drag etc.); null = back to the committed doc. */
  setLive: (d: Doc | null) => void;
  /** Push an undo entry. */
  commit: (d: Doc) => void;
  /** `auto` marks the editor-wide history, whose buttons live in the top bar. */
  undo: { can: boolean; on: () => void; auto?: boolean };
  redo: { can: boolean; on: () => void; auto?: boolean };
  setOriginal: (down: boolean) => void;
  toast: (s: string) => void;
  sub: Sub;
  openSub: (s: Sub) => void;
  tab: TabId;
  setTab: (t: TabId) => void;
  selected: number | null;
  select: (id: number | null) => void;
  /** Displayed frame rect (CSS px inside the editor root) and the frame size in px. */
  rect: Rect;
  frame: { fw: number; fh: number };
  /** Downscaled base used for the interactive preview. */
  srcCanvas: () => HTMLCanvasElement | null;
  /** The rendered photo pass (filters and adjustments applied, no border or layers). */
  photoCanvas: () => HTMLCanvasElement | null;
  /** Object URL of the untouched photo (hold to compare, blur swatches). */
  originalUrl: string;
  bases: RefObject<HTMLCanvasElement[]>;
  setTool: (t: PreviewTool | null) => void;
  rerender: () => void;
  nextId: () => number;
  /** Dev only: preselected Adjust item (headless proofs). */
  devAdjust?: string;
  /** Animate the preview so `r` (editor-root CSS px, as displayed) fills the preview area. */
  zoomTo?: (r: Rect, ms?: number) => void;
  /** The top bar element that tool pages portal their Cancel / title / Apply bar into. */
  barSlot: HTMLElement | null;
}

export const EditCtx = createContext<EditCtxValue | null>(null);
export function useEdit() {
  const v = useContext(EditCtx);
  if (!v) throw new Error("useEdit() outside the editor");
  return v;
}
