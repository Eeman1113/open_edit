"use client";

// EPRemoveFragment (fragment_edit_photo_tools_remove.xml, the AI-capable variant). Both modes run on-device with
// MI-GAN (src/lib/ai, MIT) in place of the TFLite inpaint model and the moon.snow.me inpaint server:
// - Standard: each stroke is removed on touch-up ("In progress…").
// - AI Remove: strokes build one mask, "Create" removes it with the EditAiLoading progress; one undo entry.
// Previews run on the editor snapshot; Confirm replays every step on the full-resolution base.
import { useEffect, useRef, useState } from "react";
import { inpaintCanvas, type CallOpts } from "@/lib/ai";
import { useEdit } from "../ctx";
import { CtrlIcon, EditSeekBar, FeatureButton } from "../ui";
import {
  AiLoading, BrushRing, CreateButton, EditLoading, lerp, MENU, newCanvas, OptionRow, Panel, PhotoOverlay, RetryView, S,
  strokeMask, TextTooltip, useHold, usePhotoArea, usePhotoSnapshot, useStrokeInput, useTimedTooltip, type MStroke } from "./common";
import { aiStepText, useAiJob, useAsyncBake } from "./aiCommon";

const MASK = "rgba(11,212,210,0.5)";
const NEW_KEY = "b612.edit.remove.aiNew";
const TIP_KEY = "b612.edit.remove.aiTip";
const GEN_KEY = "b612.edit.remove.genTip";

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
  const { openSub, toast } = useEdit();
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

  // first run: "Perfect removal with AI!" for 2s
  useEffect(() => {
    if (lsGet(TIP_KEY) !== null) return;
    lsSet(TIP_KEY);
    setTip("Perfect removal with AI!");
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
      if (lsGet(GEN_KEY) === null) { lsSet(GEN_KEY); setTip("Press the button to generate"); }
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
      toast(S.networkConnect);
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
      <TextTooltip text={tip} bottom={MENU + 108} />
      {retry && <RetryView text={S.networkConnect} onRetry={retry} bottom={MENU + 108} />}
      <div className="absolute inset-x-0 z-20 flex items-center" style={{ bottom: MENU + 54, height: 54 }} onPointerDown={(e) => e.stopPropagation()}>
        <CtrlIcon name="undo" enabled={undo.can} onClick={undo.on} style={{ marginLeft: 10 }} />
        <CtrlIcon name="redo" enabled={redo.can} onClick={redo.on} style={{ marginLeft: 10 }} />
        <span className="flex-1" />
        <CtrlIcon name="original" enabled={hist.i > 0} onHold={hold} style={{ marginRight: 10 }} />
      </div>
      <OptionRow bottom={MENU} label="Size" labelWidth={63}>
        <EditSeekBar style={{ marginLeft: 10, marginRight: 52 }} value={size} min={0.01} max={1} def={0.2} onChange={(v) => { setSizing(true); setSize(v); }} onRelease={() => setSizing(false)} />
      </OptionRow>
      <Panel
        title="Remove" guide onClose={() => openSub(null)}
        confirmNode={inAi && maskStrokes.length ? <CreateButton onClick={() => void create()} /> : undefined}
        onConfirm={() => void confirm()}
      >
        <div className="absolute inset-x-0 top-0 flex items-center justify-center" style={{ bottom: 52 }}>
          <FeatureButton icon="icon_edit_tab_remove" label="Standard" selected={mode === "standard"} onClick={() => pickMode("standard")} />
          <span style={{ width: 52 }} />
          <FeatureButton icon="icon_edit_tab_ai_remove" label="AI Remove" selected={mode === "ai"} isNew={aiNew} onClick={() => pickMode("ai")} />
        </div>
      </Panel>
      {job.pct !== null && <AiLoading text={aiStepText(job.pct)} onCancel={job.cancel} />}
    </>
  );
}
