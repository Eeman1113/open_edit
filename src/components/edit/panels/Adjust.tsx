"use client";

// EPAdjustFragment + EPCurveFragment / EPHSLFragment / EPSplitToneFragment.
import { useEffect, useMemo, useRef, useState } from "react";
import { useEdit } from "../ctx";
import {
  ADJUST_ITEMS, curvesModified, DEFAULT_SPLIT, HSL_COLORS, splineFn, SPLIT_HIGHLIGHT_COLORS, SPLIT_SHADOW_COLORS,
  type AdjustKey, type Curves, type Doc, type Pt,
} from "../model";
import { ColorChip, ControlRow, EditSeekBar, FeatureButton, FeatureList, Img, TitleBar, TitleTab } from "../ui";

const hslModified = (h: number[]) => h.some((v) => Math.abs(v) > 0.001);
const splitModified = (d: Doc) => !!(d.split.shadow.color || d.split.highlight.color);

export function AdjustPanel() {
  const { doc, setLive, commit, undo, redo, setOriginal, openSub, devAdjust } = useEdit();
  // Entering Adjust: selection NONE, slider hidden (EPAdjustViewModel)
  const [sel, setSel] = useState<AdjustKey | null>(() => (ADJUST_ITEMS.some((i) => i.key === devAdjust && i.kind === "slide") ? devAdjust as AdjustKey : null));
  const [flash, setFlash] = useState(0);
  const item = ADJUST_ITEMS.find((i) => i.key === sel);
  const wrap = useRef<HTMLDivElement>(null);
  // CenterScrollLayoutManager: the tapped item smooth-scrolls to the horizontal centre
  const centre = (idx: number) => {
    const list = wrap.current?.firstElementChild as HTMLElement | null;
    const el = list?.children[idx] as HTMLElement | undefined;
    if (!list || !el) return;
    list.scrollTo({ left: el.offsetLeft + el.offsetWidth / 2 - list.clientWidth / 2, behavior: "smooth" });
  };
  return (
    <>
      <ControlRow undo={undo} redo={redo} onOriginal={setOriginal}>
        {item && (
          <EditSeekBar
            style={{ marginLeft: 24, marginRight: 24 }}
            value={doc.adjust[item.key as AdjustKey]}
            min={item.min} max={item.max} def={0}
            flashKey={flash}
            onChange={(v) => setLive({ ...doc, adjust: { ...doc.adjust, [item.key]: v } })}
            onRelease={(v) => commit({ ...doc, adjust: { ...doc.adjust, [item.key]: v } })}
          />
        )}
      </ControlRow>
      <div ref={wrap} className="absolute inset-x-0" style={{ bottom: 52, height: 134 }}>
        <FeatureList count={ADJUST_ITEMS.length}>
          {ADJUST_ITEMS.map((it, idx) => {
            const modified = it.key === "curves" ? curvesModified(doc.curves) : it.key === "hsl" ? hslModified(doc.hsl) : it.key === "split_tone" ? splitModified(doc) : Math.abs(doc.adjust[it.key as AdjustKey]) > 0.0001;
            return (
              <FeatureButton
                key={it.key}
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
            );
          })}
        </FeatureList>
      </div>
    </>
  );
}

/* ================================================================== Curves */

