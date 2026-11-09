"use client";

// EPMosaicFragment (fragment_edit_photo_tools_mosaic.xml): colour row, effect list, vertical slider list,
// Brush / Eraser slide tab, stroke undo/redo. The effect list is server content (SCP asset menu MOSAIC/EDIT);
// the web port ships a local catalogue of the 8 native types with thumbnails rendered from the photo.
import { useEffect, useMemo, useRef, useState } from "react";
import { useEdit } from "../ctx";
import { CtrlIcon, EditSeekBar, Img, PRIMARY, Tint } from "../ui";
import {
  BrushRing, copyCanvas, lerp, MENU, newCanvas, paintThrough, Panel, PhotoOverlay, sampleHex, Swatch,
  useBake, useHold, usePhotoArea, useStrokeCanvas, useStrokeInput, useStrokes, type MStroke, usePhotoSnapshot } from "./common";
import { isBlurType, mosaicEffect, type MosaicType } from "./effects";

interface MosaicItem { id: string; type: MosaicType; usesInnerColorType: boolean; defaultStrength: number; defaultSize: number }
const ITEMS: MosaicItem[] = [
  { id: "square", type: "MOSAIC_Square", usesInnerColorType: false, defaultStrength: 50, defaultSize: 30 },
  { id: "triangle", type: "MOSAIC_Triangle", usesInnerColorType: false, defaultStrength: 50, defaultSize: 30 },
  { id: "hexagon", type: "MOSAIC_Hexagon", usesInnerColorType: false, defaultStrength: 50, defaultSize: 30 },
  { id: "oil", type: "MOSAIC_OIL", usesInnerColorType: false, defaultStrength: 100, defaultSize: 30 },
  { id: "oilcolor", type: "MOSAIC_OIL_COLOR", usesInnerColorType: true, defaultStrength: 100, defaultSize: 30 },
  { id: "gaussian", type: "BLUR_Gaussian", usesInnerColorType: true, defaultStrength: 100, defaultSize: 30 },
  { id: "motion", type: "BLUR_Motion", usesInnerColorType: false, defaultStrength: 100, defaultSize: 30 },
  { id: "horizontal", type: "BLUR_Horizontal", usesInnerColorType: true, defaultStrength: 100, defaultSize: 30 },
];
/** InterfaceC20270a built-in colours */
const COLORS = ["#FFFFFF", "#FF3827", "#FF7421", "#FFC300", "#6CC037", "#32C5FF", "#0041E6", "#000000"];
const colorUsable = (it: MosaicItem) => it.usesInnerColorType && (it.type === "MOSAIC_OIL_COLOR" || it.type === "BLUR_Gaussian" || it.type === "BLUR_Horizontal");

type Vals = { filter: number; strength: number; size: number };

