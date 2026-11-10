"use client";

// Photo editor shell: top bar (back · undo / redo · layers · Save), the zoomable preview, the dock with the active
// tab's panel and the tab bar, and the tool pages that replace the dock (their Cancel / title / Apply bar is portalled
// into the top bar). Saving shows the Saved page with sharing.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Icon, IconButton, Spinner, cx, toast } from "@/components/ui";
import { useBackHandler } from "@/lib/back";
import { getPhoto, savePhoto } from "@/lib/store";
import { EditCtx, type EditCtxValue, type PreviewTool, type Rect, type Sub } from "./ctx";
import { initialDoc, NOT_ON_WEB, PORTRAIT, TABS, TOOLS, type Doc, type TabId } from "./model";
import { composite, decodeToCanvas, exportDoc, loadFonts, Preview, stampImage } from "./pipeline";
import { AlertDialog, MENU, TAB_H, TOP_H } from "./ui";
import { sampleBlob } from "./devSample";
import { SavedImage, SavedPage } from "./SavedPage";
import { FilterPanel } from "./panels/Filter";
import { EffectsPanel } from "./panels/Effects";
import { AdjustPanel, CurvesPanel, HslPanel, SplitPanel } from "./panels/Adjust";
import { CropTool, ToolsPanel } from "./panels/Tools";
import { AutoSkinPanel, PortraitPanel, SkinTonePanel } from "./panels/Portrait";
import { detectFaces, detectPose, faceEditActive, nonZero, peekFaces, peekPose } from "./tools/portrait/faceEngine";
import { BorderPanel } from "./panels/Border";
import { BrushAddPage, LayerAdjustPage, LayerEraserPage, LayerGizmo, LayerListPopup, LayerPanel, StampAddPage, TextAddPage } from "./panels/Layers";
import { ArFilterPanel } from "./panels/ArFilter";
import { ExtSub, isExtSub } from "./tools/ExtSub";

// pinch zoom limits, relative to the fitted size
const MAX_ZOOM = 16, MIN_ZOOM = 0.4;

/** Dev-only init (headless proofs). */
export interface DevInit { sample: boolean; tab?: string; sub?: string; adjust?: string; filter?: string; save?: boolean; share?: boolean }

const photoKey = (doc: Doc) => JSON.stringify([doc.base, doc.filter, doc.adjust, doc.curves, doc.hsl, doc.split, doc.beauty, doc.fx]);
const scaleText = (s: number) => (s >= 1 ? `${Math.round(s * 100)}%` : `${(Math.round(s * 1000) / 10).toFixed(1)}%`);

/** `?tool=` values that open a tool page straight away (tools by key, portrait pages by id). */
function toolTarget(tool: string | undefined): { tab: TabId; sub: Sub } | null {
  if (!tool) return null;
  if (tool === "crop") return { tab: "TOOLS", sub: "crop" };
  if (TOOLS.some((t) => t.key === tool)) return { tab: "TOOLS", sub: `x:${tool}` };
  const p = PORTRAIT.find((x) => x.key === tool.toUpperCase());
  if (p) return { tab: "PORTRAIT", sub: p.key === "RETOUCH_AUTO" ? "autoskin" : p.key === "SKINTONE" ? "skintone" : `x:${p.key}` };
  return null;
}

interface Zoom { s: number; x: number; y: number }
const NO_ZOOM: Zoom = { s: 1, x: 0, y: 0 };