const CH = [
  { key: "rgb", sel: "#FFFFFF", unsel: "#888888", hist: "rgba(171,171,171,0.2)" },
  { key: "red", sel: "#FF5151", unsel: "#6B2E2E", hist: "rgba(242,89,104,0.2)" },
  { key: "green", sel: "#7DD87E", unsel: "#375137", hist: "rgba(93,192,93,0.2)" },
  { key: "blue", sel: "#3D86FF", unsel: "#213279", hist: "rgba(61,134,255,0.2)" },
] as const;

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

  // draw EPCurveView
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext("2d")!;
    g.scale(dpr, dpr);
    g.fillStyle = "rgba(0,0,0,0.7)"; g.fillRect(0, 0, W, H);
    const pad = 20, w = W - pad * 2, h = H - pad * 2;
    const X = (x: number) => pad + x * w, Y = (y: number) => pad + (1 - y) * h;
    if (hist) {
      g.fillStyle = CH[ch].hist;
      g.beginPath(); g.moveTo(X(0), Y(0));
      hist[ch].forEach((v, i) => g.lineTo(X(i / 255), Y(v)));
      g.lineTo(X(1), Y(0)); g.closePath(); g.fill();
    }
    g.strokeStyle = "rgba(69,69,69,0.8)"; g.lineWidth = 1; g.lineJoin = "round";
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(X(i / 4), Y(0)); g.lineTo(X(i / 4), Y(1)); g.stroke();
      g.beginPath(); g.moveTo(X(0), Y(i / 4)); g.lineTo(X(1), Y(i / 4)); g.stroke();
    }
    g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(1), Y(1)); g.stroke();
    const f = splineFn(pts);
    const path = () => { g.beginPath(); for (let i = 0; i <= 200; i++) { const x = i / 200; const y = Math.min(1, Math.max(0, f(x))); if (i) g.lineTo(X(x), Y(y)); else g.moveTo(X(x), Y(y)); } };
    g.lineCap = "round";
    path(); g.strokeStyle = "#000000"; g.lineWidth = 4; g.stroke();
    path(); g.strokeStyle = CH[ch].sel; g.lineWidth = 2; g.stroke();
    pts.forEach((p, i) => {
      g.beginPath(); g.arc(X(p[0]), Y(p[1]), 8.5, 0, Math.PI * 2);
      g.fillStyle = i === selPt ? CH[ch].sel : CH[ch].unsel; g.fill();
      g.strokeStyle = "#000"; g.lineWidth = 1; g.stroke();
    });
  }, [pts, ch, selPt, hist]);

  const toUnit = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const pad = 20, w = r.width - pad * 2, h = r.height - pad * 2;
    return { x: (e.clientX - r.left - pad) / w, y: 1 - (e.clientY - r.top - pad) / h, w };
  };

  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y, w } = toUnit(e);
    let idx = pts.findIndex((p) => Math.abs(p[0] - x) * w <= 17);
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
    const minGap = 8.5 / w;
    const nx = i === 0 || i === cur.length - 1 ? cur[i][0] : Math.min(cur[i + 1][0] - minGap, Math.max(cur[i - 1][0] + minGap, x));
    const next = cur.map((p, j) => (j === i ? [nx, Math.min(1, Math.max(0, y))] as Pt : p));
    apply({ ...curves, [key]: next });
  };
  const onUp = () => { if (drag.current) { drag.current = null; push(curves); } };

  const canDelete = selPt > 0 && selPt < pts.length - 1;
  const undoLocal = (dir: -1 | 1) => {
    const i = stack.i + dir;
    if (i < 0 || i >= stack.list.length) return;
    setStack({ ...stack, i });
    setSelPt(-1);
    apply(stack.list[i]);
  };

  return (
    <>
      <ControlRow bottom={322} undo={{ can: stack.i > 0, on: () => undoLocal(-1) }} redo={{ can: stack.i < stack.list.length - 1, on: () => undoLocal(1) }} onOriginal={setOriginal} />
      <div className="absolute inset-x-0 bottom-0 bg-black" style={{ height: 186 }} />
      <canvas
        ref={canvasRef}
        className="absolute inset-x-0"
        style={{ bottom: 112, height: 210, width: "100%", touchAction: "none" }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      />
      <div className="absolute inset-x-0 flex justify-center" style={{ bottom: 75, gap: 28 }}>
        {CH.map((c, i) => (
          <ColorChip key={c.key} color={i === 0 ? "transparent" : c.sel} selected={ch === i} onClick={() => { setCh(i); setSelPt(-1); }}>
            {i === 0 && <Img name="icon_edit_adjust_curve_rgb" size={ch === 0 ? 24 : 32} style={{ position: "absolute" }} />}
            {i === 0 && ch === 0 && <span className="absolute inset-0 rounded-full" style={{ border: "2px solid #ffffff" }} />}
          </ColorChip>
        ))}
      </div>
      <button
        type="button"
        disabled={!canDelete}
        onClick={() => { const next = pts.filter((_, j) => j !== selPt); const c = { ...curves, [key]: next }; apply(c); push(c); setSelPt(-1); }}
        className="absolute"
        style={{ right: 10, bottom: 52 + 44.5, width: 29.5, height: 29.5, opacity: canDelete ? 1 : 0.4 }}
      >
        <Img name="icon_edit_curve_delete_enabled" size={29.5} />
      </button>
      <TitleBar title="Curves" onClose={() => { setLive(null); openSub(null); }} onConfirm={() => { commit({ ...doc, curves }); openSub(null); }} />
    </>
  );
}

