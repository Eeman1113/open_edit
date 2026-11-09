"use client";

// Result page shown after saving from the photo editor, the collage maker or the video editor, and the share sheet
// it opens. The saved file is already in the gallery; this page offers Share, Done (to the gallery) and a way back
// into the editor.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Icon, ListGroup, ListRow, Sheet, toast } from "@/components/ui";
import { useBackHandler } from "@/lib/back";
import { download } from "@/lib/store";

const fileName = (blob: Blob) => {
  const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("webm") ? "webm" : blob.type.includes("png") ? "png" : "jpg";
  return `OpenEdit_${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}.${ext}`;
};

/** Share options for a saved photo or video: the system share sheet (when the browser has one) and Download. */
export function ShareSheet({ open, blob, onClose }: { open: boolean; blob: Blob | null; onClose: () => void }) {
  const canShare = (() => {
    if (!blob || typeof navigator === "undefined" || !navigator.canShare) return false;
    try { return navigator.canShare({ files: [new File([blob], fileName(blob), { type: blob.type })] }); } catch { return false; }
  })();
  const share = async () => {
    if (!blob) return;
    const file = new File([blob], fileName(blob), { type: blob.type });
    try { await navigator.share({ files: [file] }); onClose(); } catch { /* dismissed */ }
  };
  const save = () => {
    if (!blob) return;
    download(blob, fileName(blob));
    toast("Downloaded", { icon: "download", tone: "ok" });
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Share" z={110}>
      <div className="pb-2">
        <ListGroup>
          {canShare && <ListRow icon="share" iconTone="accent" title="Share to an app" subtitle="Uses your device's share menu" onClick={() => void share()} />}
          <ListRow icon="download" title="Download a copy" subtitle={blob?.type.startsWith("video/") ? "Saves the video file" : "Saves the full-size file"} onClick={save} />
        </ListGroup>
        {!canShare && <p className="px-5 pt-3 text-[12px] leading-relaxed text-fg-3">This browser has no share menu, so you can download the file and share it from there.</p>}
      </div>
    </Sheet>
  );
}

/**
 * Full-screen "Saved" page. `media` is the saved picture or video element; ✕ goes back to the editor, Done (and the
 * back key) leave for the gallery.
 */
export function SavedPage({ blob, media, title = "Saved", note = "It's in your gallery.", initialShare = false, onClose, onDone, extra }: {
  blob: Blob; media: ReactNode; title?: string; note?: string; initialShare?: boolean; onClose: () => void; onDone: () => void; extra?: ReactNode;
}) {
  const [share, setShare] = useState(initialShare);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    return () => cancelAnimationFrame(r);
  }, []);
  // the share sheet registers its own back handler above this one
  useBackHandler(onDone);
  return (
    <div
      className="absolute inset-0 z-[95] flex flex-col bg-bg text-fg"
      style={{ opacity: shown ? 1 : 0, transform: shown ? "none" : "translateY(24px)", transition: "opacity 240ms, transform 320ms var(--oe-ease)" }}
    >
      <header className="flex flex-none items-center gap-2 px-2" style={{ height: "var(--oe-top-bar)" }}>
        <button type="button" aria-label="Back to editing" onClick={onClose} className="oe-press flex h-10 w-10 items-center justify-center rounded-full bg-raised">
          <Icon name="close" size={20} />
        </button>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" onClick={onDone}>Done</Button>
      </header>
      <div className="relative min-h-0 flex-1 px-4 pb-2 pt-1">
        <div className="relative h-full w-full">{media}</div>
      </div>
      <div className="flex-none px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-3">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-ok/15 text-ok"><Icon name="check" size={22} stroke={2.4} /></span>
          <div className="min-w-0">
            <p className="font-display text-[20px] font-bold leading-tight">{title}</p>
            <p className="text-[13px] text-fg-3">{note}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" icon="share" block onClick={() => setShare(true)}>Share</Button>
          <Button icon="gallery" block onClick={onDone}>Open gallery</Button>
        </div>
        {extra}
      </div>
      <ShareSheet open={share} blob={blob} onClose={() => setShare(false)} />
    </div>
  );
}

/** The saved picture, contained in a rounded frame. */
export function SavedImage({ url }: { url: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="Saved result" draggable={false} className="absolute inset-0 m-auto max-h-full max-w-full rounded-lg object-contain shadow-2xl" />;
}

/** The saved video, looping; tap to pause. */
export function SavedVideo({ url }: { url: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  return (
    <button
      type="button" aria-label={paused ? "Play" : "Pause"} className="absolute inset-0"
      onClick={() => { const v = ref.current; if (!v) return; if (v.paused) { void v.play(); setPaused(false); } else { v.pause(); setPaused(true); } }}
    >
      <video ref={ref} src={url} autoPlay loop playsInline className="absolute inset-0 m-auto max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
      {paused && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-glass text-white backdrop-blur-md"><Icon name="play" size={30} filled /></span>
        </span>
      )}
    </button>
  );
}
