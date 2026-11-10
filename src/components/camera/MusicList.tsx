"use client";

// Music picker (camera toolbar, the capture review for videos and the video editor). Tracks come from the content
// API (/api/music, which reads its provider from server-side env) and fall back to the asset pack's built-in loops
// (kind "music"). Tap a track to preview it, then "Use".
import { useEffect, useRef, useState } from "react";
import { Button, EmptyState, Icon, Sheet, Spinner, cx } from "@/components/ui";
import { loadMusic } from "@/lib/content/music";
import type { Track } from "@/lib/content/types";
import { loadPref, savePref } from "./prefs";

export type { Track } from "@/lib/content/types";

const mmss = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");

export function MusicList({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(true);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [chosen, setChosen] = useState<string | null>(() => loadPref<string | null>("music", null));
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    loadMusic(attempt > 0).then((t) => { if (alive) { setTracks(t); setPhase("ready"); } }, () => alive && setPhase("error"));
    return () => { alive = false; };
  }, [attempt]);
  useEffect(() => () => audio.current?.pause(), []);

  const close = () => { audio.current?.pause(); setOpen(false); window.setTimeout(onClose, 220); };
  const preview = (t: Track) => {
    if (playing === t.id) { audio.current?.pause(); setPlaying(null); return; }
    audio.current?.pause();
    audio.current = new Audio(t.url);
    audio.current.onended = () => setPlaying(null);
    void audio.current.play().catch(() => setPlaying(null));
    setPlaying(t.id);
  };
  const use = (id: string | null) => { setChosen(id); savePref("music", id); close(); };

  return (
    <Sheet open={open} onClose={close} title="Music" full z={65}>
      <div className="px-4 pb-4">
        <button type="button" onClick={() => use(null)} className={cx("mb-3 flex w-full items-center gap-3 rounded-md px-3 py-3 text-left", chosen == null ? "bg-accent-soft text-accent" : "bg-raised")}>
          <Icon name="mute" size={20} /> <span className="flex-1 text-[15px] font-medium">No music</span>
          {chosen == null && <Icon name="check" size={18} />}
        </button>
        {phase === "loading" && <div className="flex items-center justify-center gap-2 py-12 text-fg-2"><Spinner size={18} /> Loading tracks…</div>}
        {phase === "error" && (
          <EmptyState icon="offline" title="Can’t load music" body="Check your connection and try again."
            action={<Button size="sm" variant="secondary" icon="reset" onClick={() => { setPhase("loading"); setAttempt((a) => a + 1); }}>Try again</Button>} />
        )}
        {phase === "ready" && tracks.length === 0 && (
          <EmptyState icon="music" title="No tracks yet" body="This build has no music library. A server admin can connect one in the environment settings." />
        )}
        {tracks.map((t) => (
          <div key={t.id} className="flex items-center gap-3 border-b border-line py-2.5">
            <button type="button" aria-label={playing === t.id ? "Pause preview" : "Play preview"} onClick={() => preview(t)} className="oe-press flex h-11 w-11 shrink-0 items-center justify-center rounded-sm bg-raised text-fg">
              <Icon name={playing === t.id ? "pause" : "play"} size={18} filled />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px]">{t.title}</p>
              <p className="truncate text-[12px] text-fg-3">{[t.artist, mmss(t.duration)].filter(Boolean).join(" · ")}</p>
            </div>
            <Button size="sm" variant={chosen === t.id ? "primary" : "secondary"} onClick={() => use(t.id)}>{chosen === t.id ? "Selected" : "Use"}</Button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
