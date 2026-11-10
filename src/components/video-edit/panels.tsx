"use client";

// Speed and Music panels of the video editor (the full music picker is shared with the camera). They fill the dock above the tab bar.
import { useEffect, useState } from "react";
import { Icon, Slider, Spinner, Switch, cx } from "@/components/ui";
import { loadMusic } from "@/lib/content/music";
import type { Track } from "@/lib/content/types";
import { STR, type VMusic } from "./model";
import { SpeedSeekBar } from "./ui";

export function SpeedPanel({ speed, reverse, durationMs, onSpeed, onSpeedCommit, onReverse }: {
  speed: number; reverse: boolean; durationMs: number;
  onSpeed: (s: number) => void; onSpeedCommit: (s: number) => void; onReverse: (on: boolean) => void;
}) {
  return (
    <div className="flex h-full flex-col justify-center gap-3 px-5">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-medium text-fg-2">Speed</span>
        <span className="tabular font-display text-[17px] font-semibold">{speed}x</span>
      </div>
      <SpeedSeekBar speed={speed} durationMs={durationMs} onChange={onSpeed} onCommit={onSpeedCommit} />
      <div className="flex items-center gap-3 rounded-md bg-raised px-3 py-2">
        <Icon name="reverse" size={18} className="text-fg-2" />
        <span className="flex-1 text-[14px]">{STR.reverse}</span>
        <Switch label={STR.reverse} checked={reverse} onChange={onReverse} />
      </div>
    </div>
  );
}

/** Music: the music library (content API or the pack's built-in loops). Tap a track to put it under the video (tap
 *  it again to remove it); it plays with the preview and is mixed into the saved file. "All tracks" opens the full
 *  picker shared with the camera. */
export function MusicPanel({ value, onChange, onChoose }: { value: VMusic | null; onChange: (m: VMusic | null) => void; onChoose: () => void }) {
  const [tracks, setTracks] = useState<Track[] | null>(null);
  useEffect(() => {
    let alive = true;
    void loadMusic().then((t) => alive && setTracks(t));
    return () => { alive = false; };
  }, []);
  const pick = (t: Track) => onChange(value?.id === t.id ? null : { id: t.id, url: t.url, title: t.title, volume: value?.volume ?? 0.8 });
  if (!tracks) return <div className="flex h-full items-center justify-center"><Spinner size={20} /></div>;
  if (!tracks.length) return <div className="flex h-full items-center justify-center px-8 text-center text-[14px] text-fg-2">No tracks are available.</div>;
  return (
    <div className="flex h-full flex-col justify-center gap-2">
      <div className="flex items-center justify-between gap-3 px-4">
        <span className="min-w-0 truncate text-[13px] font-medium text-fg-2">{value ? `Music: ${value.title}` : "Tap a track to add it"}</span>
        <button type="button" onClick={onChoose} className="flex-none text-[13px] font-semibold text-accent">All tracks</button>
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4">
        {tracks.map((t) => {
          const on = value?.id === t.id;
          return (
            <button key={t.id} type="button" data-track={t.id} aria-pressed={on} onClick={() => pick(t)}
              className={cx("oe-press flex w-[104px] shrink-0 flex-col gap-1 rounded-md p-2.5 text-left", on ? "bg-accent-soft text-accent ring-1 ring-accent" : "bg-raised")}>
              <Icon name={on ? "check" : "music"} size={16} />
              <span className="truncate text-[13px] font-medium">{t.title}</span>
              <span className={cx("truncate text-[11px]", on ? "text-accent/80" : "text-fg-3")}>{t.mood ?? t.artist ?? ""}</span>
            </button>
          );
        })}
      </div>
      {value && (
        <div className="flex items-center gap-3 px-4">
          <span className="text-[12px] font-medium text-fg-3">Volume</span>
          <Slider value={value.volume} onChange={(v) => onChange({ ...value, volume: v })} aria-label="Music volume" className="flex-1" />
        </div>
      )}
    </div>
  );
}

export { MusicList } from "@/components/camera/MusicList";
