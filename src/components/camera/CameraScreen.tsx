"use client";

// Camera screen: live WebGL preview with filters, beauty, AR effects and makeup; photo, video (multi-clip),
// hold-to-record, bounce loops, collage shots, timer, flash / screen flash, tap to focus with exposure, pinch zoom,
// swipe to change filter, then the review screen. Geometry lives in ./layout.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useBackHandler } from "@/lib/back";
import { DEFAULT_FAVORITES, DEFAULT_FILTER_KEY, FILTER_CATEGORY, LOCAL_FILTERS, filterByKey, lutFor, strengthFor, type LocalFilter } from "@/lib/filters";
import { Renderer, ZERO_ADJUST, type Adjustments, type ToneParams } from "@/lib/gl/renderer";
import { listPhotos } from "@/lib/store";
import { BottomNav, Button, Icon, IconButton, Logo, PHOTOS_EVENT, Switch, cx, toast, type IconName } from "@/components/ui";
import { useCameraPermission, useCameraStream, type Facing } from "./useCameraStream";
import { FilterPanel, PANEL_H as FILTER_PANEL_H, type FilterCategory } from "./FilterPanel";
import { STICKER_PANEL_H, StickerPanel } from "./StickerPanel";
import { cameraFilterCategories, useFilterInventory } from "./FilterInventory";
import { BEAUTY_PANEL_H, BeautyPanel, applyBeautyChange, beautyRenderParams, restoreBeautyState, type BeautyState } from "./BeautyPanel";
import { FACE_SHAPE_DEFAULT } from "@/data/camera/beauty";
import { facePreset } from "@/lib/face/presets";
import { beautyFaceParams, bodySlimValue } from "./faceParams";
import { FaceTracker, StickerRuntime, makeupActive, parseSticker, type FaceRenderParams } from "@/lib/face";
import { STICKER_BASE, findSticker, type Sticker } from "@/data/camera/stickers";
import { useRecorder, LONG_PRESS_MAX_MS, type RecordingResult } from "./capture/useRecorder";
import { VideoClipBar, clipBarBottom } from "./capture/VideoClipBar";
import { maybeWatermarkPhoto } from "./capture/watermark";
import { useFrameClock } from "./capture/anim";
import { Splash } from "@/components/home/Splash";
import { Shutter } from "./Shutter";
import { MusicList } from "./MusicList";
import { ConfirmScreen, type Capture } from "./ConfirmScreen";
import {
  DOCK_HEIGHT, RATIOS, RATIO_LABEL, SHUTTER, TOOLBAR_H, controlsOverPreview, dockBottom, previewRect, shutterCenter, visibleRect,
  type Ratio, type Rect,
} from "./layout";
import { loadPref, savePref } from "./prefs";
import { SETTINGS, getSetting, useSetting } from "@/lib/settings";

type Panel = "none" | "filter" | "beauty" | "sticker";
type Mode = "NORMAL" | "VIDEO";
type Flash = "off" | "auto" | "on" | "torch";
type ChildMenu = "none" | "ratio" | "rec";
type Grid = "TWO_BY_TWO" | "ONE_BY_TWO" | "TWO_BY_ONE" | "ONE_BY_THREE" | "ONE_BY_ONE_BY_ONE" | "TWO_BY_THREE";

// Pinch zoom: 100 zoom steps spread linearly from 1x to 4x (browsers don't report the sensor's digital zoom limit).
const ZOOM_STEPS = 100;
const MAX_ZOOM = 4;
const stepToZoom = (step: number) => 1 + (step / ZOOM_STEPS) * (MAX_ZOOM - 1);
const zoomToStep = (z: number) => Math.round(((z - 1) / (MAX_ZOOM - 1)) * ZOOM_STEPS);
const TIMERS = [0, 3000, 10000];
const REC = [{ label: "5 min", ms: 300_000 }, { label: "15 min", ms: 900_000 }, { label: "30 min", ms: 1_800_000 }];

// Collage grids: cell rects in GL coordinates (left, bottom, right, top; y up).
const GRIDS: { id: Grid; label: string; cells: [number, number, number, number][] }[] = [
  { id: "TWO_BY_TWO", label: "2 × 2", cells: [[0, 0.5, 0.5, 1], [0.5, 0.5, 1, 1], [0, 0, 0.5, 0.5], [0.5, 0, 1, 0.5]] },
  { id: "ONE_BY_TWO", label: "Stacked 2", cells: [[0, 0.5, 1, 1], [0, 0, 1, 0.5]] },
  { id: "TWO_BY_ONE", label: "Side by side", cells: [[0, 0, 0.5, 1], [0.5, 0, 1, 1]] },
  { id: "ONE_BY_THREE", label: "Stacked 3", cells: [[0, 0.667, 1, 1], [0, 0.333, 1, 0.667], [0, 0, 1, 0.333]] },
  { id: "ONE_BY_ONE_BY_ONE", label: "1 + 2", cells: [[0, 0.5, 1, 1], [0, 0, 0.5, 0.5], [0.5, 0, 1, 0.5]] },
  { id: "TWO_BY_THREE", label: "2 × 3", cells: [[0, 0.667, 0.5, 1], [0.5, 0.667, 1, 1], [0, 0.333, 0.5, 0.667], [0.5, 0.333, 1, 0.667], [0, 0, 0.5, 0.333], [0.5, 0, 1, 0.333]] },
];
/** GL rect (left, bottom, right, top; y up) → screen rect inside `r`. */
const cellRect = (c: [number, number, number, number], r: Rect): Rect => ({ x: r.x + c[0] * r.w, y: r.y + (1 - c[3]) * r.h, w: (c[2] - c[0]) * r.w, h: (c[3] - c[1]) * r.h });

const byKey = (k: string) => filterByKey(k)!;
const DEFAULT_FILTER = DEFAULT_FILTER_KEY;

/** Script-style filters (no lookup table) are rendered as light skin smoothing + whitening. */
function renderParamsFor(f: LocalFilter, front: boolean, strength: number) {
  if (f.key === "ORIGINAL") return { intensity: 0, extraSmooth: 0, extraWhiten: 0 };
  return { lut: lutFor(f, front), intensity: strength, extraSmooth: 0, extraWhiten: 0 };
}

const pad2 = (n: number) => String(n).padStart(2, "0");
/** Event timestamp / unique key (called from handlers only). */
let seq = 0;
const stamp = () => Date.now();
const uid = () => ++seq;
const perfNow = () => performance.now();

