"use client";

// Adjust tab: one-tap sliders plus three pages (Curves, Split tone, Colour mix).
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Icon, cx } from "@/components/ui";
import { useEdit } from "../ctx";
import {
  ADJUST_ITEMS, curvesModified, DEFAULT_CURVE, DEFAULT_SPLIT, HSL_COLORS, splineFn, SPLIT_HIGHLIGHT_COLORS, SPLIT_SHADOW_COLORS,
  type AdjustKey, type Curves, type Doc, type Pt,
} from "../model";
import { BarTabs, ColorChip, ControlRow, Dock, EditBar, EditSeekBar, FeatureButton, FeatureList, MENU, PanelArea, SliderRow } from "../ui";

const hslModified = (h: number[]) => h.some((v) => Math.abs(v) > 0.001);
const splitModified = (d: Doc) => !!(d.split.shadow.color || d.split.highlight.color);

export function AdjustPanel() {
  const { doc, setLive, commit, undo, setOriginal, openSub, devAdjust } = useEdit();
  // nothing selected on entry: the slider appears once an item is picked
  const [sel, setSel] = useState<AdjustKey | null>(() => (ADJUST_ITEMS.some((i) => i.key === devAdjust && i.kind === "slide") ? devAdjust as AdjustKey : null));
  const [flash, setFlash] = useState(0);
  const item = ADJUST_ITEMS.find((i) => i.key === sel);
  const wrap = useRef<HTMLDivElement>(null);
  const centre = (idx: number) => {
    const list = wrap.current?.firstElementChild as HTMLElement | null;
    const el = list?.children[idx] as HTMLElement | undefined;
    if (!list || !el) return;
    list.scrollTo({ left: el.offsetLeft + el.offsetWidth / 2 - list.clientWidth / 2, behavior: "smooth" });
  };
  return (
    <>
      <ControlRow undo={undo} onOriginal={setOriginal}>
        {item && (
          <EditSeekBar
            value={doc.adjust[item.key as AdjustKey]}
            min={item.min} max={item.max} def={0}
            flashKey={flash}
            onChange={(v) => setLive({ ...doc, adjust: { ...doc.adjust, [item.key]: v } })}
            onRelease={(v) => commit({ ...doc, adjust: { ...doc.adjust, [item.key]: v } })}
          />
        )}
      </ControlRow>
      <PanelArea>
        <div ref={wrap} className="absolute inset-0">
          <FeatureList>
            {ADJUST_ITEMS.map((it, idx) => {
              const modified = it.key === "curves" ? curvesModified(doc.curves) : it.key === "hsl" ? hslModified(doc.hsl) : it.key === "split_tone" ? splitModified(doc) : Math.abs(doc.adjust[it.key as AdjustKey]) > 0.0001;
              return (
                <div key={it.key} className="flex flex-none items-center">
                  <FeatureButton
                    icon={it.icon}
                    label={it.label}
                    selected={sel === it.key}
                    modified={modified}
                    onClick={() => {
                      if (it.kind === "feature") {
                        setSel(null);
                        openSub(it.key === "curves" ? "curves" : it.key === "hsl" ? "hsl" : "split");
                      } else {
                        setSel(it.key as AdjustKey);
                        setFlash((n) => n + 1);
                        centre(idx);
                      }
                    }}
                  />
                  {it.key === "hsl" && <span className="mx-1.5 h-8 w-px flex-none bg-line" />}
                </div>
              );
            })}
          </FeatureList>
        </div>
      </PanelArea>
    </>
  );
}

/* ================================================================== Curves */

/** Channel colours: line, point and histogram fill. */
const CH = [
  { key: "rgb", label: "All", line: "#F4F5F7", hist: "rgba(244,245,247,0.16)" },
  { key: "red", label: "Red", line: "#FF6B6B", hist: "rgba(255,107,107,0.18)" },
  { key: "green", label: "Green", line: "#4ADE80", hist: "rgba(74,222,128,0.18)" },
  { key: "blue", label: "Blue", line: "#60A5FA", hist: "rgba(96,165,250,0.18)" },
] as const;
const CURVE_H = 220;

