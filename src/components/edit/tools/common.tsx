"use client";

// Shared pieces for the Tools / Portrait two-depth pages: EditTextTooltip, SnowRetryView, EditAiLoading,
// EditLoading, the title row, the photo-area overlay used by bitmap tools, brush stroke masks, colour helpers.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { d } from "@/components/ui/legacy-drawable";
import { useEdit } from "../ctx";
import { frameGeo } from "../pipeline";
import { Img, PRIMARY, Tint, WHITE60 } from "../ui";

export const MENU = 186;
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/* ------------------------------------------------------------------ strings (values/strings.xml) */

export const S = {
  noFace: "Unable to recognize any faces.",
  networkTry: "You are not connected to network.\nPlease check your network settings and try again.",
  networkConnect: "You are not connected to the network.\nPlease connect and try again.",
  retry: "Retry",
  processing: "Processing…",
  downloading: "Downloading…",
  inProgress: "In progress…",
};

/* ------------------------------------------------------------------ EditTextTooltip */

/** EditTextTooltip: centred in the preview (above `bottom`), marginH 60, 13dp white on r18 #99000000. */
export function TextTooltip({ text, bottom = MENU, top = 0 }: { text: string | null; bottom?: number; top?: number }) {
  if (!text) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 z-30 flex items-center justify-center" style={{ top, bottom, padding: "0 60px" }}>
      <div className="whitespace-pre-line text-center text-white" style={{ fontSize: 13, lineHeight: "16px", minHeight: 36, padding: "10px 15px", borderRadius: 18, background: "rgba(0,0,0,0.6)" }}>
        {text}
      </div>
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

/* ------------------------------------------------------------------ SnowRetryView / EditAiLoading / EditLoading */

/** SnowRetryView (view_snow_retry.xml): white r20 "Retry" pill (40dp, 15dp #222222) + 14dp description. */
export function RetryView({ text, onRetry, bottom = MENU }: { text: string; onRetry: () => void; bottom?: number }) {
  return (
    <div className="absolute inset-x-0 top-0 z-30 flex flex-col items-center justify-center" style={{ bottom }}>
      <button type="button" onClick={onRetry} style={{ height: 40, minWidth: 90, padding: "0 12px", borderRadius: 20, background: "#ffffff", color: "#222222", fontSize: 15 }}>
        {S.retry}
      </button>
      <p className="whitespace-pre-line text-center text-white" style={{ marginTop: 20, padding: "0 20px", fontSize: 14, lineHeight: "17px" }}>{text}</p>
    </div>
  );
}

/** EditAiLoading (view_edit_ai_loading.xml): 200dp r15 #99000000 card, close 40dp, 90dp spinner, 14dp text. */
export function AiLoading({ text, onCancel }: { text: string; onCancel: () => void }) {
  return (
    <div className="absolute inset-0 z-[70]" style={{ background: "transparent" }}>
      <div className="absolute inset-x-0 top-0 flex items-center justify-center" style={{ bottom: MENU }}>
        <div className="relative" style={{ width: 200, height: 200, borderRadius: 15, background: "rgba(0,0,0,0.6)" }}>
          <button type="button" onClick={onCancel} className="absolute right-0 top-0" style={{ width: 40, height: 40 }} aria-label="Cancel">
            <Img name="icon_edit_popup_close" size={40} />
          </button>
          <img src={d("lens_loading")} alt="" className="spin-save absolute left-1/2" style={{ top: 41.5, width: 90, height: 90, marginLeft: -45 }} />
          <p className="absolute inset-x-0 whitespace-pre-line text-center text-white" style={{ top: 141.5, padding: "0 15px", fontSize: 14, lineHeight: "17px" }}>{text}</p>
        </div>
      </div>
    </div>
  );
}

/** EditLoading: spinner + optional label, centred above the panel. */
export function EditLoading({ text, bottom = MENU }: { text?: string; bottom?: number }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col items-center justify-center" style={{ bottom }}>
      <img src={d("lens_loading")} alt="" className="spin-save" style={{ width: 37, height: 37 }} />
      {text && <p className="text-white" style={{ marginTop: 8, fontSize: 13 }}>{text}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ panel + title row */

/** container_feature (186dp black) with the 52dp title bar: X / title (+ guide "?") / mint check. */
export function Panel({ title, guide, onClose, onConfirm, confirmNode, children, height = MENU, bg = "#000000", style }: {
  title?: ReactNode; guide?: boolean; onClose?: () => void; onConfirm?: () => void; confirmNode?: ReactNode;
  children?: ReactNode; height?: number; bg?: string; style?: CSSProperties;
}) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-20" style={{ height, background: bg, ...style }} onPointerDown={(e) => e.stopPropagation()}>
      {children}
      <div className="absolute inset-x-0 bottom-0 flex items-center" style={{ height: 52 }}>
        {onClose ? (
          <button type="button" onClick={onClose} className="flex-none" style={{ width: 52, height: 52 }} aria-label="Close"><Img name="icon_edit_title_close" size={52} /></button>
        ) : <span style={{ width: 52 }} />}
        <div className="flex min-w-0 flex-1 items-center justify-center text-white" style={{ fontSize: 15, lineHeight: "18px" }}>
          {title}
          {guide && <Img name="icon_common_list_guide" size={21} style={{ marginLeft: 2 }} />}
        </div>
        {confirmNode ?? (onConfirm ? (
          <button type="button" onClick={onConfirm} className="flex-none" style={{ width: 52, height: 52 }} aria-label="Confirm"><Tint name="icon_edit_title_confirm" size={52} color={PRIMARY} /></button>
        ) : <span style={{ width: 52 }} />)}
      </div>
    </div>
  );
}

/** "Create" pill (btn_generate): 32dp, paddingH 15, 15dp white on r18 #0bd4d2, marginEnd 8. */
export function CreateButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex-none text-white" style={{ height: 32, padding: "0 15px", borderRadius: 18, background: PRIMARY, fontSize: 15, marginRight: 8 }}>
      Create
    </button>
  );
}

