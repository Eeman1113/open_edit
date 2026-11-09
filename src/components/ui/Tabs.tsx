"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "./Button";

export interface TabItem<T extends string | number> { id: T; label: ReactNode }

/**
 * Tabs in two looks:
 *  - "underline": a scrollable row of labels with a sliding accent bar (screen sections)
 *  - "segment":   a pill track with a sliding thumb (2–4 short options)
 */
export function Tabs<T extends string | number>({ items, value, onChange, look = "underline", className, tone = "default" }: {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  look?: "underline" | "segment";
  className?: string;
  /** "overlay" = white text for use over photos / the camera. */
  tone?: "default" | "overlay";
}) {
  const row = useRef<HTMLDivElement>(null);
  const refs = useRef(new Map<T, HTMLButtonElement>());
  const [bar, setBar] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const el = refs.current.get(value);
    if (el) setBar({ x: el.offsetLeft, w: el.offsetWidth });
  }, [value, items]);
  useEffect(() => {
    const el = refs.current.get(value), r = row.current;
    if (el && r && look === "underline") r.scrollTo({ left: el.offsetLeft - r.clientWidth / 2 + el.offsetWidth / 2, behavior: "smooth" });
  }, [value, look]);

  if (look === "segment") {
    return (
      <div ref={row} role="tablist" className={cx("relative flex rounded-full p-1", tone === "overlay" ? "bg-glass backdrop-blur-md" : "bg-raised", className)}>
        {bar && <span className="absolute bottom-1 top-1 rounded-full bg-fg transition-all duration-200" style={{ left: bar.x, width: bar.w }} />}
        {items.map((t) => (
          <button
            key={t.id}
            ref={(el) => { if (el) refs.current.set(t.id, el); }}
            role="tab"
            aria-selected={t.id === value}
            type="button"
            onClick={() => onChange(t.id)}
            className={cx("relative z-[1] h-8 flex-1 whitespace-nowrap rounded-full px-3 text-[13px] font-semibold transition-colors", t.id === value ? "text-bg" : tone === "overlay" ? "text-white/75" : "text-fg-2")}
          >
            {t.label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div ref={row} role="tablist" className={cx("no-scrollbar relative flex gap-5 overflow-x-auto px-4", className)}>
      {items.map((t) => (
        <button
          key={t.id}
          ref={(el) => { if (el) refs.current.set(t.id, el); }}
          role="tab"
          aria-selected={t.id === value}
          type="button"
          onClick={() => onChange(t.id)}
          className={cx("h-10 shrink-0 whitespace-nowrap text-[15px] font-semibold transition-colors", t.id === value ? (tone === "overlay" ? "text-white" : "text-fg") : tone === "overlay" ? "text-white/55" : "text-fg-3")}
        >
          {t.label}
        </button>
      ))}
      {bar && <span className="pointer-events-none absolute bottom-0 h-[3px] rounded-full bg-accent transition-all duration-200" style={{ left: bar.x, width: bar.w }} />}
    </div>
  );
}
