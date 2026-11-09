"use client";

// EditConfirmFragment with EditConfirm$PageType.VIDEO (VideoConfirmHandler.showConfirm): black page, 52dp top bar
// (icon_edit_top_close / "Saved!" / icon_edit_top_share_shadow), the saved video playing (contain, looping),
// slide_in_right. ShareBar = main_share_etc_bar.xml in the BLACK theme.
import { useEffect, useRef, useState } from "react";
import { download } from "@/lib/store";
import { useBackHandler } from "@/lib/back";
import { Img } from "./ui";
import { STR } from "./model";

const ext = (b: Blob) => (b.type.includes("mp4") ? "mp4" : "webm");

export function SaveConfirm({ url, blob, onClose, onBack }: { url: string; blob: Blob; onClose: () => void; onBack: () => void }) {
  const [share, setShare] = useState(false);
  const [shown, setShown] = useState(false);
  const [paused, setPaused] = useState(false);
  const vref = useRef<HTMLVideoElement>(null);
  useEffect(() => { const r = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(r); }, []);
  // back: the share bar (its own handler, above) first, else the Gallery
  useBackHandler(onBack);
  return (
    <div className="absolute inset-0 z-[95] flex flex-col bg-black" style={{ transform: shown ? "none" : "translateX(100%)", transition: "transform 300ms ease-in-out" }}>
      <div className="relative flex flex-none items-center justify-between" style={{ height: 52, padding: "9px 8px" }}>
        <button type="button" onClick={onClose} aria-label="Close" style={{ width: 34, height: 34 }}><Img name="icon_edit_top_close" size={34} /></button>
        <span className="pointer-events-none absolute inset-x-0 text-center text-white" style={{ fontSize: 15, fontWeight: 600, lineHeight: "18px" }}>{STR.saved}</span>
        <button type="button" onClick={() => setShare(true)} aria-label="Share" style={{ width: 34, height: 34 }}><Img name="icon_edit_top_share_shadow" size={34} /></button>
      </div>
      <div className="relative min-h-0 flex-1" onClick={() => { const v = vref.current; if (!v) return; if (v.paused) { void v.play(); setPaused(false); } else { v.pause(); setPaused(true); } }}>
        <video ref={vref} src={url} autoPlay loop playsInline className="absolute inset-0 h-full w-full object-contain" />
        {paused && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><Img name="gallery_btn_play" size={60} /></div>}
      </div>
      <ShareBar open={share} blob={blob} onClose={() => setShare(false)} />
    </div>
  );
}

/** main_share_etc_bar.xml BLACK: 167dp sheet, 50dp close row (btn_close_default white), "More" (Web Share / download). */
export function ShareBar({ open, blob, onClose }: { open: boolean; blob: Blob | null; onClose: () => void }) {
  const [mounted, setMounted] = useState(open);
  const [up, setUp] = useState(false);
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    if (open) { const r = requestAnimationFrame(() => setUp(true)); return () => cancelAnimationFrame(r); }
    const r = requestAnimationFrame(() => setUp(false));
    const t = window.setTimeout(() => setMounted(false), 300);
    return () => { cancelAnimationFrame(r); window.clearTimeout(t); };
  }, [open]);
  useBackHandler(onClose, open);
  if (!mounted || !blob) return null;
  const more = async () => {
    const name = `B612_${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}.${ext(blob)}`;
    const file = new File([blob], name, { type: blob.type });
    try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file] }); return; } } catch { return; }
    download(blob, name);
  };
  return (
    <div className="absolute inset-0 z-[96]" onClick={onClose}>
      <div className="absolute inset-x-0 bottom-0 bg-black" style={{ height: 167, transform: up ? "none" : "translateY(100%)", transition: "transform 300ms ease-in-out" }} onClick={(e) => e.stopPropagation()}>
        <div className="absolute inset-x-0 top-0 flex items-center" style={{ bottom: 50, padding: "0 18px" }}>
          <button type="button" onClick={() => void more()} className="mx-auto flex flex-none flex-col items-center" style={{ width: 75 }}>
            <Img name="btn_share_etc" size={54} />
            <span className="text-center text-white" style={{ marginTop: 11.5, fontSize: 10, lineHeight: "12px", padding: 1 }}>More</span>
          </button>
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center" style={{ height: 50 }}>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 27, height: 27 }}><Img name="btn_close_default" size={27} style={{ filter: "brightness(0) invert(1)" }} /></button>
        </div>
      </div>
    </div>
  );
}