export function EditScreen({ id, tool, dev }: { id: string; tool?: string; dev?: DevInit }) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const outRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<Preview | null>(null);
  const bases = useRef<HTMLCanvasElement[]>([]);
  const lastKey = useRef("");
  const lastBase = useRef(-1);
  const toolRef = useRef<PreviewTool | null>(null);
  const idSeq = useRef(1);
  const target = useMemo(() => toolTarget(tool), [tool]);

  const [status, setStatus] = useState<"loading" | "ok" | "missing" | "video" | "error">("loading");
  const [originalUrl, setOriginalUrl] = useState("");
  const [hist, setHist] = useState<{ list: Doc[]; i: number }>(() => {
    const d0 = initialDoc();
    if (dev?.filter) d0.filter = { key: dev.filter, strength: 0.8 };
    return { list: [d0], i: 0 };
  });
  const [live, setLiveState] = useState<Doc | null>(null);
  const doc = live ?? hist.list[hist.i];
  // Start on Tools (or the requested tool); switch to Portrait once a face is found unless the user picked a tab.
  const [tab, setTabState] = useState<TabId>(() => (dev?.tab && TABS.some((t) => t.id === dev.tab) ? dev.tab as TabId : target?.tab ?? "TOOLS"));
  const [prevTab, setPrevTab] = useState<TabId>("TOOLS");
  const tabPicked = useRef(!!target || !!dev?.tab);
  const [sub, setSub] = useState<Sub>(() => (dev?.sub as Sub) ?? null);
  const [selected, setSelected] = useState<number | null>(null);
  const [original, setOriginal] = useState(false);
  const [size, setSize] = useState({ w: 360, h: 640 });
  const [frame, setFrame] = useState({ fw: 1, fh: 1 });
  const [tick, setTick] = useState(0);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ url: string; blob: Blob } | null>(null);
  const [layerPopup, setLayerPopup] = useState(false);
  const [zoom, setZoom] = useState<Zoom>(NO_ZOOM);
  const [showScale, setShowScale] = useState(false);
  const [barSlot, setBarSlot] = useState<HTMLDivElement | null>(null);

  /* ---------------------------------------------------------------- load */
  useEffect(() => {
    let alive = true;
    let url = "";
    (async () => {
      let blob: Blob | undefined;
      if (dev?.sample) blob = await sampleBlob().catch(() => undefined);
      else {
        const p = await getPhoto(id).catch(() => undefined);
        if (p?.blob.type.startsWith("video/")) { if (alive) setStatus("video"); return; }
        blob = p?.blob;
      }
      if (!alive) return;
      if (!blob) return setStatus("missing");
      try {
        const base = await decodeToCanvas(blob);
        if (!alive) return;
        bases.current = [base];
        setFrame({ fw: base.width, fh: base.height });
        url = URL.createObjectURL(blob);
        setOriginalUrl(url);
        const pv = new Preview();
        previewRef.current = pv;
        await Promise.all([pv.ready, loadFonts()]);
        if (!alive) return;
        setStatus("ok");
        if (target && !dev?.sub) setSub(target.sub);
        if (!tabPicked.current)
          detectFaces(base)
            .then((d) => { if (alive && d.faces.length && !tabPicked.current) setTabState("PORTRAIT"); })
            .catch(() => {});
      } catch {
        if (alive) setStatus("error");
      }
    })();
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
      previewRef.current?.dispose();
      previewRef.current = null;
    };
  }, [id, dev?.sample, dev?.sub, target]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [status]);

  /* ---------------------------------------------------------------- render */
  const rerender = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    if (status !== "ok") return;
    const raf = requestAnimationFrame(() => {
      const pv = previewRef.current, out = outRef.current;
      const base = bases.current[doc.base];
      if (!pv || !out || !base) return;
      if (lastBase.current !== doc.base) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        pv.setBase(base, Math.min(1600, Math.max(size.w, size.h) * dpr));
        lastBase.current = doc.base;
        lastKey.current = "";
      }
      // A new base (crop, rotate, erase, expand...) keeps the face edits: analyse it right away so they stay applied.
      const fe = doc.beauty.face;
      if (faceEditActive(fe)) {
        const needPose = !!fe?.body && nonZero(fe.body) && !peekPose(base);
        if (!peekFaces(base) || needPose) {
          void Promise.all([detectFaces(base), needPose ? detectPose(base) : undefined]).then(() => {
            if (bases.current[lastBase.current] === base) { lastKey.current = ""; rerender(); }
          }).catch(() => {});
        }
      }
      const k = photoKey(doc);
      if (k !== lastKey.current) { pv.renderPhoto(doc, () => { lastKey.current = ""; rerender(); }); lastKey.current = k; }
      const [pw, ph] = pv.size;
      const g = composite(out, pv.gl, pw, ph, doc, rerender);
      if (g.fw !== frame.fw || g.fh !== frame.fh) setFrame({ fw: g.fw, fh: g.fh });
    });
    return () => cancelAnimationFrame(raf);
  }, [status, doc, size, tick, frame, rerender]);

  // preview area: between the top bar and the dock, with a small inset so the photo never touches the chrome
  const area = useMemo(() => ({ x: 0, y: TOP_H, w: size.w, h: Math.max(1, size.h - MENU - TOP_H) }), [size]);
  const fitRect: Rect = useMemo(() => {
    const pad = 12;
    const aw = area.w - pad * 2, ah = area.h - pad * 2;
    const k = Math.min(aw / frame.fw, ah / frame.fh);
    const w = frame.fw * k, h = frame.fh * k;
    return { x: area.x + (area.w - w) / 2, y: area.y + (area.h - h) / 2, w, h };
  }, [area, frame]);
  // displayed rect after pinch zoom / pan (screen = fit * s + t)
  const rect: Rect = useMemo(() => ({
    x: fitRect.x * zoom.s + zoom.x, y: fitRect.y * zoom.s + zoom.y, w: fitRect.w * zoom.s, h: fitRect.h * zoom.s,
  }), [fitRect, zoom]);
  const zoomed = zoom.s !== 1 || zoom.x !== 0 || zoom.y !== 0;

  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; });
  const animRaf = useRef(0);
  const animateZoom = useCallback((to: Zoom, ms: number) => {
    cancelAnimationFrame(animRaf.current);
    const from = zoomRef.current, t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms), e = 1 - (1 - t) * (1 - t);
      setZoom(t >= 1 ? to : { s: from.s + (to.s - from.s) * e, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e });
      if (t < 1) animRaf.current = requestAnimationFrame(step);
    };
    animRaf.current = requestAnimationFrame(step);
  }, []);
  useEffect(() => () => cancelAnimationFrame(animRaf.current), []);
  const resetZoom = useCallback(() => animateZoom(NO_ZOOM, 200), [animateZoom]);
  /** Zoom so that `r` (as displayed now) fills the preview area, centred. */
  const zoomTo = useCallback((r: Rect, ms = 300) => {
    if (r.w <= 0 || r.h <= 0) return;
    const z = zoomRef.current;
    const k0 = Math.min(area.w / r.w, area.h / r.h);
    const s = Math.min(MAX_ZOOM, z.s * k0), k = s / z.s;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    animateZoom({ s, x: k * (z.x - cx) + area.x + area.w / 2, y: k * (z.y - cy) + area.y + area.h / 2 }, ms);
  }, [area, animateZoom]);

  /* ---------------------------------------------------------------- history */
  const commit = useCallback((next: Doc) => {
    setHist((h) => ({ list: [...h.list.slice(0, h.i + 1), next], i: h.i + 1 }));
    setLiveState(null);
  }, []);
  const undo = useMemo(() => ({ auto: true, can: hist.i > 0, on: () => { setLiveState(null); setHist((h) => ({ ...h, i: Math.max(0, h.i - 1) })); } }), [hist.i]);
  const redo = useMemo(() => ({ auto: true, can: hist.i < hist.list.length - 1, on: () => { setLiveState(null); setHist((h) => ({ ...h, i: Math.min(h.list.length - 1, h.i + 1) })); } }), [hist.i, hist.list.length]);
  const modified = hist.i > 0;

  const setTab = useCallback((t: TabId) => {
    tabPicked.current = true;
    setLiveState(null);
    setSub(null);
    setLayerPopup(false);
    setPrevTab(tab);
    setTabState(t);
  }, [tab]);

  // switching features resets the preview zoom
  const [zoomKey, setZoomKey] = useState(`${tab}|${sub}`);
  if (zoomKey !== `${tab}|${sub}`) { setZoomKey(`${tab}|${sub}`); setZoom(NO_ZOOM); }
  useEffect(() => () => cancelAnimationFrame(animRaf.current), [zoomKey]);

  const ctx: EditCtxValue = {
    doc, setLive: setLiveState, commit, undo, redo, setOriginal, toast: (s) => toast(s), sub,
    openSub: (s) => { setLiveState(null); setSub(s); },
    tab, setTab, selected, select: setSelected, rect, frame,
    srcCanvas: () => previewRef.current?.src ?? null,
    photoCanvas: () => previewRef.current?.gl ?? null,
    originalUrl, bases, setTool: (t) => { toolRef.current = t; }, rerender,
    nextId: () => idSeq.current++,
    devAdjust: dev?.adjust,
    zoomTo,
    barSlot,
  };

  /* ---------------------------------------------------------------- preview pointer: tools + pinch zoom */
  const toFrame = (e: React.PointerEvent | PointerEvent): [number, number] => {
    const r = rootRef.current!.getBoundingClientRect();
    return [(e.clientX - r.left - rect.x) / rect.w, (e.clientY - r.top - rect.y) / rect.h];
  };
  const local = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = rootRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const pointers = useRef(new Map<number, [number, number]>());
  const gesture = useRef<null | { kind: "tool" } | { kind: "pan"; last: [number, number] } | { kind: "pinch"; d0: number; s0: number; b: [number, number] }>(null);
  const pinchInfo = () => {
    const [a, b] = [...pointers.current.values()];
    return { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as [number, number] };
  };
  const onPDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 2) {
      // a second finger ends a running tool stroke and starts pinching
      if (gesture.current?.kind === "tool") { const [x, y] = toFrame(e); toolRef.current?.up?.(x, y, e.nativeEvent); }
      const { d: dist, m } = pinchInfo();
      cancelAnimationFrame(animRaf.current);
      gesture.current = { kind: "pinch", d0: dist, s0: zoom.s, b: [(m[0] - zoom.x) / zoom.s, (m[1] - zoom.y) / zoom.s] };
      setShowScale(true);
      return;
    }
    if (pointers.current.size > 2) return;
    const t = toolRef.current;
    if (t?.down) {
      gesture.current = { kind: "tool" };
      const [x, y] = toFrame(e);
      t.down(x, y, e.nativeEvent);
    } else if (zoomed) gesture.current = { kind: "pan", last: local(e) };
    else gesture.current = null;
  };
  const onPMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, local(e));
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "tool") { const [x, y] = toFrame(e); toolRef.current?.move?.(x, y, e.nativeEvent); }
    else if (g.kind === "pan") {
      const p = local(e);
      setZoom((z) => ({ ...z, x: z.x + p[0] - g.last[0], y: z.y + p[1] - g.last[1] }));
      g.last = p;
    } else if (g.kind === "pinch" && pointers.current.size >= 2) {
      const { d: dist, m } = pinchInfo();
      const s = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, g.s0 * dist / g.d0));
      setZoom({ s, x: m[0] - g.b[0] * s, y: m[1] - g.b[1] * s });
    }
  };
  const onPUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g?.kind === "tool") { const [x, y] = toFrame(e); toolRef.current?.up?.(x, y, e.nativeEvent); gesture.current = null; }
    if (g?.kind === "pinch" && pointers.current.size < 2) {
      setShowScale(false);
      gesture.current = null;
      if (zoom.s < 1) resetZoom(); // zoomed out below the fit size: spring back
    }
    if (g?.kind === "pan" && pointers.current.size === 0) gesture.current = null;
  };
  // desktop: trackpad pinch arrives as ctrl + wheel
  const scaleTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    const el = rootRef.current?.querySelector<HTMLElement>("[data-preview]");
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const [mx, my] = local(e);
      setZoom((z) => {
        const s = Math.min(MAX_ZOOM, Math.max(1, z.s * Math.exp(-e.deltaY * 0.01)));
        const bx = (mx - z.x) / z.s, by = (my - z.y) / z.s;
        return s === 1 ? NO_ZOOM : { s, x: mx - bx * s, y: my - by * s };
      });
      setShowScale(true);
      window.clearTimeout(scaleTimer.current);
      scaleTimer.current = window.setTimeout(() => setShowScale(false), 1000);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [status, saved]);

  /* ---------------------------------------------------------------- back / save */
  const leave = () => {
    if (window.history.length > 1) router.back();
    else router.push("/gallery");
  };
  const exitFullPage = () => setTab(prevTab === "STICKER" ? "TOOLS" : prevTab);
  const onBack = () => {
    if (sub) { setSub(null); setLiveState(null); return; }
    if (modified) setConfirmLeave(true);
    else leave();
  };
  // back key: dialogs, sheets and pages register their own handlers above this one; here the layer list, then the
  // open tool page, then leaving (asking first when there are unsaved edits)
  useBackHandler(() => {
    if (status !== "ok") { router.push("/gallery"); return; }
    if (saving) return;
    if (layerPopup) { setLayerPopup(false); return; }
    onBack();
  }, !saved);
  const onSave = useCallback(async () => {
    if (saving) return;
    const base = bases.current[doc.base];
    if (!base) return;
    setSaving(true);
    try {
      doc.layers.forEach((l) => { if (l.kind === "stamp") stampImage(l.src); });
      const { blob, width, height } = await exportDoc(base, doc);
      await savePhoto(blob, width, height);
      setSaved({ url: URL.createObjectURL(blob), blob });
    } catch {
      toast("Couldn't save the photo. Please try again.", { icon: "alert", tone: "danger" });
    } finally {
      setSaving(false);
    }
  }, [saving, doc]);
  useEffect(() => () => { if (saved) URL.revokeObjectURL(saved.url); }, [saved]);
  const devSaved = useRef(false);
  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
  useEffect(() => {
    if (status !== "ok" || !dev?.save || devSaved.current) return;
    devSaved.current = true;
    window.setTimeout(() => void onSaveRef.current(), 1500);
  }, [status, dev?.save]);

  /* ---------------------------------------------------------------- tab bar: keep the active tab in view */
  const tabBarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = tabBarRef.current;
    const el = bar?.querySelector<HTMLElement>(`[data-tab="${tab}"]`);
    if (!bar || !el) return;
    bar.scrollTo({ left: el.offsetLeft + el.offsetWidth / 2 - bar.clientWidth / 2, behavior: "smooth" });
  }, [tab, status, sub, saved]);

  if (status !== "ok") {
    const msg = status === "video" ? { t: "This is a video", b: "Open it in the video editor instead." }
      : status === "missing" ? { t: "Photo not found", b: "It may have been deleted from the gallery." }
      : status === "error" ? { t: "Couldn't open this photo", b: NOT_ON_WEB } : null;
    return (
      <div ref={rootRef} className="absolute inset-0 flex flex-col bg-bg text-fg">
        <div className="flex items-center px-2" style={{ height: TOP_H }}>
          <IconButton icon="back" label="Back" variant="raised" onClick={() => router.push("/gallery")} />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-10 pb-16 text-center">
          {!msg ? <Spinner size={28} className="text-accent" /> : (
            <>
              <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-raised text-fg-2"><Icon name={status === "video" ? "video" : "image"} size={26} /></span>
              <div>
                <p className="font-display text-[18px] font-semibold">{msg.t}</p>
                <p className="mt-1 text-[14px] text-fg-3">{msg.b}</p>
              </div>
              <Button onClick={() => (status === "video" ? router.replace(`/video-edit?id=${encodeURIComponent(id)}`) : router.push("/gallery"))}>
                {status === "video" ? "Open video editor" : "Back to gallery"}
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  const layerCount = doc.layers.length;
  const isLayerTab = tab === "STAMP" || tab === "TEXT" || tab === "BRUSH";
  const fullPage = tab === "STICKER";
  const mainMode = !sub && !fullPage;

  return (
    <EditCtx.Provider value={ctx}>
      <div ref={rootRef} className="absolute inset-0 overflow-hidden bg-bg text-fg" style={{ touchAction: "none" }} data-editor>
        {/* preview: the whole root takes the gestures; the photo sits in the area between the bars */}
        <div
          data-preview
          className="absolute inset-0 overflow-hidden"
          style={{ touchAction: "none", background: "radial-gradient(120% 80% at 50% 40%, var(--oe-panel), var(--oe-bg) 70%)" }}
          onPointerDown={onPDown}
          onPointerMove={onPMove}
          onPointerUp={onPUp}
          onPointerCancel={onPUp}
        >
          <canvas
            ref={outRef}
            className="absolute shadow-[0_8px_32px_rgba(0,0,0,0.45)]"
            style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, visibility: original || sub === "crop" ? "hidden" : "visible" }}
          />
          {/* hold to compare: the untouched photo in the same place (max-width none so zoom isn't clamped) */}
          {original && originalUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={originalUrl} alt="" className="pointer-events-none absolute object-contain" draggable={false} style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, maxWidth: "none", maxHeight: "none" }} />
          )}
          {original && (
            <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full bg-glass px-3 py-1 text-[12px] font-semibold text-white backdrop-blur-md" style={{ top: TOP_H + 10 }}>Original</span>
          )}
        </div>

        {isLayerTab && !original && <LayerGizmo />}

        {showScale && (
          <div className="pointer-events-none absolute inset-x-0 z-30 flex items-center justify-center" style={{ top: TOP_H, bottom: MENU }}>
            <span className="tabular rounded-md bg-glass px-4 py-3 font-display text-[15px] font-semibold text-white backdrop-blur-md">{scaleText(zoom.s)}</span>
          </div>
        )}
        {zoomed && mainMode && (
          <button type="button" onClick={resetZoom} className="oe-press absolute left-1/2 z-30 flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full bg-glass px-3 text-[13px] font-semibold text-white backdrop-blur-md" style={{ top: TOP_H + 10 }}>
            <Icon name="full" size={15} /> Fit to screen
          </button>
        )}

        {/* dock: the active tab's panel above the tab bar */}
        {mainMode && (
          <div className="absolute inset-x-0 bottom-0 z-10 rounded-t-xl bg-panel shadow-[0_-8px_24px_rgba(0,0,0,0.35)]" style={{ height: MENU }}>
            <div className="absolute inset-x-0 bottom-0 border-t border-line" style={{ height: TAB_H }}>
              <div ref={tabBarRef} role="tablist" aria-label="Editor sections" className="no-scrollbar flex h-full items-stretch overflow-x-auto px-1.5">
                {TABS.map((t) => {
                  const on = tab === t.id;
                  return (
                    <button
                      key={t.id} data-tab={t.id} type="button" role="tab" aria-selected={on} onClick={() => setTab(t.id)}
                      className={cx("oe-press relative flex w-[62px] flex-none flex-col items-center justify-center gap-1 transition-colors", on ? "text-fg" : "text-fg-3")}
                    >
                      <span className={cx("absolute top-0 h-[3px] w-6 rounded-b-full bg-accent transition-opacity", on ? "opacity-100" : "opacity-0")} />
                      <Icon name={t.icon} size={21} />
                      <span className="text-[11px] font-medium">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {!sub && tab === "PORTRAIT" && <PortraitPanel />}
        {!sub && tab === "TOOLS" && <ToolsPanel />}
        {!sub && tab === "FILTER" && <FilterPanel />}
        {!sub && tab === "EFFECTS" && <EffectsPanel />}
        {!sub && tab === "ADJUST" && <AdjustPanel />}
        {!sub && tab === "STICKER" && <ArFilterPanel onExit={exitFullPage} />}
        {!sub && tab === "STAMP" && <LayerPanel kind="stamp" />}
        {!sub && tab === "TEXT" && <LayerPanel kind="text" />}
        {!sub && tab === "BRUSH" && <LayerPanel kind="brush" />}
        {!sub && tab === "BORDER" && <BorderPanel />}

        {sub === "crop" && <CropTool />}
        {sub === "curves" && <CurvesPanel />}
        {sub === "hsl" && <HslPanel />}
        {sub === "split" && <SplitPanel />}
        {sub === "autoskin" && <AutoSkinPanel />}
        {sub === "skintone" && <SkinTonePanel />}
        {sub === "stamp-add" && <StampAddPage />}
        {(sub === "text-add" || sub === "text-edit") && <TextAddPage key={sub} mode={sub === "text-add" ? "add" : "edit"} />}
        {sub === "brush-add" && <BrushAddPage />}
        {sub === "layer-adjust" && <LayerAdjustPage />}
        {sub === "layer-eraser" && <LayerEraserPage />}
        {isExtSub(sub) && <ExtSub key={sub} sub={sub} />}

        {/* top bar: the main commands, or the bar of the open tool page (portalled in) */}
        <div ref={setBarSlot} className="absolute inset-x-0 top-0 z-40 bg-bg/95 backdrop-blur-md" style={{ height: TOP_H }}>
          {mainMode && (
            <div className="flex h-full items-center gap-1 px-2">
              <IconButton icon="back" label="Back" variant="raised" onClick={onBack} />
              <div className="flex flex-1 items-center justify-center gap-1">
                <IconButton icon="undo" label="Undo" disabled={!undo.can} onClick={undo.on} />
                <IconButton icon="redo" label="Redo" disabled={!redo.can} onClick={redo.on} />
              </div>
              <IconButton icon="layers" label={`Layers (${layerCount})`} variant="raised" disabled={!layerCount} active={layerPopup} onClick={() => setLayerPopup((v) => !v)}>
                {layerCount > 0 && <span className="tabular absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-on-accent">{layerCount}</span>}
              </IconButton>
              <Button size="sm" icon="save" className="ml-1 h-10 rounded-full px-4" onClick={() => void onSave()}>Save</Button>
            </div>
          )}
        </div>
        {layerPopup && layerCount > 0 && mainMode && <LayerListPopup onClose={() => setLayerPopup(false)} />}

        {confirmLeave && (
          <AlertDialog
            icon="trash" destructive
            title="Discard your edits?"
            message="You haven't saved this photo yet. Leaving now throws the changes away."
            ok="Discard" cancel="Keep editing"
            onCancel={() => setConfirmLeave(false)}
            onOk={() => { setConfirmLeave(false); leave(); }}
          />
        )}

        {saving && (
          <div className="absolute inset-0 z-[90] flex items-center justify-center bg-scrim/40">
            <div className="flex items-center gap-3 rounded-lg bg-panel px-5 py-4 shadow-2xl ring-1 ring-line">
              <Spinner size={22} className="text-accent" />
              <span className="text-[15px] font-medium">Saving full size…</span>
            </div>
          </div>
        )}

        {saved && (
          <SavedPage
            blob={saved.blob}
            media={<SavedImage url={saved.url} />}
            initialShare={!!dev?.share}
            onClose={() => setSaved(null)}
            onDone={() => router.push("/gallery")}
          />
        )}
      </div>
    </EditCtx.Provider>
  );
}
