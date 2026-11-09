"use client";

// Brush pages under Portrait that work on pixels (no face tracking):
//  - Retouch brush: paint retouch effects where you want them, with per-item opacity, spot sizes and tone sliders.
//  - Colour brush: paint skin tone, tint or glitter, with an eraser.
// The effects are approximated with canvas filters (see skinEffect below).
import { useMemo, useRef, useState } from "react";
import { Tabs, cx } from "@/components/ui";
import { useEdit } from "../../ctx";
import { ChipRow, ControlRow, EditSeekBar, FeatureButton, SwatchTool, ToolChip } from "../../ui";
import { ToneRows } from "../../panels/Portrait";
import {
  BrushRing, copyCanvas, lerp, MENU, newCanvas, OPTION_H, OptionRow, paintThrough, Panel, PhotoOverlay, sampleHex, strokeMask, TextTooltip,
  useBake, useHold, usePhotoArea, useStrokeCanvas, useStrokeInput, useStrokes, useTimedTooltip, type MStroke, usePhotoSnapshot } from "../common";
import { blurCanvas, filtered, mix } from "../effects";

/* ================================================================== Retouch brush */

const SKIN_ITEMS: [string, string][] = [
  ["auto", "Quick fix"], ["blemish", "Spots"], ["smooth", "Smooth"], ["balance", "Pores"], ["conceal", "Conceal"], ["wrinkle", "Lines"],
  ["smoother", "Extra smooth"], ["oilremover", "Shine"], ["skintexture", "Texture"], ["cleanse", "Clean up"], ["skintoneup", "Skin tone"],
  ["vibrance", "Vibrance"], ["glow", "Glow"], ["cooldown", "Cool down"], ["fixtone", "Even tone"], ["blackandwhite", "Mono"],
  ["fixshadow", "Lift shadows"], ["antiglare", "Less glare"], ["details", "Fine detail"], ["clear", "Clarity"], ["teeth", "Teeth"],
  ["structure", "Structure"], ["clarity", "Definition"], ["eyebag", "Under-eyes"], ["plim", "Eye smile"],
];
const BLEMISH_SIZES = [{ d: 10, ring: 5 }, { d: 13, ring: 10 }, { d: 15, ring: 15 }, { d: 18, ring: 20 }, { d: 21, ring: 25 }];

function skinEffect(src: HTMLCanvasElement, key: string, tone: { cw: number; tl: number }): HTMLCanvasElement {
  const m = Math.min(src.width, src.height);
  const soften = (r: number, t: number) => mix(src, blurCanvas(src, m * r), t);
  switch (key) {
    case "auto": return filtered(soften(0.004, 0.6), "brightness(1.04)");
    case "blemish": return blurCanvas(src, m * 0.008);
    case "smooth": return soften(0.004, 0.75);
    case "balance": return soften(0.002, 0.8);
    case "conceal": return filtered(soften(0.005, 0.7), "brightness(1.05)");
    case "wrinkle": return soften(0.003, 0.8);
    case "smoother": return soften(0.007, 0.8);
    case "oilremover": return filtered(src, "brightness(0.96) saturate(0.95) contrast(0.94)");
    case "skintexture": return filtered(src, "contrast(1.08)");
    case "cleanse": return filtered(soften(0.003, 0.6), "saturate(0.95) brightness(1.02)");
    case "skintoneup": {
      let c = filtered(src, `brightness(${1 + tone.tl * 0.18})`);
      if (tone.cw) {
        const t = newCanvas(src.width, src.height);
        const g = t.getContext("2d")!;
        g.drawImage(c, 0, 0);
        g.globalCompositeOperation = "soft-light"; g.globalAlpha = Math.abs(tone.cw) * 0.6;
        g.fillStyle = tone.cw > 0 ? "#FFA68E" : "#83CCFA"; g.fillRect(0, 0, t.width, t.height);
        c = t;
      }
      return c;
    }
    case "vibrance": return filtered(src, "saturate(1.35)");
    case "glow": {
      const c = filtered(src, "brightness(1.06)");
      const g = c.getContext("2d")!;
      g.globalCompositeOperation = "screen"; g.globalAlpha = 0.35; g.drawImage(blurCanvas(src, m * 0.01), 0, 0);
      return c;
    }
    case "cooldown": return filtered(src, "hue-rotate(-8deg) saturate(0.9)");
    case "fixtone": return filtered(src, "saturate(0.85) brightness(1.03)");
    case "blackandwhite": return filtered(src, "grayscale(1)");
    case "fixshadow": return filtered(src, "brightness(1.18)");
    case "antiglare": return filtered(src, "brightness(0.9) contrast(0.95)");
    case "teeth": return filtered(src, "saturate(0.45) brightness(1.15)");
    case "eyebag": return filtered(soften(0.004, 0.7), "brightness(1.06)");
    case "plim": return filtered(src, "brightness(1.08)");
    default: return filtered(src, "contrast(1.14) saturate(1.05)"); // details / clear / structure / clarity
  }
}

