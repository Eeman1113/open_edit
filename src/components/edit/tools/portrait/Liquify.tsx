"use client";

// EPRetouchFragment ("Reshape", manual liquify): Reshape / Restore modes, Size + Strength rows (98dp option area),
// per-stroke undo/redo. The warp is the face engine's LiquifyField (Kuru KuruTouchUniV2 push / restore brush),
// stored in doc.beauty.face.liq and rendered through the editor pipeline (full resolution on SAVE).
import { useEffect, useRef, useState } from "react";
import { LiquifyField } from "@/lib/face";
import { useEdit } from "../../ctx";
import { ControlRow, EditSeekBar, FeatureButton } from "../../ui";
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
  const [tip] = useTimedTooltip("Tap and drag your finger to edit wherever you want!", 2500);
  const rPx = 22 + (140 - 22) * size; // brush radius, dp (touchBeautyBrushSize)

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
      <TextTooltip text={tip} bottom={MENU + 98 + 54} />
      <ControlRow bottom={MENU + (mode ? 98 : 0)} style={{ zIndex: 20 }} undo={{ can: hist.i > 0, on: () => step(hist.i - 1) }} redo={{ can: hist.i < hist.ids.length - 1, on: () => step(hist.i + 1) }} onOriginal={hold} originalEnabled={!!hist.ids[hist.i]} />
      {mode && (
        <div className="absolute inset-x-0 z-20" style={{ bottom: MENU, height: 98, background: "rgba(0,0,0,0.4)" }} onPointerDown={(e) => e.stopPropagation()}>
          {([["Size", size, setSize, 0.01, 0.1], ["Strength", strength, setStrength, 0, 0.2]] as const).map(([l, v, set, min, def], i) => (
            <div key={l} className="absolute inset-x-0 flex items-center" style={{ top: i * 44 + (i ? 0 : 5), height: 49 }}>
              <span className="flex-none truncate text-white" style={{ marginLeft: 20, maxWidth: 80, width: 56, fontSize: 13 }}>{l}</span>
              <EditSeekBar style={{ marginLeft: 24, marginRight: 52 }} value={v} min={min} max={1} def={def} onChange={set} />
            </div>
          ))}
        </div>
      )}
      <Panel title="Reshape" onClose={close} onConfirm={finish}>
        <div className="absolute inset-x-0 flex justify-center" style={{ top: 36, gap: 52 }}>
          <FeatureButton icon="icon_edit_beauty_reshape" label="Reshape" selected={mode === "reshape"} onClick={() => setMode((m) => (m === "reshape" ? null : "reshape"))} />
          <FeatureButton icon="icon_edit_beauty_restore" label="Restore" selected={mode === "restore"} onClick={() => setMode((m) => (m === "restore" ? null : "restore"))} />
        </div>
      </Panel>
    </>
  );
}
