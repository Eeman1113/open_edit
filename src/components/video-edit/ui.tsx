"use client";

// Video editor widgets: the speed slider, the progress card used while saving or reversing, the loading layer and
// the playback row of the face pages.
import { useRef, useState, type CSSProperties } from "react";
import { Button, Icon, Spinner, cx } from "@/components/ui";
import { EditSeekBar } from "@/components/edit/ui";
import { ProgressRing } from "@/components/edit/tools/common";
import { fmtDuration, progressToSpeed, speedLabel, speedToProgress } from "./model";

/* ------------------------------------------------------------------ speed slider */

const MARKS = [0.25, 0.5, 1, 2, 4];

/**
 * Speed slider from 0.25x to 4x with 1x in the middle. The fill runs from 1x to the thumb; it snaps to the marked
 * speeds and keeps the edited length between 1 s and 5 min.
 */
export function SpeedSeekBar({ speed, onChange, onCommit, durationMs, style }: {
  speed: number; onChange: (s: number) => void; onCommit: (s: number) => void; durationMs: number; style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);
  const latest = useRef(speed);
  const ticks = MARKS.map(speedToProgress);
  const p = speedToProgress(speed) / 4;
  const pick = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    let q = Math.min(4, Math.max(0, ((clientX - r.left) / r.width) * 4));
    for (const t of ticks) if (Math.abs(q - t) <= 0.06) q = t;
    let s = progressToSpeed(q);
    const out = durationMs / s;
    if (out < 1000) s = progressToSpeed(speedToProgress(durationMs / 1000));
    if (out > 300000) s = progressToSpeed(speedToProgress(durationMs / 300000));
    return s;
  };
  const a = Math.min(0.5, p), b = Math.max(0.5, p);
  return (
    <div style={style}>
      <div
        ref={ref}
        role="slider" aria-label="Speed" aria-valuemin={0.25} aria-valuemax={4} aria-valuenow={speed} tabIndex={0}
        className="relative h-11 cursor-pointer touch-none"
        onPointerDown={(e) => { setDrag(true); e.currentTarget.setPointerCapture(e.pointerId); const s = pick(e.clientX); latest.current = s; onChange(s); }}
        onPointerMove={(e) => { if (!drag) return; const s = pick(e.clientX); latest.current = s; onChange(s); }}
        onPointerUp={() => { if (!drag) return; setDrag(false); onCommit(latest.current); }}
        onPointerCancel={() => { if (!drag) return; setDrag(false); onCommit(latest.current); }}
      >
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted">
          <div className="absolute inset-y-0 rounded-full bg-accent" style={{ left: `${a * 100}%`, width: `${(b - a) * 100}%` }} />
        </div>
        {ticks.map((t) => (
          <span key={t} className={cx("absolute top-1/2 h-3 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full", t / 4 >= a && t / 4 <= b ? "bg-accent" : "bg-fg-3")} style={{ left: `${(t / 4) * 100}%` }} />
        ))}
        <span className={cx("absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.5)]", drag && "ring-4 ring-accent/35")} style={{ left: `${p * 100}%` }} />
      </div>
      <div className="relative mt-1 h-4">
        {MARKS.map((m) => (
          <span key={m} className="tabular absolute -translate-x-1/2 text-[11px] font-medium text-fg-3" style={{ left: `${(speedToProgress(m) / 4) * 100}%` }}>{speedLabel(m)}</span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ progress, loading */

/** Blocking progress card (saving, exporting, reversing) with an optional Cancel. */
export function PercentDialog({ value, title, sub, onCancel }: { value: number; title: string; sub?: string; onCancel?: () => void }) {
  return (
    <div className="absolute inset-0 z-[90] flex items-center justify-center bg-scrim/50 px-10" onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex w-full max-w-[260px] flex-col items-center gap-3 rounded-lg bg-panel px-5 pb-4 pt-5 text-center shadow-2xl ring-1 ring-line" style={{ animation: "oe-pop 200ms var(--oe-ease)" }}>
        <ProgressRing value={value * 100} />
        <p className="text-[15px] font-semibold">{title}</p>
        {sub && <p className="-mt-1.5 text-[12px] leading-snug text-fg-3">{sub}</p>}
        {onCancel && <Button variant="secondary" size="sm" block onClick={onCancel}>Cancel</Button>}
      </div>
    </div>
  );
}

/** Full-screen loading layer while the video opens. */
export function LoadingLayer() {
  return (
    <div className="absolute inset-0 z-[90] flex items-center justify-center bg-bg/60" onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-3 rounded-lg bg-panel px-5 py-4 shadow-2xl ring-1 ring-line">
        <Spinner size={22} className="text-accent" />
        <span className="text-[15px] font-medium">Opening video…</span>
      </div>
    </div>
  );
}

/** Play / pause, a position slider and the time, for the face pages. */
export function PlayRow({ playing, pos, start, end, onToggle, onSeek, className, style }: {
  playing: boolean; pos: number; start: number; end: number; onToggle: () => void; onSeek: (ms: number) => void; className?: string; style?: CSSProperties;
}) {
  return (
    <div className={cx("flex items-center gap-3 px-4", className)} style={style}>
      <button type="button" onClick={onToggle} aria-label={playing ? "Pause" : "Play"} className="oe-press flex h-9 w-9 flex-none items-center justify-center rounded-full bg-raised">
        <Icon name={playing ? "pause" : "play"} size={17} filled />
      </button>
      <EditSeekBar value={pos} min={start} max={Math.max(end, start + 1)} def={start} level={false} duplex={false} onChange={onSeek} />
      <span className="tabular w-10 flex-none text-right text-[12px] text-fg-3">{fmtDuration(pos - start)}</span>
    </div>
  );
}
