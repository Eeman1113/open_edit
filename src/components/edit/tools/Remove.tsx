"use client";

// Erase: paint over something to remove it. Both modes run MI-GAN on device (src/lib/ai, MIT):
// - Quick: each stroke is filled in as soon as you lift your finger.
// - Smart: paint a whole area first, then tap Generate to fill it in one go (one undo step).
// Previews run on the editor snapshot; Apply replays every step on the full-size photo.
import { useEffect, useRef, useState } from "react";
import { TOKENS, toast } from "@/components/ui";
import { inpaintCanvas, type CallOpts } from "@/lib/ai";
import { useEdit } from "../ctx";
import { ControlRow, EditSeekBar, FeatureButton } from "../ui";
import {
  AiLoading, BrushRing, CreateButton, EditLoading, lerp, MENU, newCanvas, OPTION_H, OptionRow, Panel, PhotoOverlay, RetryView, S,
  strokeMask, TextTooltip, useHold, usePhotoArea, usePhotoSnapshot, useStrokeInput, useTimedTooltip, type MStroke } from "./common";
import { aiStepText, useAiJob, useAsyncBake } from "./aiCommon";

const MASK = `${TOKENS.color.accent}88`;
const NEW_KEY = "oe.edit.erase.smartSeen";
const TIP_KEY = "oe.edit.erase.tipSeen";
const GEN_KEY = "oe.edit.erase.generateSeen";

/** One history step: the strokes removed together (Standard = 1 stroke, AI = the whole mask). */
interface Step { strokes: MStroke[]; c: HTMLCanvasElement }

function holeOf(strokes: MStroke[], w: number, h: number) {
  const m = newCanvas(w, h);
  const g = m.getContext("2d")!;
  for (const s of strokes) strokeMask(g, s, w, h, 0);
  return m;
}

const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string) => { try { localStorage.setItem(k, "1"); } catch { /* private mode */ } };

