"use client";

// Pinch-zoomable, fit-centred image: pinch + pan, double tap toggles a zoom level at the tap point, single tap
// is passed to the parent (e.g. to toggle the viewer bars).
// While the image is zoomed the pager must not page (the zoomable consumes the drag), so `onZoomedChange` reports it.
import { useEffect, useRef, useState, type CSSProperties } from "react";

type T = { s: number; x: number; y: number };
const ID: T = { s: 1, x: 0, y: 0 };
const TAP_SLOP = 10;
const DOUBLE_TAP_MS = 300;

export function ZoomImage({ src, maxScale, doubleTapScale, onTap, onZoomedChange, active = true, style }: {
  src: string;
  maxScale: number;
  doubleTapScale: number;
  onTap?: () => void;
  onZoomedChange?: (zoomed: boolean) => void;
  /** false when the page is not the current one: zoom resets (each page remembers its own ZoomState only while composed). */
  active?: boolean;
  style?: CSSProperties;
}) {
  const box = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const [t, setT] = useState<T>(ID);
  const [anim, setAnim] = useState(false);
  const tRef = useRef<T>(ID);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startDist: number; startT: T; mid: { x: number; y: number }; moved: boolean; downAt: { x: number; y: number } } | null>(null);
  const lastTap = useRef<{ at: number; x: number; y: number } | null>(null);
  const tapTimer = useRef<number | undefined>(undefined);
  const zoomedRef = useRef(false);

  const apply = (next: T, animate = false) => {
    tRef.current = next;
    setAnim(animate);
    setT(next);
    const z = next.s > 1.001;
    if (z !== zoomedRef.current) {
      zoomedRef.current = z;
      onZoomedChange?.(z);
    }
  };

  useEffect(() => {
    if (!active && tRef.current.s !== 1) apply(ID);
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => window.clearTimeout(tapTimer.current), []);

  /** Fitted (ContentScale.Fit) content size inside the box. */
  const fit = () => {
    const el = box.current, im = img.current;
    const W = el?.clientWidth ?? 0, H = el?.clientHeight ?? 0;
    const nw = im?.naturalWidth || W, nh = im?.naturalHeight || H;
    const k = Math.min(W / Math.max(1, nw), H / Math.max(1, nh));
    return { W, H, w: nw * k, h: nh * k };
  };
  const clamp = (n: T): T => {
    const s = Math.min(Math.max(n.s, 1), maxScale);
    const { W, H, w, h } = fit();
    const mx = Math.max(0, (w * s - W) / 2), my = Math.max(0, (h * s - H) / 2);
    return { s, x: Math.min(mx, Math.max(-mx, n.x)), y: Math.min(my, Math.max(-my, n.y)) };
  };
  /** Point relative to the box centre. */
  const rel = (cx: number, cy: number) => {
    const r = box.current!.getBoundingClientRect();
    return { x: cx - r.left - r.width / 2, y: cy - r.top - r.height / 2 };
  };
  /** Scale to `s` keeping the content point under `p` fixed. */
  const zoomAt = (from: T, s: number, p: { x: number; y: number }): T => {
    const k = s / from.s;
    return { s, x: p.x - (p.x - from.x) * k, y: p.y - (p.y - from.y) * k };
  };

  const doubleTap = (p: { x: number; y: number }) => {
    const cur = tRef.current;
    if (cur.s > 1.001) apply(ID, true);
    else apply(clamp(zoomAt(ID, Math.min(doubleTapScale, maxScale), p)), true);
  };

  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const list = [...pts.current.values()];
    if (list.length === 1) {
      gesture.current = { startDist: 0, startT: tRef.current, mid: rel(e.clientX, e.clientY), moved: false, downAt: { x: e.clientX, y: e.clientY } };
    } else if (list.length === 2) {
      const [a, b] = list;
      gesture.current = { startDist: Math.hypot(a.x - b.x, a.y - b.y), startT: tRef.current, mid: rel((a.x + b.x) / 2, (a.y + b.y) / 2), moved: true, downAt: { x: 0, y: 0 } };
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    const list = [...pts.current.values()];
    if (list.length >= 2) {
      const [a, b] = list;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = rel((a.x + b.x) / 2, (a.y + b.y) / 2);
      const s = Math.min(Math.max(g.startT.s * (dist / Math.max(1, g.startDist)), 1), maxScale);
      const z = zoomAt(g.startT, s, g.mid);
      apply(clamp({ s, x: z.x + (mid.x - g.mid.x), y: z.y + (mid.y - g.mid.y) }));
    } else if (list.length === 1) {
      const dx = e.clientX - g.downAt.x, dy = e.clientY - g.downAt.y;
      if (Math.hypot(dx, dy) > TAP_SLOP) g.moved = true;
      if (tRef.current.s > 1.001 && g.moved) apply(clamp({ ...g.startT, x: g.startT.x + dx, y: g.startT.y + dy }));
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const wasSingle = pts.current.size === 1;
    pts.current.delete(e.pointerId);
    const g = gesture.current;
    if (pts.current.size === 1) {
      // one finger left after a pinch: continue as a pan from here
      const [p] = [...pts.current.values()];
      gesture.current = { startDist: 0, startT: tRef.current, mid: rel(p.x, p.y), moved: true, downAt: p };
      return;
    }
    gesture.current = null;
    if (!wasSingle || !g || g.moved || e.type === "pointercancel") return;
    const now = Date.now();
    const lt = lastTap.current;
    if (lt && now - lt.at < DOUBLE_TAP_MS && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 40) {
      lastTap.current = null;
      window.clearTimeout(tapTimer.current);
      doubleTap(rel(e.clientX, e.clientY));
      return;
    }
    lastTap.current = { at: now, x: e.clientX, y: e.clientY };
    if (onTap) {
      window.clearTimeout(tapTimer.current);
      tapTimer.current = window.setTimeout(() => onTap(), DOUBLE_TAP_MS);
    }
  };

  const zoomed = t.s > 1.001;
  return (
    <div
      ref={box}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onWheel={(e) => {
        // trackpad pinch (ctrl + wheel) on desktop
        if (!e.ctrlKey) return;
        const s = Math.min(Math.max(tRef.current.s * Math.exp(-e.deltaY / 100), 1), maxScale);
        apply(clamp(zoomAt(tRef.current, s, rel(e.clientX, e.clientY))));
      }}
      className="absolute inset-0 overflow-hidden"
      // unzoomed: horizontal drags belong to the pager; zoomed: every gesture is ours
      style={{ touchAction: zoomed ? "none" : "pan-x", ...style }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={img}
        src={src}
        alt=""
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
        style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})`, transformOrigin: "50% 50%", transition: anim ? "transform 300ms cubic-bezier(0.4, 0, 0.2, 1)" : "none", willChange: "transform" }}
      />
    </div>
  );
}
