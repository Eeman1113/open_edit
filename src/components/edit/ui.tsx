"use client";

// Editor building blocks shared by the photo editor, the video editor and the collage maker. Everything is drawn
// with the design-system tokens (bg-panel, text-fg-2, accent...) and <Icon>; see docs/design.md "Editors".
//
// Layout of the photo editor (all sizes in CSS px):
//   ┌ top bar (TOP_H) ───────────── back · undo / redo · layers · Save ┐   tool pages swap it for Cancel · title · Apply
//   │ preview                                                          │
//   │                       control row (CTRL_H): history · slider · compare
//   ├ dock (MENU, rounded panel) ───────────────────────────────────────┤
//   │ tool panel (PANEL_H)                                              │
//   └ tab bar (TAB_H) ──────────────────────────────────────────────────┘   tool pages use the whole dock instead
import { useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button, Dialog, Icon, Tabs, cx, type IconName } from "@/components/ui";
import { EditCtx } from "./ctx";

export const TOP_H = 52;
export const TAB_H = 60;
/** Height of the bottom dock (tool panel + tab bar, or a tool page). The preview fits above it. */
export const MENU = 200;
export const PANEL_H = MENU - TAB_H;
export const CTRL_H = 48;

/* ------------------------------------------------------------------ dock + tool-page bar */

