"use client";

// Video mode clip strip: one accent segment per recorded clip on a track whose full width is 5 min (it rescales
// to 15 / 30 min as the total grows). While paused, Undo (tap twice: arm, then delete the last clip) and Next
// (finish; enabled after 1 s of footage) appear on either side. The armed clip blinks.
import { IconButton } from "@/components/ui";
import { useFrameClock } from "./anim";

export const CLIP_BAR_HEIGHT = 40;

/** Bottom offset of the strip: just above the shutter. */
export function clipBarBottom(shutterCenterFromBottom: number) {
  return shutterCenterFromBottom + 38 + 8;
}

const fullScale = (total: number) => (total <= 300_000 ? 300_000 : total <= 900_000 ? 900_000 : 1_800_000);

interface Props {
  clips: number[];
  runningSince?: number | null;
  showButtons: boolean;
  undoArmed: boolean;
  nextEnabled: boolean;
  onUndo: () => void;
  onNext: () => void;
  bottom: number;
}

export function VideoClipBar({ clips: done, runningSince = null, showButtons, undoArmed, nextEnabled, onUndo, onNext, bottom }: Props) {
  const now = useFrameClock(runningSince != null);
  const clips = runningSince != null ? [...done, Math.max(0, now - runningSince)] : done;
  const total = clips.reduce((a, b) => a + b, 0);
  const full = fullScale(total);
  const starts = clips.map((_, i) => clips.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <div className="pointer-events-none absolute inset-x-0 z-30 flex items-center justify-center gap-3 px-4" style={{ bottom, height: CLIP_BAR_HEIGHT }}>
      <span className="w-9">
        {showButtons && (
          <IconButton icon="undo" label={undoArmed ? "Delete last clip" : "Undo last clip"} variant={undoArmed ? "accent" : "glass"} size={36} iconSize={18} className="pointer-events-auto" onClick={onUndo} />
        )}
      </span>
      <div className="relative h-1.5 max-w-[240px] flex-1 overflow-hidden rounded-full bg-white/25">
        {clips.map((ms, i) => {
          const left = (starts[i] / full) * 100;
          const last = i === clips.length - 1;
          return (
            <span
              key={i}
              className="absolute inset-y-0 bg-accent"
              style={{ left: `${left}%`, width: `${(ms / full) * 100}%`, borderRight: "2px solid rgba(0,0,0,.5)", animation: last && undoArmed ? "oe-pulse 700ms ease-in-out infinite" : undefined }}
            />
          );
        })}
      </div>
      <span className="w-9">
        {showButtons && (
          <IconButton icon="check" label="Finish video" variant="accent" size={36} iconSize={18} disabled={!nextEnabled} className="pointer-events-auto" onClick={onNext} />
        )}
      </span>
    </div>
  );
}
