"use client";

// Shared editor widgets: EditImageButton, control row, 2-depth title bar, EditSeekBar, colour chips, toasts.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { d } from "@/components/ui/legacy-drawable";
import { useBackHandler } from "@/lib/back";

export const PRIMARY = "#0bd4d2";
export const WHITE60 = "rgba(255,255,255,0.6)";
export const BLACK40 = "rgba(0,0,0,0.4)";

/** Drawable tinted with a solid colour (Android `tint`), via CSS mask. */
export function Tint({ name, size, color, style }: { name: string; size: number | [number, number]; color: string; style?: CSSProperties }) {
  const [w, h] = Array.isArray(size) ? size : [size, size];
  const url = `url(${d(name)})`;
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block", flex: "none", width: w, height: h, backgroundColor: color,
        WebkitMaskImage: url, maskImage: url, WebkitMaskSize: "contain", maskSize: "contain",
        WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", WebkitMaskPosition: "center", maskPosition: "center",
        ...style,
      }}
    />
  );
}

export function Img({ name, size, style, className }: { name: string; size: number | [number, number]; style?: CSSProperties; className?: string }) {
  const [w, h] = Array.isArray(size) ? size : [size, size];
  return <img src={d(name)} alt="" draggable={false} className={className} style={{ width: w, height: h, objectFit: "contain", flex: "none", ...style }} />;
}

/** color/edit_feature_selector */
export const featureColor = (selected: boolean, disabled?: boolean) => (disabled ? WHITE60 : selected ? PRIMARY : "#ffffff");

/** EditImageButton (view_edit_image_button.xml): 58x58, 46dp icon, 10dp label, 16dp badges. */
export function FeatureButton({ icon, label, selected = false, disabled = false, isNew, modified, onClick, tint = true, dim, iconNode }: {
  icon: string; label: string; selected?: boolean; disabled?: boolean; isNew?: boolean; modified?: boolean;
  onClick?: () => void; tint?: boolean; dim?: boolean; iconNode?: ReactNode;
}) {
  const color = featureColor(selected, disabled);
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex flex-none flex-col items-center"
      style={{ width: 58, minHeight: 58, opacity: dim ? 0.3 : 1 }}
    >
      {iconNode ?? (tint ? <Tint name={icon} size={46} color={color} /> : <Img name={icon} size={46} />)}
      <span className="w-full truncate text-center" style={{ fontSize: 10, lineHeight: "12px", color }}>{label}</span>
      {modified !== undefined && (
        <span className="rounded-full" style={{ width: 3, height: 3, marginTop: 6, background: selected ? PRIMARY : "rgba(255,255,255,0.4)", opacity: modified ? 1 : 0, transition: "opacity 200ms" }} />
      )}
      {isNew && <Img name="icon_edit_tab_new" size={16} style={{ position: "absolute", top: 0, right: 2 }} />}
    </button>
  );
}

/** Horizontal feature list (list_feature): marginTop 36, paddingH 4, EditDefaultDecoration gaps. */
export function FeatureList({ children, count, top = 36 }: { children: ReactNode; count: number; top?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(360);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // EditDefaultDecoration
  let gap: number;
  let center = false;
  if (count <= 5) { gap = count === 5 ? 16 : count === 4 ? 24 : 44; center = true; }
  else if (w <= 420) gap = (w - 4 - 5.5 * 58) / 5;
  else if (w <= 500) gap = (w - 4 - 6.5 * 58) / 6;
  else gap = Math.max((w - 8 - count * 58) / (count - 1), 6);
  return (
    <div ref={ref} className="no-scrollbar absolute inset-x-0 flex overflow-x-auto" style={{ top, paddingLeft: 4, paddingRight: 4, gap, justifyContent: center ? "center" : undefined }}>
      {children}
    </div>
  );
}

/** Undo / redo / hold-to-compare icons (icon_edit_undo/redo/original selectors: disabled = alpha 0.4). */
export function CtrlIcon({ name, enabled, onClick, onHold, style }: { name: "undo" | "redo" | "original"; enabled: boolean; onClick?: () => void; onHold?: (down: boolean) => void; style?: CSSProperties }) {
  const holdHandlers = onHold ? {
    onPointerDown: (e: React.PointerEvent) => { if (!enabled) return; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); onHold(true); },
    onPointerUp: () => onHold(false),
    onPointerCancel: () => onHold(false),
    onPointerLeave: () => onHold(false),
  } : {};
  return (
    <button type="button" disabled={!enabled} onClick={onClick} {...holdHandlers} style={{ width: 34, height: 34, opacity: enabled ? 1 : 0.4, flex: "none", touchAction: "none", ...style }}>
      <Img name={`icon_edit_common_${name}`} size={34} />
    </button>
  );
}

