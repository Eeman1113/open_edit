"use client";

// EditActivity (video) → VideoEditFragment (photoend_video_edit_fragment.xml).
// Preview (VideoPreviewTextureView, fit-centre above bottom_menu_guideline = 200dp), layout_video_edit_top_menu (52dp,
// edit_video_shadow: close / sound / rotate / share / SAVE), video_edit_feature_menu_recycler_view (52dp icon tabs in
// VideoEditFeatureMenuAdapter order) and the per-tab feature areas. Save → PercentProgressDialogFragment →
// VideoSaveResultDialogFragment → EditConfirmFragment (VIDEO).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { d } from "@/components/ui/legacy-drawable";
import { useBackHandler } from "@/lib/back";
import { BASE } from "@/lib/base";
import { getPhoto, savePhoto } from "@/lib/store";
import { StickerRuntime, parseSticker, type FaceData } from "@/lib/face";
import { STICKER_BASE, findSticker, type Sticker } from "@/data/camera/stickers";
import { AlertDialog, ConfirmDialog } from "@/components/gallery/parts";
import { VideoEngine, decodeReverse, rotatedSize } from "./engine";
import { MAX_MS, MENU_H, PRIMARY, STR, TABS, TAB_H, docModified, initialDoc, type Reshape, type Rotation, type TabId, type VDoc } from "./model";
import { TrimPanel } from "./TrimPanel";
import { EffectPanel, MusicList, MusicPanel, SpeedPanel } from "./panels";
import { VideoFilterPanel } from "./FilterPanel";
import { ArFilterPanel, BeautyPanel, RetouchPanel, dragToOp } from "./FacePanels";
import { LoadingLayer, PercentDialog, SaveResult, Toast, useToast } from "./ui";
import { SaveConfirm, ShareBar } from "./SaveConfirm";

export interface DevInit { sample?: boolean; tab?: string; save?: boolean; share?: boolean; filter?: string; speed?: number; reverse?: boolean; sticker?: number; music?: boolean }

/** Thumbnails of `count` evenly spaced frames in [start, end] (Glide video frames for the effect strip / face list). */
async function frameThumbs(url: string, start: number, end: number, count: number, size: number): Promise<string[]> {
  const v = document.createElement("video");
  v.muted = true; v.preload = "auto"; v.src = url;
  await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error("v")); });
  const c = document.createElement("canvas");
  const s = (size * 2) / Math.min(v.videoWidth, v.videoHeight);
  c.width = Math.round(v.videoWidth * s); c.height = Math.round(v.videoHeight * s);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    await new Promise<void>((res) => { v.onseeked = () => res(); v.currentTime = (start + ((end - start) * (i + 0.5)) / count) / 1000; });
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    out.push(c.toDataURL("image/jpeg", 0.6));
  }
  v.removeAttribute("src"); v.load();
  return out;
}

