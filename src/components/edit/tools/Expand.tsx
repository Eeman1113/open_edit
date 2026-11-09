"use client";

// EPGenerativeFillFragment (fragment_edit_photo_tools_generative_fill.xml): ExpansionView + ratio list +
// the 100–150% Ratio slider. The original's server generation (moon.snow.me fill/process) is replaced by
// on-device MI-GAN outpainting (src/lib/ai outpaintCanvas: padded canvas, overlapping 512 px tiles).
// Each "Create" is one result step (undo/redo); Confirm bakes the latest result as the new base.
import { useEffect, useMemo, useRef, useState } from "react";
import { d } from "@/components/ui/legacy-drawable";
import { outpaintCanvas } from "@/lib/ai";
import { useEdit } from "../ctx";
import { CtrlIcon, EditSeekBar, FeatureButton } from "../ui";
import { AiLoading, clamp, copyCanvas, CreateButton, MENU, OptionRow, Panel, RetryView, TextTooltip, useHold, useTimedTooltip, usePhotoSnapshot } from "./common";
import { aiStepText, useAiJob, useBase } from "./aiCommon";

const ITEMS: { key: string; label: string; icon: string; r: number | null }[] = [
  { key: "ratio", label: "Ratio", icon: "icon_edit_crop_ratio_original", r: null },
  { key: "custom", label: "Free", icon: "icon_edit_crop_ratio_free", r: null },
  { key: "square", label: "Square", icon: "icon_edit_crop_ratio_1_1", r: 1 },
  { key: "4:5", label: "4:5", icon: "icon_edit_crop_ratio_4_5", r: 0.8 },
  { key: "9:16", label: "9:16", icon: "icon_edit_crop_ratio_9_16", r: 0.5625 },
  { key: "3:4", label: "3:4", icon: "icon_edit_crop_ratio_3_4", r: 0.75 },
  { key: "16:9", label: "16:9", icon: "icon_edit_crop_ratio_16_9", r: 16 / 9 },
  { key: "1:2", label: "1:2", icon: "icon_edit_crop_ratio_1_2", r: 0.5 },
  { key: "2:3", label: "2:3", icon: "icon_edit_crop_ratio_2_3", r: 2 / 3 },
  { key: "9:20", label: "9:20", icon: "icon_edit_crop_ratio_9_20", r: 0.45 },
  { key: "3:2", label: "3:2", icon: "icon_edit_crop_ratio_3_2", r: 1.5 },
  { key: "4:3", label: "4:3", icon: "icon_edit_crop_ratio_4_3", r: 4 / 3 },
  { key: "5:4", label: "5:4", icon: "icon_edit_crop_ratio_5_4", r: 1.25 },
];
const FAIL = "Creation failed.\nPlease wait a moment and try again.";

/** Downscaled JPEG data URL for the ExpansionView image. */
function previewUrl(c: HTMLCanvasElement) {
  const k = Math.min(1, 1280 / Math.max(c.width, c.height));
  return (k < 1 ? copyCanvas(c, Math.round(c.width * k), Math.round(c.height * k)) : c).toDataURL("image/jpeg", 0.9);
}

/** Background rect in image units (image = [0,0,1,1/aspect]): left/top/right/bottom extensions as fractions. */
interface Ext { l: number; t: number; r: number; b: number }
const ZERO: Ext = { l: 0, t: 0, r: 0, b: 0 };