/** Undo/redo handle. `auto` = the editor-wide stack (EPOneDepthFragment.setUpUndoRedo semantics). */
export interface UndoHandle { can: boolean; on: () => void; auto?: boolean }

/**
 * container_control: 54dp row sitting on top of the 186dp menu area.
 * With the editor-wide stack (`undo.auto`), EPOneDepthFragment makes undo/redo INVISIBLE until the
 * stack has an entry (isUndoRedoVisible = undoable || redoable) and btn_original INVISIBLE while
 * nothing is undoable (EPPageFragment.setUpOriginalUi). INVISIBLE keeps the layout slot.
 */
export function ControlRow({ bottom = 186, undo, redo, onOriginal, originalEnabled, hideOriginal, children, style }: {
  bottom?: number;
  undo?: UndoHandle; redo?: UndoHandle;
  onOriginal?: (down: boolean) => void; originalEnabled?: boolean; hideOriginal?: boolean;
  children?: ReactNode; style?: CSSProperties;
}) {
  const auto = !!undo?.auto;
  const undoRedoVisible = !auto || !!(undo?.can || redo?.can);
  const originalVisible = !auto || originalEnabled !== undefined || !!undo?.can;
  return (
    <div className="pointer-events-none absolute inset-x-0 flex items-center" style={{ bottom, height: 54, ...style }}>
      <div className="pointer-events-auto flex items-center" style={{ visibility: undoRedoVisible ? undefined : "hidden" }}>
        {undo && <CtrlIcon name="undo" enabled={undo.can} onClick={undo.on} style={{ marginLeft: 10 }} />}
        {redo && <CtrlIcon name="redo" enabled={redo.can} onClick={redo.on} style={{ marginLeft: 10 }} />}
      </div>
      <div className="pointer-events-auto relative flex min-w-0 flex-1 items-center">{children}</div>
      {onOriginal && !hideOriginal && (
        <div className="pointer-events-auto" style={{ marginRight: 10, visibility: originalVisible ? undefined : "hidden" }}>
          <CtrlIcon name="original" enabled={originalEnabled ?? true} onHold={onOriginal} />
        </div>
      )}
    </div>
  );
}

/** Two-depth bottom title bar: 52dp, X / title / mint check. */
export function TitleBar({ title, onClose, onConfirm, children }: { title?: ReactNode; onClose?: () => void; onConfirm?: () => void; children?: ReactNode }) {
  return (
    <div className="absolute inset-x-0 bottom-0 flex items-center bg-black" style={{ height: 52 }}>
      {onClose ? (
        <button type="button" aria-label="Close" onClick={onClose} className="flex flex-none items-center justify-center" style={{ width: 52, height: 52 }}>
          <Img name="icon_edit_title_close" size={52} />
        </button>
      ) : <span style={{ width: 52 }} />}
      <div className="flex min-w-0 flex-1 items-center justify-center text-white" style={{ fontSize: 15, lineHeight: "18px" }}>
        {children ?? title}
      </div>
      {onConfirm ? (
        <button type="button" aria-label="Confirm" onClick={onConfirm} className="flex flex-none items-center justify-center" style={{ width: 52, height: 52 }}>
          <Tint name="icon_edit_title_confirm" size={52} color={PRIMARY} />
        </button>
      ) : <span style={{ width: 52 }} />}
    </div>
  );
}

/** Text tab inside a title bar (edit_title_selector). */
export function TitleTab({ label, selected, onClick, style }: { label: string; selected: boolean; onClick: () => void; style?: CSSProperties }) {
  return (
    <button type="button" onClick={onClick} style={{ fontSize: 15, color: selected ? "#ffffff" : WHITE60, ...style }}>{label}</button>
  );
}

/* ------------------------------------------------------------------ EditSeekBar */

export interface SeekProps {
  value: number; min?: number; max?: number; def?: number;
  onChange: (v: number) => void; onRelease?: (v: number) => void;
  disabled?: boolean; level?: boolean;
  /** bidirectional display (-100..100) */
  duplex?: boolean;
  gradient?: string[];
  style?: CSSProperties;
  /** custom bubble text */
  format?: (v: number) => string;
  flashKey?: unknown;
}

