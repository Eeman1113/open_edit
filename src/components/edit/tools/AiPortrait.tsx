"use client";

// Portrait pages backed by on-device AI (src/lib/ai):
// - HD Skin (fragment_edit_photo_portrait_hdskin.xml): the server skin GAN is replaced by Real-ESRGAN face
//   restoration + guided-filter skin smoothing on the face-skin mask; the slider (default 0.8) blends it in.
// - Hair color (fragment_edit_photo_portrait_hair_color*.xml): MediaPipe hair mask + recolor, texture slider and
//   the "Hair area correction" brush. Colours are server content, so a local list is used.
// - AI Hair (fragment_edit_photo_portrait_ai_hair.xml): hairstyle generation is server-only; original
//   unavailable state (network error retry) is kept.
import { useEffect, useMemo, useRef, useState } from "react";
import { hdSkinCanvas, HAIR_COLORS, photoFaces, recolorHair, refineMask } from "@/lib/ai";
import { useEdit } from "../ctx";
import { CtrlIcon, EditSeekBar, FeatureButton, Img, ThumbItem, Tint, WHITE60 } from "../ui";
import {
  AiLoading, BrushRing, copyCanvas, EditLoading, lerp, MENU, newCanvas, Panel, PhotoOverlay, RetryView, S, strokeMask,
  TextTooltip, useHold, usePhotoArea, useStrokeInput, useStrokes, useTimedTooltip, type MStroke } from "./common";
import { useAiJob, useAsyncBake, useBase } from "./aiCommon";

/** Preview-size copy (long side <= `max`). */
const shrink = (c: HTMLCanvasElement, max = 900) => {
  const k = Math.min(1, max / Math.max(c.width, c.height));
  return k < 1 ? copyCanvas(c, Math.round(c.width * k), Math.round(c.height * k)) : c;
};

/** EditContentNetworkErrorView: error icon + "Retry" pill. */
function NetworkError({ onRetry, top = 0, bottom = 52 }: { onRetry: () => void; top?: number; bottom?: number }) {
  return (
    <div className="absolute inset-x-0 flex flex-col items-center justify-center" style={{ top, bottom }}>
      <Img name="gallery_edit_frame_error" size={40} />
      <button type="button" onClick={onRetry} className="text-white" style={{ marginTop: 10, height: 31, padding: "0 14px", borderRadius: 16, fontSize: 13, background: "rgba(255,255,255,0.15)" }}>{S.retry}</button>
    </div>
  );
}

