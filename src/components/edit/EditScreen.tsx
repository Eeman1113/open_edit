"use client";

// EPActivity / EditPhotoFragment (fragment_edit_photo.xml): preview (PinchZoomTextureView on #171717),
// top bar (back / layer / SAVE / Fit screen), tool content area (186dp) and the text tab bar
// (EPContentMenu) at the bottom. After SAVE: EditConfirmFragment ("Saved!" + ShareBar).
import { BASE } from "@/lib/base";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { d } from "@/components/ui/legacy-drawable";
import { useBackHandler } from "@/lib/back";
import { download, getPhoto, savePhoto } from "@/lib/store";
import { EditCtx, type EditCtxValue, type PreviewTool, type Rect, type Sub } from "./ctx";
import { initialDoc, NOT_ON_WEB, TABS, type Doc, type TabId } from "./model";
import { composite, decodeToCanvas, exportDoc, loadFonts, Preview, stampImage } from "./pipeline";
import { AlertDialog, Img, Toast, useToast } from "./ui";
import { FilterPanel } from "./panels/Filter";
import { AdjustPanel, CurvesPanel, HslPanel, SplitPanel } from "./panels/Adjust";
import { CropTool, ToolsPanel } from "./panels/Tools";
import { AutoSkinPanel, PortraitPanel, SkinTonePanel } from "./panels/Portrait";
import { detectFaces, detectPose, faceEditActive, nonZero, peekFaces, peekPose } from "./tools/portrait/faceEngine";
import { BorderPanel } from "./panels/Border";
import { BrushAddPage, LayerAdjustPage, LayerEraserPage, LayerGizmo, LayerListPopup, LayerPanel, StampAddPage, TextAddPage } from "./panels/Layers";
import { StickerServerPanel } from "./panels/Server";
import { ArFilterPanel } from "./panels/ArFilter";
import { ExtSub, isExtSub } from "./tools/ExtSub";

const MENU_H = 186; // edit_menu_height
const TAB_H = 52;   // edit_tab_menu_height
// PinchZoomTextureView controller (C14956a): max 16x, min 0.4x of the fit scale.
const MAX_ZOOM = 16, MIN_ZOOM = 0.4;

/** Dev-only init (headless verification). */
export interface DevInit { sample: boolean; tab?: string; sub?: string; adjust?: string; filter?: string; save?: boolean; share?: boolean }

// EPPageViewModel removes RECOMMEND when the recommendation list is empty; the web port has no
// recommendation server data, so the tab is not shown (same as the original offline).
const VISIBLE_TABS = TABS.filter((t) => t.id !== "RECOMMEND");

const photoKey = (doc: Doc) => JSON.stringify([doc.base, doc.filter, doc.adjust, doc.curves, doc.hsl, doc.split, doc.beauty]);

/** EPPreviewZoomViewModel.Nf: >=100% as an integer, below 100% with one decimal. */
const scaleText = (s: number) => (s >= 1 ? `${Math.round(s * 100)}%` : `${(Math.round(s * 1000) / 10).toFixed(1)}%`);

interface Zoom { s: number; x: number; y: number }
const NO_ZOOM: Zoom = { s: 1, x: 0, y: 0 };