function faceThumb(snap: HTMLCanvasElement, f: FaceData): string {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (let i = 0; i < 478; i++) { const x = f.points[i * 3], y = f.points[i * 3 + 1]; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const cx = ((x0 + x1) / 2) * snap.width, cy = ((y0 + y1) / 2) * snap.height;
  const s = Math.max((x1 - x0) * snap.width, (y1 - y0) * snap.height) * 1.2;
  const c = document.createElement("canvas");
  c.width = c.height = 72;
  c.getContext("2d")!.drawImage(snap, cx - s / 2, cy - s / 2, s, s, 0, 0, 72, 72);
  return c.toDataURL("image/jpeg", 0.8);
}

export function VideoEditScreen({ id, dev }: { id: string; dev?: DevInit }) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<VideoEngine | null>(null);
  const [size, setSize] = useState({ w: 390, h: 844 });
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [src, setSrc] = useState<{ url: string; duration: number; w: number; h: number } | null>(null);
  const [doc, setDoc] = useState<VDoc>(() => initialDoc(0));
  const [tab, setTab] = useState<TabId>("VideoEdit");
  const [twoDepth, setTwoDepth] = useState<TabId | null>(null);
  const [draft, setDraft] = useState<VDoc | null>(null); // 2-depth tabs edit a draft; X restores
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [original, setOriginal] = useState(false);
  const [musicOpen, setMusicOpen] = useState(false);
  const [leave, setLeave] = useState(false);
  const [toast, showToast] = useToast();
  const [tip5min, setTip5min] = useState(false);
  const [progress, setProgress] = useState<{ value: number; title: string; sub?: string; cancel?: () => void } | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text?: string } | null>(null);
  const [saved, setSaved] = useState<{ url: string; blob: Blob } | null>(null);
  const [shareBlob, setShareBlob] = useState<Blob | null>(null);
  const [faces, setFaces] = useState<FaceData[]>([]);
  const [faceReady, setFaceReady] = useState(false);
  const [stickerLoading, setStickerLoading] = useState<number | null>(null);
  const [stripThumbs, setStripThumbs] = useState<string[]>([]);
  const [faceThumbs, setFaceThumbs] = useState<string[]>([]);
  const [selFace, setSelFace] = useState(0);
  const [brush, setBrush] = useState(2);
  const [redo, setRedo] = useState<VDoc["retouch"][]>([]);
  const [retouchTip, setRetouchTip] = useState<string | null>(null);

  const live = draft ?? doc;
  const sticker = useMemo(() => {
    const s = findSticker(live.stickerId);
    return s?.json ? new StickerRuntime(parseSticker(s.json, STICKER_BASE)) : null;
  }, [live.stickerId]);

  /* ---------------------------------------------------------------- frame size */
  useLayoutEffect(() => {
    const el = rootRef.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---------------------------------------------------------------- load */
  useEffect(() => {
    let alive = true;
    let url = "";
    (async () => {
      let blob: Blob | undefined;
      if (dev?.sample) blob = await fetch(`${BASE}/video/sample.mp4`).then((r) => r.blob()).catch(() => undefined);
      else blob = (await getPhoto(id).catch(() => undefined))?.blob;
      if (!alive) return;
      if (!blob || !blob.type.startsWith("video/")) { setStatus("error"); return; }
      url = URL.createObjectURL(blob);
      const v = document.createElement("video");
      v.preload = "metadata"; v.muted = true; v.src = url;
      await new Promise<void>((res, rej) => { v.onloadedmetadata = () => res(); v.onerror = () => rej(new Error("v")); });
      if (!alive) return;
      const duration = Math.round(v.duration * 1000);
      setSrc({ url, duration, w: v.videoWidth, h: v.videoHeight });
      const d0 = initialDoc(duration);
      if (dev?.filter) d0.filter = { key: dev.filter, strength: 0.8 };
      if (dev?.speed) d0.speed = dev.speed;
      if (dev?.sticker) d0.stickerId = dev.sticker;
      setDoc(d0);
      if (duration > MAX_MS) setTip5min(true);
      setStatus("ok");
    })().catch(() => alive && setStatus("error"));
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [id, dev?.sample, dev?.filter, dev?.speed, dev?.sticker]);

  /* ---------------------------------------------------------------- engine */
  useEffect(() => {
    if (!src || !canvasRef.current) return;
    let eng: VideoEngine;
    try { eng = new VideoEngine(canvasRef.current, src.url, { doc: initialDoc(src.duration), sticker: null }); } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- WebGL unavailable
      setStatus("error");
      return;
    }
    engineRef.current = eng;
    eng.onTime = (ms) => setPos(ms);
    eng.onPlayState = (p) => setPlaying(p);
    let lastN = -1;
    eng.onFaces = (f) => { setFaceReady(true); if (f.length !== lastN) { lastN = f.length; setFaces(f); } };
    void eng.ready().then(() => { eng.seek(0); eng.play(); }).catch(() => setStatus("error"));
    return () => { eng.dispose(); engineRef.current = null; };
  }, [src]);

  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.setParams({ doc: live, sticker, original, track: !!twoDepth || tab === "Frame" });
    if (sticker) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sticker resources start loading
      setStickerLoading(live.stickerId);
      void eng.renderer.face.preloadSticker(sticker).catch(() => undefined).finally(() => setStickerLoading(null));
    }
  }, [live, sticker, original, src, twoDepth, tab]);

  // effect strip / face list thumbnails
  useEffect(() => {
    if (!src || tab !== "Effect") return;
    let alive = true;
    void frameThumbs(src.url, doc.start, doc.end, 12, 28).then((t) => alive && setStripThumbs(t)).catch(() => undefined);
    return () => { alive = false; };
  }, [src, tab, doc.start, doc.end]);
  useEffect(() => {
    if (twoDepth !== "Retouch" || !faces.length || !engineRef.current) return;
    const snap = engineRef.current.snapshot(720);
    const all = engineRef.current.faces;
    const sorted = [...all].sort((a, b) => a.points[3] - b.points[3]);
    setFaceThumbs(sorted.map((f) => faceThumb(snap, f)));
  }, [twoDepth, faces]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") (window as unknown as { __ve?: unknown }).__ve = { faces: faces.length, faceReady, pos, playing, reverse: live.reverse, filter: live.filter.key, sticker: live.stickerId, retouch: live.retouch.length };
  });

  // 5-minute tooltip (tooltip_textview) fades after 3 s
  useEffect(() => { if (!tip5min) return; const t = window.setTimeout(() => setTip5min(false), 3000); return () => window.clearTimeout(t); }, [tip5min]);

  /* ---------------------------------------------------------------- doc ops */
  const update = useCallback((fn: (d: VDoc) => VDoc) => {
    if (draft) setDraft((x) => (x ? fn(x) : x));
    else setDoc(fn);
  }, [draft]);

  const setReverse = async (on: boolean) => {
    const eng = engineRef.current;
    if (!eng || !src) return;
    if (!on) { eng.setReverse(null); update((x) => ({ ...x, reverse: false })); eng.seek(live.start); eng.play(); return; }
    eng.pause();
    const signal = { cancelled: false };
    setProgress({ value: 0, title: STR.reversePopup, cancel: () => { signal.cancelled = true; setProgress(null); } });
    try {
      const r = await decodeReverse(src.url, live.start, live.end, (p) => setProgress((x) => (x ? { ...x, value: p } : x)), signal);
      eng.setReverse(r);
      update((x) => ({ ...x, reverse: true }));
      setProgress(null);
      if (!live.muted) showToast(STR.reverseMute);
      eng.play();
    } catch {
      setProgress(null);
      if (!signal.cancelled) showToast(STR.reverseFail);
    }
  };

  /* ---------------------------------------------------------------- tabs */
  const openTab = (t: TabId) => {
    const def = TABS.find((x) => x.id === t)!;
    if (def.twoDepth) {
      setDraft(doc);
      setTwoDepth(t);
      setRedo([]);
      if (t === "Retouch") setRetouchTip(STR.manualTooltip);
      void engineRef.current?.ensureTracker().then(() => setFaceReady(true)).catch(() => showToast(STR.unsupported));
      return;
    }
    setTab(t);
    if (t === "Frame" || t === "Reshape") void engineRef.current?.ensureTracker().catch(() => undefined);
  };
  const closeTwoDepth = (keep: boolean) => {
    if (keep && draft) setDoc(draft);
    setDraft(null);
    setTwoDepth(null);
    setOriginal(false);
  };
  useEffect(() => {
    if (status !== "ok" || !dev?.tab) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- dev deep link
    if (dev.tab in { Reshape: 1, Retouch: 1 }) { setDraft(doc); setTwoDepth(dev.tab as TabId); if (dev.tab === "Retouch") setRetouchTip(STR.manualTooltip); void engineRef.current?.ensureTracker().then(() => setFaceReady(true)).catch(() => undefined); }
    else setTab(dev.tab as TabId);
    if (dev.music) setMusicOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, dev?.tab, dev?.music, src]);

  /* ---------------------------------------------------------------- export */
  const runExport = async (share: boolean) => {
    const eng = engineRef.current;
    if (!eng) return null;
    eng.pause();
    const signal = { cancelled: false };
    const long = (live.end - live.start) / live.speed > 60_000;
    setProgress({ value: 0, title: share ? STR.exporting : STR.saveTitle, sub: share ? undefined : long ? STR.saveLongSub : STR.saveSub, cancel: () => { signal.cancelled = true; } });
    try {
      const out = await eng.export((p) => setProgress((x) => (x ? { ...x, value: p } : x)), signal);
      setProgress(null);
      return out;
    } catch {
      setProgress(null);
      if (!signal.cancelled) { setResult({ ok: false }); window.setTimeout(() => setResult(null), 3000); }
      return null;
    }
  };
  const onSave = async () => {
    const out = await runExport(false);
    if (!out) { engineRef.current?.play(); return; }
    try {
      await savePhoto(out.blob, out.width, out.height, "B612", { duration: out.duration });
    } catch {
      setResult({ ok: false }); window.setTimeout(() => setResult(null), 3000);
      return;
    }
    setResult({ ok: true });
    window.setTimeout(() => { setResult(null); setSaved({ url: URL.createObjectURL(out.blob), blob: out.blob }); }, 1500);
  };
  const onShare = async () => {
    const out = await runExport(true);
    if (out) setShareBlob(out.blob);
    else engineRef.current?.play();
  };
  useEffect(() => () => { if (saved) URL.revokeObjectURL(saved.url); }, [saved]);
  const setReverseRef = useRef(setReverse);
  useEffect(() => { setReverseRef.current = setReverse; });
  const devRan = useRef(false);
  const saveRef = useRef(onSave);
  const shareRef = useRef(onShare);
  useEffect(() => { saveRef.current = onSave; shareRef.current = onShare; });
  useEffect(() => {
    if (status !== "ok" || devRan.current || !(dev?.save || dev?.share)) return;
    devRan.current = true;
    const t = window.setTimeout(() => { if (dev.reverse) void setReverseRef.current(true).then(() => (dev.save ? saveRef.current() : shareRef.current())); else void (dev.save ? saveRef.current() : shareRef.current()); }, 2500);
    return () => window.clearTimeout(t);
  }, [status, dev]);
  useEffect(() => {
    if (status !== "ok" || !dev?.reverse || dev.save || dev.share) return;
    const t = window.setTimeout(() => void setReverseRef.current(true), 2500);
    return () => window.clearTimeout(t);
  }, [status, dev]);

  /* ---------------------------------------------------------------- back */
  const finish = useCallback(() => {
    if (window.history.length > 1) router.back();
    else router.push("/gallery");
  }, [router]);
  const onBack = useCallback(() => {
    if (shareBlob) return setShareBlob(null);
    if (musicOpen) return setMusicOpen(false);
    if (twoDepth) return closeTwoDepth(false);
    if (src && docModified(doc, src.duration)) return setLeave(true);
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareBlob, musicOpen, twoDepth, doc, src, finish]);
  // hardware back (VideoEditFragment.onBackPressed): dialogs / share bar / music list / the saved page register their
  // own handlers above this one; here: 2-depth page (Beauty / Reshape) → leave (with the leave dialog when modified)
  useBackHandler(() => {
    if (progress) return; // saving / reversing: the percent dialog keeps the screen
    onBack();
  }, !saved);

  /* ---------------------------------------------------------------- geometry */
  const W = size.w, H = size.h;
  const previewH = H - TAB_H;
  const [rw, rh] = src ? rotatedSize(src.w, src.h, live.rotation) : [9, 16];
  const scale = Math.min(W / rw, previewH / rh);
  const pw = Math.round(rw * scale), ph = Math.round(rh * scale);
  const px = (W - pw) / 2, py = (previewH - ph) / 2;
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.max(1, Math.round(pw * dpr));
    c.height = Math.max(1, Math.round(ph * dpr));
  }, [pw, ph]);

  /* ---------------------------------------------------------------- retouch drag */
  const dragRef = useRef<{ from: [number, number]; base: VDoc["retouch"] } | null>(null);
  const sortedFaces = useMemo(() => [...faces].sort((a, b) => a.points[3] - b.points[3]), [faces]);
  const onPreviewDown = (e: React.PointerEvent) => {
    if (twoDepth !== "Retouch") { if (!twoDepth) engineRef.current?.toggle(); return; }
    setRetouchTip(null);
    const f = sortedFaces[selFace];
    if (!f) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dragRef.current = { from: [e.clientX - r.left, e.clientY - r.top], base: live.retouch };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    engineRef.current?.pause();
  };
  const onPreviewMove = (e: React.PointerEvent) => {
    const dr = dragRef.current;
    const f = sortedFaces[selFace];
    if (!dr || !f) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const op = dragToOp(f, pw, ph, dr.from, [e.clientX - r.left, e.clientY - r.top], brush);
    update((x) => ({ ...x, retouch: [...dr.base, op] }));
  };
  const onPreviewUp = () => { if (dragRef.current) { dragRef.current = null; setRedo([]); } };

  /* ---------------------------------------------------------------- render */
  const tabDef = TABS.find((t) => t.id === tab)!;
  const showMenus = !twoDepth;
  const selectSticker = (s: Sticker | null) => update((x) => ({ ...x, stickerId: s?.id ?? null }));

  return (
    <div ref={rootRef} className="absolute inset-0 select-none overflow-hidden bg-black" data-video-edit>
      {/* preview_root_layout */}
      <div className="absolute" style={{ left: px, top: py, width: pw, height: ph, touchAction: "none" }} onPointerDown={onPreviewDown} onPointerMove={onPreviewMove} onPointerUp={onPreviewUp} onPointerCancel={onPreviewUp} data-preview>
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      </div>
      {/* play_icon_imageview (edit_video_effect_play, padding 5) */}
      {status === "ok" && !playing && !twoDepth && !progress && (
        <div className="pointer-events-none absolute flex items-center justify-center" style={{ left: px, top: py, width: pw, height: ph }}>
          <img src={d("edit_video_effect_play")} alt="" style={{ width: 60, height: 60, padding: 5, boxSizing: "content-box" }} draggable={false} />
        </div>
      )}
      {/* tooltip_textview: 16dp white, shadow #4c000000 r4, 62dp above the guideline, 20%..80% */}
      {tip5min && <div className="pointer-events-none absolute truncate text-center text-white" style={{ left: "20%", right: "20%", bottom: TAB_H + 62, fontSize: 16, textShadow: "0 0 4px rgba(0,0,0,0.3)" }}>{STR.tooltip5min}</div>}

      {/* layout_video_edit_top_menu */}
      {showMenus && (
        <div className="absolute inset-x-0 top-0 flex items-center" style={{ height: 52, background: "linear-gradient(to bottom, rgba(0,0,0,0.2), transparent)" }}>
          <button type="button" onClick={onBack} aria-label="Back" style={{ marginLeft: 8, width: 34, height: 34 }}>
            <img src={d("icon_edit_top_back_shadow")} alt="" style={{ width: 34, height: 34 }} draggable={false} />
          </button>
          <div className="flex-1" />
          <button type="button" aria-label="Sound" onClick={() => update((x) => ({ ...x, muted: !x.muted }))} style={{ width: 34, height: 34, marginRight: 12 }}>
            <img src={d(live.muted || live.reverse ? "icon_video_top_sound_off_shadow" : "icon_video_top_sound_on_shadow")} alt="" style={{ width: 34, height: 34 }} draggable={false} />
          </button>
          <button type="button" aria-label="Rotate" onClick={() => update((x) => ({ ...x, rotation: (((x.rotation + 90) % 360) as Rotation) }))} style={{ width: 34, height: 34, marginRight: 12 }}>
            <img src={d("icon_video_top_rotation_shadow")} alt="" style={{ width: 34, height: 34 }} draggable={false} />
          </button>
          <button type="button" aria-label="Share" onClick={() => void onShare()} style={{ width: 34, height: 34, marginRight: 12 }}>
            <img src={d("icon_edit_top_share_shadow")} alt="" style={{ width: 34, height: 34 }} draggable={false} />
          </button>
          <button type="button" onClick={() => void onSave()} className="flex items-center text-white" style={{ height: 32, padding: "0 15px", marginRight: 8, borderRadius: 18, background: PRIMARY, fontSize: 14 }}>{STR.save}</button>
        </div>
      )}

      {/* feature areas (between bottom_menu_guideline and the menu bar). The full-height box itself must not take
          touches, or it swallows the top menu (Back / Sound / Rotate / Share / SAVE) and the preview tap. */}
      {status === "ok" && src && showMenus && (
        <div className="pointer-events-none absolute inset-x-0 [&>*]:pointer-events-auto" style={{ top: 0, bottom: MENU_H }}>
          {tab === "VideoEdit" && (
            <TrimPanel
              url={src.url} width={W} duration={src.duration} start={live.start} end={live.end} pos={pos} speed={live.speed}
              top={H - TAB_H + 52}
              onStart={() => engineRef.current?.pause()}
              onMove={(s, e, edge) => { update((x) => ({ ...x, start: s, end: e })); engineRef.current?.seek(edge === "L" ? s : e); }}
              onEnd={(s, e) => {
                update((x) => ({ ...x, start: s, end: e }));
                const eng = engineRef.current;
                if (eng) { if (live.reverse) { void setReverse(true); return; } eng.seek(s); eng.play(); }
              }}
            />
          )}
          {tab === "Speed" && (
            <SpeedPanel
              speed={live.speed} reverse={live.reverse} durationMs={live.end - live.start}
              onSpeed={(s) => update((x) => ({ ...x, speed: s }))}
              onSpeedCommit={(s) => { update((x) => ({ ...x, speed: s })); engineRef.current?.seek(live.start); engineRef.current?.play(); }}
              onReverse={(on) => void setReverse(on)}
            />
          )}
          {tab === "Music" && <MusicPanel onChoose={() => { setMusicOpen(true); }} />}
          {tab === "Filter" && (
            <VideoFilterPanel
              value={live.filter}
              onChange={(f) => update((x) => ({ ...x, filter: f }))}
              onCommit={(f) => update((x) => ({ ...x, filter: f }))}
              onToast={showToast}
            />
          )}
          {tab === "Effect" && <EffectPanel thumbs={stripThumbs} pos={pos} start={live.start} end={live.end} width={W} onSeek={(ms) => { engineRef.current?.pause(); engineRef.current?.seek(ms); }} />}
          {tab === "Frame" && <ArFilterPanel selectedId={live.stickerId} loadingId={stickerLoading} onSelect={selectSticker} />}
        </div>
      )}

      {/* video_edit_feature_menu_recycler_view (52dp; 58dp cells, 44dp BottomTabImageView: 100% selected / 40% alpha) */}
      {showMenus && (
        <div className="no-scrollbar absolute inset-x-0 bottom-0 flex overflow-x-auto bg-black" style={{ height: MENU_H }}>
          {TABS.map((t) => {
            const on = t.id === tabDef.id;
            return (
              <button key={t.id} type="button" aria-label={t.title} data-tab={t.id} onClick={() => openTab(t.id)} className="flex flex-none items-center justify-center" style={{ width: 58, height: MENU_H }}>
                <span style={{ width: 44, height: 44, background: "#ffffff", opacity: on ? 1 : 0.4, WebkitMaskImage: `url(${d(t.icon)})`, maskImage: `url(${d(t.icon)})`, WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", WebkitMaskPosition: "center", maskPosition: "center" }} />
              </button>
            );
          })}
        </div>
      )}

      {/* two_depth_fragment_container */}
      {twoDepth === "Reshape" && draft && (
        <BeautyPanel
          value={draft.reshape} faces={faces} faceReady={faceReady} playing={playing} pos={pos} start={live.start} end={live.end}
          onToggle={() => engineRef.current?.toggle()} onSeek={(ms) => { engineRef.current?.pause(); engineRef.current?.seek(ms); }}
          onChange={(r: Reshape) => setDraft((x) => (x ? { ...x, reshape: r } : x))} onOriginal={setOriginal}
          onClose={() => closeTwoDepth(false)} onConfirm={() => closeTwoDepth(true)}
        />
      )}
      {twoDepth === "Retouch" && draft && (
        <RetouchPanel
          faces={sortedFaces} faceReady={faceReady} thumbs={faceThumbs} selFace={selFace} onSelFace={setSelFace} brush={brush} onBrush={setBrush}
          canUndo={draft.retouch.length > 0} canRedo={redo.length > 0}
          onUndo={() => { const last = draft.retouch; setRedo((r) => [...r, last]); setDraft((x) => (x ? { ...x, retouch: x.retouch.slice(0, -1) } : x)); }}
          onRedo={() => { const r = redo[redo.length - 1]; if (!r) return; setRedo((q) => q.slice(0, -1)); setDraft((x) => (x ? { ...x, retouch: r } : x)); }}
          onOriginal={setOriginal} playing={playing} pos={pos} start={live.start} end={live.end}
          onToggle={() => engineRef.current?.toggle()} onSeek={(ms) => { engineRef.current?.pause(); engineRef.current?.seek(ms); }}
          onClose={() => closeTwoDepth(false)} onConfirm={() => closeTwoDepth(true)}
          onRetry={() => { setFaceReady(false); window.setTimeout(() => setFaceReady(true), 600); }}
          tip={retouchTip}
        />
      )}

      {musicOpen && <MusicList onClose={() => setMusicOpen(false)} />}

      {status === "loading" && <LoadingLayer />}
      {status === "error" && (
        <AlertDialog message="Unable to load item. Please try again." onOk={finish} />
      )}
      {progress && <PercentDialog value={progress.value} title={progress.title} sub={progress.sub} onCancel={progress.cancel} />}
      {result && <SaveResult ok={result.ok} text={result.text} />}
      {leave && <ConfirmDialog message={STR.leave} cancel={STR.cancel} ok={STR.leaveOk} onCancel={() => setLeave(false)} onOk={finish} />}
      <ShareBar open={!!shareBlob} blob={shareBlob} onClose={() => { setShareBlob(null); engineRef.current?.play(); }} />
      {saved && <SaveConfirm url={saved.url} blob={saved.blob} onClose={() => { setSaved(null); engineRef.current?.play(); }} onBack={() => router.push("/gallery")} />}
      <Toast text={toast} />
      <style>{"@keyframes ve-spin { to { transform: rotate(360deg) } }"}</style>
    </div>
  );
}
