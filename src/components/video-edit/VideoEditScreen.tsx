"use client";

// Video editor: top bar (back · sound · rotate · share · Save), the preview (tap to play or pause), and a dock with
// the active tab's panel over the tab bar. Face shape and Liquify open as full tool pages. Saving shows a progress
// card, then the Saved page.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, Icon, IconButton, cx, toast } from "@/components/ui";
import { useBackHandler } from "@/lib/back";
import { getAsset } from "@/lib/assets";
import { getPhoto, savePhoto } from "@/lib/store";
import { StickerRuntime, parseSticker, type FaceData } from "@/lib/face";
import { STICKER_BASE, findSticker, type Sticker } from "@/data/camera/stickers";
import { VideoEngine, decodeReverse, rotatedSize } from "./engine";
import { DOCK_H, MAX_MS, STR, TABS, TAB_H, docModified, initialDoc, type Reshape, type Rotation, type TabId, type VDoc } from "./model";
import { TrimPanel } from "./TrimPanel";
import { MusicList, MusicPanel, SpeedPanel } from "./panels";
import { VideoFilterPanel } from "./FilterPanel";
import { VideoEffectsPanel } from "./EffectsPanel";
import { ArFilterPanel, BeautyPanel, RetouchPanel, dragToOp } from "./FacePanels";
import { LoadingLayer, PercentDialog } from "./ui";
import { SaveConfirm, ShareBar } from "./SaveConfirm";

const TOP_H = 52;
const PANEL_H = DOCK_H - TAB_H;

