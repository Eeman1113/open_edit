"use client";

// First-visit hint pointing at the gallery's Collage button. Tapping it dismisses it.
import type { RefObject } from "react";
import { useLayoutEffect, useState } from "react";

const KEY = "oe.gallery.collageHintSeen";
export const isLayoutTooltipNew = () => { try { return localStorage.getItem(KEY) !== "1"; } catch { return false; } };
export const markLayoutTooltipSeen = () => { try { localStorage.setItem(KEY, "1"); } catch { /* storage blocked */ } };

export function LayoutBalloon({ anchor, root, onClick }: { anchor: RefObject<HTMLElement | null>; root: RefObject<HTMLElement | null>; onClick: () => void }) {
  const [pos, setPos] = useState<{ right: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const a = anchor.current?.getBoundingClientRect(), r = root.current?.getBoundingClientRect();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- position from layout
    if (a && r) setPos({ right: r.right - a.right, top: a.bottom - r.top + 8 });
  }, [anchor, root]);
  if (!pos) return null;
  return (
    <button type="button" onClick={onClick} className="absolute z-30 max-w-[220px] rounded-md bg-accent px-3 py-2 text-left text-[13px] font-semibold text-on-accent shadow-lg" style={{ right: pos.right, top: pos.top, animation: "oe-rise 240ms" }}>
      <span className="absolute -top-1.5 right-5 h-3 w-3 rotate-45 bg-accent" />
      New: combine photos into a collage
    </button>
  );
}