export function EditScreen({ id, dev }: { id: string; dev?: DevInit }) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const outRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<Preview | null>(null);
  const bases = useRef<HTMLCanvasElement[]>([]);
  const lastKey = useRef("");
  const lastBase = useRef(-1);
  const toolRef = useRef<PreviewTool | null>(null);
  const idSeq = useRef(1);

  const [status, setStatus] = useState<"loading" | "ok" | "missing" | "video" | "error">("loading");
  const [originalUrl, setOriginalUrl] = useState("");
  const [hist, setHist] = useState<{ list: Doc[]; i: number }>(() => {
    const d0 = initialDoc();
    if (dev?.filter) d0.filter = { key: dev.filter, strength: 0.8 };
    return { list: [d0], i: 0 };
  });
  const [live, setLiveState] = useState<Doc | null>(null);
  const doc = live ?? hist.list[hist.i];
  // EPPageViewModel.getAndSetInitTab: PORTRAIT when a face is detected, else TOOLS.
  const [tab, setTabState] = useState<TabId>(() => (dev?.tab && TABS.some((t) => t.id === dev.tab) ? dev.tab as TabId : "TOOLS"));
  const [prevTab, setPrevTab] = useState<TabId>("TOOLS");
  /** The user chose a tab before face detection finished: don't override it. */
  const tabPicked = useRef(false);
  const [sub, setSub] = useState<Sub>(() => (dev?.sub as Sub) ?? null);
  const [selected, setSelected] = useState<number | null>(null);
  const [original, setOriginal] = useState(false);
  const [size, setSize] = useState({ w: 360, h: 640 });
  const [frame, setFrame] = useState({ fw: 1, fh: 1 });
  const [tick, setTick] = useState(0);
  const [toastText, toast] = useToast();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ url: string; blob: Blob } | null>(null);
  const [layerPopup, setLayerPopup] = useState(false);
  const [zoom, setZoom] = useState<Zoom>(NO_ZOOM);
  const [showScale, setShowScale] = useState(false);

  /* ---------------------------------------------------------------- load */
  useEffect(() => {
    let alive = true;
    let url = "";
    (async () => {
      let blob: Blob | undefined;
      if (dev?.sample) blob = await fetch(`${BASE}/drawable/img_fbpopup_bg.webp`).then((r) => r.blob()).catch(() => undefined);
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
        setFrame({ fw: base.width, fh: base.height }); // no square first frame before the first composite
        url = URL.createObjectURL(blob);
        setOriginalUrl(url);
        const pv = new Preview();
        previewRef.current = pv;
        await Promise.all([pv.ready, loadFonts()]);
        if (!alive) return;
        setStatus("ok");
        if (!dev?.tab)
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
  }, [id, dev?.sample]);

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
      // A new base (crop, rotate, Remove/Expand bake...) keeps the non-destructive face edits: analyse it right away so
      // they stay applied without reopening a face tool (the face stage reads the per-base detection cache).
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
      if (k !== lastKey.current) { pv.renderPhoto(doc); lastKey.current = k; }
      const [pw, ph] = pv.size;
      const g = composite(out, pv.gl, pw, ph, doc, rerender);
      if (g.fw !== frame.fw || g.fh !== frame.fh) setFrame({ fw: g.fw, fh: g.fh });
    });
    return () => cancelAnimationFrame(raf);
  }, [status, doc, size, tick, frame, rerender]);

  // fit-centre rect in the preview area (top .. guide_menu_area).
  // EPPreviewZoomViewModel.Pf: for 3:4-ish images (0.70 <= w/h <= 0.75) the engine gets a top padding of
  // (viewH - contentH) (bul.J -> render rect inset top), with defaultTy = half of it: the photo sits at the bottom
  // of the preview, right above the menu, instead of centred.
  const fitRect: Rect = useMemo(() => {
    const aw = size.w, ah = Math.max(1, size.h - MENU_H);
    const k = Math.min(aw / frame.fw, ah / frame.fh);
    const w = frame.fw * k, h = frame.fh * k;
    const r = frame.fw / frame.fh;
    const top = r >= 0.7 && r <= 0.75 ? Math.round(ah - h) : (ah - h) / 2;
    return { x: (aw - w) / 2, y: top, w, h };
  }, [size, frame]);
  // displayed rect after pinch zoom / pan (screen = fit * s + t)
  const rect: Rect = useMemo(() => ({
    x: fitRect.x * zoom.s + zoom.x, y: fitRect.y * zoom.s + zoom.y, w: fitRect.w * zoom.s, h: fitRect.h * zoom.s,
  }), [fitRect, zoom]);
  const zoomed = zoom.s !== 1 || zoom.x !== 0 || zoom.y !== 0;

  // animated preview transform (PinchZoomTextureView.m62786v: matrix animation, decelerate)
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
  /** baa.C3828a.mo3310c: setRectToRect(faceRect, previewRect, CENTER) pre-concatenated with the current matrix, 300 ms. */
  const zoomTo = useCallback((r: Rect, ms = 300) => {
    const pw = size.w, ph = Math.max(1, size.h - MENU_H);
    if (r.w <= 0 || r.h <= 0) return;
    const z = zoomRef.current;
    const k0 = Math.min(pw / r.w, ph / r.h);
    const s = Math.min(MAX_ZOOM, z.s * k0), k = s / z.s;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    // screen' = k * (screen - c) + previewCentre ; screen = fit * s + t
    animateZoom({ s, x: k * (z.x - cx) + pw / 2, y: k * (z.y - cy) + ph / 2 }, ms);
  }, [size, animateZoom]);

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

  // switching features resets the preview transform (EPPreviewZoomViewModel.reset)
  const [zoomKey, setZoomKey] = useState(`${tab}|${sub}`);
  if (zoomKey !== `${tab}|${sub}`) { setZoomKey(`${tab}|${sub}`); setZoom(NO_ZOOM); }
  // a running zoom animation stops when the feature changes
  useEffect(() => () => cancelAnimationFrame(animRaf.current), [zoomKey]);

  const ctx: EditCtxValue = {
    doc, setLive: setLiveState, commit, undo, redo, setOriginal, toast, sub,
    openSub: (s) => { setLiveState(null); setSub(s); },
    tab, setTab, selected, select: setSelected, rect, frame,
    srcCanvas: () => previewRef.current?.src ?? null,
    photoCanvas: () => previewRef.current?.gl ?? null,
    originalUrl, bases, setTool: (t) => { toolRef.current = t; }, rerender,
    nextId: () => idSeq.current++,
    devAdjust: dev?.adjust,
    zoomTo,
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
      // second finger: end a running tool stroke and start pinching
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
      if (zoom.s < 1) resetZoom(); // zoomed out below fit springs back
    }
    if (g?.kind === "pan" && pointers.current.size === 0) gesture.current = null;
  };
  // desktop: ctrl/trackpad pinch arrives as ctrl+wheel
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
      // showScaleForDuration(1000)
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
  const onBack = () => {
    if (sub) { setSub(null); setLiveState(null); return; }
    if (modified) setConfirmLeave(true);
    else leave();
  };
  // hardware back (EPActivity.onBackPressed): the deeper layers (dialogs, share bar, stamp shop, AR filter page...)
  // register their own handlers above this one; here: layer list popup → sub-page / tool page → Effects page →
  // back to the gallery (with the leave dialog when modified)
  useBackHandler(() => {
    if (status !== "ok") { router.push("/gallery"); return; }
    if (saving) return;
    if (layerPopup) { setLayerPopup(false); return; }
    if (!sub && tab === "EFFECT_STICKER") { setTab(prevTab === "EFFECT_STICKER" ? "TOOLS" : prevTab); return; }
    onBack();
  }, !saved);
  const onSave = useCallback(async () => {
    if (saving) return;
    const base = bases.current[doc.base];
    if (!base) return;
    setSaving(true);
    try {
      // stamp images must be decoded for the export composite
      doc.layers.forEach((l) => { if (l.kind === "stamp") stampImage(l.src); });
      const { blob, width, height } = await exportDoc(base, doc);
      // EditPhotoFragment.savePhoto: full resolution into the device gallery
      await savePhoto(blob, width, height, "B612");
      setSaved({ url: URL.createObjectURL(blob), blob });
    } catch {
      toast("Failed to save a photo."); // alert_fail_to_camera_roll
    } finally {
      setSaving(false);
    }
  }, [saving, doc, toast]);
  useEffect(() => () => { if (saved) URL.revokeObjectURL(saved.url); }, [saved]);
  const devSaved = useRef(false);
  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
  useEffect(() => {
    if (status !== "ok" || !dev?.save || devSaved.current) return;
    devSaved.current = true;
    window.setTimeout(() => void onSaveRef.current(), 1500);
  }, [status, dev?.save]);

  /* ---------------------------------------------------------------- tab bar: CenterScrollLayoutManager */
  const tabBarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = tabBarRef.current;
    const el = bar?.querySelector<HTMLElement>(`[data-tab="${tab}"]`);
    if (!bar || !el) return;
    bar.scrollTo({ left: el.offsetLeft + el.offsetWidth / 2 - bar.clientWidth / 2, behavior: "smooth" });
  }, [tab, status, sub, saved]);

  if (status !== "ok") {
    return (
      <div ref={rootRef} className="absolute inset-0 flex items-center justify-center bg-black text-white">
        {status === "loading" ? (
          <img src={d("lens_loading")} alt="" className="spin-save" style={{ width: 37, height: 37 }} />
        ) : (
          <div className="flex flex-col items-center gap-4 px-8 text-center" style={{ fontSize: 14 }}>
            <p style={{ color: "rgba(255,255,255,0.6)" }}>
              {status === "video" ? NOT_ON_WEB : status === "missing" ? "No Photos" : "The preparation failed. Please try again."}
            </p>
            <button type="button" onClick={() => router.push("/gallery")} className="text-white" style={{ height: 32, padding: "0 15px", borderRadius: 18, background: "#0bd4d2" }}>OK</button>
          </div>
        )}
        <button type="button" onClick={() => router.push("/gallery")} className="absolute" style={{ left: 8, top: 9, width: 34, height: 34 }} aria-label="Back">
          <Img name="icon_edit_top_back_shadow" size={34} />
        </button>
      </div>
    );
  }

  const layerCount = doc.layers.length;
  const isLayerTab = tab === "STAMP" || tab === "TEXT" || tab === "BRUSH";

  return (
    <EditCtx.Provider value={ctx}>
      <div ref={rootRef} className="absolute inset-0 overflow-hidden bg-black" style={{ touchAction: "none" }}>
        {/* preview FrameLayout: #171717 from the top to guide_menu_area */}
        <div
          data-preview
          className="absolute inset-x-0 top-0 overflow-hidden"
          style={{ bottom: MENU_H, background: "#171717", touchAction: "none" }}
          onPointerDown={onPDown}
          onPointerMove={onPMove}
          onPointerUp={onPUp}
          onPointerCancel={onPUp}
        >
          <canvas
            ref={outRef}
            className="absolute"
            style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, visibility: original || sub === "crop" ? "hidden" : "visible" }}
          />
          {/* hold-to-compare: the untouched photo in the same place (maxWidth none: preflight's img max-width 100% would
              shrink it to the preview width while zoomed in) */}
          {original && originalUrl && (
            <img src={originalUrl} alt="" className="pointer-events-none absolute object-contain" draggable={false} style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, maxWidth: "none", maxHeight: "none" }} />
          )}
        </div>

        {isLayerTab && !original && <LayerGizmo />}

        {/* scale_text_view: while pinching, centred in the preview */}
        {showScale && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-center" style={{ bottom: MENU_H }}>
            <span className="text-white" style={{ fontSize: 13, lineHeight: "15px", padding: "14px 17px", borderRadius: 10, background: "rgba(0,0,0,0.6)" }}>{scaleText(zoom.s)}</span>
          </div>
        )}

        {/* tool content (container_content) */}
        {!sub && tab === "PORTRAIT" && <PortraitPanel />}
        {!sub && tab === "TOOLS" && <ToolsPanel />}
        {!sub && tab === "FILTER" && <FilterPanel />}
        {!sub && tab === "ADJUST" && <AdjustPanel />}
        {!sub && tab === "EFFECT_STICKER" && <StickerServerPanel kind="effect" onExit={() => setTab(prevTab === "EFFECT_STICKER" ? "TOOLS" : prevTab)} />}
        {!sub && tab === "STICKER" && <ArFilterPanel onExit={() => setTab(prevTab === "STICKER" ? "TOOLS" : prevTab)} />}
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

        {/* list_tab_menu (52dp, paddingH 12, LinearItemDecoration 10/9dp) with a 1dp #191919 top line */}
        {!sub && !(tab === "EFFECT_STICKER" || tab === "STICKER") && (
          <div className="absolute inset-x-0 bottom-0 bg-black" style={{ height: TAB_H }}>
            <div ref={tabBarRef} className="no-scrollbar flex h-full items-center overflow-x-auto" style={{ paddingLeft: 12, paddingRight: 12, gap: size.w > 360 ? 10 : 9 }}>
              {VISIBLE_TABS.map((t) => (
                <button
                  key={t.id}
                  data-tab={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className="flex h-full flex-none items-center whitespace-nowrap"
                  style={{ padding: "0 8px", fontSize: 14, lineHeight: "16px", color: tab === t.id ? "#0bd4d2" : "rgba(255,255,255,0.6)" }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: 1, background: "#191919" }} />
          </div>
        )}

        {/* top bar (guide_top_bar 52dp, overlays the image); hidden under the full-screen Effects / AR filter pages */}
        {!sub && tab !== "EFFECT_STICKER" && tab !== "STICKER" && (
          <>
            <button type="button" onClick={onBack} className="absolute z-20" style={{ left: 8, top: 9, width: 34, height: 34 }} aria-label="Back">
              <Img name="icon_edit_top_back_shadow" size={34} />
            </button>
            {/* btn_fit_screen: shown while the preview is zoomed/panned */}
            {zoomed && (
              <div className="absolute inset-x-0 z-20 flex justify-center" style={{ top: 10, pointerEvents: "none" }}>
                <button type="button" onClick={resetZoom} className="flex items-center text-white" style={{ pointerEvents: "auto", height: 36, padding: "0 15px", borderRadius: 18, background: "rgba(0,0,0,0.6)" }}>
                  <Img name="icon_edit_gallery_fit" size={15} />
                  <span style={{ paddingLeft: 5, fontSize: 13, lineHeight: "15px" }}>Fit screen</span>
                </button>
              </div>
            )}
            <div className="absolute right-0 top-0 z-20 flex items-center" style={{ height: 52, paddingRight: 8 }}>
              {layerCount > 0 && (
                <button type="button" onClick={() => setLayerPopup((v) => !v)} className="relative flex-none" style={{ width: 42, height: 34, marginRight: 4 }} aria-label="Layers">
                  <Img name="icon_edit_top_layer_shadow" size={34} style={{ position: "absolute", left: 0, top: 0 }} />
                  {/* text_layer_count: marginStart 18 / marginTop 2 from icon_layer, bg_edit_top_layer_count_with_vip */}
                  <span
                    className="absolute flex items-center justify-center font-bold"
                    style={{ left: 18, top: 2, height: 14, minWidth: 14, padding: "0 3px", borderRadius: 7, fontSize: 10, lineHeight: "10px", color: "#222222", background: "linear-gradient(180deg, #ffd901, #ffca13)" }}
                  >
                    {layerCount}
                  </span>
                </button>
              )}
              <button type="button" onClick={() => void onSave()} className="flex items-center text-white" style={{ height: 32, padding: "0 15px", borderRadius: 18, background: "#0bd4d2", fontSize: 14 }}>
                SAVE
              </button>
            </div>
            {layerPopup && layerCount > 0 && <LayerListPopup onClose={() => setLayerPopup(false)} />}
          </>
        )}

        <Toast text={toastText} />

        {confirmLeave && (
          <AlertDialog
            message="Are you sure you want to leave without saving?"
            cancel="Cancel"
            ok="Leave"
            onCancel={() => setConfirmLeave(false)}
            onOk={() => { setConfirmLeave(false); leave(); }}
          />
        )}

        {saving && (
          <div className="absolute inset-0 z-[90] flex items-center justify-center">
            <div className="flex items-center justify-center" style={{ width: 97, height: 97, borderRadius: 8, background: "rgba(0,0,0,0.5)" }}>
              <img src={d("lens_loading")} alt="" className="spin-save" style={{ width: 57, height: 57 }} />
            </div>
          </div>
        )}

        {saved && (
          <SaveConfirm
            url={saved.url}
            blob={saved.blob}
            initialShare={!!dev?.share}
            onClose={() => setSaved(null)}
            onBack={() => router.push("/gallery")}
          />
        )}
      </div>
    </EditCtx.Provider>
  );
}

/* ================================================================== EditConfirmFragment (PHOTO) */

/**
 * yx8/ty8/ny8: black Scaffold; top bar 52dp (padding 8/9) with icon_edit_top_close, "Saved!"
 * (15/600, white) and icon_edit_top_share_shadow; body = the saved photo, contain-fit, no buttons.
 * Enters with slide_in_right; X pops back to the editor; system back opens the Gallery.
 */
function SaveConfirm({ url, blob, initialShare, onClose, onBack }: { url: string; blob: Blob; initialShare: boolean; onClose: () => void; onBack: () => void }) {
  const [share, setShare] = useState(initialShare);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, []);
  // back press order: ShareBar (its own handler, above this one) first, else Gallery
  useBackHandler(onBack);
  return (
    <div
      className="absolute inset-0 z-[95] flex flex-col bg-black"
      style={{ transform: shown ? "translateX(0)" : "translateX(100%)", transition: "transform 300ms ease-in-out" }}
    >
      <div className="relative flex flex-none items-center justify-between" style={{ height: 52, padding: "9px 8px" }}>
        <button type="button" onClick={onClose} aria-label="Close" style={{ width: 34, height: 34 }}>
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

/**
 * main_share_etc_bar.xml, BLACK theme: transparent full-screen root (tap closes), 167dp #000 sheet,
 * 50dp close row with btn_close_default (27dp, white), app list (paddingH 18, 75dp cells, 54dp icon,
 * 10dp label 11.5dp below). Only installed apps are listed and "More" always is; on the web no
 * share-target app can receive the file directly, so the list is "More" (Web Share / download).
 */
function ShareBar({ open, blob, onClose }: { open: boolean; blob: Blob; onClose: () => void }) {
  const [mounted, setMounted] = useState(open);
  const [up, setUp] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(360);
  if (open && !mounted) setMounted(true);
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
  // back closes the share bar first
  useBackHandler(onClose, open);
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
