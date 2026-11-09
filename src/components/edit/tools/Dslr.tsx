"use client";

// EPDslrFragment (fragment_edit_photo_tools_dslr.xml). The original downloads Kuru effect package 139383 and
// a server depth map; the web port computes the depth map on-device with Depth Anything V2 Small (src/lib/ai,
// Apache-2.0) and renders a depth-aware lens blur driven by the same four controls and the focus tap.
import { useEffect, useRef, useState } from "react";
import { bokeh, depthAt, depthMap, type DepthMap } from "@/lib/ai";
import { useEdit } from "../ctx";
import { CtrlIcon, EditSeekBar, FeatureButton, FeatureList } from "../ui";
import { clamp, copyCanvas, EditLoading, MENU, OptionRow, Panel, PhotoOverlay, RetryView, S, useHold, usePhotoArea, usePhotoSnapshot } from "./common";
import { F_STOPS, indexToStrength, strengthToIndex, type DslrParams } from "./effects";
import { useAsyncBake, useBase } from "./aiCommon";

/** Blur radius in px for an image of size W x H (same scale as the original f-stop ruler mapping). */
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
  { key: "strength", label: "Strength", icon: "icon_edit_dslr_strength", def: 0.6 },
  { key: "focus", label: "Focus", icon: "icon_edit_dslr_focus", def: 0.9 },
  { key: "depth", label: "Depth", icon: "icon_edit_dslr_depth", def: 0.8 },
  { key: "edges", label: "Blur Edges", icon: "icon_edit_dslr_bluredges", def: 0 },
] as const;
type Key = (typeof MENUS)[number]["key"];

const fLabel = (v: number) => `f/${Math.round(F_STOPS[Math.round(clamp(strengthToIndex(v), 0, 34))] * 10) / 10}`;

/** VCStrengthBar: aperture ruler, 35 ticks (16x2dp, 10dp gap) sliding under a fixed #FF6584 cursor. */
function StrengthBar({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x0: number; i0: number } | null>(null);
  const [bubble, setBubble] = useState(false);
  const idx = strengthToIndex(value);
  const GAP = 12; // 2dp tick + 10dp gap
  const set = (i: number) => {
    const ii = Math.round(clamp(i, 0, 34));
    if (Math.abs(indexToStrength(ii) - value) > 1e-6) onChange(Math.max(0.01, indexToStrength(ii)));
  };
  return (
    <div
      ref={ref} className="relative h-full flex-1 overflow-hidden" style={{ touchAction: "none" }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x0: e.clientX, i0: idx }; setBubble(true); }}
      onPointerMove={(e) => { const dg = drag.current; if (dg) set(dg.i0 - (e.clientX - dg.x0) / GAP); }}
      onPointerUp={() => { drag.current = null; window.setTimeout(() => setBubble(false), 500); }}
    >
      <div className="absolute inset-y-0 left-1/2" style={{ transform: `translateX(${-idx * GAP}px)` }}>
        {F_STOPS.map((f, i) => (
          <span key={i} className="absolute" style={{ left: i * GAP - 1, top: "50%", marginTop: -8, width: 2, height: 16, borderRadius: 1, background: [0, 6, 11, 21, 31, 34].includes(i) ? "#ffffff" : "rgba(255,255,255,0.3)" }} />
        ))}
        <span className="absolute rounded-full bg-white" style={{ left: 21 * GAP - 2, top: "50%", marginTop: 12, width: 4, height: 4 }} />
      </div>
      <span className="absolute left-1/2 top-1/2" style={{ width: 2, height: 26, marginLeft: -1, marginTop: -13, background: "#FF6584" }} />
      <span
        className="pointer-events-none absolute left-1/2 flex items-center justify-center rounded-full bg-white font-bold"
        style={{ width: 42, height: 42, marginLeft: -21, bottom: 34, fontSize: 11, color: "#222222", boxShadow: "0 0 2px rgba(0,0,0,0.3)", opacity: bubble ? 1 : 0, transition: bubble ? "none" : "opacity 300ms" }}
      >
        {fLabel(value)}
      </span>
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

  // depth model download + inference (view_loading "Processing…"), then Strength is auto-selected
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

  const optionH = sel ? 54 : 0;
  return (
    <>
      <PhotoOverlay area={area} canvasRef={canvasRef} hidden={held || !ready}>
        {focusAt && sel === "focus" && (
          <span className="absolute rounded-full" style={{ left: focusAt.x - 30, top: focusAt.y - 30, width: 60, height: 60, border: "1.5px solid #ffffff" }} />
        )}
      </PhotoOverlay>
      {((!ready && !failed) || baking) && <EditLoading text={S.processing} />}
      {failed && <RetryView text={S.networkTry} onRetry={() => { setFailed(false); setAttempt((n) => n + 1); }} />}

      <div className="absolute inset-x-0 z-20 flex items-center" style={{ bottom: MENU + optionH, height: 54 }} onPointerDown={(e) => e.stopPropagation()}>
        <span className="flex-1" />
        <CtrlIcon name="original" enabled={ready} onHold={hold} style={{ marginRight: 10 }} />
      </div>
      {sel === "strength" && (
        <OptionRow bottom={MENU}><div className="flex h-full flex-1 items-center" style={{ padding: "10px 0" }}><StrengthBar value={p.strength} onChange={(v) => setP((o) => ({ ...o, strength: v }))} /></div></OptionRow>
      )}
      {sel && sel !== "strength" && (
        <OptionRow bottom={MENU}>
          <EditSeekBar style={{ margin: "0 68px" }} value={p[sel]} min={0} max={1} def={MENUS.find((m) => m.key === sel)!.def} onChange={(v) => setP((o) => ({ ...o, [sel]: v }))} />
        </OptionRow>
      )}

      <Panel title="DSLR" onClose={() => openSub(null)} onConfirm={() => void confirm()}>
        {ready && (
          <FeatureList count={MENUS.length}>
            {MENUS.map((m) => <FeatureButton key={m.key} icon={m.icon} label={m.label} selected={sel === m.key} onClick={() => setSel(m.key)} />)}
          </FeatureList>
        )}
      </Panel>
    </>
  );
}