export interface DevInit { sample?: boolean; tab?: string; save?: boolean; share?: boolean; filter?: string; fx?: string; speed?: number; reverse?: boolean; sticker?: number; music?: boolean }

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
  const [tip5min, setTip5min] = useState(false);
  const [progress, setProgress] = useState<{ value: number; title: string; sub?: string; cancel?: () => void } | null>(null);
  const [saved, setSaved] = useState<{ url: string; blob: Blob } | null>(null);
  const [shareBlob, setShareBlob] = useState<Blob | null>(null);
  const [faces, setFaces] = useState<FaceData[]>([]);
  const [faceReady, setFaceReady] = useState(false);
  const [stickerLoading, setStickerLoading] = useState<number | null>(null);
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
      if (dev?.sample) blob = await fetch(getAsset("video", "clip-1")).then((r) => r.blob()).catch(() => undefined);
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
      if (dev?.fx) d0.fx = { id: dev.fx, amount: 0.8 };
      setDoc(d0);
      if (duration > MAX_MS) setTip5min(true);
      setStatus("ok");
    })().catch(() => alive && setStatus("error"));
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [id, dev?.sample, dev?.filter, dev?.fx, dev?.speed, dev?.sticker]);

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

  // face thumbnails for the Liquify face picker
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

  // the 5-minute hint fades after 3 s
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
      if (!live.muted) toast(STR.reverseMute, { icon: "mute" });
      eng.play();
    } catch {
      setProgress(null);
      if (!signal.cancelled) toast(STR.reverseFail, { icon: "alert", tone: "danger" });
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
      void engineRef.current?.ensureTracker().then(() => setFaceReady(true)).catch(() => toast(STR.unsupported, { icon: "alert" }));
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
      if (!signal.cancelled) toast(STR.saveFail, { icon: "alert", tone: "danger" });
      return null;
    }
  };
  const onSave = async () => {
    const out = await runExport(false);
    if (!out) { engineRef.current?.play(); return; }
    try {
      await savePhoto(out.blob, out.width, out.height, undefined, { duration: out.duration });
    } catch {
      toast(STR.saveFail, { icon: "alert", tone: "danger" });
      return;
    }
    setSaved({ url: URL.createObjectURL(out.blob), blob: out.blob });
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
  // back key: dialogs, the share sheet, the music sheet and the Saved page register their own handlers above this
  // one; here: an open tool page, then leaving (asking first when there are unsaved edits)
  useBackHandler(() => {
    if (progress) return; // saving or reversing: the progress card keeps the screen
    onBack();
  }, !saved);

  /* ---------------------------------------------------------------- geometry */
  const W = size.w, H = size.h;
  // the preview fits between the top bar and the dock (or the taller tool page)
  const bottomH = twoDepth ? 236 : DOCK_H;
  const areaH = Math.max(1, H - TOP_H - bottomH - 16);
  const [rw, rh] = src ? rotatedSize(src.w, src.h, live.rotation) : [9, 16];
  const scale = Math.min((W - 24) / rw, areaH / rh);
  const pw = Math.round(rw * scale), ph = Math.round(rh * scale);
  const px = (W - pw) / 2, py = TOP_H + 8 + (areaH - ph) / 2;
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
  const soundOff = live.muted || live.reverse;

  return (
    <div ref={rootRef} className="absolute inset-0 select-none overflow-hidden bg-bg text-fg" data-video-edit>
      <div className="absolute inset-0" style={{ background: "radial-gradient(120% 80% at 50% 40%, var(--oe-panel), var(--oe-bg) 70%)" }} />
      {/* preview: tap to play / pause; drag on a face in Liquify */}
      <div className="absolute overflow-hidden rounded-md shadow-[0_8px_32px_rgba(0,0,0,0.45)]" style={{ left: px, top: py, width: pw, height: ph, touchAction: "none" }} onPointerDown={onPreviewDown} onPointerMove={onPreviewMove} onPointerUp={onPreviewUp} onPointerCancel={onPreviewUp} data-preview>
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      </div>
      {status === "ok" && !playing && !twoDepth && !progress && (
        <div className="pointer-events-none absolute flex items-center justify-center" style={{ left: px, top: py, width: pw, height: ph }}>
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-glass text-white backdrop-blur-md"><Icon name="play" size={30} filled /></span>
        </div>
      )}
      {tip5min && (
        <div className="pointer-events-none absolute inset-x-0 z-10 flex justify-center px-10" style={{ bottom: DOCK_H + 64 }}>
          <span className="rounded-md bg-glass px-3.5 py-2 text-center text-[13px] text-white backdrop-blur-md">{STR.tooltip5min}</span>
        </div>
      )}

      {/* top bar */}
      {showMenus && (
        <div className="absolute inset-x-0 top-0 z-30 flex items-center gap-1 bg-bg/95 px-2 backdrop-blur-md" style={{ height: TOP_H }}>
          <IconButton icon="back" label="Back" variant="raised" onClick={onBack} />
          <div className="flex flex-1 items-center justify-center gap-1">
            <IconButton icon={soundOff ? "mute" : "sound"} label={soundOff ? "Sound off" : "Sound on"} active={soundOff} disabled={live.reverse} onClick={() => update((x) => ({ ...x, muted: !x.muted }))} />
            <IconButton icon="rotate-right" label="Rotate" onClick={() => update((x) => ({ ...x, rotation: (((x.rotation + 90) % 360) as Rotation) }))} />
            <IconButton icon="share" label="Share" onClick={() => void onShare()} />
          </div>
          <Button size="sm" icon="save" className="h-10 rounded-full px-4" onClick={() => void onSave()}>{STR.save}</Button>
        </div>
      )}

      {/* dock: the active tab's panel over the tab bar */}
      {showMenus && (
        <div className="absolute inset-x-0 bottom-0 z-10 rounded-t-xl bg-panel shadow-[0_-8px_24px_rgba(0,0,0,0.35)]" style={{ height: DOCK_H }}>
          <div className="absolute inset-x-0 bottom-0 border-t border-line" style={{ height: TAB_H }}>
            <div role="tablist" aria-label="Video tools" className="no-scrollbar flex h-full items-stretch overflow-x-auto px-1.5">
              {TABS.map((t) => {
                const on = t.id === tabDef.id && !t.twoDepth;
                return (
                  <button
                    key={t.id} type="button" role="tab" aria-selected={on} data-tab={t.id} onClick={() => openTab(t.id)}
                    className={cx("oe-press relative flex w-[62px] flex-none flex-col items-center justify-center gap-1", on ? "text-fg" : "text-fg-3")}
                  >
                    <span className={cx("absolute top-0 h-[3px] w-6 rounded-b-full bg-accent transition-opacity", on ? "opacity-100" : "opacity-0")} />
                    <Icon name={t.icon} size={21} />
                    <span className="whitespace-nowrap text-[11px] font-medium">{t.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {status === "ok" && src && showMenus && (
        <>
          {tab === "VideoEdit" && (
            <TrimPanel
              url={src.url} width={W} duration={src.duration} start={live.start} end={live.end} pos={pos} speed={live.speed}
              bottom={TAB_H}
              onStart={() => engineRef.current?.pause()}
              onMove={(s, e, edge) => { update((x) => ({ ...x, start: s, end: e })); engineRef.current?.seek(edge === "L" ? s : e); }}
              onEnd={(s, e) => {
                update((x) => ({ ...x, start: s, end: e }));
                const eng = engineRef.current;
                if (eng) { if (live.reverse) { void setReverse(true); return; } eng.seek(s); eng.play(); }
              }}
            />
          )}
          {tab === "Filter" && (
            <VideoFilterPanel
              value={live.filter} sliderBottom={DOCK_H} panelBottom={TAB_H} panelH={PANEL_H}
              onChange={(f) => update((x) => ({ ...x, filter: f }))}
              onCommit={(f) => update((x) => ({ ...x, filter: f }))}
            />
          )}
          {tab === "Effects" && (
            <VideoEffectsPanel
              value={live.fx} sliderBottom={DOCK_H} panelBottom={TAB_H} panelH={PANEL_H}
              snapshot={() => engineRef.current?.snapshot(360) ?? null} thumbKey={`${src.url}|${live.rotation}`}
              onChange={(f) => update((x) => ({ ...x, fx: f }))}
              onCommit={(f) => update((x) => ({ ...x, fx: f }))}
            />
          )}
          {(tab === "Speed" || tab === "Music" || tab === "Frame") && (
            <div className="absolute inset-x-0 z-20" style={{ bottom: TAB_H, height: PANEL_H }}>
              {tab === "Speed" && (
                <SpeedPanel
                  speed={live.speed} reverse={live.reverse} durationMs={live.end - live.start}
                  onSpeed={(s) => update((x) => ({ ...x, speed: s }))}
                  onSpeedCommit={(s) => { update((x) => ({ ...x, speed: s })); engineRef.current?.seek(live.start); engineRef.current?.play(); }}
                  onReverse={(on) => void setReverse(on)}
                />
              )}
              {tab === "Music" && <MusicPanel onChoose={() => { setMusicOpen(true); }} />}
              {tab === "Frame" && <ArFilterPanel selectedId={live.stickerId} loadingId={stickerLoading} onSelect={selectSticker} />}
            </div>
          )}
        </>
      )}

      {/* full tool pages */}
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
      <Dialog open={status === "error"} onClose={finish} icon="video" title="Couldn't open this video">
        It may have been deleted, or this browser can&apos;t play it.
      </Dialog>
      {progress && <PercentDialog value={progress.value} title={progress.title} sub={progress.sub} onCancel={progress.cancel} />}
      <Dialog open={leave} onClose={() => setLeave(false)} icon="trash" destructive title={STR.leaveTitle} confirm={STR.leaveOk} cancel={STR.cancel} onConfirm={finish}>
        {STR.leave}
      </Dialog>
      <ShareBar open={!!shareBlob} blob={shareBlob} onClose={() => { setShareBlob(null); engineRef.current?.play(); }} />
      {saved && <SaveConfirm url={saved.url} blob={saved.blob} onClose={() => { setSaved(null); engineRef.current?.play(); }} onBack={() => router.push("/gallery")} />}
    </div>
  );
}
