"use client";

// EPCutoutFragment (fragment_edit_photo_tools_cutout.xml): Outline / Brush / Eraser over a selection mask.
// The ImageSeg TFLite is replaced by the MediaPipe Interactive Segmenter (magic_touch, src/lib/ai): an outline
// loop is snapped to the subject inside it, and a tap in Outline mode selects the subject under the finger.
// If the model finds nothing that fills the loop, the loop itself is used (as before).
import { useEffect, useRef, useState } from "react";
import { subjectAt, subjectInOutline } from "@/lib/ai";
import { useEdit } from "../ctx";
import { CtrlIcon, EditSeekBar, FeatureButton, Img, PRIMARY } from "../ui";
import {
  copyCanvas, EditLoading, lerp, MENU, newCanvas, OptionRow, Panel, PhotoOverlay, strokeMask, TextTooltip,
  useBake, useHold, usePhotoArea, useStrokeInput, useStrokes, useTimedTooltip, type MStroke, usePhotoSnapshot } from "./common";

type Tool = "outline" | "brush" | "eraser";

function drawMask(g: CanvasRenderingContext2D, list: MStroke[], w: number, h: number) {
  for (const s of list) {
    g.save();
    if (s.p?.tool === "eraser") g.globalCompositeOperation = "destination-out";
    if (s.p?.mask instanceof HTMLCanvasElement) {
      g.imageSmoothingQuality = "high";
      g.drawImage(s.p.mask, 0, 0, w, h);
    } else if (s.p?.tool === "outline") {
      g.fillStyle = "#fff";
      g.beginPath();
      for (let i = 0; i < s.pts.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, s.pts[i] * w, s.pts[i + 1] * h);
      g.closePath(); g.fill();
    } else strokeMask(g, s, w, h, 0.1);
    g.restore();
  }
}

export function CutoutTool() {
  const { openSub, toast } = useEdit();
  const area = usePhotoArea();
  const bake = useBake();
  const [held, hold] = useHold();
  const src = usePhotoSnapshot();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>("outline");
  const [size, setSize] = useState(0.5);
  const [live, setLive] = useState<MStroke | null>(null);
  const strokes = useStrokes<MStroke>();
  const [tip] = useTimedTooltip("Draw the border you'd like to cut.", 3000);
  const r = (lerp(0.04, 0.3, size) * area.viewW) / 2 / Math.max(1, area.w);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !src) return;
    const W = src.width, H = src.height;
    c.width = W; c.height = H;
    const g = c.getContext("2d")!;
    g.drawImage(src, 0, 0);
    const m = newCanvas(W, H);
    const mg = m.getContext("2d")!;
    drawMask(mg, live && live.p?.tool !== "outline" ? [...strokes.visible, live] : strokes.visible, W, H);
    mg.globalCompositeOperation = "source-in";
    mg.fillStyle = "rgba(11,212,210,0.45)"; mg.fillRect(0, 0, W, H);
    g.drawImage(m, 0, 0);
    if (live?.p?.tool === "outline") {
      g.save(); g.strokeStyle = PRIMARY; g.lineWidth = Math.max(2, W / 200); g.setLineDash([g.lineWidth * 3, g.lineWidth * 2]);
      g.beginPath();
      for (let i = 0; i < live.pts.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, live.pts[i] * W, live.pts[i + 1] * H);
      g.stroke(); g.restore();
    }
  }, [src, strokes.visible, live]);

  const [busy, setBusy] = useState(false);
  useStrokeInput(area, (u, v) => (busy ? null : { pts: [u, v], r, p: { tool } }), setLive, (s) => {
    if (s.p?.tool !== "outline" || !src) { strokes.push(s); return; }
    // tap (no real loop) = subject under the finger; loop = subject snapped inside the outline
    let len = 0;
    for (let i = 2; i < s.pts.length; i += 2) len += Math.hypot(s.pts[i] - s.pts[i - 2], (s.pts[i + 1] - s.pts[i - 1]) * (area.h / Math.max(1, area.w)));
    const tap = len < 0.03;
    setBusy(true);
    const job = tap
      ? subjectAt(src, s.pts[0], s.pts[1]).then((m) => (m ? { mask: m } : null))
      : subjectInOutline(src, s.pts);
    job.then((r) => {
      if (r) strokes.push({ ...s, p: { ...s.p, mask: r.mask } });
      else if (!tap) strokes.push(s);
    }, (e) => { console.warn("[ai] cutout segmenter failed", e); if (!tap) strokes.push(s); })
      .finally(() => setBusy(false));
  });

  const confirm = () => {
    if (!strokes.visible.length) { toast("No image to bring.\nSelect the area you’d like to cut out."); return; }
    bake((base) => {
      const out = copyCanvas(base);
      const m = newCanvas(out.width, out.height);
      drawMask(m.getContext("2d")!, strokes.visible, out.width, out.height);
      const g = out.getContext("2d")!;
      g.globalCompositeOperation = "destination-in";
      g.drawImage(m, 0, 0);
      return out;
    });
  };

  const touched = strokes.count > 0;
  return (
    <>
      <PhotoOverlay area={area} canvasRef={canvasRef} hidden={held} />
      {busy && <EditLoading />}
      <TextTooltip text={tip} bottom={MENU + 108} />
      <div className="absolute inset-x-0 z-20 flex items-center" style={{ bottom: MENU + 54, height: 54 }} onPointerDown={(e) => e.stopPropagation()}>
        {touched && <CtrlIcon name="undo" enabled={strokes.undo.can} onClick={strokes.undo.on} style={{ marginLeft: 10 }} />}
        {touched && <CtrlIcon name="redo" enabled={strokes.redo.can} onClick={strokes.redo.on} style={{ marginLeft: 10 }} />}
        <span className="flex-1" />
        <button type="button" style={{ width: 34, height: 34, marginRight: 10, touchAction: "none" }}
          onPointerDown={() => hold(true)} onPointerUp={() => hold(false)} onPointerLeave={() => hold(false)} onPointerCancel={() => hold(false)}>
          <Img name="icon_edit_common_original_cutout" size={34} />
        </button>
      </div>
      <OptionRow bottom={MENU} label="Size">
        <EditSeekBar style={{ marginLeft: 10, marginRight: 52 }} value={size} min={0.01} max={1} def={0.5} onChange={setSize} />
      </OptionRow>
      <Panel title="Cutout" onClose={() => openSub(null)} onConfirm={confirm}>
        <div className="absolute inset-x-0 flex justify-center" style={{ top: 36, gap: 44 }}>
          <FeatureButton icon="edit_tab_cutout" label="Outline" selected={tool === "outline"} onClick={() => setTool("outline")} />
          <FeatureButton icon="edit_icon_makeup_tint" label="Brush" selected={tool === "brush"} onClick={() => setTool("brush")} />
          <FeatureButton icon="edit_tab_eraser" label="Eraser" selected={tool === "eraser"} onClick={() => setTool("eraser")} />
        </div>
      </Panel>
    </>
  );
}