function useHistogram(src: HTMLCanvasElement | null) {
  return useMemo(() => {
    if (!src) return null;
    const c = document.createElement("canvas");
    const k = Math.min(1, 256 / Math.max(src.width, src.height));
    c.width = Math.max(1, Math.round(src.width * k)); c.height = Math.max(1, Math.round(src.height * k));
    const ctx = c.getContext("2d")!;
    ctx.drawImage(src, 0, 0, c.width, c.height);
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    const h = [new Float32Array(256), new Float32Array(256), new Float32Array(256), new Float32Array(256)];
    for (let i = 0; i < px.length; i += 4) { h[1][px[i]]++; h[2][px[i + 1]]++; h[3][px[i + 2]]++; }
    for (let i = 0; i < 256; i++) h[0][i] = (h[1][i] + h[2][i] + h[3][i]) / 3;
    return h.map((a) => { const m = Math.max(...a) || 1; return Array.from(a, (v) => v / m); });
  }, [src]);
}

export function CurvesPanel() {
  const { doc, setLive, commit, openSub, setOriginal, srcCanvas } = useEdit();
  const [curves, setCurves] = useState<Curves>(doc.curves);
  const [stack, setStack] = useState<{ list: Curves[]; i: number }>({ list: [doc.curves], i: 0 });
  const [ch, setCh] = useState(0);
  const [selPt, setSelPt] = useState(-1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ idx: number } | null>(null);
  const [src] = useState(srcCanvas);
  const hist = useHistogram(src);
  const key = CH[ch].key;
  const pts = curves[key];

  const apply = (c: Curves) => { setCurves(c); setLive({ ...doc, curves: c }); };
  const push = (c: Curves) => setStack((s) => ({ list: [...s.list.slice(0, s.i + 1), c], i: s.i + 1 }));

  // curve graph: histogram, quarter grid, the identity diagonal, the spline and its points
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext("2d")!;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, W, H);
    const pad = 18, w = W - pad * 2, h = H - pad * 2;
    const X = (x: number) => pad + x * w, Y = (y: number) => pad + (1 - y) * h;
    if (hist) {
      g.fillStyle = CH[ch].hist;
      g.beginPath(); g.moveTo(X(0), Y(0));
      hist[ch].forEach((v, i) => g.lineTo(X(i / 255), Y(v * 0.9)));
      g.lineTo(X(1), Y(0)); g.closePath(); g.fill();
    }
    g.strokeStyle = "rgba(255,255,255,0.1)"; g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(X(i / 4), Y(0)); g.lineTo(X(i / 4), Y(1)); g.stroke();
      g.beginPath(); g.moveTo(X(0), Y(i / 4)); g.lineTo(X(1), Y(i / 4)); g.stroke();
    }
    g.setLineDash([4, 4]);
    g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(1), Y(1)); g.stroke();
    g.setLineDash([]);
    const f = splineFn(pts);
    g.beginPath();
    for (let i = 0; i <= 200; i++) { const x = i / 200; const y = Math.min(1, Math.max(0, f(x))); if (i) g.lineTo(X(x), Y(y)); else g.moveTo(X(x), Y(y)); }
    g.lineCap = "round"; g.strokeStyle = CH[ch].line; g.lineWidth = 2.5; g.stroke();
    pts.forEach((p, i) => {
      g.beginPath(); g.arc(X(p[0]), Y(p[1]), i === selPt ? 9 : 7, 0, Math.PI * 2);
      g.fillStyle = i === selPt ? CH[ch].line : "#0B0C0F"; g.fill();
      g.strokeStyle = CH[ch].line; g.lineWidth = 2; g.stroke();
    });
  }, [pts, ch, selPt, hist]);

  const toUnit = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const pad = 18, w = r.width - pad * 2, h = r.height - pad * 2;
    return { x: (e.clientX - r.left - pad) / w, y: 1 - (e.clientY - r.top - pad) / h, w };
  };
  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y, w } = toUnit(e);
    let idx = pts.findIndex((p) => Math.abs(p[0] - x) * w <= 16);
    let next = pts;
    if (idx < 0) {
      const cx = Math.min(1, Math.max(0, x)), cy = Math.min(1, Math.max(0, y));
      next = [...pts, [cx, cy] as Pt].sort((a, b) => a[0] - b[0]);
      idx = next.findIndex((p) => p[0] === cx && p[1] === cy);
      apply({ ...curves, [key]: next });
    }
    setSelPt(idx);
    drag.current = { idx };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const { x, y, w } = toUnit(e);
    const i = drag.current.idx;
    const cur = curves[key];
    const minGap = 8 / w;
    const nx = i === 0 || i === cur.length - 1 ? cur[i][0] : Math.min(cur[i + 1][0] - minGap, Math.max(cur[i - 1][0] + minGap, x));
    const next = cur.map((p, j) => (j === i ? [nx, Math.min(1, Math.max(0, y))] as Pt : p));
    apply({ ...curves, [key]: next });
  };
  const onUp = () => { if (drag.current) { drag.current = null; push(curves); } };

  const canDelete = selPt > 0 && selPt < pts.length - 1;
  const step = (dir: -1 | 1) => {
    const i = stack.i + dir;
    if (i < 0 || i >= stack.list.length) return;
    setStack({ ...stack, i });
    setSelPt(-1);
    apply(stack.list[i]);
  };
  const channelEdited = (k: (typeof CH)[number]["key"]) => { const c = curves[k]; return !(c.length === 2 && c[0][0] === 0 && c[0][1] === 0 && c[1][0] === 1 && c[1][1] === 1); };

  return (
    <>
      <ControlRow bottom={MENU + CURVE_H + 8} undo={{ can: stack.i > 0, on: () => step(-1) }} redo={{ can: stack.i < stack.list.length - 1, on: () => step(1) }} onOriginal={setOriginal} />
      <div className="absolute inset-x-3 z-20 overflow-hidden rounded-lg bg-bg/75 ring-1 ring-line backdrop-blur-md" style={{ bottom: MENU + 8, height: CURVE_H }}>
        <canvas ref={canvasRef} className="h-full w-full touch-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      </div>
      <EditBar title="Curves" onClose={() => { setLive(null); openSub(null); }} onConfirm={() => { commit({ ...doc, curves }); openSub(null); }} />
      <Dock>
        <div className="flex h-full flex-col justify-center gap-4 px-4">
          <div className="grid grid-cols-4 gap-2">
            {CH.map((c, i) => (
              <button
                key={c.key} type="button" aria-pressed={ch === i} onClick={() => { setCh(i); setSelPt(-1); }}
                className={cx("oe-press flex h-12 flex-col items-center justify-center gap-1 rounded-md text-[12px] font-semibold transition-colors", ch === i ? "bg-raised text-fg ring-1 ring-fg/40" : "bg-bg/40 text-fg-3")}
              >
                <span className="relative h-2.5 w-6 rounded-full" style={{ background: c.line }}>
                  {channelEdited(c.key) && <span className="absolute -right-1.5 -top-1 h-1.5 w-1.5 rounded-full bg-accent" />}
                </span>
                {c.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="sm" icon="trash" disabled={!canDelete} block onClick={() => { const next = pts.filter((_, j) => j !== selPt); const c = { ...curves, [key]: next }; apply(c); push(c); setSelPt(-1); }}>Delete point</Button>
            <Button variant="secondary" size="sm" icon="reset" disabled={!channelEdited(key)} block onClick={() => { const c = { ...curves, [key]: DEFAULT_CURVE }; apply(c); push(c); setSelPt(-1); }}>Reset {CH[ch].label === "All" ? "curve" : CH[ch].label.toLowerCase()}</Button>
          </div>
          <p className="-mt-1 text-center text-[12px] text-fg-3">Tap the graph to add a point, drag to shape the curve.</p>
        </div>
      </Dock>
    </>
  );
}

/* ================================================================== Colour mix (HSL) */

export function HslPanel() {
  const { doc, setLive, commit, openSub, setOriginal } = useEdit();
  const [hsl, setHsl] = useState<number[]>(doc.hsl);
  const [color, setColor] = useState(0);
  const c = HSL_COLORS[color];
  const rows = [
    { label: "Hue", grad: c.hue },
    { label: "Saturation", grad: c.sat },
    { label: "Lightness", grad: c.light },
  ];
  const set = (row: number, v: number) => {
    const next = [...hsl]; next[color * 3 + row] = v;
    setHsl(next); setLive({ ...doc, hsl: next });
  };
  const bandEdited = (i: number) => [0, 1, 2].some((r) => Math.abs(hsl[i * 3 + r]) > 0.001);
  return (
    <>
      <ControlRow onOriginal={setOriginal} />
      <EditBar title="Colour mix" onClose={() => { setLive(null); openSub(null); }} onConfirm={() => { commit({ ...doc, hsl }); openSub(null); }} />
      <Dock>
        <div className="flex h-full flex-col justify-center gap-1 pb-2">
          <div className="mb-1 flex items-center justify-between px-5">
            {HSL_COLORS.map((h, i) => (
              <ColorChip key={h.name} label={h.name} color={h.c} selected={color === i} onClick={() => setColor(i)}>
                {bandEdited(i) && color !== i && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
              </ColorChip>
            ))}
          </div>
          {rows.map((r, i) => {
            const v = hsl[color * 3 + i];
            return (
              <SliderRow key={r.label} label={r.label} value={Math.round(v * 100)}>
                <EditSeekBar value={v} min={-1} max={1} def={0} level={false} gradient={r.grad} onChange={(nv) => set(i, nv)} />
              </SliderRow>
            );
          })}
        </div>
      </Dock>
    </>
  );
}

/* ================================================================== Split tone */

export function SplitPanel() {
  const { doc, setLive, commit, openSub, setOriginal } = useEdit();
  const [split, setSplit] = useState(doc.split ?? DEFAULT_SPLIT);
  const [page, setPage] = useState<"shadow" | "highlight">("shadow");
  const cur = split[page];
  const colors = page === "shadow" ? SPLIT_SHADOW_COLORS : SPLIT_HIGHLIGHT_COLORS;
  const apply = (s: typeof split) => { setSplit(s); setLive({ ...doc, split: s }); };
  const modified = !!(split.shadow.color || split.highlight.color);
  return (
    <>
      <ControlRow onOriginal={modified ? setOriginal : undefined} />
      <EditBar onClose={() => { setLive(null); openSub(null); }} onConfirm={() => { commit({ ...doc, split }); openSub(null); }}>
        <BarTabs items={[{ id: "shadow", label: "Shadows" }, { id: "highlight", label: "Highlights" }]} value={page} onChange={setPage} />
      </EditBar>
      <Dock>
        <div className="flex h-full flex-col justify-center gap-5 pb-2">
          <div className="flex items-center justify-between px-5">
            <button
              type="button" aria-label="No tint" aria-pressed={!cur.color}
              onClick={() => apply({ ...split, [page]: { ...cur, color: null, value: 0 } })}
              className={cx("oe-press flex h-[30px] w-[30px] items-center justify-center rounded-full", !cur.color ? "bg-fg text-bg" : "bg-raised text-fg-2")}
            >
              <Icon name="block" size={16} />
            </button>
            {colors.map((c) => (
              <ColorChip
                key={c} color={c} selected={cur.color === c}
                onClick={() => apply({ ...split, [page]: { ...cur, color: c, value: cur.memo[c] ?? 1 } })}
              />
            ))}
          </div>
          <SliderRow label="Strength" value={cur.color ? Math.round(cur.value * 100) : "–"}>
            <EditSeekBar
              value={cur.color ? cur.value : 0} min={0} max={1} def={cur.color ? 1 : 0} level={false}
              disabled={!cur.color}
              onChange={(v) => apply({ ...split, [page]: { ...cur, value: v, memo: { ...cur.memo, [cur.color!]: v } } })}
            />
          </SliderRow>
        </div>
      </Dock>
    </>
  );
}
