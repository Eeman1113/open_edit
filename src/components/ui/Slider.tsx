"use client";

// Slider: unipolar (fills from the start) or bipolar (fills from the centre, for ±adjustments).
// The value label floats above the thumb; a small tick marks the default and the thumb snaps to it when close.
import { useRef, useState, type CSSProperties } from "react";
import { cx } from "./Button";

export interface SliderProps {
  value: number;
  onChange: (v: number) => void;
  /** Pointer released; receives the final value. */
  onCommit?: (v: number) => void;
  min?: number;
  max?: number;
  /** Default value: tick mark + snap target. */
  def?: number;
  bipolar?: boolean;
  /** Show the numeric label: "always", "drag" (while dragging) or "never". */
  label?: "always" | "drag" | "never";
  /** Formats the label (default: percentage of the range, signed around the centre when bipolar). */
  format?: (v: number) => string;
  /** Snap to `def` within this fraction of the range (default 0.025; 0 = off). */
  snap?: number;
  disabled?: boolean;
  /** "overlay" draws a white track with a shadow for use over photos / the camera. */
  tone?: "default" | "overlay";
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
}

/** Height a Slider occupies (label row + track row), for absolute layouts. */
export const SLIDER_HEIGHT = 44;

export function Slider({
  value, onChange, onCommit, min = 0, max = 1, def, bipolar = false, label = "drag", format, snap = 0.025, disabled, tone = "default",
  className, style, ...aria
}: SliderProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);
  const last = useRef(value);
  const span = max - min || 1;
  const pct = (v: number) => Math.min(1, Math.max(0, (v - min) / span));
  const mid = bipolar ? 0.5 : 0;
  const p = pct(value);
  const fmt = format ?? ((v: number) => {
    const n = Math.round(((v - min) / span) * 100 - (bipolar ? 50 : 0)) * (bipolar ? 2 : 1);
    return bipolar && n > 0 ? `+${n}` : String(n);
  });
  const pick = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    let v = min + Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * span;
    if (def !== undefined && snap > 0 && Math.abs(v - def) <= snap * span) v = def;
    return v;
  };
  const overlay = tone === "overlay";
  const showLabel = label === "always" || (label === "drag" && drag);
  return (
    <div
      className={cx("relative select-none touch-none", disabled && "pointer-events-none opacity-40", className)}
      style={{ height: SLIDER_HEIGHT, ...style }}
    >
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label={aria["aria-label"]}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(value * 100) / 100}
        className="absolute inset-x-3 bottom-0 top-5 cursor-pointer outline-none"
        onKeyDown={(e) => {
          const step = span / 100;
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            const v = Math.min(max, Math.max(min, value + (e.key === "ArrowRight" ? step : -step)));
            onChange(v); onCommit?.(v); e.preventDefault();
          }
        }}
        onPointerDown={(e) => {
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
          setDrag(true);
          const v = pick(e.clientX); last.current = v; onChange(v);
        }}
        onPointerMove={(e) => { if (!drag) return; const v = pick(e.clientX); last.current = v; onChange(v); }}
        onPointerUp={() => { if (!drag) return; setDrag(false); onCommit?.(last.current); }}
        onPointerCancel={() => { if (!drag) return; setDrag(false); onCommit?.(last.current); }}
      >
        {/* track */}
        <div className={cx("absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full", overlay ? "bg-white/35 shadow-[0_0_2px_rgba(0,0,0,.35)]" : "bg-muted")} />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent"
          style={{ left: `${Math.min(p, mid) * 100}%`, width: `${Math.abs(p - mid) * 100}%` }}
        />
        {/* default tick */}
        {def !== undefined && (
          <span className={cx("absolute top-1/2 h-2.5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full", overlay ? "bg-white" : "bg-fg-3")} style={{ left: `${pct(def) * 100}%` }} />
        )}
        {/* thumb */}
        <span
          className={cx("absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,.45)] ring-accent transition-[box-shadow]", drag && "ring-4")}
          style={{ left: `${p * 100}%` }}
        />
        {showLabel && (
          <span
            className={cx("tabular absolute -top-5 -translate-x-1/2 rounded-xs px-1.5 py-0.5 text-[12px] font-semibold", overlay ? "text-white [text-shadow:0_0_3px_rgba(0,0,0,.6)]" : "bg-raised text-fg")}
            style={{ left: `${p * 100}%` }}
          >
            {fmt(value)}
          </span>
        )}
      </div>
    </div>
  );
}