export function ManualSkinPage() {
  const { openSub, toast } = useEdit();
  const area = usePhotoArea();
  const bake = useBake();
  const [held, hold] = useHold();
  const src = usePhotoSnapshot();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [eraser, setEraser] = useState(false);
  const [opacity, setOpacity] = useState<Record<string, number>>({});
  const [blemishSize, setBlemishSize] = useState(2);
  const [tone, setTone] = useState({ cw: -0.2, tl: 0.3 });
  const [live, setLive] = useState<MStroke | null>(null);
  const [ring, setRing] = useState<{ x: number; y: number } | null>(null);
  const strokes = useStrokes<MStroke>();
  const [tip, setTip] = useTimedTooltip(null);
  const cache = useRef(new Map<string, HTMLCanvasElement>());

  const effect = (s: HTMLCanvasElement, key: string, cw: number, tl: number) => {
    const k = `${s.width}|${key}|${key === "skintoneup" ? `${cw.toFixed(2)},${tl.toFixed(2)}` : ""}`;
    let c = cache.current.get(k);
    if (!c) { c = skinEffect(s, key, { cw, tl }); cache.current.set(k, c); if (cache.current.size > 10) cache.current.delete(cache.current.keys().next().value!); }
    return c;
  };
  const apply = useMemo(() => (g: CanvasRenderingContext2D, s: MStroke, w: number, h: number, base: HTMLCanvasElement) => {
    const p = s.p!;
    if (p.full) { g.save(); g.globalAlpha = 1; g.drawImage(effect(base, p.key as string, 0, 0), 0, 0, w, h); g.restore(); return; }
    if (s.erase) paintThrough(g, base, s, w, h);
    else paintThrough(g, effect(base, p.key as string, p.cw as number, p.tl as number), s, w, h, p.opacity as number, 0.35);
  }, []);
  useStrokeCanvas(canvasRef, src, strokes.visible, live, apply);

  const radiusPx = sel === "blemish" ? BLEMISH_SIZES[blemishSize].ring * 1.2 : lerp(0.0015, 0.15, 0.3) * (area.viewW / 2);
  useStrokeInput(area, (u, v) => {
    if (!sel || sel === "auto") return null;
    return { pts: [u, v], r: radiusPx / Math.max(1, area.w), erase: eraser, p: { key: sel, opacity: opacity[sel] ?? 1, cw: tone.cw, tl: tone.tl } };
  }, setLive, (s) => strokes.push(s), setRing);

  const label = (k: string) => SKIN_ITEMS.find((i) => i[0] === k)?.[1] ?? "";
  const pick = (k: string) => {
    setSel(k); setEraser(false);
    if (k === "auto") { strokes.push({ pts: [0, 0], r: 0, p: { key: "auto", full: true } }); return; }
    setTip(k === "blemish" ? "Tap each spot to clear it" : "Paint over the areas to touch up");
  };
  const optionH = !sel || sel === "auto" ? 0 : sel === "skintoneup" ? 104 : OPTION_H;
  const last = strokes.visible[strokes.visible.length - 1];

  return (
    <>
      <PhotoOverlay area={area} canvasRef={canvasRef} hidden={held}><BrushRing at={ring} r={radiusPx} /></PhotoOverlay>
      <TextTooltip text={tip} bottom={MENU + optionH + 56} />
      <ControlRow
        bottom={MENU + optionH} style={{ zIndex: 20 }}
        undo={{ can: strokes.undo.can, on: () => { if (last) toast(`Undid ${label(last.p!.key as string)}`); strokes.undo.on(); } }}
        redo={{ can: strokes.redo.can, on: () => { strokes.redo.on(); } }}
        onOriginal={hold} originalEnabled={strokes.visible.length > 0}
      />
      {sel && sel !== "auto" && sel !== "blemish" && sel !== "skintoneup" && (
        <OptionRow bottom={MENU} label="Opacity">
          <EditSeekBar value={opacity[sel] ?? 1} min={0} max={1} def={1} onChange={(v) => setOpacity((o) => ({ ...o, [sel]: v }))} />
        </OptionRow>
      )}
      {sel === "blemish" && (
        <OptionRow bottom={MENU} label="Spot size">
          <div className="flex flex-1 items-center justify-around">
            {BLEMISH_SIZES.map((b, i) => (
              <button key={i} type="button" aria-label={`Size ${i + 1}`} aria-pressed={blemishSize === i} onClick={() => setBlemishSize(i)} className="flex h-9 w-9 items-center justify-center">
                <span className={cx("rounded-full transition-colors", blemishSize === i ? "bg-accent" : "bg-fg-3")} style={{ width: b.d, height: b.d }} />
              </button>
            ))}
          </div>
        </OptionRow>
      )}
      {sel === "skintoneup" && (
        <div className="absolute inset-x-3 z-20 flex flex-col justify-center rounded-lg bg-panel/90 py-2 shadow-lg ring-1 ring-line backdrop-blur-md" style={{ bottom: MENU + 8, height: 96 }} onPointerDown={(e) => e.stopPropagation()}>
          <ToneRows cw={tone.cw} tl={tone.tl} defs={[-0.2, 0.3]} onChange={(k, v) => setTone((t) => ({ ...t, [k]: v }))} />
        </div>
      )}
      <Panel title="Skin brush" onClose={() => openSub(null)} onConfirm={() => {
        if (!strokes.visible.length) { openSub(null); return; }
        bake((base) => { const out = copyCanvas(base); const g = out.getContext("2d")!; for (const s of strokes.visible) apply(g, s, out.width, out.height, base); return out; });
      }}>
        <div className="flex h-full flex-col justify-center gap-3">
          <ChipRow>
            {SKIN_ITEMS.map(([k, l]) => (
              <ToolChip key={k} label={l} selected={sel === k && k !== "auto"} modified={strokes.visible.some((st) => st.p?.key === k)} onClick={() => pick(k)} />
            ))}
          </ChipRow>
          <div className={cx("flex justify-center transition-opacity", (!sel || sel === "auto") && "pointer-events-none opacity-30")}>
            <Tabs look="segment" className="w-[200px]" items={[{ id: "paint", label: "Paint" }, { id: "erase", label: "Erase" }]} value={eraser ? "erase" : "paint"} onChange={(v) => setEraser(v === "erase")} />
          </div>
        </div>
      </Panel>
    </>
  );
}

