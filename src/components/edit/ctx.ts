"use client";

import { createContext, useContext, type RefObject } from "react";
import type { Doc, TabId } from "./model";

/** Two-depth pages opened over the editor (they replace the tab bar with their own title bar). */
export type Sub =
  | "crop" | "curves" | "hsl" | "split" | "autoskin" | "skintone"
  | "stamp-add" | "text-add" | "text-edit" | "brush-add" | "layer-adjust" | "layer-eraser"
  /** Tools / Portrait two-depth pages rendered by tools/ExtSub (edit-tools part) */
  | `x:${string}`
  | null;

export interface Rect { x: number; y: number; w: number; h: number }

/** Pointer handlers for the preview, in frame-normalized coordinates. */
export interface PreviewTool {
  down?: (x: number, y: number, e: PointerEvent) => void;
  move?: (x: number, y: number, e: PointerEvent) => void;
  up?: (x: number, y: number, e: PointerEvent) => void;
}

export interface EditCtxValue {
  doc: Doc;
  /** transient preview state (slider drag etc.); null = back to the committed doc */
  setLive: (d: Doc | null) => void;
  /** push an undo entry */
  commit: (d: Doc) => void;
  /** `auto`: editor-wide stack (undo/redo/original visibility follows EPOneDepthFragment). */
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
  /** displayed frame rect (CSS px inside the editor root) and frame size in px */
  rect: Rect;
  frame: { fw: number; fh: number };
  /** downscaled base used for the interactive preview */
  srcCanvas: () => HTMLCanvasElement | null;
  /** the rendered photo pass (filters/adjust applied, no border/layers) */
  photoCanvas: () => HTMLCanvasElement | null;
  /** object URL of the original photo (hold-to-compare, blur thumbnails) */
  originalUrl: string;
  bases: RefObject<HTMLCanvasElement[]>;
  setTool: (t: PreviewTool | null) => void;
  rerender: () => void;
  nextId: () => number;
  /** dev-only: preselected Adjust item (headless verification) */
  devAdjust?: string;
  /**
   * PinchZoomTextureView.m62786v(matrix, ms): animate the preview so the given rect (editor-root CSS px, as currently
   * displayed) fills the preview area, fit-centred (Matrix.setRectToRect(.., CENTER)). Used by FaceGuide taps (baa).
   */
  zoomTo?: (r: Rect, ms?: number) => void;
}

export const EditCtx = createContext<EditCtxValue | null>(null);
export function useEdit() {
  const v = useContext(EditCtx);
  if (!v) throw new Error("EditCtx");
  return v;
}
