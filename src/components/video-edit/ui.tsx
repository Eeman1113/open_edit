"use client";

// Shared video-editor widgets: VideoSpeedSeekBar (canvas port), PercentProgressDialogFragment,
// VideoSaveResultDialogFragment, VideoEditLoadingFragment, the effect/sticker network-error block.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { d } from "@/components/ui/legacy-drawable";
import { PRIMARY, STR, progressToSpeed, speedLabel, speedToProgress } from "./model";

export { Tint, Img } from "@/components/edit/ui";

const SHADOW = "2px 2px 2px rgba(0,0,0,0.4)"; // shadowColor #66000000, dx/dy 2, radius 2

/* ------------------------------------------------------------------ VideoSpeedSeekBar */

// CustomSeekBar metrics (custom_seek_bar_thumb_offset 12, thumb r 9.5, shadow 2, track 2, text 12sp, margin 6)
const OFF = 12, R = 9.5, SH = 2, TRACK = 2, TXT = 12, TM = 6;
const TICK_W = 1.5, TICK_H = 12.5; // f50948Y0 / f50949Z0
export const SPEED_BAR_H = Math.floor(R * 2 + SH * 2 + 9 + 1.25 * 2 + TM);

/**
 * VideoSpeedSeekBar (max 4, default 2 = 1x): #4cffffff segments between the five tick marks (0.25 / 0.6 / 1 / 2.5 / 4x),
 * ticks white when inside the 1x→thumb range, white thumb, "<speed>x" above the thumb, magnet onto the ticks (1%).
 */
export function SpeedSeekBar({ speed, onChange, onCommit, durationMs, style }: {
  speed: number; onChange: (s: number) => void; onCommit: (s: number) => void; durationMs: number; style?: CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(0);
  const H = SPEED_BAR_H;
  const ticks = [0.25, Math.floor(((0.25 + 1) / 2) * 10) / 10, 1, (1 + 4) / 2, 4].map(speedToProgress);
  const prog = speedToProgress(speed);
  const latest = useRef(speed);
  useLayoutEffect(() => { latest.current = speed; });
  useEffect(() => {
    const c = ref.current!;
    const ro = new ResizeObserver(() => setW(c.clientWidth));
    ro.observe(c);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const c = ref.current;
    if (!c || !w) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr); c.height = Math.round(H * dpr);
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, H);
    const x = (p: number) => ((w - OFF * 2) * p) / 4 + OFF;
    const cy = H - SH - R;
    // segments between ticks
    g.fillStyle = "rgba(255,255,255,0.3)";
    for (let i = 0; i < ticks.length - 1; i++) g.fillRect(x(ticks[i]) + TICK_W / 2, cy - TRACK / 2, x(ticks[i + 1]) - x(ticks[i]) - TICK_W, TRACK);
    // active part (1x → thumb)
    g.fillStyle = "#ffffff";
    const a = Math.min(x(2), x(prog)), b = Math.max(x(2), x(prog));
    g.fillRect(a, cy - TRACK / 2, b - a, TRACK);
    // ticks
    for (const t of ticks) {
      const on = prog < 2 ? t <= 2 && prog <= t : prog > 2 ? t >= 2 && prog >= t : false;
      g.fillStyle = on ? "#ffffff" : "rgba(255,255,255,0.3)";
      g.fillRect(x(t) - TICK_W / 2, cy - TICK_H / 2, TICK_W, TICK_H);
    }
    // thumb
    g.shadowBlur = 2; g.shadowColor = "rgba(0,0,0,0.2)";
    g.fillStyle = "#ffffff";
    g.beginPath(); g.arc(x(prog), cy, R, 0, Math.PI * 2); g.fill();
    // label
    g.shadowBlur = 1.25; g.shadowColor = "rgba(0,0,0,0.3)";
    g.font = `${TXT}px Roboto, system-ui, sans-serif`;
    const s = speedLabel(progressToSpeed(prog));
    const m = g.measureText(s);
    g.fillText(s, Math.max(0, x(prog) - m.width / 2), H - SH * 2 - R * 2 - TM);
  }, [w, H, prog, ticks]);

  const pick = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    let p = Math.min(4, Math.max(0, ((clientX - r.left - OFF) / (r.width - OFF * 2)) * 4));
    for (const t of ticks) if (Math.abs(p - t) <= 0.04) p = t; // mo62253k magnet (1% of max)
    let s = progressToSpeed(p);
    // mo62247F: keep the edited duration within 1 s .. 5 min
    const out = durationMs / s;
    if (out < 1000) s = progressToSpeed(speedToProgress(durationMs / 1000));
    if (out > 300000) s = progressToSpeed(speedToProgress(durationMs / 300000));
    return s;
  };
  const active = useRef(false);
  return (
    <canvas
      ref={ref}
      className="block touch-none"
      style={{ width: "100%", height: H, ...style }}
      onPointerDown={(e) => { active.current = true; e.currentTarget.setPointerCapture(e.pointerId); const s = pick(e.clientX); latest.current = s; onChange(s); }}
      onPointerMove={(e) => { if (!active.current) return; const s = pick(e.clientX); latest.current = s; onChange(s); }}
      onPointerUp={() => { if (!active.current) return; active.current = false; onCommit(latest.current); }}
      onPointerCancel={() => { if (!active.current) return; active.current = false; onCommit(latest.current); }}
    />
  );
}

/* ------------------------------------------------------------------ dialogs */

