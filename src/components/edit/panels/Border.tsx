"use client";

// EPBorderFragment: Format (aspect ratio) / Color (fill) tabs.
import { useEffect, useRef, useState } from "react";
import { useEdit } from "../ctx";
import { BORDER_COLORS, BORDER_RATIOS, type BorderFill, type Doc } from "../model";
import { ControlRow, FeatureButton, FeatureList, Img } from "../ui";

const isDark = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255 < 0.1;
};
const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;

function Swatch({ color, selected, onClick }: { color: string; selected: boolean; onClick: () => void }) {
  const dark = isDark(color);
  return (
    <button type="button" onClick={onClick} className="relative flex-none rounded-full" style={{ width: 32, height: 32, margin: "0 8.5px", background: color, boxShadow: dark ? "inset 0 0 0 1px #6f6f6f" : undefined }}>
      {selected && !dark && <span className="absolute rounded-full" style={{ inset: 2, border: "2.5px solid #000000" }} />}
      {selected && dark && <span className="absolute inset-0 rounded-full" style={{ border: "2px solid #ffffff" }} />}
    </button>
  );
}

export function BorderPanel() {
  const { doc, setLive, commit, undo, redo, setOriginal, originalUrl, setTool, photoCanvas } = useEdit();
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
    // the preview rect is the whole frame; map to the photo area inside it when a border is shown
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
      <ControlRow undo={undo} redo={redo} onOriginal={setOriginal} />
      <div className="absolute inset-x-0" style={{ bottom: 52, height: 134 }}>
        <div className="absolute inset-x-0 top-0 flex items-center justify-center" style={{ height: 54 }}>
          <button type="button" onClick={() => setCat("ratio")} style={{ fontSize: 15, color: cat === "ratio" ? "#ffffff" : "rgba(255,255,255,0.6)" }}>Format</button>
          <button type="button" onClick={() => setCat("color")} style={{ fontSize: 15, marginLeft: 60, color: cat === "color" ? "#ffffff" : "rgba(255,255,255,0.6)" }}>Color</button>
        </div>
        {cat === "ratio" && (
          <FeatureList count={BORDER_RATIOS.length} top={54}>
            {BORDER_RATIOS.map((r) => (
              <FeatureButton
                key={r.label} icon={r.icon} label={r.label}
                selected={!!b.ratio && b.ratio[0] === r.r[0] && b.ratio[1] === r.r[1]}
                onClick={() => commit({ ...doc, border: { ratio: r.r, fill: fill ?? { type: "color", color: "#FFFFFF", source: "builtin" } } })}
              />
            ))}
          </FeatureList>
        )}
        {cat === "color" && (
          <div className="no-scrollbar absolute inset-x-0 flex items-center overflow-x-auto" style={{ top: 72, height: 32, padding: "0 9.5px" }}>
            <button type="button" onClick={() => setPicker(true)} className="relative flex flex-none items-center justify-center rounded-full" style={{ width: 32, height: 32, margin: "0 8.5px", background: "#333333" }}>
              <Img name="icon_edit_color_picker" size={32} />
            </button>
            <button type="button" onClick={() => paletteRef.current?.click()} className="relative flex-none" style={{ width: 32, height: 32, margin: "0 8.5px" }}>
              <Img name="icon_edit_color_wheel" size={32} />
            </button>
            <button type="button" onClick={() => commit(withFill(doc, { type: "blur" }))} className="relative flex-none overflow-hidden rounded-full" style={{ width: 32, height: 32, margin: "0 8.5px" }}>
              {originalUrl && <img src={originalUrl} alt="" className="h-full w-full object-cover" style={{ filter: "blur(3px)", transform: "scale(1.2)" }} />}
              {fill?.type === "blur" && (
                <>
                  <span className="absolute inset-0 rounded-full" style={{ border: "2px solid #ffffff" }} />
                  <span className="absolute rounded-full" style={{ inset: 2, border: "2px solid #000000" }} />
                </>
              )}
            </button>
            {pickerColor && <Swatch color={pickerColor} selected={selColor(pickerColor, "picker")} onClick={() => commit(withFill(doc, { type: "color", color: pickerColor, source: "picker" }))} />}
            {paletteColor && <Swatch color={paletteColor} selected={selColor(paletteColor, "palette")} onClick={() => commit(withFill(doc, { type: "color", color: paletteColor, source: "palette" }))} />}
            {BORDER_COLORS.map((c) => <Swatch key={c} color={c} selected={selColor(c, "builtin")} onClick={() => commit(withFill(doc, { type: "color", color: c, source: "builtin" }))} />)}
          </div>
        )}
      </div>
      {/* view_dimmed (#CC000000) while the eyedropper is active */}
      {picker && <div className="absolute inset-x-0 bottom-0" style={{ height: 186, background: "rgba(0,0,0,0.8)" }} onClick={() => setPicker(false)} />}
    </>
  );
}
