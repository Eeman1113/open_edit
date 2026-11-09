"use client";

// CollageActivity menus: Layout (fragment_collage_layout), Sequence (fragment_collage_sequence),
// Border (fragment_collage_border), Focus 2-depth (fragment_collage_focus), Colour palette 2-depth
// (fragment_collage_color_palette).
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Img, PRIMARY, Tint } from "@/components/edit/ui";
import { useBackHandler } from "@/lib/back";
import { PACKS, type Pack, type Rect, type Sel } from "./layouts";

/** color/edit_item_color: selected #6ee7da, else white. */
export const itemColor = (sel: boolean) => (sel ? "#6ee7da" : "#ffffff");
/** color/edit_item_white_color: selected white, else white α0.3. */
const itemWhite = (sel: boolean) => (sel ? "#ffffff" : "rgba(255,255,255,0.3)");

export const FEATURE_H = 138; // collage_menu_feature_height
export const MENU_H = 52; // collage_bottom_main_menu_height

/* ------------------------------------------------------------------ helpers */

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(390);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** CenterScrollLayoutManager.smoothScrollToPosition: bring item i to the centre of the list. */
function centerOn(list: HTMLElement | null, i: number) {
  const el = list?.children[i] as HTMLElement | undefined;
  if (!list || !el) return;
  list.scrollTo({ left: el.offsetLeft + el.offsetWidth / 2 - list.clientWidth / 2, behavior: "smooth" });
}

/** LayoutItemDecoration: gap by screen class (SMALL < 380dp: 5.5 items, MEDIUM < 500dp: 6.5 items, LARGE: spread or 6dp). */
function layoutGap(parentW: number, itemW: number, count: number) {
  const avail = parentW - 4; // minus paddingStart
  if (parentW < 380) return (avail - itemW * 5.5) / 5;
  if (parentW < 500) return (avail - itemW * 6.5) / 6;
  if (count <= 1) return 0;
  return avail > itemW * count ? (avail - itemW * count) / (count - 1) : 6;
}

const listStyle: CSSProperties = { overflowX: "auto", overflowY: "hidden", display: "flex", scrollbarWidth: "none", touchAction: "pan-x" };

/* ------------------------------------------------------------------ Layout */

/** Thumbnail for a bundled template: its cells drawn as outlines at the pack ratio, fitted to 40x40. */
export function LayoutThumb({ rects, rx, ry, color }: { rects: Rect[]; rx: number; ry: number; color: string }) {
  const a = rx / ry;
  const w = a >= 1 ? 36 : 36 * a;
  const h = a >= 1 ? 36 / a : 36;
  const x0 = (40 - w) / 2, y0 = (40 - h) / 2;
  const sw = 1.5, gap = 1.5;
  return (
    <svg width={40} height={40} viewBox="0 0 40 40" aria-hidden style={{ display: "block" }}>
      {rects.map(([x, y, rw, rh], i) => (
        <rect
          key={i}
          x={x0 + x * w + gap / 2 + sw / 2}
          y={y0 + y * h + gap / 2 + sw / 2}
          width={Math.max(0, rw * w - gap - sw)}
          height={Math.max(0, rh * h - gap - sw)}
          rx={1.5}
          fill="none"
          stroke={color}
          strokeWidth={sw}
        />
      ))}
    </svg>
  );
}

