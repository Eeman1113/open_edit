"use client";

// Liquify: push pixels around with your finger, or paint them back with Restore. Size and Strength sliders, one undo
// step per stroke. The warp is the face engine's LiquifyField, stored in doc.beauty.face.liq and rendered through the
// editor pipeline (full resolution on Save).
import { useEffect, useRef, useState } from "react";
import { LiquifyField } from "@/lib/face";
import { useEdit } from "../../ctx";
import { ControlRow, EditSeekBar, FeatureButton, SliderRow } from "../../ui";
import { BrushRing, MENU, Panel, TextTooltip, useHold, usePhotoArea, useTimedTooltip } from "../common";
import { dropLiquify, liquifyById, storeLiquify } from "./faceEngine";
import { useBase, useFaceDraft } from "./faceUi";

export function LiquifyPage() {
  const { setTool, doc, setLive } = useEdit();
  const area = usePhotoArea();
  const base = useBase();
  const aspect = base ? base.width / base.height : 1;
  const [, hold] = useHold();
  const { fe, close, confirm } = useFaceDraft();
  const [mode, setMode] = useState<"reshape" | "restore" | null>("reshape");
  const [size, setSize] = useState(0.1);
  const [strength, setStrength] = useState(0.2);
  const [ring, setRing] = useState<{ x: number; y: number } | null>(null);
  const [tip] = useTimedTooltip("Drag on the photo to push it into shape", 2500);
  const rPx = 22 + (140 - 22) * size; // brush radius in CSS px

  // working field + per-stroke history (snapshots); index 0 = state on open
  const field = useRef<LiquifyField | null>(null);
  const [hist, setHist] = useState<{ ids: (number | undefined)[]; i: number }>({ ids: [fe.liq], i: 0 });
  const liveId = useRef<number | undefined>(undefined);
  const feRef = useRef(fe);
  useEffect(() => { feRef.current = fe; });
  const docRef = useRef(doc);
  useEffect(() => { docRef.current = doc; });
  const ensureField = () => {
    if (!field.current) {
      field.current = new LiquifyField(aspect);
      const cur = liquifyById(hist.ids[hist.i]);
      if (cur) field.current.restoreSnapshot(cur.snapshot());
    }
    return field.current;
  };
  /** show `id` in the editor preview (draft face edit with that liquify field) */
  const show = (id: number | undefined) => {
    const next = { ...feRef.current, liq: id };
    feRef.current = next;
    const d = docRef.current;
    setLive({ ...d, beauty: { ...d.beauty, face: next } });
  };

  const st = useRef({ area, mode, rPx, strength, aspect });
  useEffect(() => { st.current = { area, mode, rPx, strength, aspect }; });
  const histRef = useRef(hist);
  useEffect(() => { histRef.current = hist; });
  useEffect(() => {
    let last: [number, number] | null = null;
    let moved = false;
    const at = (fx: number, fy: number) => {
      const a = st.current.area;
      const [u, v] = a.toPhoto(fx, fy);
      setRing({ x: a.x + u * a.w, y: a.y + v * a.h });
      return [u, v] as [number, number];
    };
    setTool({
      down: (fx, fy) => { if (!st.current.mode) return; last = at(fx, fy); moved = false; ensureField(); },
      move: (fx, fy) => {
        const p = at(fx, fy);
        const f = field.current;
        if (!last || !f) return;
        const { area: a, mode: m, rPx: r, strength: k, aspect: asp } = st.current;
        const rad = r / Math.max(1, Math.min(a.w, a.h));
        if (m === "restore") f.restore(p, rad, 0.15 + k * 0.6, asp);
        else f.push(last, p, rad, 0.3 + k * 0.7, asp);
        last = p; moved = true;
        const id = storeLiquify(f, asp);
        dropLiquify(liveId.current);
        liveId.current = id;
        show(id);
      },
      up: () => {
        setRing(null);
        if (!last) return;
        last = null;
        if (!moved || !field.current) return;
        // one undo entry per stroke: the last live id becomes a history entry
        const id = liveId.current;
        liveId.current = undefined;
        setHist((h) => ({ ids: [...h.ids.slice(0, h.i + 1), id], i: h.i + 1 }));
      },
    });
    return () => setTool(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const step = (i: number) => {
    setHist((h) => ({ ...h, i }));
    const id = hist.ids[i];
    field.current = new LiquifyField(aspect);
    const cur = liquifyById(id);
    if (cur) field.current.restoreSnapshot(cur.snapshot());
    show(id);
  };
  // a stroke changed something -> one editor undo entry with the visible field
  const finish = () => (hist.i === 0 && feRef.current.liq === fe.liq ? close() : confirm({ ...fe, liq: feRef.current.liq }));

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[5] overflow-hidden" style={{ bottom: MENU }}><BrushRing at={ring} r={rPx} /></div>
      <TextTooltip text={tip} bottom={MENU + 104 + 56} />
      <ControlRow bottom={MENU + (mode ? 104 : 0)} style={{ zIndex: 20 }} undo={{ can: hist.i > 0, on: () => step(hist.i - 1) }} redo={{ can: hist.i < hist.ids.length - 1, on: () => step(hist.i + 1) }} onOriginal={hold} originalEnabled={!!hist.ids[hist.i]} />
      {mode && (
        <div className="absolute inset-x-3 z-20 flex flex-col justify-center gap-1 rounded-lg bg-panel/90 py-2 shadow-lg ring-1 ring-line backdrop-blur-md" style={{ bottom: MENU + 8, height: 96 }} onPointerDown={(e) => e.stopPropagation()}>
          <SliderRow label="Size" className="px-3"><EditSeekBar value={size} min={0.01} max={1} def={0.1} onChange={setSize} /></SliderRow>
          <SliderRow label="Strength" className="px-3"><EditSeekBar value={strength} min={0} max={1} def={0.2} onChange={setStrength} /></SliderRow>
        </div>
      )}
      <Panel title="Liquify" onClose={close} onConfirm={finish}>
        <div className="flex h-full items-center justify-center gap-3">
          <FeatureButton icon="hand" label="Push" selected={mode === "reshape"} onClick={() => setMode((m) => (m === "reshape" ? null : "reshape"))} />
          <FeatureButton icon="reset" label="Restore" selected={mode === "restore"} onClick={() => setMode((m) => (m === "restore" ? null : "restore"))} />
        </div>
      </Panel>
    </>
  );
}