/* ================================================================== Paint */

const hsl = (h: number, sat: number, l: number) => {
  const k = (n: number) => (n + h / 30) % 12, a = sat * Math.min(l, 1 - l);
  const f = (n: number) => Math.round((l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))) * 255).toString(16).padStart(2, "0");
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
};
const PAINT = {
  tone: { label: "Skin", icon: "skin-tone", colors: [0.9, 0.82, 0.72, 0.62, 0.5, 0.38, 0.26, 0.16].flatMap((l) => [hsl(24, 0.45, l), hsl(14, 0.35, l)]) },
  tint: { label: "Tint", icon: "palette", colors: [...[0, 12, 24, 36, 48, 90, 140, 180, 210, 240, 280, 320, 345].flatMap((h) => [hsl(h, 0.7, 0.6), hsl(h, 0.6, 0.4)]), "#E6E6E6", "#808080", "#404040"] },
  glitter: { label: "Glitter", icon: "sparkles", colors: ["#FFFFFF", ...[0, 20, 45, 60, 120, 170, 200, 230, 265, 300, 330].map((h) => hsl(h, 0.8, 0.82))] },
} as const;
type PaintKind = keyof typeof PAINT;

function paintStroke(g: CanvasRenderingContext2D, s: MStroke, w: number, h: number, base: HTMLCanvasElement) {
  if (s.erase) { paintThrough(g, base, s, w, h, 1, 0.3); return; }
  const p = s.p as { kind: PaintKind; color: string; opacity: number };
  const layer = newCanvas(w, h);
  const lg = layer.getContext("2d")!;
  strokeMask(lg, s, w, h, 0.35, p.color);
  if (p.kind === "glitter") {
    // sparkle dots inside the stroke
    const dots = newCanvas(w, h);
    const dg = dots.getContext("2d")!;
    let seed = Math.round(s.pts[0] * 1e6) || 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const rr = s.r * w;
    for (let i = 0; i < s.pts.length; i += 2) for (let k = 0; k < 6; k++) {
      const a = rnd() * Math.PI * 2, d = rnd() * rr;
      dg.fillStyle = rnd() > 0.5 ? "#ffffff" : p.color;
      dg.beginPath(); dg.arc(s.pts[i] * w + Math.cos(a) * d, s.pts[i + 1] * h + Math.sin(a) * d, Math.max(0.6, w / 900) * (0.5 + rnd()), 0, Math.PI * 2); dg.fill();
    }
    lg.globalAlpha = 0.35; lg.globalCompositeOperation = "source-in"; lg.fillStyle = p.color; lg.fillRect(0, 0, w, h);
    lg.globalAlpha = 1; lg.globalCompositeOperation = "source-over"; lg.drawImage(dots, 0, 0);
    g.save(); g.globalAlpha = p.opacity; g.globalCompositeOperation = "screen"; g.drawImage(layer, 0, 0); g.restore();
    return;
  }
  g.save(); g.globalAlpha = p.opacity * (p.kind === "tone" ? 0.7 : 0.6); g.globalCompositeOperation = p.kind === "tone" ? "color" : "soft-light"; g.drawImage(layer, 0, 0); g.restore();
  if (p.kind === "tint") { g.save(); g.globalAlpha = p.opacity * 0.25; g.globalCompositeOperation = "color"; g.drawImage(layer, 0, 0); g.restore(); }
}