/** Guidelines shared by dialog_percent_progress / fragment_video_save_result_dialog: top 50dp, bottom 75%. */
function Guided({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-x-0 flex items-center justify-center" style={{ top: 50, height: "calc(75% - 50px)" }}>
      {children}
    </div>
  );
}

/** PercentProgressView: 70dp, 4dp stroke, white_20 ring + white arc from 12 o'clock, percent text 15dp. */
function PercentRing({ value }: { value: number }) {
  const r = 33, c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: 70, height: 70 }}>
      <svg width={70} height={70} viewBox="0 0 70 70" className="absolute inset-0">
        <circle cx={35} cy={35} r={r} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={4} />
        <circle cx={35} cy={35} r={r} fill="none" stroke="#ffffff" strokeWidth={4} strokeDasharray={`${c * value} ${c}`} transform="rotate(-90 35 35)" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-white" style={{ fontSize: 15 }}>{Math.round(value * 100)}%</span>
    </div>
  );
}

/** PercentProgressDialogFragment (dialog_percent_progress.xml): 200x200 #99000000 r16 box. */
export function PercentDialog({ value, title, sub, onCancel }: { value: number; title: string; sub?: string; onCancel?: () => void }) {
  return (
    <div className="absolute inset-0 z-[90]" onPointerDown={(e) => e.stopPropagation()}>
      <Guided>
        <div className="relative flex flex-col items-center justify-center" style={{ width: 200, height: 200, borderRadius: 16, background: "rgba(0,0,0,0.6)" }}>
          <PercentRing value={value} />
          <span className="text-center text-white" style={{ marginTop: 10, padding: "0 20px", fontSize: 14 }}>{title}</span>
          {sub && <span className="text-center" style={{ marginTop: 8, padding: "0 20px", fontSize: 13, color: "rgba(255,255,255,0.6)" }}>{sub}</span>}
          {onCancel && (
            <button type="button" onClick={onCancel} aria-label="Cancel" className="absolute right-0 top-0" style={{ width: 40, height: 40 }}>
              <img src={d("icon_video_popup_close")} alt="" style={{ width: 40, height: 40 }} draggable={false} />
            </button>
          )}
        </div>
      </Guided>
    </div>
  );
}

/** VideoSaveResultDialogFragment: success = edit_save_confirm on button_black_r8, fail = common_toast_vector text; 3 s. */
export function SaveResult({ ok, text = STR.saveFail }: { ok: boolean; text?: string }) {
  return (
    <div className="absolute inset-0 z-[90]">
      <Guided>
        {ok ? (
          <div style={{ borderRadius: 8, background: "rgba(0,0,0,0.6)" }}>
            <img src={d("edit_save_confirm")} alt="" style={{ width: 57, height: 57, display: "block" }} draggable={false} />
          </div>
        ) : (
          <div className="text-center text-white" style={{ margin: "0 80px", maxWidth: 250, padding: 20, fontSize: 14, lineHeight: "23px", borderRadius: 8, background: "rgba(0,0,0,0.8)" }}>{text}</div>
        )}
      </Guided>
    </div>
  );
}

/** VideoEditLoadingFragment: common_black_30 dim, 97dp depth_loading_bg, 57dp `loading` tinted common_primary. */
export function LoadingLayer() {
  return (
    <div className="absolute inset-0 z-[90] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.3)" }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-center" style={{ width: 97, height: 97, borderRadius: 8, background: "rgba(0,0,0,0.5)" }}>
        <span
          style={{
            width: 57, height: 57, background: PRIMARY, WebkitMaskImage: `url(${d("loading")})`, maskImage: `url(${d("loading")})`,
            WebkitMaskSize: "contain", maskSize: "contain", animation: "ve-spin 1s linear infinite",
          }}
        />
      </div>
      <style>{"@keyframes ve-spin { to { transform: rotate(360deg) } }"}</style>
    </div>
  );
}

/** network_error / network_error_layout: "Not connected to network." + gallery_edit_frame_error "Retry". */
export function NetworkError({ onRetry, style }: { onRetry: () => void; style?: CSSProperties }) {
  return (
    <div className="absolute inset-x-0 flex flex-col items-center" style={style}>
      <span className="text-center text-white" style={{ fontSize: 12, textShadow: SHADOW }}>{STR.networkBar}</span>
      <button type="button" onClick={onRetry} className="flex items-center text-white" style={{ marginTop: 8, fontSize: 14, textShadow: SHADOW }}>
        <span style={{ width: 15, height: 15, marginRight: 3, background: "#ffffff", WebkitMaskImage: `url(${d("gallery_edit_frame_error")})`, maskImage: `url(${d("gallery_edit_frame_error")})`, WebkitMaskSize: "contain", maskSize: "contain" }} />
        {STR.retry}
      </button>
    </div>
  );
}

/** edit_brush_loading spinner (progress_bar). */
export function Spinner({ size = 24 }: { size?: number }) {
  return <img src={d("edit_brush_loading")} alt="" style={{ width: size, height: size, animation: "ve-spin 1s linear infinite" }} draggable={false} />;
}

/** Toast (common_toast_vector) centered, 2 s. */
export function useToast(): [string | null, (t: string) => void] {
  const [t, setT] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  return [t, (s: string) => { setT(s); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setT(null), 2000); }];
}
export function Toast({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-[95] flex items-center justify-center">
      <div className="text-center text-white" style={{ maxWidth: 250, padding: "12px 20px", fontSize: 14, borderRadius: 8, background: "rgba(0,0,0,0.8)", whiteSpace: "pre-line" }}>{text}</div>
    </div>
  );
}
