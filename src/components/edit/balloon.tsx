"use client";

// Tip balloon: an accent pill above an anchor element with a small pointer, centred on the anchor and kept inside its
// parent's edges. Optional auto-dismiss. Used for one-time hints in the editors.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

export function TopBalloon({ anchor, text, onClick, marginH = 10, marginV = 0, dismissMs, onDismiss }: {
  anchor: RefObject<HTMLElement | null>; text: string; onClick?: () => void;
  marginH?: number; marginV?: number; dismissMs?: number; onDismiss?: () => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; arrow: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      const el = wrap.current;
      const r = (el?.offsetParent as HTMLElement | null)?.getBoundingClientRect();
      if (!a || !r || !el || !a.width) return;
      const w = el.offsetWidth, h = el.offsetHeight;
      const ax = a.left - r.left;
      const left = Math.min(Math.max(ax - (w - a.width) / 2, marginH), r.width - marginH - w);
      const arrow = Math.min(Math.max(ax + a.width / 2 - left - 7, 16), w - 14 - 16);
      setPos({ left, top: a.top - r.top - h - marginV - 4, arrow });
    };
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", place); };
  }, [anchor, marginH, marginV]);
  const dismissRef = useRef(onDismiss);
  useEffect(() => { dismissRef.current = onDismiss; });
  useEffect(() => {
    if (!dismissMs) return;
    const t = window.setTimeout(() => dismissRef.current?.(), dismissMs);
    return () => window.clearTimeout(t);
  }, [dismissMs]);
  return (
    <div
      ref={wrap}
      role="button"
      tabIndex={0}
      onClick={() => { onClick?.(); onDismiss?.(); }}
      className="absolute z-30 cursor-pointer pb-[7px]"
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden", pointerEvents: "auto", animation: "oe-pop 200ms var(--oe-ease)" }}
    >
      <div className="whitespace-nowrap rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-on-accent shadow-lg">{text}</div>
      <span aria-hidden className="absolute bottom-0 h-0 w-0 border-x-[7px] border-t-[7px] border-x-transparent border-t-accent" style={{ left: pos?.arrow ?? 0 }} />
    </div>
  );
}
