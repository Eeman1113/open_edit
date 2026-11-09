"use client";

// Expand: grow the canvas past the photo's edges and let on-device MI-GAN outpainting fill the new area
// (src/lib/ai outpaintCanvas: padded canvas, overlapping 512 px tiles). Each Generate is one result step with its own
// undo / redo; Apply keeps the latest result.
import { useEffect, useMemo, useRef, useState } from "react";
import { outpaintCanvas } from "@/lib/ai";
import { useEdit } from "../ctx";
import { ControlRow, EditSeekBar, FeatureButton, TOP_H } from "../ui";
import { RatioGlyph } from "../panels/Tools";
import { AiLoading, clamp, copyCanvas, CreateButton, MENU, OPTION_H, OptionRow, Panel, RetryView, TextTooltip, useHold, useTimedTooltip, usePhotoSnapshot } from "./common";
import { aiStepText, useAiJob, useBase } from "./aiCommon";

const ITEMS: { key: string; label: string; r: number | null }[] = [
  { key: "ratio", label: "Even", r: null },
  { key: "custom", label: "Free", r: null },
  { key: "square", label: "1:1", r: 1 },
  { key: "4:5", label: "4:5", r: 0.8 },
  { key: "9:16", label: "9:16", r: 0.5625 },
  { key: "3:4", label: "3:4", r: 0.75 },
  { key: "16:9", label: "16:9", r: 16 / 9 },
  { key: "1:2", label: "1:2", r: 0.5 },
  { key: "2:3", label: "2:3", r: 2 / 3 },
  { key: "9:20", label: "9:20", r: 0.45 },
  { key: "3:2", label: "3:2", r: 1.5 },
  { key: "4:3", label: "4:3", r: 4 / 3 },
  { key: "5:4", label: "5:4", r: 1.25 },
];
const FAIL = "Couldn't fill the new area. Please try again.";
const CHECKER = "repeating-conic-gradient(var(--oe-raised) 0% 25%, var(--oe-muted) 0% 50%) 0 0 / 20px 20px";

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

  // layout: fit the expanded canvas into the preview with a 30 px inset (60 px in Free, room for the handles)
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
    if (key === "custom") setTip("Drag the corners to choose how far to expand.");
    else if (key !== "ratio") setFixed((f) => ({ ...f, [key]: true }));
  };

  const create = async () => {
    if (bgW >= 2 || bgH * aspect >= 2) setTip("Big expansions can look softer. Try expanding a little at a time.");
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

  return (
    <>
      <div ref={boxRef} className="absolute inset-x-0 z-[5] touch-none overflow-hidden bg-bg" style={{ top: TOP_H, bottom: MENU }} onPointerMove={onMove} onPointerUp={() => { drag.current = null; }}>
        {expanded && <div className="absolute rounded-[2px]" style={{ left: bx, top: by, width: bgW * k, height: bgH * k, background: CHECKER }} />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {img && <img src={img} alt="" draggable={false} className="pointer-events-none absolute" style={{ left: ix, top: iy, width: iw, height: ih, visibility: held ? "hidden" : "visible", outline: expanded ? "1px solid rgba(255,255,255,0.6)" : undefined }} />}
        {expanded && <div className="pointer-events-none absolute rounded-[3px] ring-2 ring-accent" style={{ left: bx, top: by, width: bgW * k, height: bgH * k }} />}
        {sel === "custom" && [0, 1, 2, 3].map((c) => (
          <div
            key={c} className="absolute touch-none" onPointerDown={onCorner(c)}
            style={{ left: (c === 0 || c === 3 ? bx : bx + bgW * k) - 22, top: (c === 0 || c === 1 ? by : by + bgH * k) - 22, width: 44, height: 44 }}
          >
            <span className="absolute left-1/2 top-1/2 h-5 w-5" style={{ transform: `rotate(${c * 90}deg)`, transformOrigin: "0 0" }}>
              <span className="absolute -left-[2px] -top-[2px] h-5 w-5 rounded-tl-[3px] border-l-[4px] border-t-[4px] border-accent" />
            </span>
          </div>
        ))}
        {sel === "custom" && expanded && (
          <button type="button" onClick={() => setFree(ZERO)} className="oe-press absolute right-3 top-3 rounded-full bg-glass px-3 py-1.5 text-[13px] font-semibold text-white backdrop-blur-md">Reset</button>
        )}
      </div>
      <TextTooltip text={tip} />

      <ControlRow
        bottom={MENU + (sel === "ratio" ? OPTION_H : 0)}
        undo={{ can: results.i > 0, on: () => setResults((r) => ({ ...r, i: r.i - 1 })) }}
        redo={{ can: results.i < results.list.length, on: () => setResults((r) => ({ ...r, i: r.i + 1 })) }}
        onOriginal={hold}
      />
      {sel === "ratio" && (
        <OptionRow bottom={MENU} label="Expand by">
          <EditSeekBar value={scale} min={1} max={1.5} def={1.25} duplex={false} format={(v) => `${Math.round(v * 100)}%`} onChange={setScale} />
          <span className="tabular w-10 flex-none text-right text-[12px] text-fg-3">{`${Math.round(scale * 100)}%`}</span>
        </OptionRow>
      )}

      <Panel
        title="Expand" onClose={() => openSub(null)}
        confirmNode={showCreate ? <CreateButton onClick={() => void create()} /> : undefined}
        onConfirm={confirm}
      >
        <div className="no-scrollbar flex h-full items-center gap-1 overflow-x-auto px-3">
          {ITEMS.map((it) => (
            <FeatureButton
              key={it.key} label={it.label} selected={sel === it.key} onClick={() => pick(it.key)}
              iconNode={it.key === "ratio" ? <span className="block h-5 w-5 rounded-[4px] border-2 border-current outline-dashed outline-2 outline-offset-2 outline-current" /> : <RatioGlyph ratio={it.r} />}
            />
          ))}
        </div>
      </Panel>
      {failed && <RetryView text={FAIL} onRetry={() => void create()} />}
      {job.pct !== null && <AiLoading text={aiStepText(job.pct)} onCancel={job.cancel} />}
    </>
  );
}
