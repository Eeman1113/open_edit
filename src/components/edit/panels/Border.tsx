"use client";

// Frame tab: pick a canvas ratio (Shape) and what fills the space around the photo (Fill: a colour from the palette,
// the eyedropper or the colour wheel, or a blurred copy of the photo).
import { useEffect, useRef, useState } from "react";
import { Tabs, cx } from "@/components/ui";
import { useEdit } from "../ctx";
import { BORDER_COLORS, BORDER_RATIOS, type BorderFill, type Doc } from "../model";
import { ColorChip, ControlRow, FeatureButton, HintPill, MENU, PanelArea, SwatchTool, TOP_H } from "../ui";
import { RatioGlyph } from "./Tools";

const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;

export function BorderPanel() {
  const { doc, setLive, commit, undo, setOriginal, originalUrl, setTool, photoCanvas } = useEdit();
  const [cat, setCat] = useState<"ratio" | "color">("color");
  const [picker, setPicker] = useState(false);
  const [pickerColor, setPickerColor] = useState<string | null>(() => (doc.border.fill?.type === "color" && doc.border.fill.source === "picker" ? doc.border.fill.color : null));
  const [paletteColor, setPaletteColor] = useState<string | null>(() => (doc.border.fill?.type === "color" && doc.border.fill.source === "palette" ? doc.border.fill.color : null));
  const paletteRef = useRef<HTMLInputElement>(null);
  const b = doc.border;
  const fill = b.fill;

  const withFill = (d: Doc, f: BorderFill): Doc => ({ ...d, border: { ratio: d.border.ratio ?? [1, 1], fill: f } });

  // eyedropper: drag on the photo for a live preview, release commits it as the custom picker colour
  const docRef = useRef(doc);
  useEffect(() => { docRef.current = doc; });
  useEffect(() => {
    if (!picker) { setTool(null); return; }
    const sample = (x: number, y: number) => {
      const src = photoCanvas();
      if (!src) return null;
      const c = document.createElement("canvas"); c.width = 1; c.height = 1;
      const g = c.getContext("2d")!;
      g.drawImage(src, Math.min(src.width - 1, Math.max(0, x * src.width)), Math.min(src.height - 1, Math.max(0, y * src.height)), 1, 1, 0, 0, 1, 1);
      const p = g.getImageData(0, 0, 1, 1).data;
      return toHex(p[0], p[1], p[2]);
    };
    // the preview rect is the whole frame; map to the photo area inside it when a frame is shown
    const toPhoto = (x: number, y: number) => {
      const d0 = docRef.current, src = photoCanvas();
      if (!src || !d0.border.ratio || !d0.border.fill) return [x, y] as const;
      const pw = src.width, ph = src.height;
      const ratio = d0.border.ratio[0] === 0 ? pw / ph : d0.border.ratio[0] / d0.border.ratio[1];
      let fw = pw, fh = ph;
      if (ratio > pw / ph) fw = ph * ratio; else fh = pw / ratio;
      return [(x * fw - (fw - pw) / 2) / pw, (y * fh - (fh - ph) / 2) / ph] as const;
    };
    let last: string | null = null;
    setTool({
      down: (x, y) => { const c = sample(...toPhoto(x, y)); if (c) { last = c; setLive(withFill(docRef.current, { type: "color", color: c, source: "picker" })); } },
      move: (x, y) => { const c = sample(...toPhoto(x, y)); if (c) { last = c; setLive(withFill(docRef.current, { type: "color", color: c, source: "picker" })); } },
      up: () => {
        if (last) { setPickerColor(last); commit(withFill(docRef.current, { type: "color", color: last, source: "picker" })); }
        setPicker(false);
      },
    });
    return () => setTool(null);
  }, [picker, setTool, photoCanvas, setLive, commit]);

  const selColor = (c: string, source: "builtin" | "picker" | "palette") => fill?.type === "color" && fill.color === c && fill.source === source;

  return (
    <>
      <input
        ref={paletteRef} type="color" hidden defaultValue={paletteColor ?? "#ffffff"}
        onInput={(e) => setLive(withFill(doc, { type: "color", color: e.currentTarget.value.toUpperCase(), source: "palette" }))}
        onChange={(e) => { const c = e.currentTarget.value.toUpperCase(); setPaletteColor(c); commit(withFill(doc, { type: "color", color: c, source: "palette" })); }}
      />
      <ControlRow undo={undo} onOriginal={setOriginal} />
      {picker && (
        <div className="pointer-events-none absolute inset-x-0 z-30 flex justify-center" style={{ top: TOP_H + 12 }}>
          <HintPill text="Drag on the photo to pick a colour" />
        </div>
      )}
      <PanelArea className="flex flex-col">
        <div className="flex flex-none justify-center pt-3">
          <Tabs look="segment" className="w-[220px]" items={[{ id: "ratio", label: "Shape" }, { id: "color", label: "Fill" }]} value={cat} onChange={setCat} />
        </div>
        {cat === "ratio" && (
          <div className="relative min-h-0 flex-1">
            <div className="no-scrollbar absolute inset-0 flex items-center gap-1 overflow-x-auto px-3" style={{ justifyContent: "safe center" }}>
              {BORDER_RATIOS.map((r) => (
                <FeatureButton
                  key={r.label} label={r.label} iconNode={<RatioGlyph ratio={r.r[0] === 0 ? 0 : r.r[0] / r.r[1]} />}
                  selected={!!b.ratio && b.ratio[0] === r.r[0] && b.ratio[1] === r.r[1]}
                  onClick={() => commit({ ...doc, border: { ratio: r.r, fill: fill ?? { type: "color", color: "#FFFFFF", source: "builtin" } } })}
                />
              ))}
            </div>
          </div>
        )}
        {cat === "color" && (
          <div className="no-scrollbar flex min-h-0 flex-1 items-center gap-3 overflow-x-auto px-4">
            <SwatchTool icon="pipette" label="Pick from the photo" active={picker} onClick={() => setPicker((v) => !v)} />
            <SwatchTool icon="palette" label="Colour wheel" onClick={() => paletteRef.current?.click()} />
            <button
              type="button" aria-label="Blurred photo" aria-pressed={fill?.type === "blur"} onClick={() => commit(withFill(doc, { type: "blur" }))}
              className="oe-press relative h-[30px] w-[30px] flex-none overflow-hidden rounded-full"
              style={{ boxShadow: fill?.type === "blur" ? "0 0 0 2px var(--oe-panel), 0 0 0 4px var(--oe-fg)" : "inset 0 0 0 1px rgba(255,255,255,0.16)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {originalUrl && <img src={originalUrl} alt="" className="h-full w-full scale-125 object-cover blur-[3px]" />}
            </button>
            <span className="h-6 w-px flex-none bg-line" />
            {pickerColor && <ColorChip color={pickerColor} selected={selColor(pickerColor, "picker")} onClick={() => commit(withFill(doc, { type: "color", color: pickerColor, source: "picker" }))} />}
            {paletteColor && <ColorChip color={paletteColor} selected={selColor(paletteColor, "palette")} onClick={() => commit(withFill(doc, { type: "color", color: paletteColor, source: "palette" }))} />}
            {BORDER_COLORS.map((c) => <ColorChip key={c} color={c} selected={selColor(c, "builtin")} onClick={() => commit(withFill(doc, { type: "color", color: c, source: "builtin" }))} />)}
          </div>
        )}
      </PanelArea>
      {picker && <div className={cx("absolute inset-x-0 bottom-0 z-30 bg-scrim")} style={{ height: MENU }} onClick={() => setPicker(false)} />}
    </>
  );
}
