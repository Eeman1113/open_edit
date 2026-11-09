"use client";

// Depth blur: an on-device depth map (Depth Anything V2 Small, src/lib/ai, Apache-2.0) drives a depth-aware lens blur.
// Tap the photo to choose what stays sharp; Aperture, Focus range, Depth and Soft edges shape the blur.
import { useEffect, useRef, useState } from "react";
import { bokeh, depthAt, depthMap, type DepthMap } from "@/lib/ai";
import { useEdit } from "../ctx";
import { ControlRow, EditSeekBar, FeatureButton, FeatureList } from "../ui";
import { clamp, copyCanvas, EditLoading, MENU, OPTION_H, OptionRow, Panel, PhotoOverlay, RetryView, S, useHold, usePhotoArea, usePhotoSnapshot } from "./common";
import { F_STOPS, indexToStrength, strengthToIndex, type DslrParams } from "./effects";
import { useAsyncBake, useBase } from "./aiCommon";

/** Blur radius in px for an image of size W x H, from the aperture ruler position. */
const maxRadius = (p: DslrParams, W: number, H: number) => (strengthToIndex(p.strength) / 34) * Math.min(W, H) * 0.03;

/** Depth refined at <= `long` px, then bilinearly resampled to W x H. */
function depthFor(dm: DepthMap, src: HTMLCanvasElement, long = 1600) {
  const W = src.width, H = src.height;
  const k = Math.min(1, long / Math.max(W, H));
  const small = k < 1 ? copyCanvas(src, Math.round(W * k), Math.round(H * k)) : src;
  const d = depthAt(dm, small.getContext("2d")!.getImageData(0, 0, small.width, small.height));
  if (small === src) return d;
  const sw = small.width, sh = small.height, out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const fy = Math.min(sh - 1, (y + 0.5) * (sh / H) - 0.5), y0 = Math.max(0, Math.floor(fy)), y1 = Math.min(sh - 1, y0 + 1), ty = Math.max(0, fy - y0);
    for (let x = 0; x < W; x++) {
      const fx = Math.min(sw - 1, (x + 0.5) * (sw / W) - 0.5), x0 = Math.max(0, Math.floor(fx)), x1 = Math.min(sw - 1, x0 + 1), tx = Math.max(0, fx - x0);
      out[y * W + x] = (d[y0 * sw + x0] * (1 - tx) + d[y0 * sw + x1] * tx) * (1 - ty) + (d[y1 * sw + x0] * (1 - tx) + d[y1 * sw + x1] * tx) * ty;
    }
  }
  return out;
}

const MENUS = [
  { key: "strength", label: "Aperture", icon: "depth", def: 0.6 },
  { key: "focus", label: "Focus range", icon: "focus", def: 0.9 },
  { key: "depth", label: "Depth", icon: "skew-v", def: 0.8 },
  { key: "edges", label: "Soft edges", icon: "fade", def: 0 },
] as const;
type Key = (typeof MENUS)[number]["key"];

const fLabel = (v: number) => `f/${Math.round(F_STOPS[Math.round(clamp(strengthToIndex(v), 0, 34))] * 10) / 10}`;

/** Aperture ruler: 35 f-stop ticks slide under a fixed centre marker; drag sideways to change. */
function StrengthBar({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const drag = useRef<{ x0: number; i0: number } | null>(null);
  const idx = strengthToIndex(value);
  const GAP = 12;
  const set = (i: number) => {
    const ii = Math.round(clamp(i, 0, 34));
    if (Math.abs(indexToStrength(ii) - value) > 1e-6) onChange(Math.max(0.01, indexToStrength(ii)));
  };
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <div
        className="relative h-10 min-w-0 flex-1 cursor-ew-resize touch-none overflow-hidden"
        style={{ maskImage: "linear-gradient(90deg, transparent, #000 20%, #000 80%, transparent)" }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x0: e.clientX, i0: idx }; }}
        onPointerMove={(e) => { const dg = drag.current; if (dg) set(dg.i0 - (e.clientX - dg.x0) / GAP); }}
        onPointerUp={() => { drag.current = null; }}
      >
        <div className="absolute inset-y-0 left-1/2" style={{ transform: `translateX(${-idx * GAP}px)` }}>
          {F_STOPS.map((_, i) => {
            const major = [0, 6, 11, 21, 31, 34].includes(i);
            return <span key={i} className="absolute top-1/2 w-[2px] -translate-y-1/2 rounded-full" style={{ left: i * GAP - 1, height: major ? 18 : 10, background: major ? "var(--oe-fg)" : "var(--oe-fg3)" }} />;
          })}
        </div>
        <span className="absolute left-1/2 top-1/2 h-7 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" />
      </div>
      <span className="tabular w-12 flex-none text-right font-display text-[15px] font-semibold">{fLabel(value)}</span>
    </div>
  );
}

