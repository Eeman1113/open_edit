"use client";

// Clip picker for a video template: choose the number of clips the template needs from the local gallery, in order.
// Templates (their filters, music and effects) come from the content API; without one, "Next" explains that the
// template can't be prepared.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, EmptyState, Icon, IconButton, Spinner, Tabs, cx, toast } from "@/components/ui";
import { isVideoPhoto, listPhotos, type Photo } from "@/lib/store";
import { fmtDuration } from "@/components/gallery/parts";
import { useBackHandler } from "@/lib/back";

const OFFLINE = "This template isn’t available right now. Check your connection and try again.";

function Thumb({ p, size }: { p: Photo; size: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(p.blob);
    if (!isVideoPhoto(p)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- object URL for the blob
      setUrl(u);
      return () => URL.revokeObjectURL(u);
    }
    let alive = true;
    const v = document.createElement("video");
    v.muted = true; v.preload = "auto"; v.src = u;
    v.onloadeddata = () => { v.currentTime = 0.01; };
    v.onseeked = () => {
      const c = document.createElement("canvas");
      const s = (size * 2) / Math.min(v.videoWidth, v.videoHeight);
      c.width = v.videoWidth * s; c.height = v.videoHeight * s;
      c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
      if (alive) setUrl(c.toDataURL("image/jpeg", 0.7));
      URL.revokeObjectURL(u);
    };
    return () => { alive = false; };
  }, [p, size]);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" /> : null;
}

export function ClipGallery({ clips, templateId }: { clips: number; templateId: string | null }) {
  const router = useRouter();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [tab, setTab] = useState<"video" | "photo">("video");
  const [picks, setPicks] = useState<Photo[]>([]);
  const [processing, setProcessing] = useState(false);
  const [discard, setDiscard] = useState(false);
  useEffect(() => { void listPhotos().then(setPhotos).catch(() => setPhotos([])); }, []);
  useEffect(() => { if (!templateId) { const t = window.setTimeout(() => toast(OFFLINE, { icon: "offline" }), 0); return () => window.clearTimeout(t); } }, [templateId]);
  const list = useMemo(() => photos.filter((p) => (tab === "video" ? isVideoPhoto(p) : !isVideoPhoto(p) && p.blob.type !== "image/gif")), [photos, tab]);
  const done = picks.length >= clips;
  const close = () => (picks.length ? setDiscard(true) : router.back());
  useBackHandler(close);
  const pick = (p: Photo) => {
    if (done) return;
    if (isVideoPhoto(p) && (p.duration ?? 0) < 1000) return toast("That clip is too short. Pick one that’s at least 1 second long.");
    setPicks((s) => [...s, p]);
  };
  const next = () => {
    if (!done) return;
    setProcessing(true);
    window.setTimeout(() => { setProcessing(false); toast(OFFLINE, { icon: "offline" }); }, 900);
  };
  return (
    <div className="absolute inset-0 flex flex-col bg-bg" data-clip-gallery>
      <div className="flex h-14 flex-none items-center gap-2 px-2 pt-[env(safe-area-inset-top)]">
        <IconButton icon="close" label="Close" onClick={close} />
        <span className="flex-1 font-display text-[17px] font-semibold">Pick {clips} clip{clips > 1 ? "s" : ""}</span>
      </div>
      <div className="flex-none px-4 pb-2"><Tabs look="segment" items={[{ id: "video" as const, label: "Videos" }, { id: "photo" as const, label: "Photos" }]} value={tab} onChange={setTab} /></div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-44">
        {list.length ? (
          <div className="grid grid-cols-4 gap-0.5">
            {list.map((p) => (
              <button key={p.id} type="button" onClick={() => pick(p)} className="relative aspect-square overflow-hidden bg-panel">
                <Thumb p={p} size={98} />
                {isVideoPhoto(p) && <span className="tabular absolute bottom-1 right-1.5 rounded-xs bg-black/55 px-1 text-[11px] text-white">{fmtDuration(p.duration)}</span>}
              </button>
            ))}
          </div>
        ) : <EmptyState icon={tab === "video" ? "video" : "image"} title={tab === "video" ? "No videos yet" : "No photos yet"} />}
      </div>
      <div className="absolute inset-x-0 bottom-0 rounded-t-xl bg-panel pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
        <div className="flex items-center justify-between px-4">
          <span className="text-[14px] text-fg-2"><span className="font-semibold text-fg">{picks.length}</span> / {clips} picked</span>
          <Button size="sm" iconRight="arrow-right" disabled={!done} onClick={next}>Next</Button>
        </div>
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-4">
          {Array.from({ length: clips }, (_, i) => {
            const p = picks[i];
            const focus = i === picks.length;
            return (
              <div key={i} className={cx("relative h-16 w-16 flex-none overflow-hidden rounded-sm bg-raised", focus && "ring-2 ring-accent")}>
                {p ? <Thumb p={p} size={64} /> : <span className="absolute inset-0 flex items-center justify-center font-display text-[15px] font-bold text-fg-3">{i + 1}</span>}
                {p && (
                  <button type="button" onClick={() => setPicks((s) => s.filter((_, k) => k !== i))} className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white" aria-label="Remove clip">
                    <Icon name="close" size={12} stroke={2.5} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {processing && <div className="absolute inset-0 z-50 flex items-center justify-center bg-scrim"><span className="flex items-center gap-2 rounded-md bg-panel px-4 py-3 text-[14px]"><Spinner size={18} /> Preparing…</span></div>}
      <Dialog open={discard} onClose={() => setDiscard(false)} icon="alert" destructive title="Discard your picks?" confirm="Discard" onConfirm={() => router.back()} />
    </div>
  );
}