/** Option row (54dp #66000000) with an optional 13dp label at marginLeft 20 / maxWidth 80. */
export function OptionRow({ bottom, label, labelWidth, children, bg = "rgba(0,0,0,0.4)", height = 54 }: { bottom: number; label?: string; labelWidth?: number; children: ReactNode; bg?: string; height?: number }) {
  return (
    <div className="absolute inset-x-0 z-20 flex items-center" style={{ bottom, height, background: bg }} onPointerDown={(e) => e.stopPropagation()}>
      {label !== undefined && <span className="flex-none truncate text-white" style={{ marginLeft: 20, maxWidth: 80, width: labelWidth, fontSize: 13, textShadow: "0 0 2px rgba(0,0,0,0.3)" }}>{label}</span>}
      {children}
    </div>
  );
}

/** Text toggle using edit_title_selector (white / #99ffffff). */
export function TextToggle({ label, selected, onClick, style }: { label: string; selected: boolean; onClick: () => void; style?: CSSProperties }) {
  return <button type="button" onClick={onClick} style={{ fontSize: 13, color: selected ? "#ffffff" : WHITE60, ...style }}>{label}</button>;
}

/* ------------------------------------------------------------------ photo area geometry + overlay canvas */

export interface PhotoArea {
  /** display rect of the photo (without border) in editor CSS px */
  x: number; y: number; w: number; h: number;
  /** preview photo canvas size */
  pw: number; ph: number;
  /** frame-normalized -> photo-normalized */
  toPhoto: (fx: number, fy: number) => [number, number];
  /** editor view width (EditPreviewTouchGuideView width) */
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
export function PhotoOverlay({ area, canvasRef, hidden, bg = "#171717", children }: { area: PhotoArea; canvasRef: React.RefObject<HTMLCanvasElement | null>; hidden?: boolean; bg?: string; children?: ReactNode }) {
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

/** Push a bitmap result as a new base (like CROP / CUTOUT history steps) and leave the sub page. */
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

/** EditPreviewTouchGuideView: a white ring showing the brush size while touching / dragging the size slider. */
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

/** HSV value of a hex colour (EditColorView uses V < 0.1 as "dark"). */
export const hexV = (hex: string) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return Math.max((n >> 16) & 255, (n >> 8) & 255, n & 255) / 255;
};

/** EditColorView 32dp: dark = 1dp #6f6f6f outline (2dp white when selected); light = 2.5dp black ring inset 2dp. */
export function Swatch({ color, selected, onClick, style }: { color: string; selected: boolean; onClick: () => void; style?: CSSProperties }) {
  const dark = hexV(color) < 0.1;
  return (
    <button type="button" onClick={onClick} className="relative flex-none rounded-full" style={{ width: 32, height: 32, background: color, boxShadow: dark && !selected ? "inset 0 0 0 1px #6f6f6f" : undefined, ...style }}>
      {selected && !dark && <span className="absolute rounded-full" style={{ inset: 2, border: "2.5px solid #000000" }} />}
      {selected && dark && <span className="absolute inset-0 rounded-full" style={{ border: "2px solid #ffffff" }} />}
    </button>
  );
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
