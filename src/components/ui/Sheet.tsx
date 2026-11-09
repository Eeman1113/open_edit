"use client";

// Sheet (bottom drawer) and Dialog (centred modal). Both close on scrim tap and on the hardware/browser back key.
import { useEffect, useState, type ReactNode } from "react";
import { useBackHandler } from "@/lib/back";
import { Button, cx } from "./Button";
import { Icon } from "./Icon";

/** Mount → animate in; `open=false` → animate out → unmount. */
function usePresence(open: boolean, ms = 220) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mount before the enter transition
      setMounted(true);
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(r);
    }
    setShown(false);
    const t = window.setTimeout(() => setMounted(false), ms);
    return () => window.clearTimeout(t);
  }, [open, ms]);
  return { mounted, shown };
}

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** Right side of the header (e.g. a Done button). */
  action?: ReactNode;
  children: ReactNode;
  /** Full height (a page that slides up) instead of content height. */
  full?: boolean;
  className?: string;
  /** z-index (default 60). */
  z?: number;
}

export function Sheet({ open, onClose, title, action, children, full, className, z = 60 }: SheetProps) {
  const { mounted, shown } = usePresence(open);
  useBackHandler(() => onClose(), open);
  if (!mounted) return null;
  return (
    <div className="absolute inset-0" style={{ zIndex: z }}>
      <div className="absolute inset-0 bg-scrim transition-opacity duration-200" style={{ opacity: shown ? 1 : 0 }} onClick={onClose} />
      <div
        role="dialog"
        aria-modal
        className={cx("absolute inset-x-0 bottom-0 flex flex-col rounded-t-xl bg-panel shadow-2xl", full ? "top-3" : "max-h-[88%]", className)}
        style={{ transform: shown ? "none" : "translateY(100%)", transition: "transform 220ms var(--oe-ease)" }}
      >
        <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-muted" />
        {(title || action) && (
          <div className="flex h-12 shrink-0 items-center gap-2 px-4">
            <div className="min-w-0 flex-1 truncate font-display text-[17px] font-semibold">{title}</div>
            {action ?? (
              <button type="button" aria-label="Close" onClick={onClose} className="oe-press -mr-1 flex h-9 w-9 items-center justify-center rounded-full bg-raised text-fg-2">
                <Icon name="close" size={18} />
              </button>
            )}
          </div>
        )}
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-[max(16px,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children?: ReactNode;
  /** Confirm button text; omitted = message-only dialog with a single "OK". */
  confirm?: string;
  cancel?: string;
  destructive?: boolean;
  onConfirm?: () => void;
  icon?: Parameters<typeof Icon>[0]["name"];
  z?: number;
}

export function Dialog({ open, onClose, title, children, confirm, cancel = "Cancel", destructive, onConfirm, icon, z = 80 }: DialogProps) {
  const { mounted, shown } = usePresence(open, 160);
  useBackHandler(() => onClose(), open);
  if (!mounted) return null;
  return (
    <div className="absolute inset-0 flex items-center justify-center px-8" style={{ zIndex: z }}>
      <div className="absolute inset-0 bg-scrim transition-opacity duration-150" style={{ opacity: shown ? 1 : 0 }} onClick={onClose} />
      <div
        role="alertdialog"
        aria-modal
        className="relative w-full max-w-[320px] rounded-lg bg-panel p-5 shadow-2xl"
        style={{ opacity: shown ? 1 : 0, transform: shown ? "none" : "scale(.96)", transition: "opacity 150ms, transform 150ms var(--oe-ease)" }}
      >
        {icon && (
          <div className={cx("mb-3 flex h-11 w-11 items-center justify-center rounded-full", destructive ? "bg-danger/15 text-danger" : "bg-accent-soft text-accent")}>
            <Icon name={icon} size={22} />
          </div>
        )}
        {title && <h2 className="font-display text-[18px] font-semibold leading-snug">{title}</h2>}
        {children && <div className="mt-2 text-[14px] leading-relaxed text-fg-2">{children}</div>}
        <div className="mt-5 flex flex-col gap-2">
          {confirm ? (
            <>
              <Button variant={destructive ? "danger" : "primary"} block onClick={() => { onConfirm?.(); onClose(); }}>{confirm}</Button>
              <Button variant="ghost" block onClick={onClose}>{cancel}</Button>
            </>
          ) : (
            <Button block onClick={onClose}>OK</Button>
          )}
        </div>
      </div>
    </div>
  );
}
