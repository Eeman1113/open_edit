"use client";

// Portrait pages backed by on-device AI (src/lib/ai):
// - Skin detail: Real-ESRGAN face restoration plus edge-aware smoothing on the skin mask; the slider blends it in.
// - Hair colour: MediaPipe hair mask and recolouring, a texture slider and a brush to correct the hair area.
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, Tabs, TOKENS } from "@/components/ui";
import { hdSkinCanvas, HAIR_COLORS, photoFaces, recolorHair, refineMask } from "@/lib/ai";
import { useEdit } from "../ctx";
import { ControlRow, EditSeekBar, EmptyState, FeatureButton, SliderRow, ThumbItem } from "../ui";
import {
  AiLoading, BrushRing, copyCanvas, EditLoading, lerp, MENU, newCanvas, OPTION_H, OptionRow, Panel, PhotoOverlay, RetryView, S, strokeMask,
  TextTooltip, useHold, usePhotoArea, useStrokeInput, useStrokes, useTimedTooltip, type MStroke } from "./common";
import { useAiJob, useAsyncBake, useBase } from "./aiCommon";

/** Preview-size copy (long side <= `max`). */
const shrink = (c: HTMLCanvasElement, max = 900) => {
  const k = Math.min(1, max / Math.max(c.width, c.height));
  return k < 1 ? copyCanvas(c, Math.round(c.width * k), Math.round(c.height * k)) : c;
};
const ACCENT_RGB = [parseInt(TOKENS.color.accent.slice(1, 3), 16), parseInt(TOKENS.color.accent.slice(3, 5), 16), parseInt(TOKENS.color.accent.slice(5, 7), 16)];

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
      <ControlRow onOriginal={hold} originalEnabled={!!res} />
      {baking && <EditLoading text="Rendering full size…" />}
      {failed && !job.busy && <RetryView text={S.networkTry} onRetry={() => { setFailed(false); setAttempt((n) => n + 1); }} />}
      <Panel title="Skin detail" onClose={() => openSub(null)} onConfirm={() => void confirm()}>
        <div className="flex h-full flex-col justify-center gap-2">
          <SliderRow label="Strength" value={Math.round(value * 100)}>
            <EditSeekBar value={value} min={0} max={1} def={0.8} level={false} disabled={!res} onChange={setValue} />
          </SliderRow>
          <p className="px-6 text-center text-[12px] leading-snug text-fg-3">Restores fine skin detail and evens texture. It runs on your device.</p>
        </div>
      </Panel>
      {job.pct !== null && <AiLoading text={stage === "prep" ? "Finding faces\n0%" : `Restoring detail\n${job.pct}%`} onCancel={() => { job.cancel(); openSub(null); }} />}
    </>
  );
}

/* ------------------------------------------------------------------ Hair color */

/** Hair colour swatch: the colour with a soft sheen. */
const hairBg = (color: string) => `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.5), rgba(255,255,255,0) 42%), linear-gradient(160deg, ${color}, ${color} 55%, rgba(0,0,0,0.55))`;

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
        for (let i = 0; i < alpha.length; i++) { id.data[i * 4] = ACCENT_RGB[0]; id.data[i * 4 + 1] = ACCENT_RGB[1]; id.data[i * 4 + 2] = ACCENT_RGB[2]; id.data[i * 4 + 3] = alpha[i] * 128; }
        mg.putImageData(id, 0, 0);
        g.drawImage(m, 0, 0);
        if (live) strokeMask(g, live, c.width, c.height, 0.2, live.erase ? "rgba(255,255,255,0.35)" : `${TOKENS.color.accent}80`);
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
      // refine the mask at <= 1600 px, then recolour at full resolution
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
        <ControlRow bottom={MENU + OPTION_H} undo={fixStrokes.undo} redo={fixStrokes.redo} onOriginal={hold} />
        <OptionRow bottom={MENU} label="Brush size">
          <EditSeekBar value={fixSize} min={0.01} max={1} def={0.5} onChange={setFixSize} />
        </OptionRow>
        <Panel title="Fix hair area" onConfirm={() => setFix(false)}>
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <div className="flex gap-3">
              <FeatureButton icon="brush" label="Add hair" selected={fixTool === "brush"} onClick={() => setFixTool("brush")} />
              <FeatureButton icon="remove" label="Remove" selected={fixTool === "eraser"} onClick={() => setFixTool("eraser")} />
            </div>
            <p className="text-[12px] text-fg-3">Paint where the colour should or shouldn&apos;t go</p>
          </div>
        </Panel>
      </>
    );
  }

  return (
    <>
      {ready && <PhotoOverlay area={area} canvasRef={canvasRef} hidden={held} />}
      <TextTooltip text={tip} />
      {(state === "loading" || baking) && <EditLoading text={baking ? "Rendering full size…" : "Finding hair…"} />}
      <ControlRow bottom={MENU + (sliderShown ? OPTION_H : 0)} onOriginal={hold} originalEnabled={ready && (!!color || texture > 0)} />
      {sliderShown && color && (
        <OptionRow bottom={MENU} label="Strength">
          <EditSeekBar value={strength} min={0} max={1} def={HAIR_COLORS.find((h) => h.color === color)?.def ?? 0.7} onChange={(v) => setOpacity((o) => ({ ...o, [color]: v }))} />
        </OptionRow>
      )}
      <Panel title="Hair colour" onClose={() => openSub(null)} onConfirm={() => void confirm()}>
        <div className="flex h-full flex-col justify-center gap-3">
          <div className="flex items-center gap-2 px-4">
            <Tabs look="segment" className="flex-1" items={[{ id: "recolor", label: "Colour" }, { id: "texture", label: "Shine" }]} value={page} onChange={setPage} />
            <button
              type="button" onClick={() => { if (ready) setFix(true); else if (state === "noface") setTip(S.noFace); }}
              className="oe-press flex h-10 flex-none items-center gap-1.5 rounded-full bg-raised px-3 text-[13px] font-semibold disabled:opacity-40" disabled={!ready && state !== "noface"}
            >
              <Icon name="brush" size={15} className="text-accent" />Fix area
            </button>
          </div>
          {page === "recolor" ? (
            state === "error" ? (
              <div className="relative h-[86px]"><EmptyState text="Couldn't find the hair." onRetry={() => { setState("loading"); setAttempt((n) => n + 1); }} /></div>
            ) : (
              <div className="no-scrollbar flex gap-2.5 overflow-x-auto px-4">
                <ThumbItem size={56} label="None" none selected={!color} onClick={() => pickColor(null)} />
                {HAIR_COLORS.map((h) => (
                  <ThumbItem key={h.id} size={56} label={h.label} bg={hairBg(h.color)} selected={color === h.color} onClick={() => pickColor(h.color)} />
                ))}
              </div>
            )
          ) : (
            <SliderRow label="Shine" value={Math.round(texture * 100)} className="h-[86px]">
              <EditSeekBar value={texture} min={0} max={1} def={0} level={false} disabled={!ready} onChange={setTexture} />
            </SliderRow>
          )}
        </div>
      </Panel>
    </>
  );
}
