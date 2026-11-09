"use client";

// EditConfirmFragment with Param(PageType.COLLAGE) (yx8/ty8/ny8.o). Added by CollageActivity.j() over the editor
// with slide_in_right (350ms, decelerate). Top bar: icon_edit_top_close, "Saved!", icon_edit_top_share_shadow.
// Body (ny8.o → ny8.t): the saved image, fit-center; the buttons slot is the empty default (l35.b) and the
// continue-edit / next-edit callbacks ny8.o receives are never rendered, so there are no buttons (same as PHOTO).
import { useEffect, useRef, useState } from "react";
import { Img } from "@/components/edit/ui";
import { useBackHandler } from "@/lib/back";

export function CollageConfirm({ url, blob, initialShare, onClose, onBack }: { url: string; blob: Blob; initialShare: boolean; onClose: () => void; onBack: () => void }) {
  const [share, setShare] = useState(initialShare);
  const [shown, setShown] = useState(false);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    return () => cancelAnimationFrame(r);
  }, []);
  // X (isOldEdit = false in CollageActivity): pop the confirm fragment → slide_out_right back to the editor
  const close = () => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(onClose, 350);
  };
  // Back press: ShareBar first; otherwise finish CollageActivity (no Gallery re-open for CollageActivity)
  useBackHandler(onBack);
  const x = shown && !leaving ? "0" : "100%";
  return (
    <div
      className="absolute inset-0 z-[95] flex flex-col bg-black"
      style={{ transform: `translateX(${x})`, transition: "transform 350ms cubic-bezier(0, 0, 0.2, 1)" }}
    >
      <div className="relative flex flex-none items-center justify-between" style={{ height: 52, padding: "9px 8px" }}>
        <button type="button" onClick={close} aria-label="Close" style={{ width: 34, height: 34 }}>
          <Img name="icon_edit_top_close" size={34} />
        </button>
        <span className="pointer-events-none absolute inset-x-0 text-center text-white" style={{ fontSize: 15, fontWeight: 600, lineHeight: "18px" }}>Saved!</span>
        <button type="button" onClick={() => setShare(true)} aria-label="Share" style={{ width: 34, height: 34 }}>
          <Img name="icon_edit_top_share_shadow" size={34} />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <img src={url} alt="" draggable={false} className="absolute inset-0 h-full w-full object-contain" />
      </div>
      <ShareBar open={share} blob={blob} onClose={() => setShare(false)} />
    </div>
  );
}

function download(blob: Blob) {
  const a = document.createElement("a");
  const u = URL.createObjectURL(blob);
  a.href = u;
  a.download = `B612_${Date.now()}.jpg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(u), 1000);
}

/**
 * main_share_etc_bar.xml, BLACK theme (ShareBar.T0(true)): transparent full-screen root (tap closes), 167dp #000
 * sheet, 50dp close row with btn_close_default (27dp, white), app list (paddingH 18, 75dp cells, 54dp icon, 10dp
 * label 11.5dp below). Only installed apps are listed and "More" always is; on the web that is "More".
 */
function ShareBar({ open, blob, onClose }: { open: boolean; blob: Blob; onClose: () => void }) {
  const [mounted, setMounted] = useState(open);
  const [up, setUp] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(360);
  if (open && !mounted) setMounted(true);
  // back closes the share bar first
  useBackHandler(onClose, open);
  useEffect(() => {
    if (open) {
      const r = requestAnimationFrame(() => setUp(true));
      return () => cancelAnimationFrame(r);
    }
    const r = requestAnimationFrame(() => setUp(false));
    const t = window.setTimeout(() => setMounted(false), 300);
    return () => { cancelAnimationFrame(r); window.clearTimeout(t); };
  }, [open]);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [mounted]);
  if (!mounted) return null;
  const items = [{ icon: "btn_share_etc", label: "More" }];
  const margin = Math.max(0, (w - 36 - 75 * items.length) / (items.length + 1));
  const more = async () => {
    const file = new File([blob], `B612_${Date.now()}.jpg`, { type: "image/jpeg" });
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file] }); return; }
    } catch { return; }
    download(blob);
  };
  return (
    <div className="absolute inset-0 z-10" onClick={onClose}>
      <div
        className="absolute inset-x-0 bottom-0 bg-black"
        style={{ height: 167, transform: up ? "translateY(0)" : "translateY(100%)", transition: "transform 300ms ease-in-out" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div ref={listRef} className="absolute inset-x-0 top-0 flex items-center" style={{ bottom: 50, padding: "0 18px" }}>
          {items.map((it) => (
            <button key={it.icon} type="button" onClick={() => void more()} className="flex flex-none flex-col items-center" style={{ width: 75, marginLeft: margin }}>
              <Img name={it.icon} size={54} />
              <span className="whitespace-pre-line text-center text-white" style={{ marginTop: 11.5, fontSize: 10, lineHeight: "12px", padding: 1 }}>{it.label}</span>
            </button>
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center" style={{ height: 50 }}>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 27, height: 27 }}>
            <Img name="btn_close_default" size={27} style={{ filter: "brightness(0) invert(1)" }} />
          </button>
        </div>
      </div>
    </div>
  );
}