export function DslrTool() {
  const { openSub, setTool } = useEdit();
  const area = usePhotoArea();
  const asyncBake = useAsyncBake();
  const getBase = useBase();
  const [held, hold] = useHold();
  const snap = usePhotoSnapshot();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [baking, setBaking] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const dmRef = useRef<DepthMap | null>(null);
  /** preview source (<= 900 px for interactive slider updates) + its refined depth */
  const [pv, setPv] = useState<{ c: HTMLCanvasElement; d: Float32Array } | null>(null);
  const [sel, setSel] = useState<Key | null>(null);
  const [p, setP] = useState<DslrParams>({ strength: 0.6, focus: 0.9, depth: 0.8, edges: 0, fx: 0.5, fy: 0.45 });
  const [focusAt, setFocusAt] = useState<{ x: number; y: number } | null>(null);

  // depth model download and inference, then Aperture is selected
  useEffect(() => {
    const base = getBase();
    if (!snap || !base) return;
    let alive = true;
    depthMap(base).then((dm) => {
      if (!alive) return;
      console.info(`[ai] depth ${dm.w}x${dm.h}: ${Math.round(dm.ms)} ms (${dm.ep})`);
      dmRef.current = dm;
      const k = Math.min(1, 900 / Math.max(snap.width, snap.height));
      const c = k < 1 ? copyCanvas(snap, Math.round(snap.width * k), Math.round(snap.height * k)) : snap;
      setPv({ c, d: depthFor(dm, c) });
      setReady(true); setSel((s) => s ?? "strength");
    }, (e) => { console.warn("[ai] depth failed", e); if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [snap, getBase, attempt]);

  useEffect(() => {
    if (!ready || !pv) return;
    const raf = requestAnimationFrame(() => {
      const c = canvasRef.current;
      if (!c) return;
      const r = bokeh(pv.c, pv.d, { ...p, maxR: maxRadius(p, pv.c.width, pv.c.height) });
      c.width = r.width; c.height = r.height;
      c.getContext("2d")!.drawImage(r, 0, 0);
    });
    return () => cancelAnimationFrame(raf);
  }, [ready, pv, p]);

  const confirm = async () => {
    const dm = dmRef.current;
    if (!ready || !dm) { openSub(null); return; }
    setBaking(true);
    // let the spinner paint before the full-resolution pass
    await new Promise((r) => setTimeout(r, 50));
    await asyncBake(async (base) => bokeh(base, depthFor(dm, base), { ...p, maxR: maxRadius(p, base.width, base.height) }));
    setBaking(false);
  };

  // touching the preview moves the focus point (focus indicator while touching)
  const areaRef = useRef(area);
  useEffect(() => { areaRef.current = area; });
  useEffect(() => {
    const at = (fx: number, fy: number) => {
      const a = areaRef.current;
      const [u, v] = a.toPhoto(fx, fy);
      const uu = clamp(u, 0, 1), vv = clamp(v, 0, 1);
      setP((o) => ({ ...o, fx: uu, fy: vv }));
      setFocusAt({ x: a.x + uu * a.w, y: a.y + vv * a.h });
    };
    setTool({ down: at, move: at, up: () => window.setTimeout(() => setFocusAt(null), 300) });
    return () => setTool(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const optionH = sel ? OPTION_H : 0;
  return (
    <>
      <PhotoOverlay area={area} canvasRef={canvasRef} hidden={held || !ready}>
        {focusAt && sel === "focus" && (
          <span className="absolute rounded-full ring-2 ring-accent" style={{ left: focusAt.x - 30, top: focusAt.y - 30, width: 60, height: 60, boxShadow: "0 0 0 1px rgba(0,0,0,0.3)" }} />
        )}
      </PhotoOverlay>
      {((!ready && !failed) || baking) && <EditLoading text={baking ? "Rendering full size…" : "Measuring depth…"} />}
      {failed && <RetryView text={S.networkTry} onRetry={() => { setFailed(false); setAttempt((n) => n + 1); }} />}
      <ControlRow bottom={MENU + optionH} onOriginal={hold} originalEnabled={ready} />
      {sel === "strength" && <OptionRow bottom={MENU} label="Aperture"><StrengthBar value={p.strength} onChange={(v) => setP((o) => ({ ...o, strength: v }))} /></OptionRow>}
      {sel && sel !== "strength" && (
        <OptionRow bottom={MENU} label={MENUS.find((m) => m.key === sel)!.label} labelWidth={84}>
          <EditSeekBar value={p[sel]} min={0} max={1} def={MENUS.find((m) => m.key === sel)!.def} onChange={(v) => setP((o) => ({ ...o, [sel]: v }))} />
        </OptionRow>
      )}

      <Panel title="Depth blur" onClose={() => openSub(null)} onConfirm={() => void confirm()}>
        {ready ? (
          <div className="flex h-full flex-col">
            <div className="relative flex-1">
              <FeatureList>
                {MENUS.map((m) => <FeatureButton key={m.key} icon={m.icon} label={m.label} selected={sel === m.key} onClick={() => setSel(m.key)} />)}
              </FeatureList>
            </div>
            <p className="pb-4 text-center text-[12px] text-fg-3">Tap the photo to choose what stays sharp</p>
          </div>
        ) : null}
      </Panel>
    </>
  );
}
