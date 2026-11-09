"use client";

// Pixelate: paint blocks, polygons, paint dabs or blur over parts of the photo, with an eraser, a colour tint for some
// styles and per-stroke undo. Effect previews are rendered from the photo itself.
import { useEffect, useMemo, useRef, useState } from "react";
import { Tabs, cx } from "@/components/ui";
import { useEdit } from "../ctx";
import { ColorChip, ControlRow, EditSeekBar, SliderRow, SwatchTool, ThumbItem } from "../ui";
import {
  BrushRing, copyCanvas, lerp, MENU, newCanvas, paintThrough, Panel, PhotoOverlay, sampleHex,
  useBake, useHold, usePhotoArea, useStrokeCanvas, useStrokeInput, useStrokes, type MStroke, usePhotoSnapshot } from "./common";
import { isBlurType, mosaicEffect, type MosaicType } from "./effects";

interface MosaicItem { id: string; name: string; type: MosaicType; usesInnerColorType: boolean; defaultStrength: number; defaultSize: number }
const ITEMS: MosaicItem[] = [
  { id: "square", name: "Squares", type: "MOSAIC_Square", usesInnerColorType: false, defaultStrength: 50, defaultSize: 30 },
  { id: "triangle", name: "Triangles", type: "MOSAIC_Triangle", usesInnerColorType: false, defaultStrength: 50, defaultSize: 30 },
  { id: "hexagon", name: "Hexagons", type: "MOSAIC_Hexagon", usesInnerColorType: false, defaultStrength: 50, defaultSize: 30 },
  { id: "oil", name: "Paint", type: "MOSAIC_OIL", usesInnerColorType: false, defaultStrength: 100, defaultSize: 30 },
  { id: "oilcolor", name: "Tinted", type: "MOSAIC_OIL_COLOR", usesInnerColorType: true, defaultStrength: 100, defaultSize: 30 },
  { id: "gaussian", name: "Blur", type: "BLUR_Gaussian", usesInnerColorType: true, defaultStrength: 100, defaultSize: 30 },
  { id: "motion", name: "Motion", type: "BLUR_Motion", usesInnerColorType: false, defaultStrength: 100, defaultSize: 30 },
  { id: "horizontal", name: "Streak", type: "BLUR_Horizontal", usesInnerColorType: true, defaultStrength: 100, defaultSize: 30 },
];
/** Tint colours for the styles that take one. */
const COLORS = ["#FFFFFF", "#FF5D73", "#FF8A00", "#FFD23F", "#2BB673", "#4CC9F0", "#5B5BD6", "#1B1B1F"];
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

  // previews rendered from the centre of the photo
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
        ...(item.type === "BLUR_Horizontal" ? [{ key: "filter" as const, label: "Tint", min: 0, def: 0.1 }] : []),
        { key: "strength", label: isBlurType(item.type) ? "Strength" : "Block size", min: 0.01, def: item.defaultStrength / 100 },
        { key: "size", label: "Brush size", min: 0.01, def: item.defaultSize / 100 },
      ];
  const sliderH = rows.length * 40 + 12;
  const tintable = mode === "brush" && colorUsable(item);

  useEffect(() => () => cache.current.clear(), []);

  return (
    <>
      <input ref={wheelRef} type="color" hidden onChange={(e) => { const c = e.currentTarget.value.toUpperCase(); setPalette(c); setColor(c); }} />
      <PhotoOverlay area={area} canvasRef={canvasRef} hidden={held}>
        <BrushRing at={dragging ? { x: area.x + area.w / 2, y: area.y + area.h / 2 } : ring} r={ringR} />
      </PhotoOverlay>

      <ControlRow bottom={MENU + sliderH + 8} undo={strokes.undo} redo={strokes.redo} onOriginal={hold} originalEnabled={strokes.visible.length > 0} />

      <div className="absolute inset-x-3 z-20 flex flex-col justify-center rounded-lg bg-panel/90 py-1.5 shadow-lg ring-1 ring-line backdrop-blur-md" style={{ bottom: MENU + 8, height: sliderH }} onPointerDown={(e) => e.stopPropagation()}>
        {rows.map((r) => (
          <SliderRow key={r.key} label={r.label} className="h-10 px-3">
            <EditSeekBar
              value={mode === "eraser" ? eraser[r.key as "strength" | "size"] : v[r.key]} min={r.min} max={1} def={r.def}
              onChange={(x) => { setDragging(r.key === "size"); if (mode === "eraser") setEraser((o) => ({ ...o, [r.key]: x })); else setV({ [r.key]: x }); }}
              onRelease={() => setDragging(false)}
            />
          </SliderRow>
        ))}
      </div>

      <Panel title="Pixelate" onClose={() => openSub(null)} onConfirm={confirm}>
        <div className="flex h-full flex-col justify-center gap-3">
          <div className="flex items-center gap-3 pl-4">
            <Tabs look="segment" className="w-[150px] flex-none" items={[{ id: "brush", label: "Brush" }, { id: "eraser", label: "Eraser" }]} value={mode} onChange={setMode} />
            <div className={cx("no-scrollbar flex min-w-0 flex-1 items-center gap-2.5 overflow-x-auto py-1 pr-4 transition-opacity", !tintable && "pointer-events-none opacity-30")}>
              <SwatchTool icon="block" label="No tint" active={!color} onClick={() => setColor(null)} size={28} />
              <SwatchTool icon="pipette" label="Pick from the photo" active={picking} onClick={() => setPicking((p) => !p)} size={28} />
              <SwatchTool icon="palette" label="Colour wheel" onClick={() => wheelRef.current?.click()} size={28} />
              {picked && <ColorChip size={28} color={picked} selected={color === picked} onClick={() => setColor(picked)} />}
              {palette && <ColorChip size={28} color={palette} selected={color === palette && palette !== picked} onClick={() => setColor(palette)} />}
              {COLORS.map((c) => <ColorChip key={c} size={28} color={c} selected={color === c && c !== picked && c !== palette} onClick={() => setColor(c)} />)}
            </div>
          </div>
          <div className="no-scrollbar flex gap-2.5 overflow-x-auto px-4">
            {ITEMS.map((it) => (
              <ThumbItem key={it.id} size={58} label={it.name} src={thumbs[it.id]} selected={item.id === it.id && mode === "brush"} onClick={() => { setItem(it); setMode("brush"); }} />
            ))}
          </div>
        </div>
      </Panel>
    </>
  );
}