export function MosaicTool() {
  const { openSub } = useEdit();
  const area = usePhotoArea();
  const bake = useBake();
  const [held, hold] = useHold();
  const src = usePhotoSnapshot();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [item, setItem] = useState(ITEMS[0]);
  const [mode, setMode] = useState<"brush" | "eraser">("brush");
  const [vals, setVals] = useState<Record<string, Vals>>({});
  const [eraser, setEraser] = useState({ strength: 0.4, size: 0.8 });
  const [color, setColor] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [palette, setPalette] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [ring, setRing] = useState<{ x: number; y: number } | null>(null);
  const [live, setLive] = useState<MStroke | null>(null);
  const strokes = useStrokes<MStroke>();
  const wheelRef = useRef<HTMLInputElement>(null);

  const v: Vals = vals[item.id] ?? { filter: 0.1, strength: item.defaultStrength / 100, size: item.defaultSize / 100 };
  const setV = (patch: Partial<Vals>) => setVals((o) => ({ ...o, [item.id]: { ...v, ...patch } }));
  const sizeV = mode === "eraser" ? eraser.size : v.size;
  const radius = lerp(0.0015, 0.15, sizeV) * (area.viewW / 2) / Math.max(1, area.w);

  // effect cache per (source, params)
  const cache = useRef(new Map<string, HTMLCanvasElement>());
  const effectFor = (s: HTMLCanvasElement, p: Record<string, unknown>) => {
    const key = `${s.width}x${s.height}|${p.type}|${p.strength}|${p.color}|${p.filter}`;
    let c = cache.current.get(key);
    if (!c) {
      c = mosaicEffect(s, p.type as MosaicType, p.strength as number, (p.color as string | null) ?? null, p.filter as number);
      cache.current.set(key, c);
      if (cache.current.size > 12) cache.current.delete(cache.current.keys().next().value!);
    }
    return c;
  };
  const apply = useMemo(() => (g: CanvasRenderingContext2D, s: MStroke, w: number, h: number, base: HTMLCanvasElement) => {
    if (s.erase) paintThrough(g, base, s, w, h, s.p!.strength as number);
    else paintThrough(g, effectFor(base, s.p!), s, w, h);
  }, []);
  useStrokeCanvas(canvasRef, src, strokes.visible, live, apply);

  useStrokeInput(area, (u, vv) => {
    if (picking) {
      if (src) { const hex = sampleHex(src, u, vv); setPicked(hex); setColor(hex); }
      setPicking(false);
      return null;
    }
    const er = mode === "eraser";
    return { pts: [u, vv], r: radius, erase: er, p: er ? { strength: eraser.strength } : { type: item.type, strength: v.strength, color: colorUsable(item) ? color : null, filter: v.filter } };
  }, setLive, (s) => strokes.push(s), setRing);

  const confirm = () => {
    if (!strokes.visible.length) { openSub(null); return; }
    bake((base) => {
      const out = copyCanvas(base);
      const g = out.getContext("2d")!;
      for (const s of strokes.visible) apply(g, s, out.width, out.height, base);
      return out;
    });
  };

  // thumbnails rendered from the centre of the photo (server thumbnails aren't available)
  const thumbs = useMemo(() => {
    if (!src) return {} as Record<string, string>;
    const m = Math.min(src.width, src.height);
    const crop = newCanvas(174, 174);
    crop.getContext("2d")!.drawImage(src, (src.width - m * 0.5) / 2, (src.height - m * 0.5) / 2, m * 0.5, m * 0.5, 0, 0, 174, 174);
    const out: Record<string, string> = {};
    for (const it of ITEMS) out[it.id] = mosaicEffect(crop, it.type, it.type.startsWith("MOSAIC_") && !it.type.startsWith("MOSAIC_OIL") ? 0.9 : 1, null, 0.1).toDataURL();
    return out;
  }, [src]);

  const ringR = radius * area.w;
  const rows: { key: keyof Vals; label: string; min: number; def: number }[] = mode === "eraser"
    ? [{ key: "strength", label: "Strength", min: 0.01, def: 0.4 }, { key: "size", label: "Size", min: 0.01, def: 0.8 }]
    : [
        ...(item.type === "BLUR_Horizontal" ? [{ key: "filter" as const, label: "Filter", min: 0, def: 0.1 }] : []),
        { key: "strength", label: isBlurType(item.type) ? "Strength" : "Scale", min: 0.01, def: item.defaultStrength / 100 },
        { key: "size", label: "Size", min: 0.01, def: item.defaultSize / 100 },
      ];
  const sliderH = rows.length * 43 + 35;

  useEffect(() => () => cache.current.clear(), []);

  return (
    <>
      <input ref={wheelRef} type="color" hidden onChange={(e) => { const c = e.currentTarget.value.toUpperCase(); setPalette(c); setColor(c); }} />
      <PhotoOverlay area={area} canvasRef={canvasRef} hidden={held}>
        <BrushRing at={dragging ? { x: area.x + area.w / 2, y: area.y + area.h / 2 } : ring} r={ringR} />
      </PhotoOverlay>

      {/* tab_brush_type: vertical SnowSlideTab (Brush / Eraser) */}
      <div className="absolute z-20 flex flex-col" style={{ right: 8, bottom: MENU + sliderH + 54 + 10, padding: 2.5, borderRadius: 19.5, background: "rgba(0,0,0,0.4)" }} onPointerDown={(e) => e.stopPropagation()}>
        {(["brush", "eraser"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className="flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: 17, background: mode === m ? "#ffffff" : "transparent" }}>
            <Img name={m === "brush" ? (mode === m ? "icon_edit_brush_on" : "icon_edit_brush_off") : (mode === m ? "icon_edit_erase_on" : "icon_edit_erase_off")} size={34} />
          </button>
        ))}
      </div>

      {/* container_control */}
      <div className="absolute inset-x-0 z-20 flex items-center" style={{ bottom: MENU + sliderH, height: 54 }} onPointerDown={(e) => e.stopPropagation()}>
        <CtrlIcon name="undo" enabled={strokes.undo.can} onClick={strokes.undo.on} style={{ marginLeft: 10 }} />
        <CtrlIcon name="redo" enabled={strokes.redo.can} onClick={strokes.redo.on} style={{ marginLeft: 10 }} />
        <span className="flex-1" />
        <CtrlIcon name="original" enabled={strokes.visible.length > 0} onHold={hold} style={{ marginRight: 10 }} />
      </div>

      {/* list_slider (background only while dragging) */}
      <div className="absolute inset-x-0 z-20" style={{ bottom: MENU, height: sliderH, padding: "17.5px 0", background: dragging ? "rgba(0,0,0,0.4)" : "transparent" }} onPointerDown={(e) => e.stopPropagation()}>
        {rows.map((r) => (
          <div key={r.key} className="flex items-center" style={{ height: 43 }}>
            <span className="flex-none truncate text-white" style={{ marginLeft: 20, width: 80, fontSize: 13, textShadow: "0 0 2px rgba(0,0,0,0.3)" }}>{r.label}</span>
            <EditSeekBar
              style={{ marginLeft: 24, marginRight: 52 }}
              value={mode === "eraser" ? eraser[r.key as "strength" | "size"] : v[r.key]} min={r.min} max={1} def={r.def}
              onChange={(x) => { setDragging(r.key === "size"); if (mode === "eraser") setEraser((o) => ({ ...o, [r.key]: x })); else setV({ [r.key]: x }); }}
              onRelease={() => setDragging(false)}
            />
          </div>
        ))}
      </div>

      <Panel title="Mosaic" onClose={() => openSub(null)} onConfirm={confirm}>
        {/* colour row (top 54dp) */}
        <div className="absolute inset-x-0 top-0 flex items-center" style={{ height: 54 }}>
          <button type="button" onClick={() => setColor(null)} className="relative flex h-full flex-none items-center" style={{ width: 49 }}>
            <Tint name="icon_sticker_tab_none" size={35} color="#ffffff" style={{ marginLeft: 6 }} />
            <span className="absolute right-0" style={{ width: 1, height: 18, background: "rgba(255,255,255,0.15)" }} />
          </button>
          <div className="no-scrollbar flex flex-1 items-center overflow-x-auto" style={{ height: 32, padding: "0 17px", gap: 17 }}>
            <button type="button" onClick={() => setPicking((p) => !p)} className="flex-none rounded-full" style={{ width: 32, height: 32, background: "#333333" }}><Img name="icon_edit_color_picker" size={32} /></button>
            <button type="button" onClick={() => wheelRef.current?.click()} className="flex-none" style={{ width: 32, height: 32 }}><Img name="icon_edit_color_wheel" size={32} /></button>
            {picked && <Swatch color={picked} selected={color === picked} onClick={() => setColor(picked)} />}
            {palette && <Swatch color={palette} selected={color === palette && palette !== picked} onClick={() => setColor(palette)} />}
            {COLORS.map((c) => <Swatch key={c} color={c} selected={color === c && c !== picked && c !== palette} onClick={() => setColor(c)} />)}
          </div>
          {(mode !== "brush" || !colorUsable(item)) && <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.7)" }} />}
        </div>
        {/* list_item */}
        <div className="no-scrollbar absolute inset-x-0 flex overflow-x-auto" style={{ top: 54 + 11 - 11, height: 69, padding: "0 4px" }}>
          {ITEMS.map((it) => (
            <button key={it.id} type="button" onClick={() => { setItem(it); setMode("brush"); }} className="relative flex flex-none items-center justify-center" style={{ width: 69, height: 69 }}>
              <span className="relative overflow-hidden" style={{ width: 58, height: 58, borderRadius: 7, background: "#131314" }}>
                {thumbs[it.id] && <img src={thumbs[it.id]} alt="" className="h-full w-full object-cover" draggable={false} />}
                {item.id === it.id && <span className="absolute inset-0" style={{ borderRadius: 5, border: `2.5px solid ${PRIMARY}` }} />}
              </span>
            </button>
          ))}
        </div>
      </Panel>
    </>
  );
}
