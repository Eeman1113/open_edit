"use client";

// Collage maker panels: Layout (canvas ratio + layout), Stack (one long strip), Border (width + colour), the photo
// page that opens when a cell is tapped, and the colour mixer.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Icon, cx } from "@/components/ui";
import { ColorChip, EditSeekBar, FeatureButton, SwatchTool, ToolChip, ChipRow } from "@/components/edit/ui";
import { useBackHandler } from "@/lib/back";
import { PACKS, type Pack, type Rect, type Sel } from "./layouts";

/** Panel area above the tab bar, and the tab bar. */
export const FEATURE_H = 148;
export const MENU_H = 60;

/** Bring item i of a horizontal list to the centre. */
function centerOn(list: HTMLElement | null, i: number) {
  const el = list?.children[i] as HTMLElement | undefined;
  if (!list || !el) return;
  list.scrollTo({ left: el.offsetLeft + el.offsetWidth / 2 - list.clientWidth / 2, behavior: "smooth" });
}

/* ------------------------------------------------------------------ Layout */

/** Layout thumbnail: its cells as rounded tiles at the canvas ratio, fitted to a 40 px box. */
export function LayoutThumb({ rects, rx, ry, selected }: { rects: Rect[]; rx: number; ry: number; selected: boolean }) {
  const a = rx / ry;
  const w = a >= 1 ? 38 : 38 * a;
  const h = a >= 1 ? 38 / a : 38;
  const x0 = (40 - w) / 2, y0 = (40 - h) / 2;
  const gap = 2;
  return (
    <svg width={40} height={40} viewBox="0 0 40 40" aria-hidden className="block">
      {rects.map(([x, y, rw, rh], i) => (
        <rect
          key={i}
          x={x0 + x * w + gap / 2} y={y0 + y * h + gap / 2}
          width={Math.max(0, rw * w - gap)} height={Math.max(0, rh * h - gap)}
          rx={2} fill={selected ? "var(--oe-accent)" : "var(--oe-fg3)"} opacity={selected ? 1 : 0.85}
        />
      ))}
    </svg>
  );
}

