"use client";

// Shared pieces for the Tools and Portrait pages: hint pills, retry and progress overlays, the tool-page dock, the
// photo-area overlay used by bitmap tools, brush stroke masks and colour helpers.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button, Icon, Spinner, cx } from "@/components/ui";
import { useEdit } from "../ctx";
import { frameGeo } from "../pipeline";
import { BarAction, ColorChip, Dock, EditBar, HintPill, MENU, TOP_H } from "../ui";

export { MENU };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/* ------------------------------------------------------------------ copy */

export const S = {
  noFace: "No face found in this photo.",
  networkTry: "That didn't work. Check your connection and try again.",
  networkConnect: "That didn't work. Please try again.",
  retry: "Try again",
  processing: "Working on it…",
  downloading: "Downloading…",
  inProgress: "Working on it…",
};

/* ------------------------------------------------------------------ hint pill */

/** Hint centred in the preview area (between the top bar and `bottom`). */
export function TextTooltip({ text, bottom = MENU, top = TOP_H }: { text: string | null; bottom?: number; top?: number }) {
  if (!text) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 z-30 flex items-center justify-center px-12" style={{ top, bottom }}>
      <HintPill key={text} text={text} />
    </div>
  );
}

/** Tooltip that shows on mount (and whenever `text` changes) and hides after `ms`. */
export function useTimedTooltip(initial: string | null, ms = 2000): [string | null, (t: string | null) => void] {
  const [text, setText] = useState<string | null>(initial);
  const t = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!text) return;
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => setText(null), ms);
    return () => window.clearTimeout(t.current);
  }, [text, ms]);
  return [text, setText];
}

/* ------------------------------------------------------------------ retry / AI progress / busy */

/** Error card over the preview with a retry button. */
export function RetryView({ text, onRetry, bottom = MENU }: { text: string; onRetry: () => void; bottom?: number }) {
  return (
    <div className="absolute inset-x-0 z-30 flex items-center justify-center px-10" style={{ top: TOP_H, bottom }}>
      <div className="flex max-w-[280px] flex-col items-center gap-3 rounded-lg bg-panel/95 p-5 text-center shadow-2xl ring-1 ring-line backdrop-blur-md">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-danger/15 text-danger"><Icon name="alert" size={20} /></span>
        <p className="whitespace-pre-line text-[14px] leading-snug text-fg-2">{text}</p>
        <Button size="sm" icon="reset" onClick={onRetry}>{S.retry}</Button>
      </div>
    </div>
  );
}

/** Progress ring with a percentage. */
export function ProgressRing({ value, size = 76 }: { value: number; size?: number }) {
  const r = size / 2 - 4, c = 2 * Math.PI * r;
  return (
    <span className="relative block" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--oe-muted)" strokeWidth={5} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--oe-accent)" strokeWidth={5} strokeLinecap="round" strokeDasharray={`${(c * Math.min(100, value)) / 100} ${c}`} style={{ transition: "stroke-dasharray 200ms" }} />
      </svg>
      <span className="tabular absolute inset-0 flex items-center justify-center font-display text-[17px] font-semibold">{Math.round(value)}%</span>
    </span>
  );
}

