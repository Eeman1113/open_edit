"use client";

// Speed and Music panels of the video editor (the full music picker is shared with the camera). They fill the dock above the tab bar.
import { useEffect, useRef, useState } from "react";
import { Icon, Spinner, Switch, cx } from "@/components/ui";
import { loadMusic } from "@/lib/content/music";
import type { Track } from "@/lib/content/types";
import { STR } from "./model";
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

/** Music: the music library (content API or the pack's built-in loops), previewed in the dock. "All tracks"
 *  opens the full picker shared with the camera. */
export function MusicPanel({ onChoose }: { onChoose: () => void }) {
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    let alive = true;
    void loadMusic().then((t) => alive && setTracks(t));
    return () => { alive = false; audio.current?.pause(); };
  }, []);
  const toggle = (t: Track) => {
    audio.current?.pause();
    if (playing === t.id) { setPlaying(null); return; }
    audio.current = new Audio(t.url);
    audio.current.onended = () => setPlaying(null);
    void audio.current.play().catch(() => setPlaying(null));
    setPlaying(t.id);
  };
  if (!tracks) return <div className="flex h-full items-center justify-center"><Spinner size={20} /></div>;
  if (!tracks.length) return <div className="flex h-full items-center justify-center px-8 text-center text-[14px] text-fg-2">No tracks are available.</div>;
  return (
    <div className="flex h-full flex-col justify-center gap-2">
      <div className="flex items-center justify-between px-4">
        <span className="text-[13px] font-medium text-fg-2">Tap to preview</span>
        <button type="button" onClick={() => { audio.current?.pause(); setPlaying(null); onChoose(); }} className="text-[13px] font-semibold text-accent">All tracks</button>
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4">
        {tracks.map((t) => (
          <button key={t.id} type="button" data-track={t.id} aria-pressed={playing === t.id} onClick={() => toggle(t)}
            className={cx("oe-press flex w-[104px] shrink-0 flex-col gap-1 rounded-md p-2.5 text-left", playing === t.id ? "bg-accent-soft text-accent" : "bg-raised")}>
            <Icon name={playing === t.id ? "pause" : "play"} size={16} filled />
            <span className="truncate text-[13px] font-medium">{t.title}</span>
            <span className="truncate text-[11px] text-fg-3">{t.mood ?? t.artist ?? ""}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export { MusicList } from "@/components/camera/MusicList";