/** EditSeekBar: 2dp track (#66FFFFFF off / white on), 9.5dp thumb, 2.25dp default mark, 21dp level bubble. */
export function EditSeekBar({ value, min = 0, max = 1, def = min, onChange, onRelease, disabled, level = true, duplex, gradient, style, format, flashKey }: SeekProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);
  const [bubble, setBubble] = useState(false);
  const hideT = useRef<number | undefined>(undefined);
  const latest = useRef(value);
  const isDuplex = duplex ?? Math.abs(min) === Math.abs(max);
  const p = (value - min) / (max - min || 1);
  const dp = (def - min) / (max - min || 1);
  const showBubble = () => {
    setBubble(true);
    window.clearTimeout(hideT.current);
  };
  const hideBubble = () => { window.clearTimeout(hideT.current); hideT.current = window.setTimeout(() => setBubble(false), 500); };
  useEffect(() => {
    if (flashKey === undefined || !level) return;
    const t1 = window.setTimeout(() => { setBubble(true); hideT.current = window.setTimeout(() => setBubble(false), 500); }, 0);
    return () => { window.clearTimeout(t1); window.clearTimeout(hideT.current); };
  }, [flashKey, level]);
  const valueAt = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const inset = 11.5;
    let q = (clientX - r.left - inset) / Math.max(1, r.width - inset * 2);
    q = Math.min(1, Math.max(0, q));
    // magnet snap to the default value
    if (Math.abs(q - dp) < (isDuplex ? 0.0075 * 2 : 0.015)) q = dp;
    return min + q * (max - min);
  };
  const text = format ? format(value) : String(Math.round((isDuplex ? (p - 0.5) * 2 : p) * 100));
  const onA = isDuplex ? Math.min(0.5, p) : 0, onB = isDuplex ? Math.max(0.5, p) : p;
  return (
    <div
      ref={ref}
      className="relative flex-1"
      style={{ height: 23, padding: "10px 0", boxSizing: "content-box", touchAction: "none", opacity: disabled ? 77 / 255 : 1, pointerEvents: disabled ? "none" : undefined, ...style }}
      onPointerDown={(e) => {
        if (disabled) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setDrag(true); showBubble();
        const v = valueAt(e.clientX); latest.current = v; onChange(v);
      }}
      onPointerMove={(e) => { if (!drag) return; const v = valueAt(e.clientX); latest.current = v; onChange(v); }}
      onPointerUp={() => { if (!drag) return; setDrag(false); hideBubble(); onRelease?.(latest.current); }}
      onPointerCancel={() => { setDrag(false); hideBubble(); onRelease?.(latest.current); }}
    >
      <div className="absolute" style={{ left: 11.5, right: 11.5, top: "50%", height: 2, marginTop: -1, boxShadow: "0 0 2px rgba(0,0,0,0.3)", background: gradient ? `linear-gradient(90deg, ${gradient.join(",")})` : "rgba(255,255,255,0.4)" }}>
        {!gradient && <div className="absolute inset-y-0 bg-white" style={{ left: `${onA * 100}%`, width: `${(onB - onA) * 100}%` }} />}
        <div className="absolute rounded-full bg-white" style={{ width: 4.5, height: 4.5, top: -1.25, left: `calc(${dp * 100}% - 2.25px)`, boxShadow: "0 0 2px rgba(0,0,0,0.3)" }} />
        <div className="absolute rounded-full bg-white" style={{ width: 19, height: 19, top: -8.5, left: `calc(${p * 100}% - 9.5px)`, boxShadow: "0 0 2px rgba(0,0,0,0.3)" }} />
        {level && (
          <div
            className="pointer-events-none absolute flex items-center justify-center rounded-full bg-white font-bold"
            style={{ width: 42, height: 42, left: `calc(${p * 100}% - 21px)`, bottom: 1 + 9.5 + 10, fontSize: 13, color: "#222222", boxShadow: "0 0 2px rgba(0,0,0,0.3)", opacity: bubble ? 1 : 0, transition: bubble ? "none" : "opacity 300ms" }}
          >
            {text}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ colour chip (EditColorView) */

/** 32dp disc; selected = 2dp transparent gap ring cut out 2dp from the edge. */
export function ColorChip({ color, selected, onClick, size = 32, darkOutline, children, style }: { color: string; selected?: boolean; onClick?: () => void; size?: number; darkOutline?: boolean; children?: ReactNode; style?: CSSProperties }) {
  return (
    <button type="button" onClick={onClick} className="relative flex flex-none items-center justify-center rounded-full" style={{ width: size, height: size, ...style }}>
      {selected ? (
        <>
          <span className="absolute inset-0 rounded-full" style={{ border: `2px solid ${color}` }} />
          <span className="absolute rounded-full" style={{ inset: 4, background: color }} />
        </>
      ) : (
        <span className="absolute inset-0 rounded-full" style={{ background: color, boxShadow: darkOutline ? "inset 0 0 0 1px #6f6f6f" : undefined }} />
      )}
      {children}
    </button>
  );
}

/** Thumbnail item (55x73, label 18dp, selected overlay = colour at alpha 230 + check). */
export function ThumbItem({ label, bg, text = "#ffffff", icon, iconNode, selected, onClick, none }: {
  label: string; bg: string; text?: string; icon?: string; iconNode?: ReactNode; selected?: boolean; onClick?: () => void; none?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} className="relative flex flex-none flex-col overflow-hidden" style={{ width: 55, height: 73, borderRadius: 3, background: "rgba(0,0,0,0.6)" }}>
      <div className="flex flex-1 items-start justify-center" style={{ background: bg }}>
        {none ? <Img name="icon_thumbnail_none" size={30} style={{ marginTop: 16 }} /> : iconNode ?? (icon && <img src={d(icon)} alt="" className="h-full w-full object-contain" draggable={false} />)}
      </div>
      <div className="truncate px-0.5 text-center" style={{ height: 18, lineHeight: "18px", fontSize: 10, background: bg, color: text }}>{label}</div>
      {selected && (
        <div className="absolute inset-0 flex justify-center" style={{ background: hexAlpha(bg, 230 / 255) }}>
          <Img name="icon_thumbnail_confirm" size={30} style={{ marginTop: 16 }} />
        </div>
      )}
    </button>
  );
}

export function hexAlpha(hex: string, a: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/* ------------------------------------------------------------------ toast / tooltip / dialog */

/** toast_edit_tooltip.xml: 13dp white, minHeight 36, padding 15/5, r18 #99000000. */
export function Toast({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 z-[60] flex justify-center" style={{ top: "38%" }}>
      <div className="whitespace-pre-line text-center text-white" style={{ fontSize: 13, minHeight: 36, padding: "9px 15px", borderRadius: 18, background: "rgba(0,0,0,0.6)", maxWidth: "calc(100% - 120px)" }}>
        {text}
      </div>
    </div>
  );
}

export function useToast(): [string | null, (t: string) => void] {
  const [text, setText] = useState<string | null>(null);
  const t = useRef<number | undefined>(undefined);
  const show = (s: string) => {
    setText(s);
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => setText(null), 2000);
  };
  return [text, show];
}

export function AlertDialog({ message, cancel, ok, onCancel, onOk }: { message: string; cancel: string; ok: string; onCancel: () => void; onOk: () => void }) {
  // back on a cancelable AlertDialog = cancel
  useBackHandler(onCancel);
  return (
    <div className="absolute inset-0 z-[80] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onCancel}>
      <div className="bg-white" style={{ width: 280, borderRadius: 8, padding: "24px 24px 8px" }} onClick={(e) => e.stopPropagation()}>
        <p style={{ fontSize: 16, lineHeight: "22px", color: "#222222" }}>{message}</p>
        <div className="flex justify-end" style={{ marginTop: 20, gap: 8 }}>
          <button type="button" onClick={onCancel} style={{ height: 36, padding: "0 8px", fontSize: 14, color: "#b1b9be" }}>{cancel}</button>
          <button type="button" onClick={onOk} style={{ height: 36, padding: "0 8px", fontSize: 14, color: PRIMARY }}>{ok}</button>
        </div>
      </div>
    </div>
  );
}

/** Network-error / empty state used by server-only panels. */
export function EmptyState({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
      <p className="whitespace-pre-line" style={{ fontSize: 13, lineHeight: "18px", color: WHITE60 }}>{text}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="text-white" style={{ marginTop: 12, height: 31, padding: "0 14px", borderRadius: 16, fontSize: 13, background: "rgba(255,255,255,0.15)" }}>Retry</button>
      )}
    </div>
  );
}