export function ExpandTool() {
  const { openSub, doc, bases, commit } = useEdit();
  const [held, hold] = useHold();
  const pc = usePhotoSnapshot();
  const getBase = useBase();
  const [results, setResults] = useState<{ list: { c: HTMLCanvasElement; url: string }[]; i: number }>({ list: [], i: 0 });
  const cur = results.i > 0 ? results.list[results.i - 1] : null;
  const pcUrl = useMemo(() => (pc ? previewUrl(pc) : ""), [pc]);
  const img = cur?.url ?? pcUrl;
  const aspect = cur ? cur.c.width / cur.c.height : pc ? pc.width / pc.height : 1;
  const [failed, setFailed] = useState(false);
  const job = useAiJob((e) => { console.warn("[ai] expand failed", e); setFailed(true); });
  const [sel, setSel] = useState("ratio");
  const [scale, setScale] = useState(1);
  const [free, setFree] = useState<Ext>(ZERO);
  const [fixed, setFixed] = useState<Record<string, boolean>>({});
  const [tip, setTip] = useTimedTooltip(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ w: 360, h: 400 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setView({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const item = ITEMS.find((i) => i.key === sel)!;
  // extension (fractions of the image size per side)
  const ext: Ext = useMemo(() => {
    if (sel === "ratio") { const e = (scale - 1) / 2; return { l: e, t: e, r: e, b: e }; }
    if (sel === "custom") return free;
    if (!fixed[sel] || !item.r) return ZERO;
    if (item.r > aspect) { const e = (item.r / aspect - 1) / 2; return { l: e, t: 0, r: e, b: 0 }; }
    const e = (aspect / item.r - 1) / 2; return { l: 0, t: e, r: 0, b: e };
  }, [sel, scale, free, fixed, item, aspect]);
  const expanded = ext.l + ext.t + ext.r + ext.b > 0.001;

  // layout: fit the background rect into the canvas area with a 30dp (60dp Free) inset
  const inset = sel === "custom" ? 60 : 30;
  const bgW = 1 + ext.l + ext.r, bgH = (1 + ext.t + ext.b) / aspect;
  const k = Math.min((view.w - inset * 2) / bgW, (view.h - inset * 2) / bgH);
  const bx = (view.w - bgW * k) / 2, by = (view.h - bgH * k) / 2;
  const ix = bx + ext.l * k, iy = by + (ext.t / aspect) * k, iw = k, ih = k / aspect;

  const drag = useRef<{ c: number; x0: number; y0: number; e0: Ext } | null>(null);
  const onCorner = (c: number) => (e: React.PointerEvent) => {
    e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { c, x0: e.clientX, y0: e.clientY, e0: free };
  };
  const onMove = (e: React.PointerEvent) => {
    const g = drag.current;
    if (!g) return;
    const dx = (e.clientX - g.x0) / k, dy = ((e.clientY - g.y0) / k) * aspect;
    const n = { ...g.e0 };
    if (g.c === 0 || g.c === 3) n.l = clamp(g.e0.l - dx, 0, 1.5); else n.r = clamp(g.e0.r + dx, 0, 1.5);
    if (g.c === 0 || g.c === 1) n.t = clamp(g.e0.t - dy, 0, 1.5); else n.b = clamp(g.e0.b + dy, 0, 1.5);
    setFree(n);
  };

  const pick = (key: string) => {
    if (key === sel) {
      // tapping the selected item clears its expansion
      if (key === "ratio") setScale(1); else if (key === "custom") setFree(ZERO); else setFixed((f) => ({ ...f, [key]: false }));
      return;
    }
    setSel(key);
    if (key === "custom") setTip("Drag the corners to set the area you want to enlarge.");
    else if (key !== "ratio") setFixed((f) => ({ ...f, [key]: true }));
  };

  const create = async () => {
    if (bgW >= 2 || bgH * aspect >= 2) setTip("The quality may be lower when creating a large area at once.\nTry creating an area first and then adding more.");
    const from = cur?.c ?? getBase();
    if (!from) return;
    setFailed(false);
    const e = { ...ext };
    const out = await job.run((signal, onProgress) => outpaintCanvas(from, e, { signal, onProgress }), 30);
    if (!out) return;
    setResults((r) => { const list = [...r.list.slice(0, r.i), { c: out, url: previewUrl(out) }]; return { list, i: list.length }; });
    // the new image starts unexpanded
    setScale(1); setFree(ZERO); setFixed({});
  };
  const confirm = () => {
    if (!cur) { openSub(null); return; }
    bases.current.push(cur.c);
    commit({ ...doc, base: bases.current.length - 1 });
    openSub(null);
  };

  const showCreate = sel === "ratio" ? scale > 1.001 : expanded;
  const optionH = sel === "ratio" ? 54 : 0;

  return (
    <>
      <div ref={boxRef} className="absolute inset-x-0 top-0 z-[5] overflow-hidden" style={{ bottom: MENU, background: "#171717", touchAction: "none" }} onPointerMove={onMove} onPointerUp={() => { drag.current = null; }}>
        {expanded && <div className="absolute" style={{ left: bx, top: by, width: bgW * k, height: bgH * k, backgroundImage: `url(${d("segmentation_bg")})`, backgroundSize: "24px 24px" }} />}
        {img && <img src={img} alt="" draggable={false} className="pointer-events-none absolute" style={{ left: ix, top: iy, width: iw, height: ih, visibility: held ? "hidden" : "visible", outline: expanded ? "1px solid #ffffff" : undefined }} />}
        {expanded && <div className="pointer-events-none absolute" style={{ left: bx - 1.5, top: by - 1.5, width: bgW * k + 3, height: bgH * k + 3, border: "3px solid #ffffff", borderRadius: 1.5 }} />}
        {sel === "custom" && [0, 1, 2, 3].map((c) => (
          <div
            key={c} className="absolute" onPointerDown={onCorner(c)}
            style={{ left: (c === 0 || c === 3 ? bx : bx + bgW * k) - 18, top: (c === 0 || c === 1 ? by : by + bgH * k) - 18, width: 36, height: 36, touchAction: "none" }}
          >
            <img src={d("icon_edit_crop_corner")} alt="" draggable={false} style={{ width: 36, height: 36, transform: `rotate(${c * 90}deg)` }} />
          </div>
        ))}
        {sel === "custom" && expanded && (
          <button type="button" onClick={() => setFree(ZERO)} className="absolute text-white" style={{ right: 16, top: 5, height: 34, fontSize: 15 }}>Reset</button>
        )}
      </div>
      <TextTooltip text={tip} />

      <div className="absolute inset-x-0 z-20 flex items-center" style={{ bottom: MENU + optionH, height: 54 }} onPointerDown={(e) => e.stopPropagation()}>
        <CtrlIcon name="undo" enabled={results.i > 0} onClick={() => setResults((r) => ({ ...r, i: r.i - 1 }))} style={{ marginLeft: 10 }} />
        <CtrlIcon name="redo" enabled={results.i < results.list.length} onClick={() => setResults((r) => ({ ...r, i: r.i + 1 }))} style={{ marginLeft: 10 }} />
        <span className="flex-1" />
        <CtrlIcon name="original" enabled onHold={hold} style={{ marginRight: 10 }} />
      </div>
      {sel === "ratio" && (
        <OptionRow bottom={MENU}>
          <span className="flex-none text-white" style={{ marginLeft: 20, fontSize: 13, width: 36 }}>{`${Math.round(scale * 100)}%`}</span>
          <EditSeekBar style={{ marginLeft: 24, marginRight: 52 }} value={scale} min={1} max={1.5} def={1.25} duplex={false} format={(v) => `${Math.round(v * 100)}%`} onChange={setScale} />
        </OptionRow>
      )}

      <Panel
        title="AI Expand" guide onClose={() => openSub(null)}
        confirmNode={showCreate ? <CreateButton onClick={() => void create()} /> : undefined}
        onConfirm={confirm}
      >
        <div className="no-scrollbar absolute inset-x-0 top-0 flex items-center overflow-x-auto" style={{ bottom: 52, padding: "0 4px", gap: (view.w - 4 - 5.5 * 58) / 5 }}>
          {ITEMS.map((it) => <FeatureButton key={it.key} icon={it.icon} label={it.label} selected={sel === it.key} onClick={() => pick(it.key)} />)}
        </div>
      </Panel>
      {failed && <RetryView text={FAIL} onRetry={() => void create()} />}
      {job.pct !== null && <AiLoading text={aiStepText(job.pct)} onCancel={job.cancel} />}
    </>
  );
}
