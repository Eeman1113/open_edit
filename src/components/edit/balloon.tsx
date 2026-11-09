"use client";

// SnowBalloon (C21134b text balloon) with BalloonAlignment.Top: a common_primary card (r17.5, padding 10/18, 13sp
// white, one line) above its anchor, horizontally centred on it and clamped to the window margins, with the 12x6
// icon_snow_tooltip_arrow pointing down at the anchor (x clamped to [17.5, width - 12 - 17.5]).
// Options mirror the builder calls used by the editor: m115086O(p8s(v, h)) window margins, m115078G(ms) auto dismiss.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { d } from "@/components/ui/legacy-drawable";

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
      const arrow = Math.min(Math.max(ax + a.width / 2 - left - 6, 17.5), w - 12 - 17.5);
      setPos({ left, top: a.top - r.top - h - marginV, arrow });
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
  const url = `url(${d("icon_snow_tooltip_arrow")})`;
  return (
    <div
      ref={wrap}
      role="button"
      tabIndex={0}
      onClick={() => { onClick?.(); onDismiss?.(); }}
      className="absolute z-30 cursor-pointer"
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden", paddingBottom: 6, pointerEvents: "auto" }}
    >
      <div className="whitespace-nowrap text-center text-white" style={{ minWidth: 47, padding: "10px 18px", borderRadius: 17.5, background: "#0bd4d2", fontSize: 13, lineHeight: "15px" }}>
        {text}
      </div>
      <span
        aria-hidden
        className="absolute bottom-0"
        style={{ left: pos?.arrow ?? 0, width: 12, height: 6, backgroundColor: "#0bd4d2", WebkitMaskImage: url, maskImage: url, WebkitMaskSize: "100% 100%", maskSize: "100% 100%" }}
      />
    </div>
  );
}
