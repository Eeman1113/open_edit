"use client";

// Speed and Music panels of the video editor. They fill the dock above the tab bar.
import { Icon, Sheet, Switch } from "@/components/ui";
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

/** Music: no music library ships with this build, so the panel says so plainly. */
export function MusicPanel({ onChoose }: { onChoose: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent"><Icon name="music" size={22} /></span>
      <p className="text-[14px] leading-snug text-fg-2">Your video keeps its own sound. Background music needs a music library, which isn&apos;t set up yet.</p>
      <button type="button" onClick={onChoose} className="text-[13px] font-semibold text-accent">Learn more</button>
    </div>
  );
}

export function MusicList({ onClose }: { onClose: () => void }) {
  return (
    <Sheet open onClose={onClose} title="Music" z={70}>
      <div className="flex flex-col items-center gap-3 px-8 pb-6 pt-2 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-raised text-fg-2"><Icon name="music" size={26} /></span>
        <p className="font-display text-[17px] font-semibold">No music library yet</p>
        <p className="text-[14px] leading-relaxed text-fg-3">
          Open_Edit can add tracks from a music catalogue once one is connected to this app. Until then, videos are saved with their own sound,
          and you can turn it off with the speaker button at the top.
        </p>
      </div>
    </Sheet>
  );
}
