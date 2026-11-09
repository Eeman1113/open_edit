"use client";

// Pixel-based Portrait brush tools that don't need face tracking:
//  - Manual Skin (EPSkinRetouchFragment): paint retouch effects with Opacity / blemish dot sizes / tone rows
//  - Paint (EPPaintFragment): Skin Tone / Tint / Glitter colour brushes with an eraser
// Native Kuru brush shaders are approximated with canvas filters (see effects per key below).
import { useMemo, useRef, useState } from "react";
import { useEdit } from "../../ctx";
import { ControlRow, EditSeekBar, Tint, featureColor } from "../../ui";
import {
  BrushRing, copyCanvas, lerp, MENU, newCanvas, OptionRow, paintThrough, Panel, PhotoOverlay, sampleHex, strokeMask, TextTooltip,
  useBake, useHold, usePhotoArea, useStrokeCanvas, useStrokeInput, useStrokes, useTimedTooltip, type MStroke, usePhotoSnapshot } from "../common";
import { blurCanvas, filtered, mix } from "../effects";

/* ================================================================== Manual Skin */

const SKIN_ITEMS: [string, string][] = [
  ["auto", "One touch"], ["blemish", "Blemish"], ["smooth", "Skin"], ["balance", "Pore"], ["conceal", "Conceal"], ["wrinkle", "Wrinkles"],
  ["smoother", "Smoother"], ["oilremover", "Matte"], ["skintexture", "Texture"], ["cleanse", "Cleanse"], ["skintoneup", "Brighten"],
  ["vibrance", "Vibrance"], ["glow", "Glow"], ["cooldown", "Cool Down"], ["fixtone", "Fix Tone"], ["blackandwhite", "B&W"],
  ["fixshadow", "Fix Shadow"], ["antiglare", "Anti Glare"], ["details", "Details"], ["clear", "Clarity"], ["teeth", "Whiten"],
  ["structure", "Structure"], ["clarity", "Details"], ["eyebag", "Eye bags"], ["plim", "Eye Smile"],
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

function ToneRows({ cw, tl, set, bottom }: { cw: number; tl: number; set: (k: "cw" | "tl", v: number) => void; bottom: number }) {
  const row = (k: "cw" | "tl", l: string, r: string, grad: string[], v: number, def: number) => (
    <div className="flex items-center" style={{ height: 49 }}>
      <span className="truncate text-white" style={{ marginLeft: 20, width: 50, fontSize: 13 }}>{l}</span>
      <EditSeekBar style={{ margin: "0 24px" }} value={v} min={-1} max={1} def={def} gradient={grad} onChange={(x) => set(k, x)} />
      <span className="truncate text-right text-white" style={{ marginRight: 20, width: 50, fontSize: 13 }}>{r}</span>
    </div>
  );
  return (
    <div className="absolute inset-x-0 z-20" style={{ bottom, height: 98, background: "rgba(0,0,0,0.4)" }} onPointerDown={(e) => e.stopPropagation()}>
      {row("cw", "Cool", "Warm", ["#83CCFA", "#FFA68E"], cw, -0.2)}
      {row("tl", "Tan", "Light", ["#9A6942", "#FFE5CE"], tl, 0.3)}
    </div>
  );
}

/** item_edit_photo_skin_retouch: icon 46 (marginLeft 6); selected expands a #333333 divider + eraser icon. */
function ExpandItem({ icon, label, selected, eraser, onMain, onEraser }: { icon: string; label: string; selected: boolean; eraser: boolean; onMain: () => void; onEraser: () => void }) {
  return (
    <div className="relative flex flex-none items-start" style={{ minHeight: 58 }}>
      <button type="button" onClick={onMain} className="flex flex-col items-center" style={{ width: 58 }}>
        <Tint name={icon} size={46} color={featureColor(selected && !eraser)} />
        <span className="w-full truncate text-center" style={{ fontSize: 10, lineHeight: "12px", color: featureColor(selected && !eraser) }}>{label}</span>
      </button>
      {selected && (
        <>
          <span className="flex-none" style={{ width: 1, height: 20, marginTop: 12, background: "#333333" }} />
          <button type="button" onClick={onEraser} className="flex flex-col items-center" style={{ width: 58 }}>
            <Tint name="icon_edit_tab_eraser" size={46} color={featureColor(eraser)} />
          </button>
        </>
      )}
    </div>
  );
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
    setTip(k === "blemish" ? "Tap away any blemishes!" : "Drag to touch up!");
  };
  const optionH = !sel || sel === "auto" ? 0 : sel === "skintoneup" ? 98 : 54;
  const last = strokes.visible[strokes.visible.length - 1];

  return (
    <>
      <PhotoOverlay area={area} canvasRef={canvasRef} hidden={held}><BrushRing at={ring} r={radiusPx} /></PhotoOverlay>
      <TextTooltip text={tip} bottom={MENU + optionH + 54} />
      <ControlRow
        bottom={MENU + optionH} style={{ zIndex: 20 }}
        undo={{ can: strokes.undo.can, on: () => { if (last) toast(`Undo: ${label(last.p!.key as string)}`); strokes.undo.on(); } }}
        redo={{ can: strokes.redo.can, on: () => { strokes.redo.on(); } }}
        onOriginal={hold} originalEnabled={strokes.visible.length > 0}
      />
      {sel && sel !== "auto" && sel !== "blemish" && sel !== "skintoneup" && (
        <OptionRow bottom={MENU} label="Opacity">
          <EditSeekBar style={{ marginLeft: 24, marginRight: 52 }} value={opacity[sel] ?? 1} min={0} max={1} def={1} onChange={(v) => setOpacity((o) => ({ ...o, [sel]: v }))} />
        </OptionRow>
      )}
      {sel === "blemish" && (
        <OptionRow bottom={MENU} label="Size">
          <div className="flex items-center" style={{ marginLeft: 28, gap: 14 }}>
            {BLEMISH_SIZES.map((b, i) => (
              <button key={i} type="button" onClick={() => setBlemishSize(i)} className="flex items-center justify-center" style={{ width: 21, height: 21 }}>
                <span className="rounded-full" style={{ width: b.d, height: b.d, background: blemishSize === i ? "#ffffff" : "rgba(255,255,255,0.3)" }} />
              </button>
            ))}
          </div>
        </OptionRow>
      )}
      {sel === "skintoneup" && <ToneRows cw={tone.cw} tl={tone.tl} set={(k, v) => setTone((t) => ({ ...t, [k]: v }))} bottom={MENU} />}
      <Panel title="Manual Skin" onClose={() => openSub(null)} onConfirm={() => {
        if (!strokes.visible.length) { openSub(null); return; }
        bake((base) => { const out = copyCanvas(base); const g = out.getContext("2d")!; for (const s of strokes.visible) apply(g, s, out.width, out.height, base); return out; });
      }}>
        <div className="no-scrollbar absolute inset-x-0 flex overflow-x-auto" style={{ top: 36, padding: "0 4px", gap: 6 }}>
          {SKIN_ITEMS.map(([k, l]) => (
            <ExpandItem key={k} icon={k === "auto" ? "beauty_icon_onetouch_off" : `beauty_icon_${k}`} label={l} selected={sel === k && k !== "auto"} eraser={eraser} onMain={() => pick(k)} onEraser={() => setEraser(true)} />
          ))}
        </div>
      </Panel>
    </>
  );
}