/** The rounded bottom panel that holds tool content. */
export function Dock({ height = MENU, children, className, style }: { height?: number; children?: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div
      className={cx("absolute inset-x-0 bottom-0 z-20 rounded-t-xl bg-panel shadow-[0_-8px_24px_rgba(0,0,0,0.35)]", className)}
      style={{ height, ...style }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

/** Content area of a main tab: the part of the dock above the tab bar (the dock itself is drawn by the editor). */
export function PanelArea({ children, className, style }: { children?: ReactNode; className?: string; style?: CSSProperties }) {
  return <div className={cx("absolute inset-x-0 z-20", className)} style={{ bottom: TAB_H, height: PANEL_H, ...style }}>{children}</div>;
}

/**
 * Cancel · title · Apply bar of a tool page. It is portalled into the editor's top bar so every tool page has the same
 * command row; outside the photo editor it renders in place at the top of its parent.
 */
export function EditBar({ title, onClose, onConfirm, confirmNode, children, applyLabel = "Apply" }: {
  title?: ReactNode; onClose?: () => void; onConfirm?: () => void; confirmNode?: ReactNode; children?: ReactNode; applyLabel?: string;
}) {
  const slot = useContext(EditCtx)?.barSlot ?? null;
  const bar = (
    <div className="flex h-full items-center gap-2 px-2">
      {onClose ? (
        <button type="button" aria-label="Cancel" onClick={onClose} className="oe-press flex h-10 w-10 flex-none items-center justify-center rounded-full bg-raised text-fg">
          <Icon name="close" size={20} />
        </button>
      ) : <span className="w-10 flex-none" />}
      <div className="flex min-w-0 flex-1 items-center justify-center font-display text-[16px] font-semibold">{children ?? <span className="truncate">{title}</span>}</div>
      {confirmNode ?? (onConfirm ? (
        <button type="button" aria-label={applyLabel} onClick={onConfirm} className="oe-press flex h-10 w-10 flex-none items-center justify-center rounded-full bg-accent text-on-accent">
          <Icon name="check" size={20} stroke={2.4} />
        </button>
      ) : <span className="w-10 flex-none" />)}
    </div>
  );
  if (slot) return createPortal(bar, slot);
  return <div className="absolute inset-x-0 top-0 z-40 bg-bg" style={{ height: TOP_H }}>{bar}</div>;
}
/** Older name kept for the tool pages. */
export const TitleBar = EditBar;

/** Segmented switch for a tool page bar (2–3 short options). */
export function BarTabs<T extends string>({ items, value, onChange }: { items: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return <Tabs look="segment" items={items} value={value} onChange={onChange} className="max-w-[260px] flex-1" />;
}

/** "Generate" style primary action for the bar's right slot. */
export function BarAction({ label, onClick, icon = "sparkles" }: { label: string; onClick: () => void; icon?: IconName }) {
  return <Button size="sm" icon={icon} onClick={onClick} className="h-10 rounded-full px-4">{label}</Button>;
}

/* ------------------------------------------------------------------ preview controls */

/** Glass round button used over the photo (undo / redo / compare). */
export function CtrlIcon({ name, enabled, onClick, onHold, style, label }: {
  name: "undo" | "redo" | "original"; enabled: boolean; onClick?: () => void; onHold?: (down: boolean) => void; style?: CSSProperties; label?: string;
}) {
  const hold = onHold ? {
    onPointerDown: (e: React.PointerEvent) => { if (!enabled) return; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); onHold(true); },
    onPointerUp: () => onHold(false),
    onPointerCancel: () => onHold(false),
    onPointerLeave: () => onHold(false),
  } : {};
  const aria = label ?? (name === "original" ? "Hold to compare" : name === "undo" ? "Undo" : "Redo");
  return (
    <button
      type="button" disabled={!enabled} aria-label={aria} title={aria} onClick={onClick} {...hold}
      className="oe-press flex h-9 w-9 flex-none items-center justify-center rounded-full bg-glass text-white backdrop-blur-md disabled:opacity-35"
      style={{ touchAction: "none", ...style }}
    >
      <Icon name={name} size={18} />
    </button>
  );
}

/** Undo / redo handle. `auto` = the editor-wide history (shown in the top bar, not here). */
export interface UndoHandle { can: boolean; on: () => void; auto?: boolean }

/**
 * Row that floats over the bottom edge of the preview: local undo / redo on the left, an optional slider in the
 * middle and hold-to-compare on the right. The editor-wide history is in the top bar, so `auto` handles are skipped;
 * with them, compare only appears once there is something to compare.
 */
export function ControlRow({ bottom = MENU, undo, redo, onOriginal, originalEnabled, hideOriginal, children, style }: {
  bottom?: number;
  undo?: UndoHandle; redo?: UndoHandle;
  onOriginal?: (down: boolean) => void; originalEnabled?: boolean; hideOriginal?: boolean;
  children?: ReactNode; style?: CSSProperties;
}) {
  const local = !!undo && !undo.auto;
  const auto = !!undo?.auto;
  const originalVisible = !auto || originalEnabled !== undefined || !!undo?.can;
  return (
    <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center gap-2 px-3" style={{ bottom: bottom + 4, height: CTRL_H, ...style }}>
      {local && (
        <div className="pointer-events-auto flex flex-none gap-1.5">
          <CtrlIcon name="undo" enabled={undo.can} onClick={undo.on} />
          {redo && <CtrlIcon name="redo" enabled={redo.can} onClick={redo.on} />}
        </div>
      )}
      <div className="pointer-events-auto relative flex min-w-0 flex-1 items-center">{children}</div>
      {onOriginal && !hideOriginal && (
        <div className="pointer-events-auto flex-none" style={{ visibility: originalVisible ? undefined : "hidden" }}>
          <CtrlIcon name="original" enabled={originalEnabled ?? true} onHold={onOriginal} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ tool tiles, chips, lists */

/** Icon tile with a label. Selected = accent tile; `modified` = accent dot; `disabled` only dims (taps still arrive). */
export function FeatureButton({ icon, label, selected = false, disabled = false, isNew, modified, onClick, dim, iconNode }: {
  icon?: IconName; label: string; selected?: boolean; disabled?: boolean; isNew?: boolean; modified?: boolean;
  onClick?: () => void; dim?: boolean; iconNode?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-disabled={disabled || undefined}
      className={cx("oe-press relative flex w-[68px] flex-none flex-col items-center gap-1.5", (disabled || dim) && "opacity-40")}
    >
      <span className={cx("relative flex h-11 w-11 items-center justify-center rounded-md transition-colors duration-150", selected ? "bg-accent text-on-accent" : "bg-raised text-fg")}>
        {iconNode ?? (icon && <Icon name={icon} size={22} />)}
        {modified && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-panel" />}
      </span>
      <span className={cx("w-full truncate text-center text-[11px] font-medium leading-tight", selected ? "text-fg" : "text-fg-2")}>{label}</span>
      {isNew && <span className="absolute -top-1 right-0.5 rounded-full bg-info px-1.5 py-px text-[9px] font-bold tracking-wide text-white">NEW</span>}
    </button>
  );
}

/** Horizontally scrolling row of tiles, centred when they all fit. Fills its positioned parent. */
export function FeatureList({ children, top = 0, className }: { children: ReactNode; count?: number; top?: number; className?: string }) {
  return (
    <div className={cx("no-scrollbar absolute inset-x-0 bottom-0 flex items-center gap-1 overflow-x-auto px-3", className)} style={{ top, justifyContent: "safe center" }}>
      {children}
    </div>
  );
}

/** Text chip for long lists of named sliders (selected = inverted, `modified` = accent dot). */
export function ToolChip({ label, selected, modified, onClick, dim }: { label: string; selected?: boolean; modified?: boolean; onClick?: () => void; dim?: boolean }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={selected}
      className={cx(
        "oe-press inline-flex h-9 flex-none items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium transition-colors",
        selected ? "bg-fg text-bg" : "bg-raised text-fg-2", dim && "opacity-40",
      )}
    >
      {label}
      {modified && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
    </button>
  );
}

/** Scrolling row of chips. */
export function ChipRow({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <div className={cx("no-scrollbar flex items-center gap-2 overflow-x-auto px-4", className)} style={style}>{children}</div>;
}

/** Caption above a panel row. */
export function PanelLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx("px-4 text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-3", className)}>{children}</p>;
}

/* ------------------------------------------------------------------ slider */

export interface SeekProps {
  value: number; min?: number; max?: number; def?: number;
  onChange: (v: number) => void; onRelease?: (v: number) => void;
  disabled?: boolean;
  /** Show the value bubble while dragging (and on `flashKey` changes). */
  level?: boolean;
  /** Two-directional display (−100..100), filling from the centre. Defaults to |min| = |max|. */
  duplex?: boolean;
  /** Gradient track (colour sliders) instead of the accent fill. */
  gradient?: string[];
  style?: CSSProperties;
  format?: (v: number) => string;
  /** Changing this briefly shows the value bubble (a new item was picked). */
  flashKey?: unknown;
}

/** The editors' slider: a 4 px track with an accent fill, a default tick it snaps to, and a value bubble. */
export function EditSeekBar({ value, min = 0, max = 1, def = min, onChange, onRelease, disabled, level = true, duplex, gradient, style, format, flashKey }: SeekProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);
  const [bubble, setBubble] = useState(false);
  const hideT = useRef<number | undefined>(undefined);
  const latest = useRef(value);
  const isDuplex = duplex ?? Math.abs(min) === Math.abs(max);
  const span = max - min || 1;
  const p = Math.min(1, Math.max(0, (value - min) / span));
  const dp = Math.min(1, Math.max(0, (def - min) / span));
  useEffect(() => {
    if (flashKey === undefined || !level) return;
    const t1 = window.setTimeout(() => { setBubble(true); hideT.current = window.setTimeout(() => setBubble(false), 700); }, 0);
    return () => { window.clearTimeout(t1); window.clearTimeout(hideT.current); };
  }, [flashKey, level]);
  const valueAt = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    let q = Math.min(1, Math.max(0, (clientX - r.left - 10) / Math.max(1, r.width - 20)));
    if (Math.abs(q - dp) < 0.018) q = dp; // snap to the default
    return min + q * span;
  };
  const text = format ? format(value) : (() => { const n = Math.round((isDuplex ? (p - 0.5) * 2 : p) * 100); return isDuplex && n > 0 ? `+${n}` : String(n); })();
  const a = isDuplex ? Math.min(0.5, p) : 0, b = isDuplex ? Math.max(0.5, p) : p;
  const end = (v: number) => { setDrag(false); window.clearTimeout(hideT.current); hideT.current = window.setTimeout(() => setBubble(false), 500); onRelease?.(v); };
  return (
    <div
      ref={ref}
      role="slider" aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(value * 100) / 100} tabIndex={disabled ? -1 : 0}
      className={cx("relative h-10 min-w-0 flex-1 cursor-pointer touch-none outline-none", disabled && "pointer-events-none opacity-35")}
      style={style}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        const v = Math.min(max, Math.max(min, value + (e.key === "ArrowRight" ? span / 100 : -span / 100)));
        onChange(v); onRelease?.(v); e.preventDefault();
      }}
      onPointerDown={(e) => {
        if (disabled) return;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
        setDrag(true); setBubble(true); window.clearTimeout(hideT.current);
        const v = valueAt(e.clientX); latest.current = v; onChange(v);
      }}
      onPointerMove={(e) => { if (!drag) return; const v = valueAt(e.clientX); latest.current = v; onChange(v); }}
      onPointerUp={() => { if (drag) end(latest.current); }}
      onPointerCancel={() => { if (drag) end(latest.current); }}
    >
      <div className="absolute inset-x-[10px] top-1/2 h-1 -translate-y-1/2 rounded-full shadow-[0_0_0_0.5px_rgba(0,0,0,0.25)]" style={{ background: gradient ? `linear-gradient(90deg, ${gradient.join(",")})` : "rgba(255,255,255,0.26)" }}>
        {!gradient && <div className="absolute inset-y-0 rounded-full bg-accent" style={{ left: `${a * 100}%`, width: `${(b - a) * 100}%` }} />}
        <span className="absolute top-1/2 h-2.5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80" style={{ left: `${dp * 100}%` }} />
        <span
          className={cx("absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.5)] transition-[box-shadow] duration-150", drag && "ring-4 ring-accent/35")}
          style={{ left: `${p * 100}%` }}
        />
        {level && (
          <span
            className="tabular pointer-events-none absolute bottom-4 -translate-x-1/2 rounded-xs bg-raised px-1.5 py-0.5 text-[12px] font-semibold text-fg shadow-lg ring-1 ring-line"
            style={{ left: `${p * 100}%`, opacity: bubble ? 1 : 0, transition: bubble ? "none" : "opacity 250ms" }}
          >
            {text}
          </span>
        )}
      </div>
    </div>
  );
}

/** Labelled slider row: caption on the left, slider, optional value on the right. */
export function SliderRow({ label, children, value, className, style }: { label: ReactNode; children: ReactNode; value?: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={cx("flex items-center gap-3 px-4", className)} style={style}>
      <span className="w-20 flex-none truncate text-[13px] font-medium text-fg-2">{label}</span>
      {children}
      {value !== undefined && <span className="tabular w-9 flex-none text-right text-[12px] text-fg-3">{value}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ colours and thumbnails */

/** Round colour swatch. Selected = a light ring with a gap. */
export function ColorChip({ color, selected, onClick, size = 30, children, style, label }: {
  color: string; selected?: boolean; onClick?: () => void; size?: number; darkOutline?: boolean; children?: ReactNode; style?: CSSProperties; label?: string;
}) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={selected} aria-label={label ?? color}
      className="oe-press relative flex flex-none items-center justify-center rounded-full"
      style={{
        width: size, height: size, background: color,
        boxShadow: selected ? "0 0 0 2px var(--oe-panel), 0 0 0 4px var(--oe-fg)" : "inset 0 0 0 1px rgba(255,255,255,0.16)",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/** Round tool button that sits in a swatch row (eyedropper, colour wheel, none). */
export function SwatchTool({ icon, label, onClick, active, size = 30 }: { icon: IconName; label: string; onClick: () => void; active?: boolean; size?: number }) {
  return (
    <button
      type="button" onClick={onClick} aria-label={label} title={label} aria-pressed={active}
      className={cx("oe-press flex flex-none items-center justify-center rounded-full", active ? "bg-accent text-on-accent" : "bg-raised text-fg")}
      style={{ width: size, height: size }}
    >
      <Icon name={icon} size={Math.round(size * 0.55)} />
    </button>
  );
}

/** Picture tile with a caption (filters, tones, looks). Selected = accent ring and a check badge. */
export function ThumbItem({ label, bg, src, iconNode, selected, onClick, none, badge, size = 64 }: {
  label: string; bg?: string; src?: string; iconNode?: ReactNode; selected?: boolean; onClick?: () => void; none?: boolean; badge?: ReactNode; size?: number;
  /** @deprecated unused */ text?: string;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className="oe-press relative flex flex-none flex-col items-center gap-1.5" style={{ width: size }}>
      <span
        className={cx("relative block overflow-hidden rounded-md bg-muted transition-shadow", selected && "ring-2 ring-accent ring-offset-2 ring-offset-panel")}
        style={{ width: size, height: size, background: bg }}
      >
        {none ? (
          <span className="absolute inset-0 flex items-center justify-center bg-raised text-fg-2"><Icon name="block" size={24} /></span>
        ) : src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
        ) : iconNode}
        {selected && !none && (
          <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-on-accent shadow"><Icon name="check" size={13} stroke={2.6} /></span>
        )}
        {badge}
      </span>
      <span className={cx("w-full truncate text-center text-[11px] font-medium leading-tight", selected ? "text-fg" : "text-fg-2")}>{label}</span>
    </button>
  );
}

export function hexAlpha(hex: string, a: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/* ------------------------------------------------------------------ dialogs and messages */

/** Confirm dialog (design-system Dialog). */
export function AlertDialog({ title, message, cancel = "Cancel", ok, onCancel, onOk, destructive, icon }: {
  title?: string; message: string; cancel?: string; ok: string; onCancel: () => void; onOk: () => void; destructive?: boolean; icon?: IconName;
}) {
  return (
    <Dialog open onClose={onCancel} title={title} confirm={ok} cancel={cancel} destructive={destructive} icon={icon} onConfirm={onOk}>
      {message}
    </Dialog>
  );
}

/** Centred message inside a panel, with an optional retry. */
export function EmptyState({ text, onRetry, icon = "info" }: { text: string; onRetry?: () => void; icon?: IconName }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-md bg-raised text-fg-2"><Icon name={icon} size={20} /></span>
      <p className="whitespace-pre-line text-[13px] leading-snug text-fg-2">{text}</p>
      {onRetry && <Button variant="secondary" size="sm" icon="reset" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

/** Floating hint pill over the preview. */
export function HintPill({ text, className, style }: { text: string; className?: string; style?: CSSProperties }) {
  return (
    <div className={cx("whitespace-pre-line rounded-md bg-glass px-3.5 py-2 text-center text-[13px] leading-snug text-white shadow-lg backdrop-blur-md", className)} style={{ animation: "oe-rise 200ms var(--oe-ease)", ...style }}>
      {text}
    </div>
  );
}
