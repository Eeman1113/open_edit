"use client";

// Speed (fragment_video_edit_speed), Music (music_select_button / music_title / camera_music_list BLACK theme),
// Effects (fragment_video_edit_effect) panels. All of them sit in the 148dp area above the 52dp menu bar.
import { useEffect, useRef, useState } from "react";
import { d } from "@/components/ui/legacy-drawable";
import { useBackHandler } from "@/lib/back";
import { PRIMARY, STR } from "./model";
import { NetworkError, SpeedSeekBar, Spinner, Tint } from "./ui";

export const AREA_H = 148;

/* ------------------------------------------------------------------ Speed */

export function SpeedPanel({ speed, reverse, durationMs, onSpeed, onSpeedCommit, onReverse }: {
  speed: number; reverse: boolean; durationMs: number;
  onSpeed: (s: number) => void; onSpeedCommit: (s: number) => void; onReverse: (on: boolean) => void;
}) {
  return (
    <div className="absolute inset-x-0 bottom-0 bg-black" style={{ height: AREA_H }}>
      {/* speed_seek_bar: marginLR 20.5, marginBottom 18 above check_reverse */}
      <div className="absolute" style={{ left: 20.5, right: 20.5, bottom: 37 + 27 + 18 }}>
        <SpeedSeekBar speed={speed} durationMs={durationMs} onChange={onSpeed} onCommit={onSpeedCommit} />
      </div>
      {/* check_reverse (CustomCheckBox Default: #ffffff checked / #66ffffff unchecked) */}
      <button type="button" onClick={() => onReverse(!reverse)} className="absolute flex items-center" style={{ left: 23, bottom: 37, height: 27 }}>
        <img src={d(reverse ? "edit_reverse_on" : "edit_reverse_off")} alt="" draggable={false} style={{ width: 27, height: 27 }} />
        <span style={{ marginLeft: 3, fontSize: 13, lineHeight: "15px", color: reverse ? "#ffffff" : "rgba(255,255,255,0.4)" }}>{STR.reverse}</span>
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ Music */

/** music_select_button: white pill (edit_music_bg_shape r26), 52dp, paddingH 46, "Choose music" 15dp #000. */
export function MusicPanel({ onChoose }: { onChoose: () => void }) {
  return (
    <div className="absolute inset-x-0 bottom-0 flex items-center justify-center" style={{ height: AREA_H, paddingTop: 10 }}>
      <button type="button" onClick={onChoose} className="flex items-center justify-center bg-white text-black" style={{ height: 52, padding: "0 46px", borderRadius: 26, fontSize: 15 }}>
        {STR.chooseMusic}
      </button>
    </div>
  );
}

/**
 * MusicListFragment, Theme.BLACK (GalleryEditMusicListHandler): full screen #000, title "Add Music" white, close tinted
 * white, category row + white_20 divider; the music catalog is server-only, so the page shows common_empty_network.
 */
export function MusicList({ onClose }: { onClose: () => void }) {
  const [shown, setShown] = useState(false);
  const [loading, setLoading] = useState(false);
  useEffect(() => { const t = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(t); }, []);
  const close = () => { setShown(false); window.setTimeout(onClose, 125); };
  useBackHandler(close);
  return (
    <div className="absolute inset-0 z-[70] bg-black" style={{ transform: `translateY(${shown ? 0 : 100}%)`, transition: "transform 125ms" }}>
      <div className="relative" style={{ height: 56 }}>
        <p className="absolute inset-0 flex items-center justify-center text-white" style={{ fontSize: 20 }}>{STR.addMusic}</p>
        <button type="button" className="absolute left-0 top-0 flex items-center justify-center" style={{ width: 52, height: 52 }} onClick={close} aria-label="close">
          <Tint name="icon_edit_close" color="#ffffff" size={35} />
        </button>
      </div>
      <div className="relative" style={{ height: 40 }}>
        <div className="absolute inset-x-0 bottom-0" style={{ height: 0.5, background: "rgba(255,255,255,0.2)" }} />
      </div>
      {/* common_empty_network: alert_ico_page_03 50dp, text (24%..76%), Retry (TextHeadTitle, common_primary) */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-center" style={{ top: 96 }}>
        <img src={d("alert_ico_page_03")} alt="" style={{ width: 50 }} draggable={false} />
        <p className="whitespace-pre-line text-center" style={{ marginTop: 12, width: "52%", fontSize: 14, color: "#b1b9be" }}>{STR.musicNetwork}</p>
        <div className="flex items-center justify-center" style={{ marginTop: 32, height: 40 }}>
          {loading
            ? <img src={d("list_ico_loading")} alt="" style={{ animation: "ve-spin 1s linear infinite" }} draggable={false} />
            : <button type="button" style={{ fontSize: 20, color: PRIMARY }} onClick={() => { setLoading(true); window.setTimeout(() => setLoading(false), 800); }}>{STR.retry}</button>}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Effects */

/**
 * fragment_video_edit_effect: frame strip (28dp, edit_video_effect_focus 9x48 progress bar in the middle), txt_time,
 * btn_effect_undo, effect_recycler_view (82dp). Effects are stickers from the sticker overview API (VideoEditEffectPresenter);
 * offline the list shows the original network_error block over the recycler view.
 */
export function EffectPanel({ thumbs, pos, start, end, width, onSeek }: {
  thumbs: string[]; pos: number; start: number; end: number; width: number; onSeek: (ms: number) => void;
}) {
  const [phase, setPhase] = useState<"loading" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const t = window.setTimeout(() => setPhase("error"), 600);
    return () => window.clearTimeout(t);
  }, [attempt]);
  // frame strip is centred on the progress bar: the current time sits at the centre of the screen
  const stripW = 28 * Math.max(1, thumbs.length);
  const frac = end > start ? (pos - start) / (end - start) : 0;
  const offset = width / 2 - frac * stripW;
  const drag = useRef({ x: 0, frac: 0 });
  return (
    // full-height box for positioning only: it must not swallow the top menu or the preview tap
    <div className="pointer-events-none absolute inset-x-0 bottom-0" style={{ top: 0 }}>
      {/* btn_effect_undo: marginStart 10, marginBottom 10 above the 148dp guide (disabled: alpha 0.4) */}
      <img src={d("icon_edit_common_undo")} alt="" draggable={false} className="absolute" style={{ left: 10, bottom: AREA_H + 10, width: 34, height: 34, opacity: 0.4 }} />
      <div className="pointer-events-auto absolute inset-x-0 bottom-0 bg-black" style={{ height: AREA_H }}>
        {/* layout_frame_area: marginBottom 9 above the 82dp list */}
        <div
          className="absolute inset-x-0 touch-none overflow-hidden"
          style={{ bottom: 82 + 9, height: 48 }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, frac }; }}
          onPointerMove={(e) => { if (!e.buttons) return; const f = Math.min(1, Math.max(0, drag.current.frac - (e.clientX - drag.current.x) / stripW)); onSeek(start + f * (end - start)); }}
        >
          <div className="absolute flex" style={{ left: offset, top: 10, height: 28 }}>
            {thumbs.map((t, i) => <img key={i} src={t} alt="" draggable={false} style={{ width: 28, height: 28, objectFit: "cover", maxWidth: "none" }} />)}
          </div>
          <img src={d("edit_video_effect_focus")} alt="" draggable={false} className="absolute" style={{ left: width / 2 - 4.5, top: 0, width: 9, height: 48 }} />
        </div>
        {/* effect_recycler_view (82dp) */}
        <div className="absolute inset-x-0 bottom-0" style={{ height: 82 }}>
          {phase === "loading" && <div className="absolute inset-0 flex items-center justify-center"><Spinner /></div>}
          {phase === "error" && <NetworkError style={{ top: "50%", transform: "translateY(-50%)" }} onRetry={() => { setPhase("loading"); setAttempt((a) => a + 1); }} />}
        </div>
      </div>
    </div>
  );
}