export function RemoveTool() {
  const { openSub } = useEdit();
  const area = usePhotoArea();
  const asyncBake = useAsyncBake();
  const [held, hold] = useHold();
  const src = usePhotoSnapshot();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<"standard" | "ai">("standard");
  const [aiNew, setAiNew] = useState(() => lsGet(NEW_KEY) === null);
  const [size, setSize] = useState(0.2);
  const [hist, setHist] = useState<{ list: Step[]; i: number }>({ list: [], i: 0 });
  /** AI mode: mask strokes not yet generated (own undo/redo) */
  const [mask, setMask] = useState<{ list: MStroke[]; i: number }>({ list: [], i: 0 });
  const [live, setLive] = useState<MStroke | null>(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState<null | (() => void)>(null);
  const [ring, setRing] = useState<{ x: number; y: number } | null>(null);
  const [sizing, setSizing] = useState(false);
  const [tip, setTip] = useTimedTooltip(null, 2000);
  const job = useAiJob((e) => { console.warn("[ai] remove failed", e); setRetry(() => () => setRetry(null)); });
  const [baking, setBaking] = useState(false);
  const diameter = lerp(23, 100, size);
  const r = diameter / 2 / Math.max(1, area.w);

  // first run: a short how-to
  useEffect(() => {
    if (lsGet(TIP_KEY) !== null) return;
    lsSet(TIP_KEY);
    setTip("Paint over anything you want gone");
  }, [setTip]);

  const current = hist.i > 0 ? hist.list[hist.i - 1].c : src;
  const maskStrokes = mask.list.slice(0, mask.i);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !current) return;
    c.width = current.width; c.height = current.height;
    const g = c.getContext("2d")!;
    g.drawImage(current, 0, 0);
    const shown = mode === "ai" ? [...maskStrokes, ...(live ? [live] : [])] : live ? [live] : [];
    if (shown.length) {
      const m = holeOf(shown, c.width, c.height);
      const mg = m.getContext("2d")!;
      mg.globalCompositeOperation = "source-in";
      mg.fillStyle = MASK; mg.fillRect(0, 0, m.width, m.height);
      g.drawImage(m, 0, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, live, mode, mask]);

  const pushStep = (strokes: MStroke[], c: HTMLCanvasElement) =>
    setHist((h) => { const list = [...h.list.slice(0, h.i), { strokes, c }]; return { list, i: list.length }; });

  const removeNow = async (strokes: MStroke[], opts: CallOpts) => {
    if (!current) return null;
    return inpaintCanvas(current, holeOf(strokes, current.width, current.height), opts);
  };

  useStrokeInput(area, (u, v) => (busy || job.busy || baking ? null : { pts: [u, v], r }), setLive, (s) => {
    if (mode === "ai") {
      setMask((m) => { const list = [...m.list.slice(0, m.i), s]; return { list, i: list.length }; });
      if (lsGet(GEN_KEY) === null) { lsSet(GEN_KEY); setTip("Tap Generate when the area is covered"); }
      return;
    }
    setBusy(true);
    const go = () => removeNow([s], {})
      .then((out) => { if (out) pushStep([s], out); setRetry(null); })
      .catch((e) => { console.warn("[ai] remove failed", e); setRetry(() => () => { setRetry(null); setBusy(true); void go(); }); })
      .finally(() => setBusy(false));
    void go();
  }, setRing);

  const create = async () => {
    const strokes = maskStrokes;
    if (!strokes.length) return;
    const out = await job.run((signal, onProgress) => removeNow(strokes, { signal, onProgress }));
    if (!out) return;
    pushStep(strokes, out);
    setMask({ list: [], i: 0 });
  };

  const pickMode = (m: "standard" | "ai") => {
    if (m === mode) return;
    setMode(m);
    if (m === "ai" && aiNew) { setAiNew(false); lsSet(NEW_KEY); }
    // switching back to Standard clears the AI mask
    if (m === "standard") setMask({ list: [], i: 0 });
  };

  const confirm = async () => {
    const steps = hist.list.slice(0, hist.i);
    if (!steps.length) { openSub(null); return; }
    setBaking(true);
    try {
      await asyncBake(async (base) => {
        let cur = base;
        for (const st of steps) cur = await inpaintCanvas(cur, holeOf(st.strokes, cur.width, cur.height));
        return cur;
      });
    } catch (e) {
      console.warn("[ai] remove bake failed", e);
      toast(S.networkConnect, { icon: "alert", tone: "danger" });
      setBaking(false);
    }
  };

  const inAi = mode === "ai";
  const undo = inAi && mask.i > 0 ? { can: true, on: () => setMask((m) => ({ ...m, i: m.i - 1 })) } : { can: hist.i > 0, on: () => setHist((h) => ({ ...h, i: h.i - 1 })) };
  const redo = inAi && mask.i < mask.list.length ? { can: true, on: () => setMask((m) => ({ ...m, i: m.i + 1 })) } : { can: !(inAi && mask.i > 0) && hist.i < hist.list.length, on: () => setHist((h) => ({ ...h, i: h.i + 1 })) };

  return (
    <>
      <PhotoOverlay area={area} canvasRef={canvasRef} hidden={held}>
        <BrushRing at={sizing ? { x: area.x + area.w / 2, y: area.y + area.h / 2 } : ring} r={diameter / 2} />
      </PhotoOverlay>
      {(busy || baking) && <EditLoading text={S.inProgress} />}
      <TextTooltip text={tip} bottom={MENU + OPTION_H + 56} />
      {retry && <RetryView text={S.networkConnect} onRetry={retry} bottom={MENU + OPTION_H + 56} />}
      <ControlRow bottom={MENU + OPTION_H} undo={undo} redo={redo} onOriginal={hold} originalEnabled={hist.i > 0} />
      <OptionRow bottom={MENU} label="Brush size">
        <EditSeekBar value={size} min={0.01} max={1} def={0.2} onChange={(v) => { setSizing(true); setSize(v); }} onRelease={() => setSizing(false)} />
      </OptionRow>
      <Panel
        title="Erase" onClose={() => openSub(null)}
        confirmNode={inAi && maskStrokes.length ? <CreateButton onClick={() => void create()} /> : undefined}
        onConfirm={() => void confirm()}
      >
        <div className="flex h-full flex-col items-center justify-center gap-3">
          <div className="flex gap-3">
            <FeatureButton icon="remove" label="Quick" selected={mode === "standard"} onClick={() => pickMode("standard")} />
            <FeatureButton icon="sparkles" label="Smart area" selected={mode === "ai"} isNew={aiNew} onClick={() => pickMode("ai")} />
          </div>
          <p className="px-8 text-center text-[12px] leading-snug text-fg-3">
            {inAi ? "Paint the whole area, then tap Generate. Best for bigger objects." : "Each stroke is erased as soon as you lift your finger."}
          </p>
        </div>
      </Panel>
      {job.pct !== null && <AiLoading text={aiStepText(job.pct)} onCancel={job.cancel} />}
    </>
  );
}
