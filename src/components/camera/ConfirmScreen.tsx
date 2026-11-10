"use client";

// Review screen after a capture: the result fills its frame; the bottom bar offers Share · Save · Edit.
// Photos can get a white border ("Border"): the picture is placed at 92% on a white canvas of the chosen shape
// and that composite is what Save / Share / Edit use. Videos get a music button.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Icon, IconButton, cx, toast } from "@/components/ui";
import { useBackHandler } from "@/lib/back";
import { download, savePhoto } from "@/lib/store";
import type { Ratio, Rect } from "./layout";
import { ConfirmVideo } from "./capture/ConfirmVideo";
import { getSaveRoute } from "@/components/saveroute/SaveRoute";
import { MusicList, type Track } from "./MusicList";
import { mergeClips } from "./capture/mergeClips";
import { pickMime } from "./capture/useRecorder";
import { findTrack } from "@/lib/content/music";
import { loadPref } from "./prefs";

/** Border shapes: aspect = width / height (−1 = keep the photo's own shape, i.e. no border). */
export const WHITESPACE_TYPES = [
  { key: "NONE", label: "None", aspect: -1 },
  { key: "9_16", label: "9:16", aspect: 9 / 16 },
  { key: "3_4", label: "3:4", aspect: 3 / 4 },
  { key: "1_1", label: "1:1", aspect: 1 },
  { key: "4_3", label: "4:3", aspect: 4 / 3 },
  { key: "16_9", label: "16:9", aspect: 16 / 9 },
] as const;
const INSET = 0.92;

/** Largest w×h box of `aspect` inside a W×H area. */
const fit = (W: number, H: number, aspect: number): [number, number] => (W / H > aspect ? [aspect * H, H] : [W, W / aspect]);

/** The photo centred at 92% on a white canvas of `aspect` (the photo's width is kept). */
async function composeBorder(src: Blob, aspect: number): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(src);
  const W = bmp.width, H = Math.round(bmp.width / aspect);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  const k = Math.min(W / bmp.width, H / bmp.height) * INSET;
  const dw = bmp.width * k, dh = bmp.height * k;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, (W - dw) / 2, (H - dh) / 2, dw, dh);
  bmp.close();
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/jpeg", 0.95));
  return { blob, width: W, height: H };
}

export interface Capture {
  blob: Blob;
  url: string;
  width: number;
  height: number;
  isVideo: boolean;
  /** Video recorded as several clips: played back to back until `ready` resolves. */
  clips?: Blob[];
  /** Final file still being produced (clip merge); Save waits for it. */
  ready?: Promise<Blob>;
}

export type SaveState = "idle" | "loading" | "complete";

interface Props {
  capture: Capture;
  /** Where the picture sits on screen (the visible camera frame). */
  rect: Rect;
  ratio?: Ratio;
  autoSave: boolean;
  /** Stores the result and returns its gallery id (default: the local gallery). */
  onSave?: (blob: Blob, width: number, height: number) => Promise<string>;
  onBack: () => void;
  onEdit: (id: string) => void;
  initialSaveState?: SaveState;
}

const MIN_SPIN = 700;
const stampName = () => new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const extFor = (b: Blob, video: boolean) => (video ? (b.type.includes("mp4") ? "mp4" : "webm") : b.type.includes("png") ? "png" : "jpg");

