"use client";

// Full-screen viewer opened from a grid cell's zoom corner: swipe between items, pinch / double-tap to zoom photos,
// play videos; Share, Edit and Delete at the bottom.
import { useEffect, useRef, useState } from "react";
import { Icon, IconButton, type IconName } from "@/components/ui";
import { useBackHandler } from "@/lib/back";
import { isVideoPhoto, type Photo } from "@/lib/store";
import { fmtDuration } from "./parts";
import { ZoomImage } from "./ZoomImage";

function BottomButton({ icon, label, enabled = true, onClick, danger }: { icon: IconName; label: string; enabled?: boolean; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" disabled={!enabled} onClick={onClick} className={`oe-press flex w-16 flex-col items-center gap-1 text-[11px] font-semibold disabled:opacity-30 ${danger ? "text-danger" : "text-fg"}`}>
      <Icon name={icon} size={22} />
      {label}
    </button>
  );
}

/** Video page: tap play to start (no autoplay); tap the video to pause. */
function VideoPage({ photo, url, active }: { photo: Photo; url: string; active: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!active) ref.current?.pause();
  }, [active]);
  const play = () => {
    const v = ref.current;
    if (!v) return;
    if (v.ended) v.currentTime = 0;
    void v.play();
  };
  return (
    <div className="relative h-full w-full bg-black">
      <video
        ref={ref}
        src={`${url}#t=0.1`}
        playsInline
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onClick={() => playing && ref.current?.pause()}
        className="absolute inset-0 h-full w-full object-contain"
      />
      {!playing && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <button type="button" aria-label="Play" onClick={play} className="pointer-events-auto flex h-16 w-16 items-center justify-center rounded-full bg-glass text-white backdrop-blur-md"><Icon name="play" size={28} filled /></button>
          <span className="tabular mt-2 text-[14px] font-semibold text-white">{fmtDuration(photo.duration)}</span>
        </div>
      )}
    </div>
  );
}

export function GalleryViewer({ items, urls, startId, onBack, onEdit, onShare, onDelete }: {
  items: Photo[];
  urls: Map<string, string>;
  startId: string;
  onBack: () => void;
  onEdit: (p: Photo) => void;
  onShare: (p: Photo) => void;
  onDelete: (p: Photo) => void;
}) {
  const pager = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(() => Math.max(0, items.findIndex((p) => p.id === startId)));
  const [leaving, setLeaving] = useState(false);
  // zoomable consumes drags while the current image is zoomed, so the pager does not page
  const [zoomed, setZoomed] = useState(false);
  const cur = Math.min(index, Math.max(0, items.length - 1));

  // jump to the current page on first layout and after a delete
  useEffect(() => {
    const el = pager.current;
    if (el) el.scrollTo({ left: cur * el.clientWidth });
  }, [items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const back = () => {
    setLeaving(true);
    window.setTimeout(onBack, 350);
  };
  useBackHandler(back);

  const item = items[cur];
  return (
    <div
      className="absolute inset-0 z-40 flex flex-col bg-black"
      style={{ animation: "oe-fade-in 250ms", opacity: leaving ? 0 : 1, transition: "opacity 300ms" }}
    >
      <div className="relative flex h-14 flex-none items-center justify-center pt-[env(safe-area-inset-top)]">
        <span className="absolute left-2"><IconButton icon="back" label="Back" onClick={back} className="text-white" iconSize={26} /></span>
        {items.length > 0 && <span className="tabular text-[15px] font-semibold text-white">{cur + 1} / {items.length}</span>}
      </div>

      <div
        ref={pager}
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          if (i !== index) {
            setIndex(i);
            setZoomed(false);
          }
        }}
        className="no-scrollbar relative flex min-h-0 flex-1 overflow-y-hidden"
        style={{ overflowX: zoomed ? "hidden" : "auto", scrollSnapType: "x mandatory", overscrollBehavior: "contain" }}
      >
        {items.map((p, i) => {
          const u = urls.get(p.id);
          return (
            <div key={p.id} className="relative h-full w-full flex-none" style={{ scrollSnapAlign: "start", scrollSnapStop: "always" }}>
              {u && Math.abs(i - cur) <= 2 && (isVideoPhoto(p)
                ? <VideoPage photo={p} url={u} active={i === cur} />
                : <ZoomImage src={u} maxScale={3} doubleTapScale={2.5} active={i === cur} onZoomedChange={(z) => i === cur && setZoomed(z)} />)}
            </div>
          );
        })}
      </div>

      <div className="flex h-16 flex-none items-center justify-around bg-panel pb-[env(safe-area-inset-bottom)]">
        <BottomButton icon="share" label="Share" onClick={() => item && onShare(item)} />
        <BottomButton icon="edit" label="Edit" enabled={!!item} onClick={() => item && onEdit(item)} />
        <BottomButton icon="trash" label="Delete" danger onClick={() => item && onDelete(item)} />
      </div>
    </div>
  );
}
