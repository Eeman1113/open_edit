"use client";

// Gallery building blocks: media thumbnails, grid cells and the two simple dialogs other screens reuse.
import { useState, type CSSProperties } from "react";
import { Dialog, Icon } from "@/components/ui";
import { isGifPhoto, isVideoPhoto, type Photo } from "@/lib/store";

/** "m:ss" for video durations. */
export function fmtDuration(ms?: number) {
  if (ms === undefined || !isFinite(ms)) return "0:00";
  const t = Math.round(ms / 1000);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/** Cover-cropped thumbnail; videos show their first frame. */
export function Thumb({ photo, url }: { photo: Photo; url?: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  if (!url || failed) return <Icon name="image" size={24} className="absolute inset-0 m-auto text-fg-3" />;
  const style: CSSProperties = { opacity: loaded ? 1 : 0, transition: "opacity 200ms" };
  return isVideoPhoto(photo) ? (
    <video src={`${url}#t=0.1`} muted playsInline preload="metadata" onLoadedData={() => setLoaded(true)} onError={() => setFailed(true)} className="pointer-events-none absolute inset-0 h-full w-full object-cover" style={style} />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" draggable={false} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} className="pointer-events-none absolute inset-0 h-full w-full object-cover" style={style} />
  );
}

/** Grid cell: thumbnail, GIF / video badges, and a corner button that opens the full-screen viewer. */
export function GalleryCell({ photo, url, zoom, picked, onClick, onZoom }: { photo: Photo; url?: string; zoom: boolean; picked?: number; onClick: () => void; onZoom: () => void }) {
  const video = isVideoPhoto(photo);
  return (
    <div role="button" tabIndex={0} onClick={onClick} className="relative aspect-square w-full cursor-pointer overflow-hidden bg-panel">
      <Thumb photo={photo} url={url} />
      {isGifPhoto(photo) && <span className="absolute bottom-1.5 left-1.5 rounded-xs bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white">GIF</span>}
      {video && (
        <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-xs bg-black/55 px-1.5 py-0.5 text-[11px] font-semibold text-white">
          <Icon name="play" size={10} filled /> {fmtDuration(photo.duration)}
        </span>
      )}
      {picked ? <span className="absolute inset-0 ring-2 ring-inset ring-accent"><span className="absolute left-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-on-accent">{picked}</span></span> : null}
      {zoom && (
        <button type="button" aria-label="View full screen" onClick={(e) => { e.stopPropagation(); onZoom(); }} className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm">
          <Icon name="zoom" size={14} stroke={2.2} />
        </button>
      )}
    </div>
  );
}

/** One-button message dialog. */
export function AlertDialog({ message, onOk }: { message: string; onOk: () => void }) {
  return <Dialog open onClose={onOk}><span className="whitespace-pre-line text-fg">{message}</span></Dialog>;
}

/** Two-button confirm dialog. */
export function ConfirmDialog({ message, cancel, ok, onCancel, onOk, destructive }: { message: string; cancel: string; ok: string; onCancel: () => void; onOk: () => void; destructive?: boolean }) {
  return <Dialog open onClose={onCancel} title={message} cancel={cancel} confirm={ok} destructive={destructive ?? /delete|remove|discard/i.test(ok)} onConfirm={onOk} />;
}