export function CameraScreen() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [size, setSize] = useState({ W: 390, H: 844 });

  // Deep links from Home / Discover: /?filter=<LocalFilterType id>, /?beauty=<style>, /?sticker=<id>
  const [deepLink] = useState(() => new URLSearchParams(window.location.search));
  const dev = process.env.NODE_ENV !== "production" ? deepLink.get("__panel") : null;
  const [facing, setFacing] = useState<Facing>(() => loadPref("facing", "user"));
  const [ratio, setRatio] = useState<Ratio>(() => (deepLink.get("__ratio") as Ratio | null) ?? loadPref("sectionType", "9:16"));
  const [timerIdx, setTimerIdx] = useState<number>(() => loadPref("timerType", 0));
  const [flash, setFlash] = useState<Flash>(() => loadPref("flashMode", "off"));
  const [mode, setMode] = useState<Mode>(() => (dev === "video" || dev === "rec" ? "VIDEO" : "NORMAL"));
  const [recIdx, setRecIdx] = useState<number>(() => loadPref("recordingTime", 0));
  const [bounce, setBounce] = useState(false);
  const [layoutOn, setLayoutOn] = useState(dev === "layout" || dev === "grid");
  const [grid, setGrid] = useState<Grid>(() => loadPref("layoutGridOption", "TWO_BY_TWO"));
  const [gridPopover, setGridPopover] = useState<"closed" | "open" | "closing">(dev === "grid" ? "open" : "closed");
  const [shots, setShots] = useState<string[]>([]);
  const [panel, setPanel] = useState<Panel>(() =>
    deepLink.has("filter") || dev === "filter" ? "filter" : deepLink.has("beauty") ? "beauty" : deepLink.has("sticker") ? "sticker" : "none");
  const [moreOpen, setMoreOpen] = useState(dev === "more");
  const [musicOpen, setMusicOpen] = useState(dev === "music");
  const [childMenu, setChildMenu] = useState<ChildMenu>(dev === "ratio" ? "ratio" : dev === "rec" ? "rec" : "none");
  const [filterKey, setFilterKey] = useState<string>(() => {
    const id = Number(deepLink.get("filter"));
    return LOCAL_FILTERS.find((f) => f.id === id)?.key ?? loadPref("Original.takenFilterId", DEFAULT_FILTER);
  });
  const [favorites, setFavorites] = useState<string[]>(() => loadPref("filterFavorites", [...DEFAULT_FAVORITES]));
  const [powerFront, setPowerFront] = useState<Record<string, number>>(() => loadPref("filterPowerByFilterId", {}));
  const [powerBack, setPowerBack] = useState<Record<string, number>>(() => loadPref("filterPowerByFilterIdBack", {}));
  const [liveStrength, setLiveStrength] = useState<number | null>(null);
  const [sliderOpen, setSliderOpen] = useState(false);
  // two-way items hold f + 1 on a 0…2 bar; makeup looks are stored too
  const [beautyState, setBeautyState] = useState<BeautyState>(() => {
    const st = restoreBeautyState(loadPref<BeautyState | null>("beautyState.v2", null));
    // ?beauty=<face style> (Home face styles, saved looks) selects that style
    const style = deepLink.get("beauty");
    return style && facePreset(style) ? { ...st, faceShape: style, faceShapePower: st.faceShapePower > 0 ? st.faceShapePower : FACE_SHAPE_DEFAULT } : st;
  });
  // ?sticker=<id> deep link selects the effect when it is in the local catalog
  const [stickerId, setStickerId] = useState<number | null>(() => findSticker(Number(deepLink.get("sticker")))?.id ?? null);
  const [beautyOriginal, setBeautyOriginal] = useState(false);
  const [autoSave, setAutoSave] = useState<boolean>(() => loadPref("isAutoSave", false));
  const [makeup, setMakeup] = useState<boolean>(() => loadPref("isMakeupOn", true));
  const [night, setNight] = useState<boolean>(() => loadPref("isNightMode", false));
  const [touchShoot, setTouchShoot] = useState(false);
  const [footerTip, setFooterTip] = useState(false);
  const [center, setCenter] = useState<{ text: string; big: boolean; k: number; delay: number; dur: number } | null>(null);
  const [countdown, setCountdown] = useState(false);
  const [focus, setFocus] = useState<{ x: number; y: number; k: number } | null>(null);
  const [exposure, setExposure] = useState<{ v: number; visible: boolean; dragging: boolean; k: number }>({ v: 0, visible: false, dragging: false, k: 0 });
  const [zoom, setZoom] = useState(() => (process.env.NODE_ENV !== "production" && deepLink.get("__zoom") ? Math.min(MAX_ZOOM, Math.max(1, Number(deepLink.get("__zoom")) || 1)) : 1));
  const [filterToast, setFilterToast] = useState<{ name: string; dir: 1 | -1; k: number } | null>(null);
  const [screenFlash, setScreenFlash] = useState(false);
  const [bounceProg, setBounceProg] = useState<{ start: number; progress: number } | null>(null);
  const [capture, setCapture] = useState<Capture | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  // the latest item can be a video (saved recording): an <img> cannot show it, so it gets a <video> poster frame
  const [thumbVideo, setThumbVideo] = useState(false);
  const [lpGuide, setLpGuide] = useState<"pending" | "shown" | "done">(() => (loadPref("guideLongPressToVideo", false) ? "done" : "pending"));

  // ---------- permission ----------
  const [perm, setPerm] = useCameraPermission();
  const [requested, setRequested] = useState(false);
  const streamOn = perm === "granted" || requested;
  const front = facing === "user";
  const [gridLines] = useSetting(SETTINGS.gridLines, false);
  const { videoRef, ready, error, caps, setTorch } = useCameraStream(facing, streamOn);
  useEffect(() => {
    if (error === "permission") setPerm("denied");
    else if (ready && perm !== "granted") setPerm("granted");
  }, [error, ready, perm, setPerm]);

  const { W, H } = size;
  const prev = useMemo(() => previewRect(ratio, W, H), [ratio, W, H]);
  const vis = useMemo(() => visibleRect(ratio, W, H), [ratio, W, H]);
  const prevBottom = prev.y + prev.h;
  const overPreview = controlsOverPreview(ratio, W, H);

  // persist prefs
  useEffect(() => savePref("facing", facing), [facing]);
  useEffect(() => savePref("sectionType", ratio), [ratio]);
  useEffect(() => savePref("timerType", timerIdx), [timerIdx]);
  useEffect(() => savePref("flashMode", flash), [flash]);
  useEffect(() => savePref("recordingTime", recIdx), [recIdx]);
  useEffect(() => savePref("layoutGridOption", grid), [grid]);
  useEffect(() => savePref("Original.takenFilterId", filterKey), [filterKey]);
  useEffect(() => savePref("filterFavorites", favorites), [favorites]);
  useEffect(() => savePref("beautyState.v2", beautyState), [beautyState]);
  useEffect(() => savePref("isAutoSave", autoSave), [autoSave]);
  useEffect(() => savePref("isMakeupOn", makeup), [makeup]);
  useEffect(() => savePref("isNightMode", night), [night]);

  // size of the phone frame
  useEffect(() => {
    const el = rootRef.current!;
    const ro = new ResizeObserver(() => setSize({ W: el.clientWidth, H: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // gallery thumbnail = last saved photo
  // The object URL is made and the previous one revoked here, not inside a state updater (updaters must stay pure:
  // StrictMode runs them twice).
  const thumbUrl = useRef<string | null>(null);
  const refreshThumb = useCallback(async () => {
    const [p] = await listPhotos();
    const next = p ? URL.createObjectURL(p.blob) : null;
    const old = thumbUrl.current;
    thumbUrl.current = next;
    setThumb(next);
    setThumbVideo(!!p && p.blob.type.startsWith("video/"));
    if (old) window.setTimeout(() => URL.revokeObjectURL(old), 1000);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with IndexedDB
    void refreshThumb();
    window.addEventListener(PHOTOS_EVENT, refreshThumb);
    window.addEventListener("focus", refreshThumb);
    return () => { window.removeEventListener(PHOTOS_EVENT, refreshThumb); window.removeEventListener("focus", refreshThumb); };
  }, [refreshThumb]);

  const showToast = useCallback((text: string) => toast(text), []);

  // ---------- filter state ----------
  const filter = byKey(filterKey) ?? byKey(DEFAULT_FILTER);
  const powers = front ? powerFront : powerBack;
  const defStrength = filter.key === "ORIGINAL" ? 1 : strengthFor(filter, front);
  const strength = liveStrength ?? powers[filter.key] ?? defStrength;

  // exposure: −1…1 from the exposure slider (up = brighter) → renderer brightness
  const expBrightness = -exposure.v * 0.8;

  // ---------- render loop ----------
  const beauty = useMemo(() => (beautyOriginal ? { smooth: 0, whiten: 0, sharpen: 0, skinTone: null, skinToneValue: 0 } : beautyRenderParams(beautyState)), [beautyState, beautyOriginal]);
  // ---------- face engine (src/lib/face): beauty reshape / makeup + effects ----------
  const faceBeauty = useMemo(() => beautyFaceParams(beautyState, makeup), [beautyState, makeup]);
  const sticker = useMemo(() => findSticker(stickerId), [stickerId]);
  const stickerRt = useMemo(() => (sticker?.json ? new StickerRuntime(parseSticker(sticker.json, STICKER_BASE)) : null), [sticker]);
  // beauty mark: a face-UV texture on the face mesh (FACE_SKIN); Mirror flips it
  const bm = faceBeauty.beautyMark;
  const bmKey = bm ? `${bm.url}|${bm.alpha}|${bm.flip}` : "";
  const beautyMarkRt = useMemo(() => {
    if (!bmKey) return null;
    const [url, alpha, flip] = bmKey.split("|");
    return new StickerRuntime(parseSticker({ items: [{ id: "bm", drawType: "FACE_MASK", triggerType: "FACE_DETECT", resourceType: "IMAGE", resourceName: url, alpha: Number(alpha), flipHorizontally: flip === "true" }] }, STICKER_BASE));
  }, [bmKey]);
  const beautyFaceActive = Object.keys(faceBeauty.shape).length > 0 || faceBeauty.warpOps.length > 0 || Object.keys(faceBeauty.beauty3d).length > 0
    || Object.values(faceBeauty.warp).some((v) => Math.abs(v ?? 0) > 1e-3) || makeupActive(faceBeauty.makeup) || !!beautyMarkRt;
  const beautyFaceOn = !beautyOriginal && beautyFaceActive;
  // dev-only `?__noface=1` keeps the face engine off (performance baseline)
  const faceNeeded = (beautyFaceActive || !!stickerRt) && !(process.env.NODE_ENV !== "production" && deepLink.has("__noface"));
  const needSeg = !!stickerRt?.def.items.some((it) => it.drawType === "BACKGROUND" || it.drawType === "SEGMENTATION");
  const trackerRef = useRef<FaceTracker | null>(null);
  const [faceStatus, setFaceStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [hasFace, setHasFace] = useState(false);
  const hasFaceRef = useRef(false);
  const [stickerLoading, setStickerLoading] = useState<number | null>(null);

  const bodySlim = beautyOriginal ? 0 : bodySlimValue(beautyState);
  const bodySlimOn = bodySlim > 1e-3;
  const paramsRef = useRef({ filter, front, strength, beauty, expBrightness, zoom, faceBeauty, beautyFaceOn, stickerRt, beautyMarkRt, needSeg, bodySlim });
  // bumped whenever a render input changes, so the loop can skip frames where neither the video nor the params changed
  const paramsVersion = useRef(0);
  useLayoutEffect(() => {
    const next = { filter, front, strength, beauty, expBrightness, zoom, faceBeauty, beautyFaceOn, stickerRt, beautyMarkRt, needSeg, bodySlim };
    const cur = paramsRef.current as Record<string, unknown>;
    if (Object.entries(next).some(([k, v]) => cur[k] !== v)) paramsVersion.current++;
    paramsRef.current = next;
  });

  // lazy-load the face model (and the reshape / face-UV tables) the first time Beauty or Effects needs it
  useEffect(() => {
    if (!faceNeeded || !ready || faceStatus !== "idle") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- starting an async load
    setFaceStatus("loading");
    FaceTracker.create({ mode: "VIDEO" })
      .then((t) => { trackerRef.current = t; setFaceStatus("ready"); })
      .catch((err) => { console.error("[camera] face model failed to load", err); setFaceStatus("error"); });
  }, [faceNeeded, ready, faceStatus]);
  useEffect(() => () => { trackerRef.current?.close(); trackerRef.current = null; }, []);
  // per-frame tracking on the camera video (rVFC); background effects segment every 2nd frame to hold 30 fps
  useEffect(() => {
    const t = trackerRef.current, v = videoRef.current;
    if (faceStatus !== "ready" || !t || !v || !faceNeeded) return;
    const stop = t.track(v, {
      // Beauty "Slim" (body): pose landmarks drive the engine's body warp; the person mask refines its width
      segment: needSeg || bodySlimOn, segmentEvery: 2, pose: bodySlimOn,
      onFrame: (f) => { const h = f.length > 0; if (h !== hasFaceRef.current) { hasFaceRef.current = h; setHasFace(h); } },
    });
    return () => { stop(); };
  }, [faceStatus, faceNeeded, needSeg, bodySlimOn, videoRef, facing]);
  // preload makeup / sticker textures through the renderer's image cache
  useEffect(() => { rendererRef.current?.face.images.preload(faceBeauty.urls).catch(() => undefined); }, [faceBeauty.urls]);
  useEffect(() => {
    const r = rendererRef.current;
    if (!stickerRt || !r) return;
    let alive = true;
    setStickerLoading(stickerId);
    r.face.preloadSticker(stickerRt).catch(() => undefined).finally(() => { if (alive) setStickerLoading(null); });
    return () => { alive = false; };
  }, [stickerRt, stickerId]);
  useEffect(() => {
    const canvas = canvasRef.current!;
    let r: Renderer;
    try { r = new Renderer(canvas); } catch (err) {
      console.error("[camera] renderer init failed", err);
      return;
    }
    rendererRef.current = r;
    LOCAL_FILTERS.forEach((f) => { if (f.lut) void r.loadLut(f.lut); if (f.backLut) void r.loadLut(f.backLut); });
    let raf = 0;
    let fc = 0;
    // Skip passes when nothing changed: re-render only on a new camera frame (rVFC), a params change, a canvas
    // resize, or while an animated sticker is shown.
    let frameSeq = 0, drawnSeq = -1, drawnVersion = -1, drawnW = 0, drawnH = 0;
    let vfcVideo: HTMLVideoElement | null = null;
    const onVideoFrame = () => {
      frameSeq++;
      if (vfcVideo) vfcVideo.requestVideoFrameCallback(onVideoFrame);
    };
    const perf = { frames: 0, t0: perfNow(), fps: 0, ms: 0 };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const v = videoRef.current;
      if (!v || v.readyState < 2) return;
      const hasVfc = "requestVideoFrameCallback" in v;
      if (hasVfc && vfcVideo !== v) { vfcVideo = v; v.requestVideoFrameCallback(onVideoFrame); }
      const { filter, front, strength, beauty, expBrightness, zoom, faceBeauty, beautyFaceOn, stickerRt, beautyMarkRt, needSeg, bodySlim } = paramsRef.current;
      const animated = !!stickerRt;
      if (hasVfc && frameSeq === drawnSeq && paramsVersion.current === drawnVersion && canvas.width === drawnW && canvas.height === drawnH && !animated) return;
      drawnSeq = frameSeq; drawnVersion = paramsVersion.current; drawnW = canvas.width; drawnH = canvas.height;
      const tStart = perfNow();
      const p = renderParamsFor(filter, front, strength);
      // Night light is not a pixel pass: it is a white screen overlay that lights the face (see the JSX).
      const brightness = expBrightness;
      const adjust: Adjustments | undefined = beauty.sharpen > 0 || brightness !== 0
        ? { ...ZERO_ADJUST, brightness, sharpen: beauty.sharpen }
        : undefined;
      const tone: ToneParams | undefined = beauty.skinTone ? { coolWarm: 0, tanLight: 0, skinTone: beauty.skinTone, skinToneValue: beauty.skinToneValue } : undefined;
      const s = 1 / zoom;
      // params.face: faces in source space (the renderer applies the cover crop + mirror), face reshape,
      // parametric extras, makeup / retouch, stickers (+ the beauty-mark FACE_SKIN item) and segmentation masks
      const tracker = trackerRef.current;
      const stickers = [beautyFaceOn ? beautyMarkRt : null, stickerRt].filter((x): x is StickerRuntime => !!x);
      const face: FaceRenderParams | undefined = tracker && (beautyFaceOn || stickers.length) ? {
        faces: tracker.latest,
        shape: beautyFaceOn ? faceBeauty.shape : undefined,
        warp: beautyFaceOn ? faceBeauty.warp : undefined,
        warpOps: beautyFaceOn ? faceBeauty.warpOps : undefined,
        beauty3d: beautyFaceOn ? faceBeauty.beauty3d : undefined,
        makeup: beautyFaceOn ? faceBeauty.makeup : undefined,
        stickers,
        segmentation: needSeg || bodySlim > 1e-3 ? tracker.latestMasks : null,
        // body slim: the engine's pose-driven body warp
        body: beautyFaceOn && bodySlim > 1e-3 ? { slim: bodySlim, pose: tracker.latestPose } : null,
      } : undefined;
      r.render(v, v.videoWidth, v.videoHeight, {
        lut: p.lut,
        intensity: p.intensity,
        smooth: Math.min(1, beauty.smooth + p.extraSmooth),
        whiten: Math.min(1, beauty.whiten + p.extraWhiten),
        adjust,
        tone,
        mirror: front,
        crop: zoom > 1 ? { x: (1 - s) / 2, y: (1 - s) / 2, w: s, h: s } : undefined,
        face,
      });
      // render cost (CPU submit time) and delivered fps, for the dev perf overlay / headless measurement
      perf.frames++;
      perf.ms = perf.ms * 0.9 + (perfNow() - tStart) * 0.1;
      if (perfNow() - perf.t0 >= 1000) { perf.fps = (perf.frames * 1000) / (perfNow() - perf.t0); perf.frames = 0; perf.t0 = perfNow(); }
      if (process.env.NODE_ENV !== "production") (window as unknown as { __perf?: unknown }).__perf = { fps: Math.round(perf.fps * 10) / 10, renderMs: Math.round(perf.ms * 100) / 100, canvas: [canvas.width, canvas.height], video: [v.videoWidth, v.videoHeight], tracking: !!tracker };
      if (process.env.NODE_ENV !== "production") (window as unknown as { __face?: unknown }).__face = { faces: tracker?.latest.length ?? 0, status: tracker ? "ok" : "loading", sticker: stickerRt?.def.stickerId ?? null, shape: Object.keys(faceBeauty.warp), ops: faceBeauty.warpOps.length, layers: faceBeauty.makeup.layers?.length ?? 0, frames: (fc = fc + 1), params: face };
    };
    loop();
    return () => { cancelAnimationFrame(raf); r.dispose(); rendererRef.current = null; };
  }, [videoRef]);

  // canvas backing size follows the preview rect
  // Backing store: device pixels (≤ 2x), but never more than the camera actually delivers for the visible region
  // (no upscaled passes: at 720p a 2x backing store would run every pass on ~4x the pixels for no extra detail).
  const [videoDims, setVideoDims] = useState({ vw: 0, vh: 0 });
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !ready) return;
    const upd = () => setVideoDims((o) => (o.vw === v.videoWidth && o.vh === v.videoHeight ? o : { vw: v.videoWidth, vh: v.videoHeight }));
    upd();
    v.addEventListener("resize", upd);
    return () => v.removeEventListener("resize", upd);
  }, [videoRef, ready, facing]);
  useEffect(() => {
    const c = canvasRef.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { vw, vh } = videoDims;
    const srcPerCss = vw && vh ? (vw / vh > prev.w / prev.h ? vh / prev.h : vw / prev.w) : dpr;
    const k = Math.min(dpr, Math.max(1, srcPerCss));
    c.width = Math.round(prev.w * k);
    c.height = Math.round(prev.h * k);
  }, [prev.w, prev.h, videoDims]);

  // torch for the back camera (photo TORCH, video ON/TORCH)
  useEffect(() => {
    void setTorch(!front && (flash === "torch" || (mode === "VIDEO" && flash === "on")));
  }, [flash, front, mode, setTorch, ready]);

  // ---------- filter actions ----------
  const inventory = useFilterInventory();
  const categories: FilterCategory[] = useMemo(() => cameraFilterCategories(favorites, inventory), [favorites, inventory]);
  const [favTip] = useState(() => !loadPref("filterFavoriteTooltipShown", false));
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [selCat, setSelCat] = useState<number>(FILTER_CATEGORY.BASIC);
  const selectFilter = (f: LocalFilter, cat?: number) => {
    if (recording) return;
    if (f.key === filterKey) setSliderOpen((o) => f.key !== "ORIGINAL" && f.key !== "PRESET" && !o);
    else { setFilterKey(f.key); if (f.key === "ORIGINAL" || f.key === "PRESET") setSliderOpen(false); }
    if (cat) setSelCat(cat);
  };
  const swipeFilter = (dir: 1 | -1) => {
    const list = categories.find((c) => c.id === FILTER_CATEGORY.BASIC)?.filters ?? [];
    if (!list.length) return;
    const i = list.findIndex((f) => f.key === filterKey);
    const next = list[(i + dir + list.length) % list.length];
    setFilterKey(next.key);
    setFilterToast({ name: next.name, dir, k: stamp() });
  };
  const commitStrength = (v: number) => {
    setLiveStrength(null);
    const set = front ? setPowerFront : setPowerBack;
    set((m) => {
      const n = { ...m, [filter.key]: v };
      savePref(front ? "filterPowerByFilterId" : "filterPowerByFilterIdBack", n);
      return n;
    });
  };

  // ---------- centre text (timer countdown / hints) ----------
  const showCenter = (text: string, big: boolean, delay: number, dur: number) => setCenter({ text, big, k: uid(), delay, dur });

  // ---------- capture ----------
  /** Visible region of the GL surface as a canvas (mirrored per Settings → Mirror front camera). */
  const grabVisible = useCallback((): HTMLCanvasElement | null => {
    const c = canvasRef.current;
    if (!rendererRef.current || !c) return null;
    const s = c.width / prev.w;
    const vy = Math.max(vis.y, 0), vh = Math.min(vis.y + vis.h, H) - vy;
    const sx = Math.max(0, (vis.x - prev.x) * s), sy = Math.max(0, (vy - prev.y) * s);
    const sw = Math.min(c.width - sx, Math.min(vis.w, W) * s), sh = Math.min(c.height - sy, vh * s);
    const out = document.createElement("canvas");
    out.width = Math.round(sw);
    out.height = Math.round(sh);
    const ctx = out.getContext("2d")!;
    if (front && !getSetting(SETTINGS.mirrorFront)) { ctx.translate(out.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(c, sx, sy, sw, sh, 0, 0, out.width, out.height);
    return out;
  }, [prev, vis, front, W, H]);

  const toCapture = async (out: HTMLCanvasElement): Promise<Capture> => {
    const raw = await new Promise<Blob>((res) => out.toBlob((b) => res(b!), "image/jpeg", 0.95));
    const blob = await maybeWatermarkPhoto(raw);
    return { blob, url: URL.createObjectURL(blob), width: out.width, height: out.height, isVideo: false };
  };

  /** Front camera: a warm full-screen flash; back camera: a torch pulse. */
  const withFlash = useCallback(async <T,>(fn: () => T | Promise<T>): Promise<T> => {
    const screen = front && (flash === "on" || flash === "torch");
    const torch = !front && (flash === "on" || flash === "auto");
    if (screen) { setScreenFlash(true); await new Promise((r) => setTimeout(r, 250)); }
    if (torch) { await setTorch(true); await new Promise((r) => setTimeout(r, 300)); }
    try { return await fn(); } finally {
      setScreenFlash(false);
      if (torch) void setTorch(false);
    }
  }, [front, flash, setTorch]);

  const playClick = () => {
    try {
      const ac = new AudioContext();
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = 1800; g.gain.setValueAtTime(0.15, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.06);
      o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.07);
      window.setTimeout(() => void ac.close(), 200);
    } catch {}
  };

  const openConfirm = useCallback((cap: Capture) => {
    setPanel("none"); setMoreOpen(false); setChildMenu("none");
    setCapture(cap);
  }, []);

  const takePhoto = useCallback(async () => {
    const out = await withFlash(() => grabVisible());
    if (!out) return;
    playClick();
    openConfirm(await toCapture(out));
  }, [withFlash, grabVisible, openConfirm]);

  // Layout (collage) mode: each shot fills the next cell of the grid.
  const gridDef = GRIDS.find((g) => g.id === grid)!;
  const takeLayoutShot = useCallback(async () => {
    const out = await withFlash(() => grabVisible());
    if (!out) return;
    playClick();
    const cell = gridDef.cells[shots.length];
    const r = cellRect(cell, { x: 0, y: 0, w: out.width, h: out.height });
    const piece = document.createElement("canvas");
    piece.width = Math.round(r.w); piece.height = Math.round(r.h);
    piece.getContext("2d")!.drawImage(out, r.x, r.y, r.w, r.h, 0, 0, piece.width, piece.height);
    const url = piece.toDataURL("image/jpeg", 0.95);
    const next = [...shots, url];
    if (next.length < gridDef.cells.length) { setShots(next); return; }
    // compose
    const all = document.createElement("canvas");
    all.width = out.width; all.height = out.height;
    const ctx = all.getContext("2d")!;
    await Promise.all(next.map((u, i) => new Promise<void>((res) => {
      const img = new Image();
      img.onload = () => { const rr = cellRect(gridDef.cells[i], { x: 0, y: 0, w: all.width, h: all.height }); ctx.drawImage(img, rr.x, rr.y, rr.w, rr.h); res(); };
      img.src = u;
    })));
    setShots([]);
    openConfirm(await toCapture(all));
  }, [withFlash, grabVisible, gridDef, shots, openConfirm]);

  // ---------- recording (multi-clip MediaRecorder on the GL canvas) ----------
  const openVideoConfirm = useCallback((r: RecordingResult) => {
    openConfirm({
      blob: r.clips[0], url: URL.createObjectURL(r.clips[0]), width: r.width, height: r.height, isVideo: true,
      clips: r.clips, ready: r.clips.length > 1 ? r.ready : undefined,
    });
  }, [openConfirm]);
  const rec = useRecorder({
    getCanvas: () => canvasRef.current,
    getCrop: () => {
      const c = canvasRef.current!;
      const s = c.width / prev.w;
      const sx = Math.max(0, (vis.x - prev.x) * s), sy = Math.max(0, (vis.y - prev.y) * s);
      return { sx, sy, sw: Math.min(c.width - sx, vis.w * s), sh: Math.min(c.height - sy, vis.h * s), flip: front && !getSetting(SETTINGS.mirrorFront) };
    },
    onAutoStop: openVideoConfirm,
    onError: showToast,
  });
  const recording = rec.status !== "idle" || !!bounceProg;
  const videoMax = REC[recIdx].ms;
  const recClock = useFrameClock(rec.status === "recording");
  const recElapsed = rec.totalMs + (rec.status === "recording" && rec.clipStartedAt !== null ? Math.max(0, recClock - rec.clipStartedAt) : 0);
  const finishRecording = () => void rec.finish().then((r) => r && openVideoConfirm(r));

  // Bounce: 1.5 s of frames played forward then backward at 2x, three loops.
  const bounceRef = useRef(false);
  const takeBounce = useCallback(async () => {
    if (bounceRef.current || typeof MediaRecorder === "undefined") return;
    bounceRef.current = true;
    const frames: ImageBitmap[] = [];
    const start = perfNow();
    setBounceProg({ start, progress: 0 });
    while (perfNow() - start < 1500) {
      const out = grabVisible();
      if (out) frames.push(await createImageBitmap(out));
      const el = perfNow() - start;
      setBounceProg({ start, progress: Math.min(1, el / 1500) });
      await new Promise((r) => setTimeout(r, 50));
    }
    if (!frames.length) { setBounceProg(null); bounceRef.current = false; return; }
    const cv = document.createElement("canvas");
    cv.width = frames[0].width; cv.height = frames[0].height;
    const ctx = cv.getContext("2d")!;
    const type = MediaRecorder.isTypeSupported("video/mp4") ? "video/mp4" : "video/webm";
    const rec = new MediaRecorder(cv.captureStream(30), { mimeType: type });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise<void>((res) => { rec.onstop = () => res(); });
    ctx.drawImage(frames[0], 0, 0);
    rec.start();
    const seq = [...frames, ...frames.slice(1, -1).reverse()];
    for (let loop = 0; loop < 3; loop++) {
      for (const f of seq) { ctx.drawImage(f, 0, 0); await new Promise((r) => setTimeout(r, 25)); }
    }
    rec.stop();
    await done;
    frames.forEach((f) => f.close());
    const blob = new Blob(chunks, { type });
    setBounceProg(null);
    bounceRef.current = false;
    openConfirm({ blob, url: URL.createObjectURL(blob), width: cv.width, height: cv.height, isVideo: true });
  }, [grabVisible, openConfirm]);

  // ---------- timer countdown ----------
  const timerRef = useRef<number[]>([]);
  const cancelTimer = () => { timerRef.current.forEach((t) => window.clearTimeout(t)); timerRef.current = []; setCountdown(false); setCenter(null); };
  const startTimer = (then: () => void) => {
    const ms = TIMERS[timerIdx];
    if (!ms) return then();
    const n0 = ms / 1000;
    setCountdown(true);
    for (let i = 0; i < n0; i++) {
      const n = n0 - i;
      timerRef.current.push(window.setTimeout(() => showCenter(String(n), true, n === 1 ? 1000 : 1e9, 200), i * 1000));
    }
    timerRef.current.push(window.setTimeout(() => { timerRef.current = []; setCountdown(false); then(); }, ms));
  };

  const doShoot = () => {
    if (mode === "VIDEO") {
      // tap pauses / resumes; the check on the clip bar finishes
      if (rec.status === "recording") return void rec.pause();
      if (rec.status === "paused") return rec.resume();
      return startTimer(() => void rec.start(videoMax));
    }
    if (rec.status === "recording") return finishRecording();
    if (bounce) return startTimer(() => void takeBounce());
    if (layoutOn) return startTimer(() => void takeLayoutShot());
    startTimer(() => void takePhoto());
  };
  const onShutterTap = () => {
    if (lpGuide === "shown") setLpGuide("done");
    if (countdown) return cancelTimer();
    setMoreOpen(false); setChildMenu("none");
    doShoot();
  };

  // dev-only hook for headless verification (no real pointer on the shutter)
  const shootRef = useRef(onShutterTap);
  useLayoutEffect(() => { shootRef.current = onShutterTap; });
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as { __oeShoot?: () => void }).__oeShoot = () => shootRef.current();
  }, []);

  // ---------- menu actions ----------
  // flash modes available for the current camera and mode (front "on" = screen flash)
  const flashModes: Flash[] = mode === "VIDEO"
    ? (front ? ["off", "on"] : caps.torch ? ["off", "torch"] : ["off"])
    : front ? ["off", "on"] : caps.torch ? ["off", "auto", "on", "torch"] : ["off"];
  const cycleFlash = () => {
    const list = flashModes;
    if (list.length === 1) return showToast("Flash isn’t available on this camera.");
    setFlash(list[(list.indexOf(flash) + 1) % list.length] ?? "off");
  };
  const cycleTimer = () => {
    const n = (timerIdx + 1) % 3;
    setTimerIdx(n);
    showCenter(n === 0 ? "Timer off" : `${TIMERS[n] / 1000}s`, false, 1200, 400);
  };
  const toggleMore = () => { setChildMenu("none"); setMoreOpen((o) => !o); };
  const toggleBounce = () => { setBounce((b) => !b); setLayoutOn(false); setShots([]); };
  const toggleLayout = () => {
    if (layoutOn) { setLayoutOn(false); setShots([]); setGridPopover("closed"); return; }
    setBounce(false); setLayoutOn(true); setShots([]); setGridPopover("open");
  };
  const closeGridPopover = () => { if (gridPopover === "open") { setGridPopover("closing"); window.setTimeout(() => setGridPopover("closed"), 100); } };
  const pickGrid = (g: Grid) => { setGrid(g); setShots([]); closeGridPopover(); };

  const switchMode = (m: Mode) => {
    if (m === mode || recording || countdown) return;
    setMode(m);
    setChildMenu("none");
    setBounce(false); setLayoutOn(false); setShots([]); setGridPopover("closed");
    // to video: keep the light only if it was on; back to photo: torch becomes on
    setFlash((f) => (m === "VIDEO" ? (f === "on" || f === "torch" ? (front ? "on" : "torch") : "off") : f === "torch" ? "on" : f));
  };
  const switchCamera = () => {
    if (recording) return;
    setFacing((f) => (f === "user" ? "environment" : "user"));
    setFlash((f) => (f === "auto" || f === "torch" ? "off" : f));
    setZoom(1);
  };

  // first time in Video mode: a hint that longer recordings are possible
  const [recTip, setRecTip] = useState<boolean>(() => loadPref("keyRecordingTimeTooltip", true));
  const pickRec = (i: number) => {
    if (recording) return showToast("Change the length before you start recording.");
    setRecIdx(i); setChildMenu("none");
    if (recTip) { setRecTip(false); savePref("keyRecordingTimeTooltip", false); }
  };

  // ---------- gestures on the preview ----------
  // exposure slider: a vertical track near the right edge, across the middle of the visible frame
  const expLine = useMemo(() => {
    const top = Math.max(vis.y, 0) + Math.min(vis.h, H) * 0.32;
    const len = Math.min(vis.h, H) * 0.3;
    return { x: W - 30, top, bottom: top + len, len };
  }, [W, H, vis.y, vis.h]);
  const expTimers = useRef<number[]>([]);
  const armExposureTimers = () => {
    expTimers.current.forEach((t) => window.clearTimeout(t));
    expTimers.current = [
      window.setTimeout(() => setExposure((e) => ({ ...e, visible: false })), 2000),
      // after 5 s the camera goes back to automatic exposure
      window.setTimeout(() => setExposure((e) => ({ ...e, v: 0 })), 5000),
    ];
  };
  const DEAD = 20; // px dead zone around 0
  const g = useRef<{
    x: number; y: number; moved: boolean; lastTap: { t: number; x: number; y: number }; pinch?: { d: number; z: number; step: number; acc: number };
    ptrs: Map<number, { x: number; y: number }>; exp?: { v0: number }; lp?: number; lpFired?: boolean; tapTimer?: number;
  }>({ x: 0, y: 0, moved: false, lastTap: { t: 0, x: 0, y: 0 }, ptrs: new Map() });

  // laptop trackpad pinch arrives as ctrl+wheel (non-passive so the page itself doesn't zoom): same zoom-index model
  const touchRef = useRef<HTMLDivElement>(null);
  const prevW = prev.w;
  useEffect(() => {
    const el = touchRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((z) => stepToZoom(Math.max(0, Math.min(ZOOM_STEPS, zoomToStep(z) + Math.round((-e.deltaY * 4) / (prevW / ZOOM_STEPS))))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [prevW]);
  const local = (e: React.PointerEvent) => {
    const r = rootRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onPointerDown = (e: React.PointerEvent) => {
    const s = g.current;
    const p = local(e);
    s.ptrs.set(e.pointerId, p);
    try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch {}
    if (s.ptrs.size === 2) {
      const [a, b] = [...s.ptrs.values()];
      s.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom, step: zoomToStep(zoom), acc: 0 };
      window.clearTimeout(s.lp);
      return;
    }
    Object.assign(s, { x: p.x, y: p.y, moved: false, exp: undefined, lpFired: false });
    // grab the exposure track (±16 px) while it is visible
    if (exposure.visible && Math.abs(p.x - expLine.x) <= 16 && p.y >= expLine.top - 16 && p.y <= expLine.bottom + 16) {
      s.exp = { v0: exposure.v };
      setExposure((x) => ({ ...x, dragging: true, k: stamp() }));
      expTimers.current.forEach((t) => window.clearTimeout(t));
      return;
    }
    if (touchShoot && !capture && mode === "NORMAL" && !overlayOpen) {
      s.lp = window.setTimeout(() => { s.lpFired = true; void rec.start(LONG_PRESS_MAX_MS); }, 500);
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = g.current;
    if (!s.ptrs.has(e.pointerId)) return;
    const p = local(e);
    s.ptrs.set(e.pointerId, p);
    if (s.ptrs.size === 2 && s.pinch) {
      const [a, b] = [...s.ptrs.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      // pinch distance change moves the zoom step by delta / (previewWidth / steps); fractions carry over
      s.pinch.acc += (dist - s.pinch.d) / (prev.w / ZOOM_STEPS);
      s.pinch.d = dist;
      const whole = Math.trunc(s.pinch.acc);
      s.pinch.acc -= whole;
      s.pinch.step = Math.max(0, Math.min(ZOOM_STEPS, s.pinch.step + whole));
      setZoom(stepToZoom(s.pinch.step));
      s.moved = true;
      return;
    }
    const dx = p.x - s.x, dy = p.y - s.y;
    if (s.exp) {
      // drag: v = v0 + dy·2/len, the dead zone snaps to 0
      let v = s.exp.v0 + (dy * 2) / expLine.len;
      if (Math.abs(v) <= DEAD / expLine.len) v = 0;
      v = Math.max(-1, Math.min(1, v));
      setExposure((x) => ({ ...x, v, dragging: true }));
      s.moved = true;
      return;
    }
    if (Math.hypot(dx, dy) >= 20) {
      window.clearTimeout(s.lp);
      if (!s.moved && 2 * Math.abs(dx) > 3 * Math.abs(dy) && !recording && !capture && !overlayOpen && !inventoryOpen) swipeFilter(dx < 0 ? 1 : -1);
      s.moved = true;
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = g.current;
    const p = local(e);
    s.ptrs.delete(e.pointerId);
    window.clearTimeout(s.lp);
    if (s.lpFired) { s.lpFired = false; finishRecording(); return; }
    if (s.ptrs.size > 0) return;
    s.pinch = undefined;
    if (s.exp) {
      if (!s.moved) {
        // tap on the strip sets the absolute value
        let v = ((p.y - expLine.top) * 2) / expLine.len - 1;
        if (Math.abs(v) <= DEAD / expLine.len) v = 0;
        setExposure((x) => ({ ...x, v: Math.max(-1, Math.min(1, v)) }));
      }
      s.exp = undefined;
      setExposure((x) => ({ ...x, dragging: false, k: stamp() }));
      armExposureTimers();
      return;
    }
    if (s.moved) return;
    stickerRt?.tap(); // effects with tap triggers
    const now = stamp();
    // close any open overlay first
    if (moreOpen) { setMoreOpen(false); return; }
    if (childMenu !== "none") { setChildMenu("none"); return; }
    if (gridPopover === "open") { closeGridPopover(); return; }
    if (panel !== "none") { setPanel("none"); setSliderOpen(false); return; }
    // double tap switches cameras
    const lt = s.lastTap;
    if (now - lt.t < 300 && Math.hypot(p.x - lt.x, p.y - lt.y) < 60) {
      s.lastTap = { t: 0, x: 0, y: 0 };
      window.clearTimeout(s.tapTimer);
      setFocus(null);
      switchCamera();
      return;
    }
    s.lastTap = { t: now, x: p.x, y: p.y };
    if (touchShoot) {
      s.tapTimer = window.setTimeout(() => onShutterTap(), 300);
      return;
    }
    // manual focus + exposure, clamped inside the visible preview
    const vy = Math.max(vis.y, 0), vb = Math.min(vis.y + vis.h, H);
    const x = Math.min(Math.max(p.x, vis.x + 36), vis.x + vis.w - 36);
    const y = Math.min(Math.max(p.y, vy + 36), vb - 36);
    setFocus({ x, y, k: now });
    setExposure({ v: 0, visible: true, dragging: false, k: now });
    armExposureTimers();
  };

  // hardware back: close the open overlay / panel first; with nothing open the press is not handled here
  useBackHandler(() => {
    if (moreOpen) { setMoreOpen(false); return; }
    if (childMenu !== "none") { setChildMenu("none"); return; }
    if (gridPopover === "open") { closeGridPopover(); return; }
    if (panel !== "none") { setPanel("none"); setSliderOpen(false); return; }
    return false;
  });
  const guideReady = lpGuide === "pending" && ready && perm === "granted" && mode === "NORMAL" && panel === "none" && !capture && !moreOpen && rec.status === "idle" && !countdown && !bounce && !layoutOn;
  useEffect(() => {
    if (!guideReady) return;
    const a = window.setTimeout(() => { setLpGuide("shown"); savePref("guideLongPressToVideo", true); }, 100);
    return () => window.clearTimeout(a);
  }, [guideReady]);
  useEffect(() => {
    if (lpGuide !== "shown") return;
    const t = window.setTimeout(() => setLpGuide("done"), 2400);
    return () => window.clearTimeout(t);
  }, [lpGuide]);

  // ---------- confirm ----------
  const closeConfirm = () => { if (capture) URL.revokeObjectURL(capture.url); setCapture(null); };

  const overlayOpen = musicOpen;
  const shrink = panel !== "none";
  const camReady = ready && perm === "granted";
  const showNav = !shrink && !capture && !recording && !countdown && !overlayOpen;
  const showMenus = !capture && !shrink && !recording && !countdown;
  const shutterY = shutterCenter(H, true);
  const panelH = panel === "filter" ? FILTER_PANEL_H : panel === "beauty" ? BEAUTY_PANEL_H : panel === "sticker" ? STICKER_PANEL_H : 0;
  const shutterBottom = shrink ? panelH + 64 + 12 : shutterY - SHUTTER / 2;

  // More popover: fade in/out
  const [moreMounted, setMoreMounted] = useState(moreOpen);
  useEffect(() => {
    if (moreOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mount for the fade-in
      setMoreMounted(true);
      return;
    }
    const t = window.setTimeout(() => setMoreMounted(false), 300);
    return () => window.clearTimeout(t);
  }, [moreOpen]);

  const toggleTouch = () => {
    const on = !touchShoot;
    setTouchShoot(on);
    setFooterTip(on);
    if (on) window.setTimeout(() => setFooterTip(false), 2000);
  };

  const visTop = Math.max(vis.y, 0), visBottom = Math.min(vis.y + vis.h, H);
  const timerOn = timerIdx > 0;
  const flashIcon: IconName = flash === "off" ? "flash-off" : flash === "torch" ? "torch" : "flash-on";
  const tools: ToolDef[] = layoutOn
    ? [
        { id: "collage-off", icon: "close", label: "Leave collage", on: toggleLayout },
        { id: "grid", icon: "collage", label: `Layout: ${gridDef.label}`, text: gridDef.label, active: gridPopover !== "closed", on: () => (gridPopover === "closed" ? setGridPopover("open") : closeGridPopover()) },
      ]
    : [
        { id: "flash", icon: flashIcon, label: `Flash: ${flash}`, active: flash !== "off", badge: flash === "auto" ? "A" : undefined, on: cycleFlash },
        { id: "timer", icon: timerOn ? "timer" : "timer-off", label: timerOn ? `Timer: ${TIMERS[timerIdx] / 1000} seconds` : "Timer off", active: timerOn, badge: timerOn ? String(TIMERS[timerIdx] / 1000) : undefined, on: cycleTimer },
        { id: "ratio", icon: "ratio", label: `Frame: ${RATIO_LABEL[ratio]}`, text: RATIO_LABEL[ratio], active: childMenu === "ratio", on: () => { setMoreOpen(false); setChildMenu((c) => (c === "ratio" ? "none" : "ratio")); } },
        ...(mode === "NORMAL"
          ? [
              { id: "bounce", icon: "bounce", label: bounce ? "Bounce on" : "Bounce off", active: bounce, on: toggleBounce } as ToolDef,
              { id: "collage", icon: "collage", label: "Collage", on: toggleLayout } as ToolDef,
              { id: "music", icon: "music", label: "Music", on: () => { setChildMenu("none"); setMoreOpen(false); setMusicOpen(true); } } as ToolDef,
            ]
          : [{ id: "length", icon: "clock", label: `Max length: ${REC[recIdx].label}`, text: REC[recIdx].label.replace(" min", "m"), active: childMenu === "rec", dot: recTip, on: () => { setMoreOpen(false); setChildMenu((c) => (c === "rec" ? "none" : "rec")); } } as ToolDef]),
        { id: "more", icon: "more", label: "More options", active: moreOpen, on: toggleMore },
      ];

  return (
    <div ref={rootRef} className="absolute inset-0 select-none overflow-hidden bg-bg">
      <canvas ref={canvasRef} className="absolute" style={{ left: prev.x, top: prev.y, width: prev.w, height: prev.h }} />

      {/* collage: finished cells show their shot, upcoming cells are dimmed */}
      {layoutOn && !capture && (
        <div className="pointer-events-none absolute" style={{ left: vis.x, top: visTop, width: Math.min(vis.w, W), height: visBottom - visTop }}>
          {gridDef.cells.map((c, i) => {
            const r = cellRect(c, { x: 0, y: 0, w: 100, h: 100 });
            return (
              <div key={i} className="absolute" style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%`, outline: "1px solid rgba(255,255,255,.7)", background: i > shots.length ? "rgba(0,0,0,.55)" : undefined }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {shots[i] && <img src={shots[i]} alt="" className="h-full w-full object-cover" />}
                {i === shots.length && <span className="absolute left-2 top-2 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-on-accent">{i + 1}/{gridDef.cells.length}</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* 1:1 crops the 3:4 frame */}
      {ratio === "1:1" && (
        <>
          <div className="absolute inset-x-0 bg-bg" style={{ top: prev.y, height: vis.y - prev.y }} />
          <div className="absolute inset-x-0 bg-bg" style={{ top: vis.y + vis.h, height: prevBottom - (vis.y + vis.h) }} />
        </>
      )}

      {/* rule-of-thirds grid (Settings) */}
      {gridLines && !layoutOn && (
        <div className="pointer-events-none absolute" style={{ left: vis.x, top: visTop, width: Math.min(vis.w, W), height: visBottom - visTop }}>
          {[1, 2].map((i) => <div key={`v${i}`} className="absolute inset-y-0 w-px bg-white/45" style={{ left: `${(i * 100) / 3}%` }} />)}
          {[1, 2].map((i) => <div key={`h${i}`} className="absolute inset-x-0 h-px bg-white/45" style={{ top: `${(i * 100) / 3}%` }} />)}
        </div>
      )}

      {/* dark until the first frame */}
      {!camReady && <div className="absolute inset-x-0 top-0 bg-[#050608]" style={{ height: Math.min(prevBottom, H) }} />}

      {/* legibility gradients when the controls sit on the picture */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/40 to-transparent" />
      {overPreview && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/45 to-transparent" />}

      {/* touch surface */}
      <div
        className="absolute inset-0 touch-none"
        ref={touchRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(e) => { g.current.ptrs.delete(e.pointerId); window.clearTimeout(g.current.lp); }}
      />

      {/* focus reticle */}
      {focus && (
        <span
          key={focus.k}
          className="pointer-events-none absolute h-16 w-16 rounded-md border-2 border-accent"
          style={{ left: focus.x, top: focus.y, transform: "translate(-50%,-50%)", animation: "oe-focus 220ms var(--oe-ease), oe-fade-out 400ms 2200ms forwards" }}
          onAnimationEnd={(e) => { if (e.animationName === "oe-fade-out") setFocus(null); }}
        />
      )}
      <style href="oe-camera-kf" precedence="default">{"@keyframes oe-focus{from{transform:translate(-50%,-50%) scale(1.35);opacity:.4}to{transform:translate(-50%,-50%) scale(1);opacity:1}}"}</style>

      {exposure.visible && camReady && <ExposureSlider line={expLine} v={exposure.v} dragging={exposure.dragging} />}

      {/* centre text: countdown numbers / short hints */}
      {center && (
        <div
          key={center.k}
          className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 font-display font-bold text-white [text-shadow:0_2px_12px_rgba(0,0,0,.45)]"
          style={{ top: visTop + (visBottom - visTop) / 2, fontSize: center.big ? 96 : 28, animation: center.delay < 1e8 ? `oe-fade-out ${center.dur}ms ${center.delay}ms forwards` : "oe-pop 200ms" }}
          onAnimationEnd={(e) => { if (e.animationName === "oe-fade-out") setCenter((c) => (c && c.k === center.k ? null : c)); }}
        >
          {center.text}
        </div>
      )}

      {/* filter name after a swipe */}
      {filterToast && (
        <div
          key={filterToast.k}
          className="pointer-events-none absolute left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-glass px-4 py-2 font-display text-[16px] font-semibold text-white backdrop-blur-md"
          style={{ top: TOOLBAR_H + 64, animation: "oe-pop 180ms, oe-fade-out 400ms 1300ms forwards" }}
          onAnimationEnd={(e) => { if (e.animationName === "oe-fade-out") setFilterToast(null); }}
        >
          <Icon name="filter" size={16} /> {filterToast.name}
        </div>
      )}

      {/* first launch: ask for the camera */}
      {perm === "prompt" && !requested && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center px-10 text-center">
          <Logo size={64} />
          <p className="mt-6 font-display text-[24px] font-bold">Ready when you are</p>
          <p className="mt-2 text-[14px] leading-relaxed text-fg-2">Open_Edit needs your camera to take photos and videos. Everything stays on this device.</p>
          <Button className="mt-7" size="lg" icon="camera" onClick={() => setRequested(true)}>Turn on camera</Button>
          <button type="button" className="mt-4 text-[14px] font-medium text-fg-2 underline-offset-4 hover:underline" onClick={() => router.push("/gallery")}>Edit a photo instead</button>
        </div>
      )}

      {/* recording time */}
      {rec.status !== "idle" && mode === "VIDEO" && (
        <div className="tabular pointer-events-none absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-glass px-3 py-1.5 text-[14px] font-semibold text-white backdrop-blur-md">
          <span className="h-2 w-2 rounded-full bg-danger" style={{ animation: rec.status === "recording" ? "oe-pulse 1s infinite" : undefined }} />
          {pad2(Math.floor(recElapsed / 60000))}:{pad2(Math.floor(recElapsed / 1000) % 60)}
        </div>
      )}

      {/* top toolbar */}
      {!capture && !recording && !countdown && camReady && (
        <div className="absolute inset-x-0 top-0 z-20" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          {layoutOn && shots.length > 0 ? (
            <div className="flex items-center px-3" style={{ height: TOOLBAR_H }}>
              <Button size="sm" variant="glass" icon="undo" className="rounded-full" onClick={() => setShots((s) => s.slice(0, -1))}>Retake last</Button>
            </div>
          ) : (
            <div className="flex items-center justify-between px-3" style={{ height: TOOLBAR_H }}>
              {tools.map((t) => <ToolButton key={t.id} t={t} />)}
            </div>
          )}

          {childMenu === "ratio" && (
            <OptionRow>
              {RATIOS.map((r) => <OptionChip key={r} on={r === ratio} onClick={() => { setRatio(r); window.setTimeout(() => setChildMenu("none"), 150); }}><RatioGlyph r={r} />{RATIO_LABEL[r]}</OptionChip>)}
            </OptionRow>
          )}
          {childMenu === "rec" && (
            <OptionRow>
              {REC.map((r, i) => <OptionChip key={r.label} on={i === recIdx} onClick={() => pickRec(i)}>{r.label}</OptionChip>)}
            </OptionRow>
          )}
          {layoutOn && gridPopover !== "closed" && (
            <OptionRow>
              {GRIDS.map((gd) => (
                <OptionChip key={gd.id} on={gd.id === grid} onClick={() => pickGrid(gd.id)} label={gd.label}>
                  <GridGlyph cells={gd.cells} />
                </OptionChip>
              ))}
            </OptionRow>
          )}
          {mode === "VIDEO" && recTip && childMenu !== "rec" && (
            <div className="mx-auto mt-1 w-fit rounded-full bg-accent px-3 py-1.5 text-[12px] font-semibold text-on-accent shadow-lg" style={{ animation: "oe-rise 240ms" }}>
              Videos can be up to 30 minutes. Tap the clock to change the length.
            </div>
          )}
        </div>
      )}

      {/* More popover */}
      {moreMounted && !capture && (
        <div className="absolute right-3 z-30 w-[268px] rounded-lg bg-panel/92 p-1.5 shadow-2xl ring-1 ring-line backdrop-blur-xl" style={{ top: TOOLBAR_H + 4, opacity: moreOpen ? 1 : 0, transition: "opacity 200ms", animation: moreOpen ? "oe-pop 180ms var(--oe-ease)" : undefined }}>
          <MoreRow icon="touch" title="Tap to shoot" desc="Tap the preview to take a photo; hold to record." on={touchShoot} onChange={toggleTouch} />
          <MoreRow icon="beauty" title="Makeup" desc="Apply your makeup look to shots." on={makeup} onChange={setMakeup} />
          <MoreRow icon="night" title="Night light" desc="Turns the screen into a soft light for selfies." on={night} onChange={setNight} />
          <MoreRow icon="save" title="Auto-save" desc="Save every shot to the gallery right away." on={autoSave} onChange={setAutoSave} />
          <button type="button" onClick={() => { setMoreOpen(false); router.push("/settings"); }} className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-[14px] font-medium active:bg-raised">
            <Icon name="settings" size={20} className="text-fg-2" /> <span className="flex-1">Camera settings</span> <Icon name="chevron-right" size={18} className="text-fg-3" />
          </button>
          {footerTip && <p className="m-1.5 rounded-sm bg-accent px-3 py-2 text-[12px] font-semibold text-on-accent">Tap anywhere on the preview to shoot.</p>}
        </div>
      )}

      {/* drawers */}
      {panel === "filter" && (
        <FilterPanel
          categories={categories}
          selectedKey={`${categories.find((c) => c.id === selCat && c.filters.some((f) => f.key === filterKey))?.id ?? categories.find((c) => c.filters.some((f) => f.key === filterKey))?.id ?? FILTER_CATEGORY.BASIC}:${filterKey}`}
          favorites={favorites}
          showSlider={sliderOpen && filter.key !== "ORIGINAL" && filter.key !== "PRESET"}
          onSelect={(f, cat) => selectFilter(f, cat)}
          onToggleFavorite={(f) => setFavorites((fs) => (fs.includes(f.key) ? fs.filter((k) => k !== f.key) : [...fs, f.key]))}
          onClose={() => setPanel("none")}
          recording={recording}
          onToast={showToast}
          strength={{ value: strength, def: defStrength, onChange: setLiveStrength, onCommit: commitStrength }}
          favoriteTooltip={favTip}
          onFavoriteTooltipShown={() => savePref("filterFavoriteTooltipShown", true)}
          inventoryOpen={inventoryOpen}
          onInventoryOpenChange={setInventoryOpen}
        />
      )}
      {panel === "beauty" && (
        <BeautyPanel state={beautyState} onChange={(k, v) => setBeautyState((b) => applyBeautyChange(b, k, v))} onClose={() => setPanel("none")} onOriginal={setBeautyOriginal} />
      )}
      {panel === "sticker" && (
        <StickerPanel
          selectedId={stickerId}
          onSelect={(st: Sticker | null) => setStickerId(st?.id ?? null)}
          onRemoveEffect={() => setStickerId(null)}
          onClose={() => setPanel("none")}
          loadingId={stickerId != null && (faceStatus === "loading" || stickerLoading === stickerId) ? stickerId : null}
        />
      )}

      {/* effect needs a face */}
      {stickerRt && faceStatus === "ready" && !hasFace && !capture && (
        <div className="pointer-events-none absolute inset-x-0 z-20 flex justify-center" style={{ bottom: (shrink ? panelH + 120 : dockBottom(H) + DOCK_HEIGHT + 16) }}>
          <p className="flex items-center gap-2 rounded-full bg-glass px-4 py-2 text-[14px] font-medium text-white backdrop-blur-md" style={{ animation: "oe-pulse 1.6s ease-in-out infinite" }}>
            <Icon name="face" size={18} /> Point the camera at a face
          </p>
        </div>
      )}

      {/* dock: Filters · Beauty · Effects */}
      {showMenus && camReady && (
        <div className="absolute inset-x-0 z-20 flex justify-center gap-2 px-4" style={{ bottom: dockBottom(H), height: DOCK_HEIGHT }}>
          <DockButton icon="filter" label="Filters" value={filter.key !== "ORIGINAL" ? filter.name : undefined} onClick={() => { setMoreOpen(false); setChildMenu("none"); setPanel("filter"); }} />
          <DockButton icon="beauty" label="Beauty" onClick={() => { setMoreOpen(false); setChildMenu("none"); setPanel("beauty"); }} />
          <DockButton icon="effects" label="Effects" dot={stickerId != null} onClick={() => { setMoreOpen(false); setChildMenu("none"); setPanel("sticker"); }} />
        </div>
      )}

      {/* shutter row */}
      {!capture && camReady && (
        <>
          <div className="absolute inset-x-0 z-20 flex items-center justify-between px-8" style={{ bottom: shutterY - 26, height: 52, opacity: shrink || recording || countdown ? 0 : 1, pointerEvents: shrink || recording || countdown ? "none" : undefined, transition: "opacity 200ms" }}>
            <button type="button" aria-label="Open gallery" onClick={() => router.push("/gallery")} className="oe-press relative h-12 w-12 overflow-hidden rounded-md bg-raised ring-2 ring-white/85">
              {thumb
                ? thumbVideo
                  ? <video src={`${thumb}#t=0.1`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={thumb} alt="" className="h-full w-full object-cover" />
                : <Icon name="gallery" size={22} className="absolute inset-0 m-auto text-fg-2" />}
            </button>
            <IconButton icon="flip" label="Switch camera" variant="glass" size={48} iconSize={24} onClick={switchCamera} />
          </div>
          <div className="absolute left-1/2 z-40" style={{ bottom: shutterBottom, transform: `translateX(-50%) scale(${shrink ? 0.78 : 1})`, transformOrigin: "bottom center", transition: "transform 200ms var(--oe-ease), bottom 200ms var(--oe-ease)" }}>
            <Shutter
              glow={overPreview || shrink}
              mode={mode}
              status={bounceProg ? "recording" : rec.status === "idle" ? "normal" : rec.status}
              clipStartedAt={bounceProg ? bounceProg.start : rec.clipStartedAt}
              maxMs={bounceProg ? 1500 : rec.maxMs}
              timerActive={countdown}
              bounce={bounce}
              onTap={onShutterTap}
              onLongPressStart={() => {
                if (mode === "VIDEO") return rec.status === "paused" ? rec.resume() : void rec.start(videoMax);
                if (!bounce && !layoutOn) void rec.start(LONG_PRESS_MAX_MS);
              }}
              onLongPressEnd={() => {
                if (mode === "VIDEO") return void rec.pause();
                if (rec.status !== "idle") finishRecording();
              }}
            />
          </div>
        </>
      )}

      {/* Photo / Video */}
      {showMenus && camReady && (
        <div className="absolute left-1/2 z-20 flex -translate-x-1/2 gap-1" style={{ bottom: 64 + 6 }}>
          {(["NORMAL", "VIDEO"] as Mode[]).map((m) => (
            <button key={m} type="button" aria-pressed={m === mode} onClick={() => switchMode(m)}
              className={cx("h-8 rounded-full px-4 text-[13px] font-bold tracking-wide transition-colors", m === mode ? "bg-white text-[#111]" : "text-white/75 [text-shadow:0_1px_3px_rgba(0,0,0,.5)]")}>
              {m === "NORMAL" ? "Photo" : "Video"}
            </button>
          ))}
        </div>
      )}

      {/* first-run hint: hold the shutter */}
      {lpGuide === "shown" && mode === "NORMAL" && panel === "none" && !capture && camReady && rec.status === "idle" && (
        <div className="pointer-events-none absolute inset-x-0 z-30 flex justify-center" style={{ bottom: shutterY + SHUTTER / 2 + 12, animation: "oe-rise 300ms" }}>
          <span className="rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-on-accent shadow-lg">Hold the shutter to record a clip</span>
        </div>
      )}

      {mode === "VIDEO" && !capture && !countdown && camReady && (
        <VideoClipBar
          clips={rec.durations}
          runningSince={rec.status === "recording" ? rec.clipStartedAt : null}
          showButtons={rec.status === "paused"}
          undoArmed={rec.undoArmed}
          nextEnabled={rec.totalMs >= 1000}
          onUndo={rec.undo}
          onNext={finishRecording}
          bottom={clipBarBottom(shutterY)}
        />
      )}

      {/* night light: a soft white overlay that lights the subject */}
      {night && !capture && <div className="pointer-events-none absolute inset-0 z-40 bg-white" style={{ opacity: 0.45 }} />}

      {showNav && <BottomNav active="camera" tone={overPreview ? "overlay" : "solid"} />}

      {musicOpen && <MusicList onClose={() => setMusicOpen(false)} />}

      {/* front-camera flash */}
      {screenFlash && <div className="absolute inset-0 z-50" style={{ background: "#fff4dc" }} />}

      {capture && (
        <ConfirmScreen capture={capture} rect={vis} ratio={ratio} autoSave={autoSave} onBack={closeConfirm} onEdit={(id) => router.push(`/edit?id=${id}`)} />
      )}

      {perm === "denied" && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-scrim px-8">
          <div className="w-full max-w-[320px] rounded-lg bg-panel p-5 shadow-2xl">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-danger/15 text-danger"><Icon name="camera-off" size={22} /></span>
            <p className="font-display text-[18px] font-semibold">Camera access is blocked</p>
            <p className="mt-2 text-[14px] leading-relaxed text-fg-2">Allow camera access for this site in your browser’s settings, then try again. You can still edit photos from your gallery.</p>
            <div className="mt-5 flex gap-2">
              <Button variant="secondary" block onClick={() => router.push("/gallery")}>Gallery</Button>
              <Button block onClick={() => { setRequested(false); setPerm("prompt"); window.setTimeout(() => setRequested(true), 0); }}>Try again</Button>
            </div>
          </div>
        </div>
      )}

      <Splash ready={camReady || !!error || perm === "denied" || (perm === "prompt" && !requested)} />
    </div>
  );
}

// ============================================================================================
// toolbar

interface ToolDef { id: string; icon: IconName; label: string; on: () => void; active?: boolean; text?: string; badge?: string; dot?: boolean }

function ToolButton({ t }: { t: ToolDef }) {
  return (
    <button
      type="button"
      aria-label={t.label}
      title={t.label}
      aria-pressed={t.active}
      onClick={t.on}
      className={cx("oe-press relative flex h-10 min-w-10 items-center justify-center gap-1 rounded-full px-2.5 backdrop-blur-md transition-colors", t.active ? "bg-white text-[#111]" : "bg-glass text-white")}
    >
      <Icon name={t.icon} size={20} />
      {t.text && <span className="text-[12px] font-bold">{t.text}</span>}
      {t.badge && <span className="absolute -bottom-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-on-accent">{t.badge}</span>}
      {t.dot && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent" />}
    </button>
  );
}

function OptionRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-3 mt-1 flex justify-center" style={{ animation: "oe-rise 180ms var(--oe-ease)" }}>
      <div className="no-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-full bg-glass p-1 backdrop-blur-md">{children}</div>
    </div>
  );
}

function OptionChip({ on, onClick, children, label }: { on: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <button type="button" aria-pressed={on} aria-label={label} title={label} onClick={onClick}
      className={cx("flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors", on ? "bg-white text-[#111]" : "text-white")}>
      {children}
    </button>
  );
}

function RatioGlyph({ r }: { r: Ratio }) {
  const [w, h] = r === "full" ? [9, 18] : r === "9:16" ? [9, 16] : r === "3:4" ? [12, 16] : [14, 14];
  return <span className="rounded-[2px] border-[1.5px] border-current" style={{ width: w, height: h }} />;
}

function GridGlyph({ cells }: { cells: [number, number, number, number][] }) {
  return (
    <svg width={16} height={20} viewBox="0 0 16 20" aria-hidden>
      {cells.map((c, i) => <rect key={i} x={c[0] * 16 + 0.75} y={(1 - c[3]) * 20 + 0.75} width={(c[2] - c[0]) * 16 - 1.5} height={(c[3] - c[1]) * 20 - 1.5} rx={1} fill="none" stroke="currentColor" strokeWidth={1.4} />)}
    </svg>
  );
}

function MoreRow({ icon, title, desc, on, onChange }: { icon: IconName; title: string; desc: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 rounded-md px-3 py-2.5" onClick={() => onChange(!on)}>
      <Icon name={icon} size={20} className="shrink-0 text-fg-2" />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium">{title}</p>
        <p className="text-[12px] leading-snug text-fg-3">{desc}</p>
      </div>
      <Switch checked={on} onChange={onChange} label={title} />
    </div>
  );
}

function DockButton({ icon, label, value, dot, onClick }: { icon: IconName; label: string; value?: string; dot?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="oe-press relative flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-glass px-3 text-white backdrop-blur-md">
      <Icon name={icon} size={20} />
      <span className="truncate text-[13px] font-semibold">{value ?? label}</span>
      {dot && <span className="absolute right-3 top-2.5 h-2 w-2 rounded-full bg-accent" />}
    </button>
  );
}

// ============================================================================================
// Exposure: a vertical track with a sun thumb; drag up to brighten. Accent while it snaps to 0.

function ExposureSlider({ line, v, dragging }: { line: { x: number; top: number; bottom: number; len: number }; v: number; dragging: boolean }) {
  const ty = line.bottom - ((v + 1) / 2) * line.len;
  return (
    <div className="pointer-events-none absolute inset-0 z-10" style={{ animation: "oe-fade-in 160ms" }}>
      <div className="absolute w-[2px] rounded-full bg-white/70 shadow-[0_0_2px_rgba(0,0,0,.4)]" style={{ left: line.x - 1, top: line.top, height: line.len }} />
      <span className={cx("absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full", v === 0 && dragging ? "bg-accent text-on-accent" : "bg-white text-[#111]")} style={{ left: line.x, top: ty }}>
        <Icon name="exposure" size={16} stroke={2.2} />
      </span>
    </div>
  );
}