export function LayoutPanel({ templates, pack, sel, onPack, onLayout }: {
  templates: Rect[][]; pack: Pack; sel: Sel; onPack: (p: Pack) => void; onLayout: (i: number) => void;
}) {
  const layoutList = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (sel.kind === "layout" && sel.pack === pack.id) centerOn(layoutList.current, sel.index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="flex h-full flex-col justify-center gap-3" onPointerDown={(e) => e.stopPropagation()}>
      <ChipRow>
        {PACKS.map((p) => <ToolChip key={p.id} label={p.title} selected={p.id === pack.id} onClick={() => onPack(p)} />)}
      </ChipRow>
      <div ref={layoutList} className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-1">
        {templates.map((t, i) => {
          const s = sel.kind === "layout" && sel.pack === pack.id && sel.index === i;
          return (
            <button
              key={i} type="button" aria-label={`Layout ${i + 1}`} aria-pressed={s}
              onClick={() => { onLayout(i); centerOn(layoutList.current, i); }}
              className={cx("oe-press flex h-[60px] w-[60px] flex-none items-center justify-center rounded-md transition-colors", s ? "bg-accent-soft ring-2 ring-accent" : "bg-raised")}
            >
              <LayoutThumb rects={t} rx={pack.rx} ry={pack.ry} selected={s} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Stack */

function StackOption({ icon, title, sub, selected, onClick }: { icon: "stack-v" | "stack-h"; title: string; sub: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={selected}
      className={cx("oe-press flex flex-1 items-center gap-3 rounded-lg p-3 text-left transition-colors", selected ? "bg-accent-soft ring-2 ring-accent" : "bg-raised")}
    >
      <span className={cx("flex h-10 w-10 flex-none items-center justify-center rounded-md", selected ? "bg-accent text-on-accent" : "bg-muted text-fg")}><Icon name={icon} size={20} /></span>
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold">{title}</span>
        <span className="block text-[12px] text-fg-3">{sub}</span>
      </span>
    </button>
  );
}

export function SequencePanel({ sel, onHeight, onWidth }: { sel: Sel; onHeight: () => void; onWidth: () => void }) {
  return (
    <div className="flex h-full items-center gap-3 px-4" onPointerDown={(e) => e.stopPropagation()}>
      <StackOption icon="stack-v" title="Top to bottom" sub="One tall strip" selected={sel.kind === "height"} onClick={onHeight} />
      <StackOption icon="stack-h" title="Side by side" sub="One wide strip" selected={sel.kind === "width"} onClick={onWidth} />
    </div>
  );
}

/* ------------------------------------------------------------------ Border */

export type BorderItem =
  | { kind: "tool"; tool: "picker" | "palette" }
  | { kind: "color"; type: "builtin" | "picker" | "palette"; color: string };

export const sameColor = (a: BorderItem, b: { type: string; color: string }) => a.kind === "color" && a.type === b.type && a.color.toLowerCase() === b.color.toLowerCase();

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
    <div className="relative flex h-full flex-col justify-center gap-3" onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-3 px-4">
        <span className="w-14 flex-none text-[13px] font-medium text-fg-2">Width</span>
        <EditSeekBar value={size} min={0} max={1} def={0} duplex={false} disabled={!sizeEnabled} flashKey={flashKey} onChange={onSize} />
        <span className="tabular w-8 flex-none text-right text-[12px] text-fg-3">{Math.round(size * 100)}</span>
      </div>
      <div ref={list} className="no-scrollbar flex items-center gap-3 overflow-x-auto px-4 py-1.5">
        {items.map((it, i) =>
          it.kind === "tool" ? (
            <SwatchTool key={`t-${it.tool}`} icon={it.tool === "picker" ? "pipette" : "palette"} label={it.tool === "picker" ? "Pick from the collage" : "Mix a colour"} active={it.tool === "picker" && dimmed} onClick={() => { centerOn(list.current, i); onItem(it, i); }} />
          ) : (
            <ColorChip key={`${it.type}-${it.color}`} color={it.color} selected={sameColor(it, current)} onClick={() => { centerOn(list.current, i); onItem(it, i); }} />
          ),
        )}
      </div>
      {dimmed && <div className="absolute inset-0 flex items-center justify-center bg-panel/85 text-[13px] font-medium text-fg-2" style={{ animation: "oe-fade-in 200ms" }} onClick={(e) => e.stopPropagation()}>Drag on the collage to pick a colour</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ Photo page (a cell was tapped) */

/** Top command bar of a collage page (Cancel · title · Apply). */
export function PageBar({ title, onCancel, onConfirm, children }: { title?: string; onCancel?: () => void; onConfirm: () => void; children?: ReactNode }) {
  return (
    <div className="absolute inset-x-0 top-0 z-30 flex items-center gap-2 bg-bg/95 px-2 backdrop-blur-md" style={{ height: "var(--oe-top-bar)" }}>
      {onCancel ? (
        <button type="button" aria-label="Cancel" onClick={onCancel} className="oe-press flex h-10 w-10 items-center justify-center rounded-full bg-raised"><Icon name="close" size={20} /></button>
      ) : <span className="w-10" />}
      <div className="flex min-w-0 flex-1 justify-center font-display text-[16px] font-semibold">{children ?? title}</div>
      <button type="button" aria-label="Apply" onClick={onConfirm} className="oe-press flex h-10 w-10 items-center justify-center rounded-full bg-accent text-on-accent"><Icon name="check" size={20} stroke={2.4} /></button>
    </div>
  );
}

export function FocusPanel({ onReplace, onRight90, onMirror, onFlip }: {
  onReplace: () => void; onRight90: () => void; onMirror: () => void; onFlip: () => void;
}) {
  return (
    <div className="flex h-full flex-col justify-center gap-2" onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex justify-center gap-2">
        <FeatureButton icon="replace" label="Replace" onClick={onReplace} />
        <FeatureButton icon="rotate-right" label="Rotate" onClick={onRight90} />
        <FeatureButton icon="flip-h" label="Flip across" onClick={onMirror} />
        <FeatureButton icon="flip-v" label="Flip upright" onClick={onFlip} />
      </div>
      <p className="text-center text-[12px] text-fg-3">Drag or pinch the photo to frame it. Hold and drag to swap cells.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ Colour mixer */

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

/** Partial hex input → full colour ("#abc" → "#AABBCC", missing digits padded with 0). */
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

export const PALETTE_H = 300;

export function PalettePanel({ initial, onLive, onApply, onCommit, onBack }: { initial: string | null; onLive: (hex: string) => void; onApply: (hex: string) => void; onCommit: (hex: string) => void; onBack: () => void }) {
  // no colour yet: start at white (top-left of the square)
  const [hsv, setHsv] = useState<[number, number, number]>(() => (initial ? hexToHsv(initial) : [0, 0, 1]));
  const hex = hsvToHex(hsv[0], hsv[1], hsv[2]);
  const [text, setText] = useState<string | null>(null); // null = not editing (shows the hex)
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
    const x = Math.min(r.width, Math.max(0, e.clientX - r.left));
    setHsv(([, s, v]) => [(x / Math.max(1, r.width)) * 359.9, s, v]);
  };
  const pureHue = hsvToHex(hsv[0], 1, 1);
  return (
    <div className="absolute inset-0" onPointerDown={(e) => e.stopPropagation()}>
      <PageBar title="Border colour" onCancel={onBack} onConfirm={() => onCommit(hex)} />
      {/* tapping the collage applies the colour so far */}
      <div className="absolute inset-x-0" style={{ top: 52, bottom: PALETTE_H }} onPointerDown={() => onApply(hex)} />
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-4 rounded-t-xl bg-panel px-4 pb-5 pt-4 shadow-[0_-8px_24px_rgba(0,0,0,0.35)]" style={{ height: PALETTE_H }}>
        <div
          ref={sv}
          className="relative h-[130px] flex-none touch-none rounded-md"
          style={{ background: `linear-gradient(to bottom, rgba(0,0,0,0), #000000), linear-gradient(to right, #ffffff, ${pureHue})` }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); svAt(e); }}
          onPointerMove={(e) => { if (e.buttons) svAt(e); }}
        >
          <span className="pointer-events-none absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full ring-[3px] ring-white" style={{ left: `${hsv[1] * 100}%`, top: `${(1 - hsv[2]) * 100}%`, background: hex, boxShadow: "0 0 0 4px rgba(0,0,0,0.25)" }} />
        </div>
        <div
          ref={hue}
          className="relative h-6 flex-none touch-none rounded-full"
          style={{ background: "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)" }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); hueAt(e); }}
          onPointerMove={(e) => { if (e.buttons) hueAt(e); }}
        >
          <span className="pointer-events-none absolute top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full ring-[3px] ring-white" style={{ left: `${(hsv[0] / 360) * 100}%`, background: pureHue }} />
        </div>
        <div className="flex items-center gap-3">
          <span className="h-10 w-10 flex-none rounded-md ring-1 ring-line" style={{ background: hex }} />
          <input
            value={text ?? hex}
            aria-label="Hex colour"
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
            spellCheck={false}
            autoComplete="off"
            placeholder="#RRGGBB"
            className="tabular h-10 min-w-0 flex-1 rounded-md bg-raised px-3 font-display text-[15px] font-semibold text-fg outline-none placeholder:text-fg-3 focus:ring-2 focus:ring-accent"
          />
          <Button size="sm" className="h-10" onClick={() => onCommit(hex)}>Use</Button>
        </div>
      </div>
    </div>
  );
}
