"use client";

// Shutter button.
//  Photo: white ring + white core.   Video: white ring + red core.
//  Recording: the core shrinks to a rounded red square and an accent progress ring fills around it (one lap = the
//  shorter of the max length and 10 s, then it starts again).   Timer running: the core shows ×, tap cancels.
//  Bounce armed: the core shows the loop glyph.   Tap = shoot; hold ≥ 450 ms = record a clip while held.
import { useRef } from "react";
import { Icon } from "@/components/ui";
import { TOKENS } from "@/components/ui/theme";
import { useFrameClock, useTween } from "./capture/anim";

export type ShutterStatus = "normal" | "recording" | "paused";

export interface ShutterProps {
  /** Over the picture (adds a soft shadow so the ring reads on bright scenes). */
  glow: boolean;
  mode: "NORMAL" | "VIDEO";
  status?: ShutterStatus;
  /** performance.now() when the current clip started (drives the progress ring). */
  clipStartedAt?: number | null;
  /** Max recording length in ms. */
  maxMs?: number;
  timerActive: boolean;
  bounce?: boolean;
  /** Diameter in px (default 76). */
  size?: number;
  onTap: () => void;
  onLongPressStart: () => void;
  onLongPressEnd: () => void;
}

const HOLD_MS = 450;

export function Shutter({ glow, mode, status = "normal", clipStartedAt, maxMs = 20_000, timerActive, bounce, size = 76, onTap, onLongPressStart, onLongPressEnd }: ShutterProps) {
  const rec = status === "recording";
  const core = useTween(rec ? 0.42 : 1, 160);
  const lp = useRef<{ t?: number; fired: boolean; down: boolean }>({ fired: false, down: false });
  const now = useFrameClock(rec && clipStartedAt != null);
  const lap = Math.min(maxMs, 10_000) || 10_000;
  const elapsed = rec && clipStartedAt != null ? Math.max(0, now - clipStartedAt) : 0;
  const frac = (elapsed % lap) / lap;

  const R = 50, ring = 44, coreR = 36;
  const circ = 2 * Math.PI * (ring + 2);
  const video = mode === "VIDEO" || rec || status === "paused";
  const coreColor = video ? TOKENS.color.danger : "#ffffff";
  const sq = coreR * core;
  const radius = rec ? 6 : sq;

  const release = (cancel: boolean) => {
    const s = lp.current;
    if (!s.down) return;
    s.down = false;
    clearTimeout(s.t);
    if (s.fired) onLongPressEnd();
    else if (!cancel) onTap();
  };

  return (
    <button
      type="button"
      aria-label={rec ? "Stop recording" : timerActive ? "Cancel timer" : mode === "VIDEO" ? "Record video" : "Take photo"}
      className="relative block touch-none select-none"
      style={{ width: size, height: size, filter: glow ? "drop-shadow(0 2px 8px rgba(0,0,0,.35))" : undefined }}
      onPointerDown={(e) => {
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
        const s = lp.current;
        s.down = true; s.fired = false;
        clearTimeout(s.t);
        if (!timerActive && !rec) s.t = window.setTimeout(() => { if (s.down) { s.fired = true; onLongPressStart(); } }, HOLD_MS);
      }}
      onPointerUp={() => release(false)}
      onPointerCancel={() => release(true)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} className="absolute inset-0 overflow-visible">
        <circle cx={R} cy={R} r={ring} fill="none" stroke="#ffffff" strokeWidth={4} opacity={rec ? 0.35 : 1} />
        {rec && (
          <circle
            cx={R} cy={R} r={ring + 2} fill="none" stroke={TOKENS.color.accent} strokeWidth={5} strokeLinecap="round"
            strokeDasharray={`${circ * frac} ${circ}`} transform={`rotate(-90 ${R} ${R})`}
          />
        )}
        <rect x={R - sq} y={R - sq} width={sq * 2} height={sq * 2} rx={radius} fill={coreColor} />
      </svg>
      {timerActive && !rec && <Icon name="close" size={size * 0.4} className="absolute inset-0 m-auto" style={{ color: video ? "#fff" : "#111" }} stroke={2.4} />}
      {bounce && !timerActive && !rec && <Icon name="bounce" size={size * 0.38} className="absolute inset-0 m-auto text-[#111]" stroke={2.2} />}
    </button>
  );
}