export function PaintPage() {
  const { openSub } = useEdit();
  const area = usePhotoArea();
  const bake = useBake();
  const [held, hold] = useHold();
  const src = usePhotoSnapshot();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [kind, setKind] = useState<PaintKind>("tone");
  const [eraser, setEraser] = useState(false);
  const [tab, setTab] = useState<"opacity" | "size">("opacity");
  const [vals, setVals] = useState<Record<PaintKind, { opacity: number; size: number; color: string }>>({
    tone: { opacity: 0.8, size: 0.5, color: PAINT.tone.colors[0] }, tint: { opacity: 0.8, size: 0.5, color: PAINT.tint.colors[0] }, glitter: { opacity: 0.8, size: 0.5, color: PAINT.glitter.colors[0] },
  });
  const [picking, setPicking] = useState(false);
  const [live, setLive] = useState<MStroke | null>(null);
  const [ring, setRing] = useState<{ x: number; y: number } | null>(null);
  const strokes = useStrokes<MStroke>();
  const v = vals[kind];
  const rPx = lerp(0.01, 0.15, v.size) * area.viewW / 2;
  useStrokeCanvas(canvasRef, src, strokes.visible, live, paintStroke);
  useStrokeInput(area, (u, vv) => {
    if (picking) { if (src) { const c = sampleHex(src, u, vv); setVals((o) => ({ ...o, [kind]: { ...o[kind], color: c } })); } setPicking(false); return null; }
    return { pts: [u, vv], r: rPx / Math.max(1, area.w), erase: eraser, p: { kind, color: v.color, opacity: v.opacity } };
  }, setLive, (s) => strokes.push(s), setRing);

  return (
    <>
      <PhotoOverlay area={area} canvasRef={canvasRef} hidden={held}><BrushRing at={ring} r={rPx} /></PhotoOverlay>
      {/* colour rail at the right edge of the preview */}
      <div className="absolute right-2 z-20 flex flex-col items-center gap-2 rounded-full bg-glass p-1.5 backdrop-blur-md" style={{ top: 64, bottom: MENU + OPTION_H + 60 }} onPointerDown={(e) => e.stopPropagation()}>
        <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto py-1" style={{ maskImage: "linear-gradient(transparent, #000 12px, #000 calc(100% - 12px), transparent)" }}>
          {PAINT[kind].colors.map((c) => (
            <button key={c} type="button" aria-label={c} aria-pressed={v.color === c} onClick={() => setVals((o) => ({ ...o, [kind]: { ...o[kind], color: c } }))}
              className="h-8 w-8 flex-none rounded-full" style={{ background: c, boxShadow: v.color === c ? "0 0 0 2px var(--oe-bg), 0 0 0 4px var(--oe-fg)" : "inset 0 0 0 1px rgba(255,255,255,0.2)" }} />
          ))}
        </div>
        <SwatchTool icon="pipette" label="Pick from the photo" active={picking} onClick={() => setPicking((p) => !p)} size={32} />
      </div>
      <ControlRow bottom={MENU + OPTION_H} style={{ zIndex: 20 }} undo={strokes.undo} redo={strokes.redo} onOriginal={hold} originalEnabled={strokes.visible.length > 0} />
      <OptionRow bottom={MENU}>
        <Tabs look="segment" className="w-[140px] flex-none" items={[{ id: "opacity", label: "Opacity" }, { id: "size", label: "Size" }]} value={tab} onChange={setTab} />
        <EditSeekBar value={v[tab]} min={tab === "size" ? 0.01 : 0} max={1} def={tab === "size" ? 0.5 : 0.8} onChange={(x) => setVals((o) => ({ ...o, [kind]: { ...o[kind], [tab]: x } }))} />
      </OptionRow>
      <Panel title="Colour" onClose={() => openSub(null)} onConfirm={() => {
        if (!strokes.visible.length) { openSub(null); return; }
        bake((base) => { const out = copyCanvas(base); const g = out.getContext("2d")!; for (const s of strokes.visible) paintStroke(g, s, out.width, out.height, base); return out; });
      }}>
        <div className="flex h-full items-center justify-center gap-2">
          {(Object.keys(PAINT) as PaintKind[]).map((k) => (
            <FeatureButton key={k} icon={PAINT[k].icon} label={PAINT[k].label} selected={kind === k && !eraser} onClick={() => { setKind(k); setEraser(false); }} />
          ))}
          <span className="mx-2 h-10 w-px bg-line" />
          <FeatureButton icon="remove" label="Erase" selected={eraser} onClick={() => setEraser(true)} />
        </div>
      </Panel>
    </>
  );
}