export function ConfirmScreen({ capture, rect, autoSave, onSave, onBack, onEdit, initialSaveState = "idle" }: Props) {
  // ---- final file (multi-clip videos are merged in the background) ----
  // Videos: the track chosen in the camera's Music sheet (or here, with Add music) is mixed into the file.
  const [music, setMusic] = useState<{ track: Track | null } | null>(capture.isVideo ? null : { track: null });
  useEffect(() => {
    if (!capture.isVideo) return;
    let alive = true;
    void findTrack(loadPref<string | null>("music", null)).catch(() => undefined).then((t) => { if (alive) setMusic((m) => m ?? { track: t ?? null }); });
    return () => { alive = false; };
  }, [capture.isVideo]);
  const musicUrl = music?.track?.url ?? null;
  const [finalBlob, setFinalBlob] = useState<Blob | null>(capture.ready || capture.isVideo ? null : capture.blob);
  const [finalUrl, setFinalUrl] = useState<string | null>(capture.ready || capture.isVideo ? null : capture.url);
  useEffect(() => {
    if (!capture.ready && !capture.isVideo) return;
    if (!music) return; // the music choice is still being read
    let alive = true, url: string | null = null;
    const made = musicUrl
      ? mergeClips(capture.clips ?? [capture.blob], capture.width, capture.height, pickMime(), musicUrl)
      : capture.ready ?? Promise.resolve(capture.blob);
    made.then((b) => {
      if (!alive) return;
      if (b === capture.blob) { setFinalBlob(b); setFinalUrl(capture.url); return; }
      url = URL.createObjectURL(b); setFinalBlob(b); setFinalUrl(url);
    }, () => { if (alive) toast("Couldn’t add the music to this video.", { icon: "alert", tone: "danger" }); });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [capture, music, musicUrl]);

  // ---- border ----
  const [border, setBorder] = useState(0);
  const [borderOpen, setBorderOpen] = useState(false);
  const [composite, setComposite] = useState<{ type: number; blob: Blob; width: number; height: number } | null>(null);
  useEffect(() => {
    if (capture.isVideo || border === 0 || !finalBlob) return;
    let alive = true;
    const type = border;
    void composeBorder(finalBlob, WHITESPACE_TYPES[type].aspect).then((r) => { if (alive) setComposite({ type, ...r }); });
    return () => { alive = false; };
  }, [border, finalBlob, capture.isVideo]);
  const out = useMemo(
    () => (border !== 0 ? (composite?.type === border ? composite : null) : finalBlob ? { blob: finalBlob, width: capture.width, height: capture.height } : null),
    [border, composite, finalBlob, capture.width, capture.height],
  );
  const ready = !!out;

  // ---- save ----
  const [state, setState] = useState<SaveState>(initialSaveState);
  const saving = useRef<Promise<string | null> | null>(null);
  const saved = useRef<{ id: string; blob: Blob } | null>(null);
  const save = useCallback((): Promise<string | null> => {
    if (saved.current && saved.current.blob === out?.blob) return Promise.resolve(saved.current.id);
    if (saving.current) return saving.current;
    if (!out) return Promise.resolve(null);
    const { blob, width, height } = out;
    setState("loading");
    const t0 = performance.now();
    const store = onSave ?? (async (b: Blob, w: number, h: number) => (await savePhoto(b, w, h)).id);
    saving.current = (async () => {
      try {
        const id = await store(blob, width, height);
        // Settings → Where photos are saved: also download a copy
        if (getSaveRoute() === "DOWNLOAD") download(blob, `OpenEdit_${stampName()}.${extFor(blob, capture.isVideo)}`);
        const left = MIN_SPIN - (performance.now() - t0);
        if (left > 0) await new Promise((r) => setTimeout(r, left));
        saved.current = { id, blob };
        setState("complete");
        return id;
      } catch (e) {
        setState("idle");
        const full = e instanceof DOMException && e.name === "QuotaExceededError";
        toast(full ? "Your browser’s storage is full. Free some space in the gallery and try again." : `Couldn’t save the ${capture.isVideo ? "video" : "photo"}.`, { icon: "alert", tone: "danger" });
        return null;
      } finally {
        saving.current = null;
      }
    })();
    return saving.current;
  }, [out, onSave, capture.isVideo]);
  // a different border makes a different file
  const outBlob = out?.blob ?? null;
  useEffect(() => {
    // the composite changed: the saved state no longer applies
    if (saved.current && outBlob && saved.current.blob !== outBlob) setState("idle");
  }, [outBlob]);
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoSave || !ready || autoStarted.current || initialSaveState !== "idle") return;
    autoStarted.current = true;
    const id = window.setTimeout(() => void save(), 0);
    return () => window.clearTimeout(id);
  }, [autoSave, ready, save, initialSaveState]);

  const share = async () => {
    const blob = out?.blob ?? (capture.ready ? await capture.ready.catch(() => null) : null);
    if (!blob) return;
    const file = new File([blob], `OpenEdit_${stampName()}.${extFor(blob, capture.isVideo)}`, { type: blob.type });
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file] }); return; }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
    download(blob, file.name);
  };
  const edit = async () => { if (!ready) return; const id = await save(); if (id) onEdit(id); };

  const [musicOpen, setMusicOpen] = useState(false);
  useBackHandler(() => { if (borderOpen) return setBorderOpen(false); onBack(); });

  const showBorderView = !capture.isVideo && (borderOpen || border !== 0);
  return (
    <div className="absolute inset-0 z-40 select-none bg-bg">
      {/* the result */}
      <div className="absolute overflow-hidden bg-black" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
        {capture.isVideo
          ? <ConfirmVideo src={finalUrl} clips={capture.clips ?? [capture.blob]} muted={false} />
          // eslint-disable-next-line @next/next/no-img-element
          : <img src={capture.url} alt="Captured photo" draggable={false} className="h-full w-full object-cover" />}
      </div>
      {showBorderView && <BorderPreview url={capture.url} imgW={capture.width} imgH={capture.height} type={border} bottomInset={borderOpen ? 196 : 120} />}

      {/* top */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/45 to-transparent px-3 pb-6 pt-3">
        <IconButton icon="close" label="Discard and go back" variant="glass" size={40} iconSize={20} onClick={onBack} />
        <div className="flex gap-2">
          {capture.isVideo && <IconButton icon="music" label={musicUrl ? `Music: ${music?.track?.title}` : "Add music"} variant="glass" size={40} iconSize={20} active={!!musicUrl} onClick={() => setMusicOpen(true)} />}
          {!capture.isVideo && !borderOpen && (
            <Button size="sm" variant="glass" icon="frame" className="h-10 rounded-full" onClick={() => setBorderOpen(true)}>Border</Button>
          )}
        </div>
      </div>

      {/* actions */}
      {!borderOpen && (
        <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between gap-3 bg-gradient-to-t from-black/60 via-black/30 to-transparent px-5 pb-[max(28px,env(safe-area-inset-bottom))] pt-10">
          <ActionButton icon="share" label="Share" onClick={() => void share()} />
          <button
            type="button"
            aria-label="Save to gallery"
            disabled={!ready || state === "loading"}
            onClick={() => void save()}
            className={cx("oe-press flex h-16 min-w-[148px] items-center justify-center gap-2 rounded-full px-6 font-display text-[17px] font-bold shadow-xl transition-colors disabled:opacity-60",
              state === "complete" ? "bg-fg text-bg" : "bg-accent text-on-accent")}
          >
            <Icon name={state === "loading" ? "loader" : state === "complete" ? "check" : "save"} size={22} stroke={2.2} className={state === "loading" ? "oe-spin" : undefined} />
            {state === "loading" ? "Saving" : state === "complete" ? "Saved" : "Save"}
          </button>
          <ActionButton icon="edit" label="Edit" onClick={() => void edit()} disabled={!ready} />
        </div>
      )}

      {borderOpen && (
        <div className="absolute inset-x-0 bottom-0 z-10 rounded-t-xl bg-panel px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-4" style={{ animation: "oe-sheet-in 220ms var(--oe-ease)" }}>
          <div className="mb-3 flex items-center justify-between">
            <span className="font-display text-[16px] font-semibold">White border</span>
            <Button size="sm" onClick={() => setBorderOpen(false)}>Done</Button>
          </div>
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            {WHITESPACE_TYPES.map((t, i) => {
              const [w, h] = t.aspect > 0 ? fit(30, 30, t.aspect) : [0, 0];
              return (
                <button key={t.key} type="button" aria-pressed={i === border} onClick={() => setBorder(i)}
                  className={cx("oe-press flex h-[84px] w-[64px] shrink-0 flex-col items-center justify-center gap-2 rounded-md", i === border ? "bg-accent-soft text-accent ring-1 ring-accent" : "bg-raised text-fg-2")}>
                  <span className="flex h-8 w-8 items-center justify-center">
                    {t.aspect > 0 ? <span className="rounded-[3px] border-2 border-current" style={{ width: w, height: h }} /> : <Icon name="block" size={22} />}
                  </span>
                  <span className="text-[12px] font-semibold">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {capture.isVideo && music && !finalBlob && (
        <div className="pointer-events-none absolute inset-x-0 top-20 z-10 flex justify-center">
          <span className="flex items-center gap-2 rounded-full bg-glass px-3.5 py-2 text-[13px] font-medium text-white backdrop-blur-md">
            <Icon name="loader" size={16} className="oe-spin" /> {musicUrl ? `Adding “${music.track?.title}”…` : "Preparing video…"}
          </span>
        </div>
      )}
      {musicOpen && <MusicList onClose={() => setMusicOpen(false)} onPick={(t) => { if (t?.id === music?.track?.id) return; setFinalBlob(null); setFinalUrl(null); setMusic({ track: t }); }} />}
    </div>
  );
}

function ActionButton({ icon, label, onClick, disabled }: { icon: "share" | "edit"; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="oe-press flex w-16 flex-col items-center gap-1.5 text-[12px] font-semibold text-white disabled:opacity-40">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-glass backdrop-blur-md"><Icon name={icon} size={22} /></span>
      {label}
    </button>
  );
}

/** Live preview of the border: a white card of the chosen shape with the photo inset, on the app background. */
function BorderPreview({ url, imgW, imgH, type, bottomInset }: { url: string; imgW: number; imgH: number; type: number; bottomInset: number }) {
  const t = WHITESPACE_TYPES[type];
  const aspect = t.aspect > 0 ? t.aspect : imgW / imgH;
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-bg px-6 pt-16 transition-[padding] duration-200" style={{ paddingBottom: bottomInset }}>
      <div className="relative flex max-h-full max-w-full items-center justify-center bg-white shadow-2xl transition-all duration-300" style={{ aspectRatio: `${aspect}`, height: aspect < 1 ? "100%" : undefined, width: aspect >= 1 ? "100%" : undefined }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" draggable={false} style={{ maxWidth: `${t.aspect > 0 ? INSET * 100 : 100}%`, maxHeight: `${t.aspect > 0 ? INSET * 100 : 100}%`, objectFit: "contain" }} />
      </div>
    </div>
  );
}