export function LayoutPanel({ templates, pack, sel, onPack, onLayout }: {
  templates: Rect[][]; pack: Pack; sel: Sel; onPack: (p: Pack) => void; onLayout: (i: number) => void;
}) {
  const [rootRef, w] = useWidth<HTMLDivElement>();
  const packList = useRef<HTMLDivElement>(null);
  const layoutList = useRef<HTMLDivElement>(null);
  const packGap = layoutGap(w, 58, PACKS.length);
  const layGap = layoutGap(w, 58, templates.length);
  // CollageLayoutFragment.m4/k4: scroll the selected pack / layout into the centre when the lists appear
  useEffect(() => {
    centerOn(packList.current, PACKS.findIndex((p) => p.id === pack.id));
    if (sel.kind === "layout" && sel.pack === pack.id) centerOn(layoutList.current, sel.index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div ref={rootRef} className="absolute inset-x-0 bottom-0 bg-black" style={{ height: FEATURE_H }} onPointerDown={(e) => e.stopPropagation()}>
      {/* list_collage_ratio */}
      <div ref={packList} className="no-scrollbar absolute inset-x-0" style={{ ...listStyle, top: 8, height: 58, padding: "0 4px" }}>
        {PACKS.map((p, i) => {
          const s = p.id === pack.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => { onPack(p); centerOn(packList.current, i); }}
              className="relative flex flex-none flex-col items-center"
              style={{ width: 58, height: 58, marginLeft: i === 0 ? 0 : packGap / 2, marginRight: i === PACKS.length - 1 ? 0 : packGap / 2 }}
            >
              <Tint name={p.icon} size={46} color={itemColor(s)} />
              <span className="absolute inset-x-0 bottom-0 truncate text-center" style={{ fontSize: 10, lineHeight: "12px", minHeight: 12, color: itemColor(s) }}>{p.title}</span>
            </button>
          );
        })}
      </div>
      {/* list_collage_layout */}
      <div ref={layoutList} className="no-scrollbar absolute inset-x-0" style={{ ...listStyle, top: 8 + 58 + 14, height: 48, padding: "0 4px" }}>
        {templates.map((t, i) => {
          const s = sel.kind === "layout" && sel.pack === pack.id && sel.index === i;
          return (
            <button
              key={i}
              type="button"
              onClick={() => { onLayout(i); centerOn(layoutList.current, i); }}
              className="flex flex-none items-center justify-center"
              style={{ width: 58, height: 48, marginLeft: i === 0 ? 0 : layGap / 2, marginRight: i === templates.length - 1 ? 0 : layGap / 2 }}
            >
              <LayoutThumb rects={t} rx={pack.rx} ry={pack.ry} color={itemWhite(s)} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 58x58 icon button (EditImageButton-like) */

function IconButton({ icon, label, selected = false, onClick }: { icon: string; label: string; selected?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="relative flex flex-none flex-col items-center" style={{ width: 58, height: 58 }}>
      <Tint name={icon} size={46} color={itemColor(selected)} />
      <span className="w-full truncate text-center" style={{ fontSize: 10, lineHeight: "12px", color: itemColor(selected) }}>{label}</span>
    </button>
  );
}

/** Weighted horizontal chain (spaces with layout_constraintHorizontal_weight around fixed 58dp buttons). */
function Chain({ weights, children }: { weights: number[]; children: ReactNode[] }) {
  const out: ReactNode[] = [];
  weights.forEach((wt, i) => {
    out.push(<div key={`s${i}`} style={{ flex: `${wt} 1 0`, minWidth: 0 }} />);
    if (children[i]) out.push(<div key={`b${i}`} className="flex-none">{children[i]}</div>);
  });
  return <div className="absolute inset-0 flex items-center">{out}</div>;
}

/* ------------------------------------------------------------------ Sequence */

export function SequencePanel({ sel, onHeight, onWidth }: { sel: Sel; onHeight: () => void; onWidth: () => void }) {
  return (
    <div className="absolute inset-x-0 bottom-0 bg-black" style={{ height: FEATURE_H }} onPointerDown={(e) => e.stopPropagation()}>
      <Chain weights={[3996, 2008, 3996]}>
        {[
          <IconButton key="h" icon="icon_edit_layout_sequence_height" label="Height" selected={sel.kind === "height"} onClick={onHeight} />,
          <IconButton key="w" icon="icon_edit_layout_sequence_width" label="Width" selected={sel.kind === "width"} onClick={onWidth} />,
        ]}
      </Chain>
    </div>
  );
}

/* ------------------------------------------------------------------ EditSeekBar (border size: max 1, no default mark) */

export function SizeSeekBar({ value, disabled, onChange, flashKey }: { value: number; disabled: boolean; onChange: (v: number) => void; flashKey: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);
  const [bubble, setBubble] = useState(false);
  const hideT = useRef<number | undefined>(undefined);
  useEffect(() => {
    // EditSeekBar.G(): flash the level text when the layout changes
    const t1 = window.setTimeout(() => { setBubble(true); hideT.current = window.setTimeout(() => setBubble(false), 500); }, 0);
    return () => { window.clearTimeout(t1); window.clearTimeout(hideT.current); };
  }, [flashKey]);
  const valueAt = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const inset = 11.5;
    return Math.min(1, Math.max(0, (clientX - r.left - inset) / Math.max(1, r.width - inset * 2)));
  };
  return (
    <div
      ref={ref}
      className="relative"
      style={{ height: 23, padding: "10px 0", boxSizing: "content-box", touchAction: "none", opacity: disabled ? 77 / 255 : 1, pointerEvents: disabled ? "none" : undefined }}
      onPointerDown={(e) => {
        if (disabled) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setDrag(true); setBubble(true); window.clearTimeout(hideT.current);
        onChange(valueAt(e.clientX));
      }}
      onPointerMove={(e) => { if (drag) onChange(valueAt(e.clientX)); }}
      onPointerUp={() => { setDrag(false); window.clearTimeout(hideT.current); hideT.current = window.setTimeout(() => setBubble(false), 500); }}
      onPointerCancel={() => { setDrag(false); setBubble(false); }}
    >
      <div className="absolute" style={{ left: 11.5, right: 11.5, top: "50%", height: 2, marginTop: -1, boxShadow: "0 0 2px rgba(0,0,0,0.3)", background: "rgba(255,255,255,0.4)" }}>
        <div className="absolute inset-y-0 left-0 bg-white" style={{ width: `${value * 100}%` }} />
        <div className="absolute rounded-full bg-white" style={{ width: 19, height: 19, top: -8.5, left: `calc(${value * 100}% - 9.5px)`, boxShadow: "0 0 2px rgba(0,0,0,0.3)" }} />
        <div
          className="pointer-events-none absolute flex items-center justify-center rounded-full bg-white font-bold"
          style={{ width: 42, height: 42, left: `calc(${value * 100}% - 21px)`, bottom: 20.5, fontSize: 13, color: "#222222", boxShadow: "0 0 2px rgba(0,0,0,0.3)", opacity: bubble ? 1 : 0, transition: bubble ? "none" : "opacity 300ms" }}
        >
          {Math.round(value * 100)}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Border */

export type BorderItem =
  | { kind: "tool"; tool: "picker" | "palette" }
  | { kind: "color"; type: "builtin" | "picker" | "palette"; color: string };

export const sameColor = (a: BorderItem, b: { type: string; color: string }) => a.kind === "color" && a.type === b.type && a.color.toLowerCase() === b.color.toLowerCase();

function ColorItem({ color, selected, onClick }: { color: string; selected: boolean; onClick: () => void }) {
  const black = color.toLowerCase() === "#000000";
  return (
    <button type="button" onClick={onClick} className="relative flex-none rounded-full" style={{ width: 32, height: 32 }}>
      {/* icon_color: edit_layout_circle tinted (black: edit_layout_black_circle selector) */}
      <span
        className="absolute inset-0 rounded-full"
        style={{ background: color, boxShadow: black ? `inset 0 0 0 ${selected ? 2 : 1}px ${selected ? "#ffffff" : "#6f6f6f"}` : undefined }}
      />
      {/* icon_selected: edit_layout_border_color_selected (inset 2dp, 2.5dp black ring) */}
      {selected && <span className="absolute rounded-full" style={{ inset: 2, border: "2.5px solid #000000" }} />}
    </button>
  );
}

export function BorderPanel({ items, current, size, sizeEnabled, flashKey, onSize, onItem, dimmed }: {
  items: BorderItem[]; current: { type: string; color: string }; size: number; sizeEnabled: boolean; flashKey: number;
  onSize: (v: number) => void; onItem: (it: BorderItem, i: number) => void; dimmed: boolean;
}) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const i = items.findIndex((it) => sameColor(it, current));
    if (i >= 0) centerOn(list.current, i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="absolute inset-x-0 bottom-0 bg-black" style={{ height: FEATURE_H }} onPointerDown={(e) => e.stopPropagation()}>
      {/* container_border_width: "Size" + EditSeekBar */}
      <div className="absolute inset-x-0 top-0 flex items-center" style={{ height: 60 }}>
        <span className="flex-none text-white" style={{ marginLeft: 30, maxWidth: 80, fontSize: 13, lineHeight: "16px" }}>Size</span>
        <div className="min-w-0 flex-1" style={{ marginLeft: 25, marginRight: 40 }}>
          <SizeSeekBar value={size} disabled={!sizeEnabled} onChange={onSize} flashKey={flashKey} />
        </div>
      </div>
      {/* list_border_color: paddingH 20, 32dp items, LinearItemDecoration(17dp) */}
      <div ref={list} className="no-scrollbar absolute inset-x-0" style={{ ...listStyle, top: 60 + (FEATURE_H - 60 - 10 - 32) / 2, height: 32, padding: "0 20px", gap: 17 }}>
        {items.map((it, i) =>
          it.kind === "tool" ? (
            <button
              key={`t-${it.tool}`}
              type="button"
              onClick={() => { centerOn(list.current, i); onItem(it, i); }}
              className="flex flex-none items-center justify-center rounded-full"
              style={{ width: 32, height: 32, background: it.tool === "picker" ? "#333333" : "transparent" }}
            >
              <Img name={it.tool === "picker" ? "icon_edit_color_picker" : "icon_edit_color_wheel"} size={32} />
            </button>
          ) : (
            <ColorItem key={`${it.type}-${it.color}`} color={it.color} selected={sameColor(it, current)} onClick={() => { centerOn(list.current, i); onItem(it, i); }} />
          ),
        )}
      </div>
      {/* dimmed_view (common_black_80) while the colour picker is active */}
      {dimmed && <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.8)", animation: "collage-fade 200ms" }} onClick={(e) => e.stopPropagation()} />}
    </div>
  );
}

/* ------------------------------------------------------------------ Focus (2-depth) */

export function FocusPanel({ onReplace, onRight90, onMirror, onFlip, onCancel, onConfirm }: {
  onReplace: () => void; onRight90: () => void; onMirror: () => void; onFlip: () => void; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div className="absolute inset-x-0 bottom-0" onPointerDown={(e) => e.stopPropagation()}>
      <div className="relative bg-black" style={{ height: FEATURE_H }}>
        <Chain weights={[2692, 1538, 1538, 1538, 2692]}>
          {[
            <IconButton key="r" icon="icon_edit_layout_replace" label="Replace" onClick={onReplace} />,
            <IconButton key="90" icon="icon_edit_layout_right90" label="Right 90°" onClick={onRight90} />,
            <IconButton key="m" icon="icon_edit_layout_mirror" label="Mirror" onClick={onMirror} />,
            <IconButton key="f" icon="icon_edit_layout_flip" label="Flip" onClick={onFlip} />,
          ]}
        </Chain>
      </div>
      <div className="relative bg-black" style={{ height: MENU_H }}>
        <button type="button" onClick={onCancel} aria-label="Cancel" className="absolute bottom-0 left-0" style={{ width: 52, height: 52 }}>
          <Img name="icon_edit_title_close" size={52} />
        </button>
        <button type="button" onClick={onConfirm} aria-label="Confirm" className="absolute bottom-0 right-0" style={{ width: 52, height: 52 }}>
          <Tint name="icon_edit_title_confirm" size={52} color={PRIMARY} />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Colour palette (2-depth) */

export function hsvToHex(h: number, s: number, v: number) {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return `#${[f(5), f(3), f(1)].map((x) => x.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

export function hexToHsv(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return [h, mx ? d / mx : 0, mx];
}

/** nx4.b: "#abc" style partial input → full colour (missing digits padded with 0, short forms doubled). */
function parseHex(text: string): string | null {
  const s = text.replace(/#/g, "");
  let full: string;
  switch (s.length) {
    case 0: return null;
    case 1: full = s + s + "0000"; break;
    case 2: full = s[0] + s[0] + s[1] + s[1] + "00"; break;
    case 3: full = s[0] + s[0] + s[1] + s[1] + s[2] + s[2]; break;
    case 4: full = s + "00"; break;
    case 5: full = s + "0"; break;
    default: full = s.slice(0, 6);
  }
  return /^[0-9a-f]{6}$/i.test(full) ? `#${full.toUpperCase()}` : null;
}

export function PalettePanel({ initial, onLive, onApply, onCommit, onBack }: { initial: string | null; onLive: (hex: string) => void; onApply: (hex: string) => void; onCommit: (hex: string) => void; onBack: () => void }) {
  // ColorSaturationValueView: unselected → pointer at the top-left = HSV(hue, 0, 1)
  const [hsv, setHsv] = useState<[number, number, number]>(() => (initial ? hexToHsv(initial) : [0, 0, 1]));
  const hex = hsvToHex(hsv[0], hsv[1], hsv[2]);
  const [text, setText] = useState<string | null>(null); // null = not focused (shows the hex)
  const sv = useRef<HTMLDivElement>(null);
  const hue = useRef<HTMLDivElement>(null);
  const live = useRef(onLive);
  useEffect(() => { live.current = onLive; });
  useEffect(() => { live.current(hex); }, [hex]);
  useBackHandler(onBack);

  const svAt = (e: React.PointerEvent) => {
    const r = sv.current!.getBoundingClientRect();
    const x = Math.min(r.width, Math.max(0, e.clientX - r.left));
    const y = Math.min(r.height, Math.max(0, e.clientY - r.top));
    setHsv(([h]) => [h, x / r.width, 1 - y / r.height]);
  };
  const hueAt = (e: React.PointerEvent) => {
    const r = hue.current!.getBoundingClientRect();
    const x = Math.min(r.width - 16, Math.max(16, e.clientX - r.left));
    setHsv(([, s, v]) => [((x - 16) / Math.max(1, r.width - 32)) * 360, s, v]);
  };
  const hueX = `calc(16px + (100% - 32px) * ${hsv[0] / 360})`;
  const pureHue = hsvToHex(hsv[0], 1, 1);
  return (
    <div className="absolute inset-0" onPointerDown={(e) => e.stopPropagation()}>
      {/* preview_area: touching the preview commits the colour (CollageDataViewModel.lg) */}
      <div className="absolute inset-x-0 top-0" style={{ bottom: 294 }} onPointerDown={() => onApply(hex)} />
      <div className="absolute inset-x-0 bottom-0 bg-black" style={{ paddingTop: 16 }}>
        {/* view_color_saturation */}
        <div
          ref={sv}
          className="relative"
          style={{ height: 124, margin: "0 16px 10px", borderRadius: 4, touchAction: "none", background: `linear-gradient(to bottom, rgba(0,0,0,0), #000000), linear-gradient(to right, #ffffff, ${pureHue})`, boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.118)" }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); svAt(e); }}
          onPointerMove={(e) => { if (e.buttons) svAt(e); }}
        >
          <span
            className="pointer-events-none absolute rounded-full"
            style={{ width: 34, height: 34, left: `calc(${hsv[1] * 100}% - 17px)`, top: `calc(${(1 - hsv[2]) * 100}% - 17px)`, border: "2px solid #ffffff", boxShadow: "0 0 6px rgba(0,0,0,0.2)" }}
          />
        </div>
        {/* view_color_hue_slider */}
        <div
          ref={hue}
          className="relative"
          style={{ height: 36, touchAction: "none" }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); hueAt(e); }}
          onPointerMove={(e) => { if (e.buttons) hueAt(e); }}
        >
          <div className="absolute" style={{ left: 16, right: 16, top: 17, height: 2, background: "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)" }} />
          <span className="pointer-events-none absolute rounded-full" style={{ width: 18, height: 18, top: 9, left: `calc(${hueX} - 9px)`, background: pureHue, border: "2px solid #ffffff" }} />
        </div>
        {/* container_color_input */}
        <div className="relative flex items-center" style={{ height: 56, padding: "0 16px" }}>
          <input
            value={text ?? hex}
            onFocus={() => setText("")}
            onBlur={() => setText(null)}
            onChange={(e) => {
              let v = e.target.value.replace(/[^#0-9a-fA-F]/g, "");
              if (v && !v.startsWith("#")) v = "#" + v.replace(/#/g, "").slice(0, 6);
              v = v.slice(0, 7).toUpperCase();
              setText(v);
              const c = v.startsWith("#") ? parseHex(v) : null;
              if (c && c !== hex) setHsv(hexToHsv(c));
            }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onCommit(hex); } }}
            maxLength={7}
            inputMode="text"
            enterKeyHint="search"
            spellCheck={false}
            autoComplete="off"
            className="w-full text-center text-white outline-none"
            style={{ height: 36, borderRadius: 4, background: "#222222", fontSize: 14, caretColor: PRIMARY }}
          />
        </div>
        {/* container_main_menu */}
        <div className="relative flex items-center justify-center" style={{ height: MENU_H }}>
          <span className="text-white" style={{ fontSize: 15 }}>Color</span>
          <button type="button" onClick={() => onCommit(hex)} aria-label="Confirm" className="absolute bottom-0 right-0" style={{ width: 52, height: 52 }}>
            <Tint name="icon_edit_title_confirm" size={52} color={PRIMARY} />
          </button>
        </div>
      </div>
    </div>
  );
}