/** On-device AI job card: progress ring, a step caption and Cancel. Blocks the editor while it runs. */
export function AiLoading({ text, pct, onCancel }: { text: string; pct?: number; onCancel: () => void }) {
  const [caption, num] = text.split("\n");
  const value = pct ?? (num ? parseInt(num, 10) || 0 : 0);
  return (
    <div className="absolute inset-0 z-[70]" onPointerDown={(e) => e.stopPropagation()}>
      <div className="absolute inset-x-0 flex items-center justify-center" style={{ top: TOP_H, bottom: MENU }}>
        <div className="flex w-[220px] flex-col items-center gap-3 rounded-lg bg-panel/95 px-5 pb-4 pt-5 shadow-2xl ring-1 ring-line backdrop-blur-md" style={{ animation: "oe-pop 200ms var(--oe-ease)" }}>
          <ProgressRing value={value} />
          <p className="text-center text-[14px] font-medium leading-snug text-fg">{caption}</p>
          <p className="-mt-2 text-center text-[12px] text-fg-3">Runs on your device</p>
          <Button variant="secondary" size="sm" onClick={onCancel} block>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

/** Small busy indicator centred over the preview. */
export function EditLoading({ text, bottom = MENU }: { text?: string; bottom?: number }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 z-30 flex items-center justify-center" style={{ top: TOP_H, bottom }}>
      <div className="flex items-center gap-2.5 rounded-full bg-glass px-4 py-2.5 text-[13px] font-medium text-white backdrop-blur-md">
        <Spinner size={18} className="text-accent" />
        {text ?? "Loading…"}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ tool page dock + bar */

/** A tool page: its Cancel / title / Apply bar in the top bar and its controls in the dock. */
export function Panel({ title, onClose, onConfirm, confirmNode, children, height = MENU, style, className }: {
  title?: ReactNode; guide?: boolean; onClose?: () => void; onConfirm?: () => void; confirmNode?: ReactNode;
  children?: ReactNode; height?: number; bg?: string; style?: CSSProperties; className?: string;
}) {
  return (
    <>
      <EditBar title={title} onClose={onClose} onConfirm={onConfirm} confirmNode={confirmNode} />
      <Dock height={height} style={style} className={className}>{children}</Dock>
    </>
  );
}

/** "Generate" action for the bar (runs an AI step instead of applying). */
export function CreateButton({ onClick, label = "Generate" }: { onClick: () => void; label?: string }) {
  return <BarAction label={label} onClick={onClick} />;
}

/** Strip that sits on top of the dock (sliders, colour rows), with an optional caption. */
export function OptionRow({ bottom, label, labelWidth, children, height = 52 }: { bottom: number; label?: string; labelWidth?: number; children: ReactNode; bg?: string; height?: number }) {
  return (
    <div className="absolute inset-x-3 z-20 flex items-center gap-3 rounded-lg bg-panel/90 px-3 shadow-lg ring-1 ring-line backdrop-blur-md" style={{ bottom: bottom + 8, height }} onPointerDown={(e) => e.stopPropagation()}>
      {label !== undefined && <span className="flex-none whitespace-nowrap text-[13px] font-medium text-fg-2" style={{ minWidth: labelWidth ?? 56 }}>{label}</span>}
      {children}
    </div>
  );
}
/** Total height an OptionRow takes above `bottom` (row + gap). */
export const OPTION_H = 60;

/** Text toggle (two or three modes in a row). */
export function TextToggle({ label, selected, onClick, style }: { label: string; selected: boolean; onClick: () => void; style?: CSSProperties }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} style={style}
      className={cx("oe-press h-8 rounded-full px-3 text-[13px] font-semibold transition-colors", selected ? "bg-fg text-bg" : "text-fg-2")}>
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ photo area geometry + overlay canvas */

export interface PhotoArea {
  /** display rect of the photo (without border) in editor CSS px */
  x: number; y: number; w: number; h: number;
  /** preview photo canvas size */
  pw: number; ph: number;
  /** frame-normalized -> photo-normalized */
  toPhoto: (fx: number, fy: number) => [number, number];
  /** editor view width */
  viewW: number;
}

export function usePhotoArea(): PhotoArea {
  const { rect, doc, photoCanvas } = useEdit();
  const pc = photoCanvas();
  const pw = pc?.width ?? 1, ph = pc?.height ?? 1;
  return useMemo(() => {
    const g = frameGeo(pw, ph, doc);
    const k = rect.w / g.fw;
    return {
      x: rect.x + g.px * k, y: rect.y + g.py * k, w: g.pw * k, h: g.ph * k, pw, ph,
      toPhoto: (fx: number, fy: number) => [(fx * g.fw - g.px) / g.pw, (fy * g.fh - g.py) / g.ph] as [number, number],
      viewW: rect.w + rect.x * 2,
    };
  }, [rect, doc, pw, ph]);
}

/** Canvas laid exactly over the photo area (pointer-events none, so the editor preview keeps the gestures). */
export function PhotoOverlay({ area, canvasRef, hidden, bg = "var(--oe-bg)", children }: { area: PhotoArea; canvasRef: React.RefObject<HTMLCanvasElement | null>; hidden?: boolean; bg?: string; children?: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[5] overflow-hidden" style={{ bottom: MENU, visibility: hidden ? "hidden" : "visible" }}>
      <div className="absolute inset-0" style={{ background: bg }} />
      <canvas ref={canvasRef} className="absolute" style={{ left: area.x, top: area.y, width: area.w, height: area.h }} />
      {children}
    </div>
  );
}

/** Hold-to-compare state that also drives the editor's original view. */
export function useHold() {
  const { setOriginal } = useEdit();
  const [held, setHeld] = useState(false);
  return [held, (down: boolean) => { setHeld(down); setOriginal(down); }] as const;
}

export function newCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}
export function copyCanvas(src: CanvasImageSource & { width: number; height: number }, w = src.width, h = src.height) {
  const c = newCanvas(w, h);
  const g = c.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** Push a bitmap result as a new base (one history step) and leave the tool page. */
export function useBake() {
  const { doc, bases, commit, openSub } = useEdit();
  return (fn: (base: HTMLCanvasElement) => HTMLCanvasElement) => {
    const base = bases.current[doc.base];
    if (!base) return;
    const out = fn(base);
    bases.current.push(out);
    commit({ ...doc, base: bases.current.length - 1 });
    openSub(null);
  };
}

/* ------------------------------------------------------------------ brush strokes (photo-normalized) */

export interface MStroke {
  /** x,y pairs in photo-normalized coords */
  pts: number[];
  /** brush radius as a fraction of the photo width */
  r: number;
  erase?: boolean;
  /** free per-tool payload (effect id, colour, opacity …) */
  p?: Record<string, unknown>;
}

/** Draw one stroke as a soft round path into a mask canvas (white = on). */
export function strokeMask(ctx: CanvasRenderingContext2D, s: MStroke, w: number, h: number, soft = 0.25, color = "#ffffff") {
  const r = Math.max(0.5, s.r * w);
  ctx.save();
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = color; ctx.fillStyle = color;
  if (soft > 0) ctx.filter = `blur(${Math.max(0.5, r * soft)}px)`;
  ctx.lineWidth = r * 2 * (1 - soft * 0.5);
  ctx.beginPath();
  ctx.moveTo(s.pts[0] * w, s.pts[1] * h);
  if (s.pts.length === 2) ctx.lineTo(s.pts[0] * w + 0.01, s.pts[1] * h);
  for (let i = 2; i < s.pts.length; i += 2) ctx.lineTo(s.pts[i] * w, s.pts[i + 1] * h);
  ctx.stroke();
  ctx.restore();
}

/** Apply `effect` over `dst` through the stroke's mask (destination keeps everything outside). */
export function paintThrough(dst: CanvasRenderingContext2D, effect: CanvasImageSource, s: MStroke, w: number, h: number, alpha = 1, soft = 0.25) {
  const m = newCanvas(w, h);
  const mc = m.getContext("2d")!;
  strokeMask(mc, s, w, h, soft);
  mc.globalCompositeOperation = "source-in";
  mc.drawImage(effect, 0, 0, w, h);
  dst.save();
  dst.globalAlpha = alpha;
  dst.drawImage(m, 0, 0);
  dst.restore();
}

/** Stroke list with undo/redo (one entry per stroke). */
export function useStrokes<T>() {
  const [st, setSt] = useState<{ list: T[]; i: number }>({ list: [], i: 0 });
  const visible = useMemo(() => st.list.slice(0, st.i), [st]);
  return {
    visible,
    push: (s: T) => setSt((o) => { const list = [...o.list.slice(0, o.i), s]; return { list, i: list.length }; }),
    undo: { can: st.i > 0, on: () => setSt((o) => ({ ...o, i: Math.max(0, o.i - 1) })) },
    redo: { can: st.i < st.list.length, on: () => setSt((o) => ({ ...o, i: Math.min(o.list.length, o.i + 1) })) },
    reset: () => setSt({ list: [], i: 0 }),
    count: st.list.length,
  };
}

/** Brush outline shown while touching the photo or dragging a size slider. */
export function BrushRing({ at, r }: { at: { x: number; y: number } | null; r: number }) {
  if (!at) return null;
  return (
    <div className="pointer-events-none absolute z-30 rounded-full" style={{ left: at.x - r, top: at.y - r, width: r * 2, height: r * 2, border: "1.5px solid #ffffff", boxShadow: "0 0 2px rgba(0,0,0,0.4)" }} />
  );
}

/* ------------------------------------------------------------------ colours */

export function sampleHex(src: CanvasImageSource & { width: number; height: number }, u: number, v: number): string {
  const c = newCanvas(1, 1);
  const g = c.getContext("2d")!;
  g.drawImage(src, clamp(u * src.width, 0, src.width - 1), clamp(v * src.height, 0, src.height - 1), 1, 1, 0, 0, 1, 1);
  const p = g.getImageData(0, 0, 1, 1).data;
  return `#${[p[0], p[1], p[2]].map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** HSV value of a hex colour (below 0.1 counts as "dark"). */
export const hexV = (hex: string) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return Math.max((n >> 16) & 255, (n >> 8) & 255, n & 255) / 255;
};

/** Colour swatch (same look as the editor's ColorChip). */
export function Swatch({ color, selected, onClick, style }: { color: string; selected: boolean; onClick: () => void; style?: CSSProperties }) {
  return <ColorChip color={color} selected={selected} onClick={onClick} style={style} />;
}

/* ------------------------------------------------------------------ preview drawing input */

/**
 * Registers a preview tool that turns drags into photo-normalized strokes. `begin` returns the new stroke
 * (or null to ignore / handle the tap itself). The live stroke is reported on every move.
 */
export function useStrokeInput(area: PhotoArea, begin: (u: number, v: number) => MStroke | null, onLive: (s: MStroke | null) => void, onEnd: (s: MStroke) => void, onTouch?: (at: { x: number; y: number } | null) => void) {
  const { setTool } = useEdit();
  const h = useRef({ area, begin, onLive, onEnd, onTouch });
  useEffect(() => { h.current = { area, begin, onLive, onEnd, onTouch }; });
  useEffect(() => {
    let cur: MStroke | null = null;
    const toView = (fx: number, fy: number) => {
      const a = h.current.area;
      const [u, v] = a.toPhoto(fx, fy);
      return { u, v, x: a.x + u * a.w, y: a.y + v * a.h };
    };
    setTool({
      down: (fx, fy) => {
        const p = toView(fx, fy);
        h.current.onTouch?.({ x: p.x, y: p.y });
        cur = h.current.begin(p.u, p.v);
        if (cur) h.current.onLive({ ...cur, pts: [...cur.pts] });
      },
      move: (fx, fy) => {
        const p = toView(fx, fy);
        h.current.onTouch?.({ x: p.x, y: p.y });
        if (!cur) return;
        cur.pts.push(p.u, p.v);
        h.current.onLive({ ...cur, pts: [...cur.pts] });
      },
      up: () => {
        h.current.onTouch?.(null);
        if (!cur) return;
        const s = cur;
        cur = null;
        h.current.onLive(null);
        h.current.onEnd(s);
      },
    });
    return () => setTool(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Overlay renderer for mask-painting tools: keeps a cached composite of the committed strokes and draws the
 * live stroke on top. `apply(ctx, stroke, w, h, src)` paints one stroke onto the composite.
 */
export function useStrokeCanvas(canvasRef: React.RefObject<HTMLCanvasElement | null>, src: HTMLCanvasElement | null, strokes: MStroke[], live: MStroke | null, apply: (ctx: CanvasRenderingContext2D, s: MStroke, w: number, h: number, src: HTMLCanvasElement) => void, extraKey = "") {
  const committed = useRef<{ key: unknown[]; c: HTMLCanvasElement } | null>(null);
  useEffect(() => {
    const out = canvasRef.current;
    if (!out || !src) return;
    const W = src.width, H = src.height;
    if (out.width !== W || out.height !== H) { out.width = W; out.height = H; }
    let cc = committed.current;
    if (!cc || cc.key[0] !== strokes || cc.key[1] !== src || cc.key[2] !== extraKey) {
      // reuse the previous composite when exactly one stroke was appended
      const prev = cc && cc.key[1] === src && cc.key[2] === extraKey && Array.isArray(cc.key[0]) && (cc.key[0] as MStroke[]).length === strokes.length - 1 && (cc.key[0] as MStroke[]).every((s, i) => s === strokes[i]) ? cc.c : null;
      const c = newCanvas(W, H);
      const g = c.getContext("2d")!;
      if (prev) { g.drawImage(prev, 0, 0); apply(g, strokes[strokes.length - 1], W, H, src); }
      else { g.drawImage(src, 0, 0); for (const s of strokes) apply(g, s, W, H, src); }
      cc = { key: [strokes, src, extraKey], c };
      committed.current = cc;
    }
    const g = out.getContext("2d")!;
    g.clearRect(0, 0, W, H);
    g.drawImage(cc.c, 0, 0);
    if (live) apply(g, live, W, H, src);
  }, [canvasRef, src, strokes, live, apply, extraKey]);
}

/** Snapshot of the rendered photo pass (filters applied) taken once the preview has rendered. */
export function usePhotoSnapshot(): HTMLCanvasElement | null {
  const { photoCanvas } = useEdit();
  const [snap, setSnap] = useState<HTMLCanvasElement | null>(null);
  const get = useRef(photoCanvas);
  useEffect(() => { get.current = photoCanvas; });
  useEffect(() => {
    let n = 0, t = 0;
    const tryTake = () => {
      const p = get.current();
      if (p && p.width > 1 && p.height > 1) {
        const c = copyCanvas(p);
        const px = c.getContext("2d")!.getImageData(c.width >> 1, c.height >> 1, 1, 1).data;
        if (px[3] > 0 || n > 30) { setSnap(c); return; }
      }
      n++;
      t = window.setTimeout(tryTake, 100);
    };
    tryTake();
    return () => window.clearTimeout(t);
  }, []);
  return snap;
}