function ControlBar({ bottom = MENU, children, original, hold }: { bottom?: number; children?: React.ReactNode; original: boolean; hold: (d: boolean) => void }) {
  return (
    <div className="absolute inset-x-0 z-20 flex items-center" style={{ bottom, height: 54 }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="relative flex min-w-0 flex-1 items-center">{children}</div>
      <CtrlIcon name="original" enabled={original} onHold={hold} style={{ marginRight: 10 }} />
    </div>
  );
}

/* ------------------------------------------------------------------ HD Skin */

export function HdSkinPage() {
  const { openSub } = useEdit();
  const area = usePhotoArea();
  const getBase = useBase();
  const asyncBake = useAsyncBake();
  const [held, hold] = useHold();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [value, setValue] = useState(0.8);
  const [res, setRes] = useState<{ full: HTMLCanvasElement; before: HTMLCanvasElement; after: HTMLCanvasElement } | null>(null);
  const [failed, setFailed] = useState(false);
  const [stage, setStage] = useState<"prep" | "load">("prep");
  const [attempt, setAttempt] = useState(0);
  const [baking, setBaking] = useState(false);
  const job = useAiJob(() => setFailed(true));

  useEffect(() => {
    const base = getBase();
    if (!base) return;
    void job.run(async (signal, onProgress) => {
      setStage("prep");
      const pf = await photoFaces(base).catch(() => ({ faces: [], faceSkin: null }));
      const r = await hdSkinCanvas(base, pf.faces, pf.faceSkin, { signal, onProgress: (s, v) => { if (s === "run") setStage("load"); onProgress(s, v); } });
      console.info(`[ai] hdskin ${pf.faces.length} face(s): ${Math.round(r.ms)} ms (${r.ep})`);
      return r.canvas;
    }).then((full) => {
      if (full) setRes({ full, before: shrink(base, 1280), after: shrink(full, 1280) });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !res) return;
    c.width = res.before.width; c.height = res.before.height;
    const g = c.getContext("2d")!;
    g.drawImage(res.before, 0, 0);
    g.globalAlpha = value; g.drawImage(res.after, 0, 0); g.globalAlpha = 1;
  }, [res, value]);

  const confirm = async () => {
    if (!res || value <= 0) { openSub(null); return; }
    setBaking(true);
    await asyncBake(async (base) => {
      const out = copyCanvas(base);
      const g = out.getContext("2d")!;
      g.globalAlpha = value; g.drawImage(res.full, 0, 0, out.width, out.height); g.globalAlpha = 1;
      return out;
    });
    setBaking(false);
  };

  return (
    <>
      {res && <PhotoOverlay area={area} canvasRef={canvasRef} hidden={held} />}
      <ControlBar original={!!res} hold={hold} />
      {baking && <EditLoading />}
      {failed && !job.busy && <RetryView text={S.networkTry} onRetry={() => { setFailed(false); setAttempt((n) => n + 1); }} />}
      <Panel title="HD Skin" guide onClose={() => openSub(null)} onConfirm={() => void confirm()}>
        <div className="absolute inset-x-0 top-0 flex items-center" style={{ bottom: 52 }}>
          <EditSeekBar style={{ margin: "0 68px" }} value={value} min={0} max={1} def={0.8} disabled={!res} onChange={setValue} />
        </div>
      </Panel>
      {job.pct !== null && <AiLoading text={stage === "prep" ? "Preparing effect" : `Loading…\n${job.pct}%`} onCancel={() => { job.cancel(); openSub(null); }} />}
    </>
  );
}

/* ------------------------------------------------------------------ AI Hair (server hairstyles: unavailable) */

export function AiHairPage() {
  const { openSub } = useEdit();
  const [, hold] = useHold();
  const [tip] = useTimedTooltip("Apply to a photo with one person.", 2500);
  const [k, setK] = useState(0);
  return (
    <>
      <TextTooltip text={tip} />
      <ControlBar original={false} hold={hold} />
      <Panel title="AI Hair" guide onClose={() => openSub(null)} onConfirm={() => openSub(null)}>
        <button type="button" className="absolute left-0 top-0 flex items-center justify-center" style={{ width: 55, height: 55 }}>
          <Tint name="icon_sticker_tab_none" size={35} color="#ffffff" />
        </button>
        <NetworkError key={k} top={0} onRetry={() => setK((n) => n + 1)} />
      </Panel>
    </>
  );
}

/* ------------------------------------------------------------------ Hair color */

/** Hair-colour thumbnail: the colour as a strand-shaded swatch on #242424 (server thumbnails aren't available). */
function Swatch({ color }: { color: string }) {
  return (
    <span className="mt-[9px] block rounded-full" style={{ width: 37, height: 37, background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.45), rgba(255,255,255,0) 45%), linear-gradient(160deg, ${color}, ${color} 55%, rgba(0,0,0,0.55))`, boxShadow: `0 0 0 1px rgba(255,255,255,0.08)` }} />
  );
}

export function HairColorPage() {
  const { openSub } = useEdit();
  const area = usePhotoArea();
  const getBase = useBase();
  const asyncBake = useAsyncBake();
  const [held, hold] = useHold();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [page, setPage] = useState<"recolor" | "texture">("recolor");
  const [fix, setFix] = useState(false);
  const [color, setColor] = useState<string | null>(null);
  const [opacity, setOpacity] = useState<Record<string, number>>({});
  const [sliderOpen, setSliderOpen] = useState(false);
  const [texture, setTexture] = useState(0);
  const [tip, setTip] = useTimedTooltip(null, 2500);
  const [state, setState] = useState<"loading" | "ready" | "noface" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [baking, setBaking] = useState(false);
  const [hairMask, setHairMask] = useState<HTMLCanvasElement | null>(null);
  const [pv, setPv] = useState<HTMLCanvasElement | null>(null);
  // correction strokes (Hair area correction)
  const fixStrokes = useStrokes<MStroke>();
  const [fixTool, setFixTool] = useState<"brush" | "eraser">("brush");
  const [fixSize, setFixSize] = useState(0.5);
  const [live, setLive] = useState<MStroke | null>(null);
  const [ring, setRing] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const base = getBase();
    if (!base) return;
    let alive = true;
    photoFaces(base).then((r) => {
      if (!alive) return;
      if (!r.faces.length) { setState("noface"); setTip(S.noFace); return; }
      if (!r.hair) { setState("error"); return; }
      setHairMask(r.hair);
      setPv(shrink(base));
      setState("ready");
    }, (e) => { console.warn("[ai] hair segmentation failed", e); if (alive) setState("error"); });
    return () => { alive = false; };
  }, [getBase, attempt, setTip]);

  /** Correction strokes as a mask canvas: red = brush (add hair), green = eraser. */
  const edits = useMemo(() => {
    const list = fixStrokes.visible;
    if (!pv || !list.length) return null;
    const c = newCanvas(pv.width, pv.height);
    const g = c.getContext("2d")!;
    for (const s of list) strokeMask(g, s, c.width, c.height, 0.2, s.erase ? "#00ff00" : "#ff0000");
    return c;
  }, [fixStrokes.visible, pv]);

  const alpha = useMemo(() => (pv && hairMask && state === "ready" ? refineMask(pv, hairMask, edits) : null), [pv, hairMask, state, edits]);
  const strength = color ? opacity[color] ?? HAIR_COLORS.find((h) => h.color === color)?.def ?? 0.7 : 0;

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !pv || !alpha) return;
    const raf = requestAnimationFrame(() => {
      c.width = pv.width; c.height = pv.height;
      const g = c.getContext("2d")!;
      g.drawImage(recolorHair(pv, alpha, color, strength, texture), 0, 0);
      if (fix) {
        // show the hair area being corrected
        const m = newCanvas(pv.width, pv.height);
        const mg = m.getContext("2d")!;
        const id = new ImageData(pv.width, pv.height);
        for (let i = 0; i < alpha.length; i++) { id.data[i * 4] = 11; id.data[i * 4 + 1] = 212; id.data[i * 4 + 2] = 210; id.data[i * 4 + 3] = alpha[i] * 128; }
        mg.putImageData(id, 0, 0);
        g.drawImage(m, 0, 0);
        if (live) strokeMask(g, live, c.width, c.height, 0.2, live.erase ? "rgba(255,255,255,0.35)" : "rgba(11,212,210,0.5)");
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [pv, alpha, color, strength, texture, fix, live]);

  const fixR = (lerp(0.01, 0.15, fixSize) * area.viewW) / 2 / Math.max(1, area.w);
  useStrokeInput(area, (u, v) => (fix ? { pts: [u, v], r: fixR, erase: fixTool === "eraser" } : null), setLive, (s) => fixStrokes.push(s), setRing);

  const confirm = async () => {
    const hair = hairMask;
    if (!hair || !pv || (!color && texture <= 0)) { openSub(null); return; }
    setBaking(true);
    await new Promise((r) => setTimeout(r, 50));
    await asyncBake(async (base) => {
      // refine the mask at <= 1600 px, then recolor at full resolution
      const work = shrink(base, 1600);
      const editsW = edits ? copyCanvas(edits, work.width, work.height) : null;
      const a = refineMask(work, hair, editsW);
      const ac = newCanvas(work.width, work.height);
      const id = new ImageData(work.width, work.height);
      for (let i = 0; i < a.length; i++) { id.data[i * 4] = 255; id.data[i * 4 + 1] = 255; id.data[i * 4 + 2] = 255; id.data[i * 4 + 3] = a[i] * 255; }
      ac.getContext("2d")!.putImageData(id, 0, 0);
      const big = copyCanvas(ac, base.width, base.height).getContext("2d")!.getImageData(0, 0, base.width, base.height).data;
      const full = new Float32Array(base.width * base.height);
      for (let i = 0; i < full.length; i++) full[i] = big[i * 4 + 3] / 255;
      return recolorHair(base, full, color, strength, texture);
    });
    setBaking(false);
  };

  const ready = state === "ready";
  const sliderShown = sliderOpen && !!color && page === "recolor";
  const pickColor = (c: string | null) => {
    if (!ready) { if (state === "noface") setTip(S.noFace); return; }
    if (c && c === color) { setSliderOpen((o) => !o); return; }
    setColor(c);
    setSliderOpen(!!c);
  };

  if (fix) {
    return (
      <>
        <PhotoOverlay area={area} canvasRef={canvasRef} hidden={held}>
          <BrushRing at={ring} r={fixR * area.w} />
        </PhotoOverlay>
        <div className="absolute inset-x-0 z-20 flex items-center" style={{ bottom: MENU + 54, height: 54 }} onPointerDown={(e) => e.stopPropagation()}>
          <CtrlIcon name="undo" enabled={fixStrokes.undo.can} onClick={fixStrokes.undo.on} style={{ marginLeft: 10 }} />
          <CtrlIcon name="redo" enabled={fixStrokes.redo.can} onClick={fixStrokes.redo.on} style={{ marginLeft: 10 }} />
          <span className="flex-1" />
          <CtrlIcon name="original" enabled onHold={hold} style={{ marginRight: 10 }} />
        </div>
        <div className="absolute inset-x-0 z-20 flex items-center" style={{ bottom: MENU, height: 54, background: "rgba(0,0,0,0.4)" }} onPointerDown={(e) => e.stopPropagation()}>
          <span className="flex-none text-white" style={{ marginLeft: 20, fontSize: 13 }}>Size</span>
          <EditSeekBar style={{ marginLeft: 24, marginRight: 52 }} value={fixSize} min={0.01} max={1} def={0.5} onChange={setFixSize} />
        </div>
        <Panel title="Hair area correction" onConfirm={() => setFix(false)}>
          <div className="absolute inset-x-0 flex justify-center" style={{ top: 36, gap: 52 }}>
            <FeatureButton icon="edit_icon_makeup_tone" label="Brush" selected={fixTool === "brush"} onClick={() => setFixTool("brush")} />
            <FeatureButton icon="edit_tab_eraser" label="Eraser" selected={fixTool === "eraser"} onClick={() => setFixTool("eraser")} />
          </div>
        </Panel>
      </>
    );
  }

  return (
    <>
      {ready && <PhotoOverlay area={area} canvasRef={canvasRef} hidden={held} />}
      <TextTooltip text={tip} />
      {(state === "loading" || baking) && <EditLoading />}
      <ControlBar original={ready && (!!color || texture > 0)} hold={hold} bottom={MENU + (sliderShown ? 75 : 0)} />
      {sliderShown && color && (
        <div className="absolute inset-x-0 z-20" style={{ bottom: MENU, padding: "17.5px 0", background: "rgba(0,0,0,0.4)" }} onPointerDown={(e) => e.stopPropagation()}>
          <div className="flex items-center" style={{ height: 40 }}>
            <span className="flex-none truncate text-white" style={{ marginLeft: 20, width: 80, fontSize: 13 }}>Opacity</span>
            <EditSeekBar style={{ marginLeft: 24, marginRight: 52 }} value={strength} min={0} max={1} def={HAIR_COLORS.find((h) => h.color === color)?.def ?? 0.7} onChange={(v) => setOpacity((o) => ({ ...o, [color]: v }))} />
          </div>
        </div>
      )}
      <Panel
        onClose={() => openSub(null)} onConfirm={() => void confirm()}
        title={(
          <div className="flex items-center" style={{ gap: 60 }}>
            <button type="button" onClick={() => setPage("recolor")} style={{ fontSize: 15, color: page === "recolor" ? "#ffffff" : WHITE60 }}>Hair color</button>
            <button type="button" onClick={() => setPage("texture")} style={{ fontSize: 15, color: page === "texture" ? "#ffffff" : WHITE60 }}>Hair texture</button>
          </div>
        )}
      >
        <div className="absolute inset-x-0 top-0" style={{ height: 134 }}>
          {page === "recolor" ? (
            <>
              <button type="button" onClick={() => pickColor(null)} className="absolute left-0 top-0 flex items-center bg-black" style={{ width: 56.5, height: 55 }}>
                <Img name="icon_sticker_none" size={35} style={{ marginLeft: 15, opacity: color ? 0.5 : 1 }} />
                <span className="absolute right-0" style={{ width: 1, height: 18, background: "rgba(255,255,255,0.15)" }} />
              </button>
              {state === "error" ? (
                <div className="absolute" style={{ left: 0, right: 58, top: 0, bottom: 0 }}><NetworkError onRetry={() => { setState("loading"); setAttempt((n) => n + 1); }} top={0} bottom={0} /></div>
              ) : (
                <div className="no-scrollbar absolute flex overflow-x-auto" style={{ left: 0, right: 58, top: 55, height: 73, paddingLeft: 15, paddingRight: 15, gap: 4 }}>
                  {HAIR_COLORS.map((h) => (
                    <ThumbItem key={h.id} label={h.label} bg="#242424" iconNode={<Swatch color={h.color} />} selected={color === h.color} onClick={() => pickColor(h.color)} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="absolute left-0 top-0 flex items-center" style={{ right: 58, bottom: 0 }}>
              <EditSeekBar style={{ margin: "0 40px" }} value={texture} min={0} max={1} def={0} disabled={!ready} onChange={setTexture} />
            </div>
          )}
          {/* btn_hair_fix "Correction" */}
          <div className="absolute right-0 flex items-center bg-black" style={{ top: 27, width: 58, height: 79 }}>
            <Img name="img_hair_shadow" size={[21, 79]} style={{ position: "absolute", left: -21, top: 0 }} />
            <FeatureButton icon="beauty_icon_manual" label="Correction" disabled={!ready} onClick={() => { if (ready) setFix(true); else if (state === "noface") setTip(S.noFace); }} />
          </div>
        </div>
      </Panel>
    </>
  );
}