/* ================================================================== HSL */

export function HslPanel() {
  const { doc, setLive, commit, openSub, setOriginal } = useEdit();
  const [hsl, setHsl] = useState<number[]>(doc.hsl);
  const [color, setColor] = useState(0);
  const [dragRow, setDragRow] = useState<number | null>(null);
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
  // option area: 3 rows of 43dp + 5.5 / 1 / 1 / 5.5 spacing
  const optH = 43 * 3 + 5.5 * 2 + 2;
  return (
    <>
      <ControlRow bottom={186 + optH} onOriginal={setOriginal} />
      <div className="absolute inset-x-0" style={{ bottom: 186, height: optH, background: dragRow === null ? "rgba(0,0,0,0.4)" : "transparent" }}>
        {rows.map((r, i) => {
          const v = hsl[color * 3 + i];
          return (
            <div key={r.label} className="flex items-center" style={{ marginTop: i === 0 ? 5.5 : 1, height: 43, visibility: dragRow === null || dragRow === i ? "visible" : "hidden" }}>
              <span className="truncate text-white" style={{ width: 80, marginLeft: 20, fontSize: 13, textShadow: "0 0 2px rgba(0,0,0,0.3)" }}>{`${r.label} ${Math.round(v * 100)}`}</span>
              <EditSeekBar
                style={{ marginLeft: 24, marginRight: 52 }}
                value={v} min={-1} max={1} def={0} level={false} gradient={r.grad}
                onChange={(nv) => { setDragRow(i); set(i, nv); }}
                onRelease={() => setDragRow(null)}
              />
            </div>
          );
        })}
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-black" style={{ height: 186 }}>
        <div className="absolute inset-x-0 top-0 flex items-center justify-between" style={{ height: 134, padding: "0 21.5px" }}>
          {HSL_COLORS.map((h, i) => <ColorChip key={h.name} color={h.c} selected={color === i} onClick={() => setColor(i)} />)}
        </div>
        <TitleBar title="HSL" onClose={() => { setLive(null); openSub(null); }} onConfirm={() => { commit({ ...doc, hsl }); openSub(null); }} />
      </div>
    </>
  );
}

/* ================================================================== Split Tone */

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
      <ControlRow onOriginal={modified ? setOriginal : undefined}>
        <EditSeekBar
          style={{ marginLeft: 68, marginRight: 24 }}
          value={cur.color ? cur.value : 0} min={0} max={1} def={cur.color ? 1 : 0}
          disabled={!cur.color}
          onChange={(v) => apply({ ...split, [page]: { ...cur, value: v, memo: { ...cur.memo, [cur.color!]: v } } })}
        />
        {!modified && <span style={{ width: 44 }} />}
      </ControlRow>
      <div className="absolute inset-x-0 bottom-0 bg-black" style={{ height: 186 }}>
        <div className="absolute inset-x-0 top-0 flex items-center justify-between" style={{ height: 134, padding: "0 22px" }}>
          {colors.map((c) => (
            <ColorChip
              key={c} color={c} selected={cur.color === c}
              onClick={() => {
                if (cur.color === c) apply({ ...split, [page]: { ...cur, color: null, value: 0 } });
                else apply({ ...split, [page]: { ...cur, color: c, value: cur.memo[c] ?? 1 } });
              }}
            />
          ))}
        </div>
        <TitleBar onClose={() => { setLive(null); openSub(null); }} onConfirm={() => { commit({ ...doc, split }); openSub(null); }}>
          <TitleTab label="Shadows" selected={page === "shadow"} onClick={() => setPage("shadow")} style={{ padding: "10px 30px" }} />
          <TitleTab label="Highlights" selected={page === "highlight"} onClick={() => setPage("highlight")} style={{ padding: "10px 30px" }} />
        </TitleBar>
      </div>
    </>
  );
}