/* ================================================================== Paint */

const PAINT = {
  tone: { label: "Skin Tone", icon: "icon_edit_makeup_tone", colors: ["#F1D4C9", "#A1766E", "#331D1D", "#ECCFBA", "#D8B08A", "#34251F", "#F7E8DC", "#B8A89C", "#483F3D", "#E5C9CF", "#C9A6AE", "#5B4156", "#AFBDAA", "#6E7563", "#4F5645", "#FEFEFE", "#000000"] },
  tint: { label: "Tint", icon: "icon_edit_makeup_tint", colors: ["#DD7768", "#BE3E31", "#753E3B", "#8A333C", "#511E27", "#E6ABB1", "#E08EA5", "#C34E6B", "#BC4E97", "#DC7846", "#DF8259", "#E0904B", "#E3A653", "#DEBB5F", "#ECC47E", "#EDCB60", "#F4DDA9", "#F6E589", "#FBF4BE", "#BA9173", "#8E5238", "#94655B", "#61352A", "#385798", "#8A8FD3", "#9BC3F4", "#C5FADE", "#95EB94", "#639E6E", "#395E3F", "#758C48", "#E5E5E5", "#B3B3B3", "#7F7F7F", "#4B4B4B"] },
  glitter: { label: "Glitter", icon: "icon_edit_makeup_glitter", colors: ["#E7AAB1", "#E08EA5", "#FFFFFF", "#F0D9C9", "#F2D5DA", "#D3A0A9", "#BCA7F2", "#AC9BD2", "#9987ED", "#9BC3F4", "#AFC3F5", "#7FC6D8", "#C8FADF", "#92E9BF", "#B6F7BF", "#95EB94", "#FCF5BE", "#F6E589", "#EEC666", "#F4DDA9", "#ECC47E", "#E5E5E5"] },
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

  const item = (k: PaintKind, pos: React.CSSProperties) => {
    const selected = kind === k;
    return (
      <div className="absolute flex items-start" style={{ top: 36, ...pos }}>
        <button type="button" onClick={() => { setKind(k); setEraser(false); }} className="flex flex-col items-center" style={{ width: 58 }}>
          <Tint name={PAINT[k].icon} size={46} color={featureColor(selected && !eraser)} />
          <span className="w-full truncate text-center" style={{ fontSize: 10, lineHeight: "12px", color: featureColor(selected && !eraser) }}>{PAINT[k].label}</span>
        </button>
        {selected && (
          <>
            <span style={{ width: 1, height: 20, marginTop: 12, background: "#333333" }} />
            <button type="button" onClick={() => setEraser(true)} style={{ width: 58 }}><Tint name="icon_edit_tab_eraser" size={46} color={featureColor(eraser)} /></button>
          </>
        )}
      </div>
    );
  };

  return (
    <>
      <PhotoOverlay area={area} canvasRef={canvasRef} hidden={held}><BrushRing at={ring} r={rPx} /></PhotoOverlay>
      {/* colour column at the right edge of the preview */}
      <div className="absolute right-0 z-20 flex flex-col items-center" style={{ top: 26, bottom: MENU + 54 + 54 + 31 }} onPointerDown={(e) => e.stopPropagation()}>
        <div className="no-scrollbar flex flex-1 flex-col overflow-y-auto" style={{ maskImage: "linear-gradient(transparent, #000 16px, #000 calc(100% - 16px), transparent)" }}>
          {PAINT[kind].colors.map((c) => (
            <button key={c} type="button" onClick={() => setVals((o) => ({ ...o, [kind]: { ...o[kind], color: c } }))} className="relative flex-none rounded-full" style={{ width: 36, height: 36, margin: "5px 10px", background: c, boxShadow: v.color === c ? "0 0 0 2px #ffffff" : "inset 0 0 0 1px rgba(255,255,255,0.2)" }} />
          ))}
        </div>
        <button type="button" onClick={() => setPicking((p) => !p)} className="flex flex-none items-center justify-center rounded-full bg-white" style={{ width: 36, height: 36, marginTop: 10, opacity: picking ? 0.6 : 1 }}>
          <Tint name="icon_edit_color_picker" size={36} color="#222222" />
        </button>
      </div>
      <ControlRow bottom={MENU + 54} style={{ zIndex: 20 }} undo={strokes.undo} redo={strokes.redo} onOriginal={hold} originalEnabled={strokes.visible.length > 0} />
      <OptionRow bottom={MENU} bg="rgba(0,0,0,0.37)">
        {(["opacity", "size"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className="flex-none" style={{ marginLeft: 20, fontSize: 13, color: tab === t ? "#ffffff" : "rgba(255,255,255,0.4)" }}>{t === "opacity" ? "Opacity" : "Size"}</button>
        ))}
        <EditSeekBar style={{ marginLeft: 24, marginRight: 52 }} value={v[tab]} min={tab === "size" ? 0.01 : 0} max={1} def={tab === "size" ? 0.5 : 0.8} onChange={(x) => setVals((o) => ({ ...o, [kind]: { ...o[kind], [tab]: x } }))} />
      </OptionRow>
      <Panel title="Paint" onClose={() => openSub(null)} onConfirm={() => {
        if (!strokes.visible.length) { openSub(null); return; }
        bake((base) => { const out = copyCanvas(base); const g = out.getContext("2d")!; for (const s of strokes.visible) paintStroke(g, s, out.width, out.height, base); return out; });
      }}>
        {item("tone", { left: 20 })}
        {item("tint", { left: "50%", transform: "translateX(-29px)" })}
        {item("glitter", { right: 20 })}
      </Panel>
    </>
  );
}

