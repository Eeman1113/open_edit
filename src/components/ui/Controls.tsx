"use client";

// Small controls: Switch, Chip, ListRow / ListGroup, TopBar, Badge-like helpers.
import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./Button";
import { Icon, type IconName } from "./Icon";
import { useBackHandler } from "@/lib/back";

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      className={cx("relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-40", checked ? "bg-accent" : "bg-muted")}
    >
      <span
        className="absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200"
        style={{ left: 4, transform: checked ? "translateX(20px)" : "none" }}
      />
    </button>
  );
}

export function Chip({ selected, onClick, icon, children, tone = "default", className }: {
  selected?: boolean; onClick?: () => void; icon?: IconName; children: ReactNode; tone?: "default" | "overlay"; className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        "oe-press inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-medium transition-colors",
        selected ? "bg-fg text-bg" : tone === "overlay" ? "bg-glass text-white backdrop-blur-md" : "bg-raised text-fg-2",
        className,
      )}
    >
      {icon && <Icon name={icon} size={15} stroke={2} />}
      {children}
    </button>
  );
}

export interface ListRowProps {
  icon?: IconName;
  /** Accent tint for the leading icon tile. */
  iconTone?: "default" | "accent" | "danger" | "info";
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-side value text. */
  value?: ReactNode;
  /** Right-side control (Switch etc.); suppresses the chevron. */
  trailing?: ReactNode;
  href?: string;
  onClick?: () => void;
  /** Show a chevron (default: when href/onClick and no trailing). */
  chevron?: boolean;
  danger?: boolean;
  external?: boolean;
}

const TONE = { default: "bg-raised text-fg-2", accent: "bg-accent-soft text-accent", danger: "bg-danger/15 text-danger", info: "bg-info/15 text-info" };

export function ListRow({ icon, iconTone = "default", title, subtitle, value, trailing, href, onClick, chevron, danger, external }: ListRowProps) {
  const body = (
    <>
      {icon && (
        <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-sm", TONE[danger ? "danger" : iconTone])}>
          <Icon name={icon} size={19} />
        </span>
      )}
      <span className="min-w-0 flex-1 py-3">
        <span className={cx("block text-[15px] leading-snug", danger ? "text-danger" : "text-fg")}>{title}</span>
        {subtitle && <span className="mt-0.5 block text-[13px] leading-snug text-fg-3">{subtitle}</span>}
      </span>
      {value !== undefined && <span className="shrink-0 text-[14px] text-fg-3">{value}</span>}
      {trailing}
      {!trailing && (chevron ?? !!(href || onClick)) && <Icon name={external ? "external" : "chevron-right"} size={18} className="shrink-0 text-fg-3" />}
    </>
  );
  const cls = "flex w-full min-h-14 items-center gap-3 px-4 text-left transition-colors active:bg-raised";
  if (href) {
    return external
      ? <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{body}</a>
      : <Link href={href} className={cls}>{body}</Link>;
  }
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{body}</button>;
  return <div className={cls}>{body}</div>;
}

/** Rounded group of ListRows with hairlines between them. */
export function ListGroup({ title, footer, children }: { title?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className="px-4 pt-5">
      {title && <h3 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-3">{title}</h3>}
      <div className="overflow-hidden rounded-lg bg-panel [&>*+*]:border-t [&>*+*]:border-line">{children}</div>
      {footer && <p className="mt-2 px-1 text-[12px] leading-relaxed text-fg-3">{footer}</p>}
    </section>
  );
}

/** Screen header: back button, title, optional actions. `large` puts a big title under the bar. */
export function TopBar({ title, onBack, actions, large, transparent, className }: {
  title?: ReactNode; onBack?: () => void; actions?: ReactNode; large?: boolean; transparent?: boolean; className?: string;
}) {
  // the back key (Escape) does what the back button does; sheets and dialogs opened on the page close first
  useBackHandler(() => onBack?.(), !!onBack);
  return (
    <header className={cx("relative z-10 shrink-0", !transparent && "bg-bg", className)}>
      <div className="flex items-center gap-1 px-2" style={{ height: "var(--oe-top-bar)", paddingTop: "env(safe-area-inset-top)" }}>
        {onBack ? (
          <button type="button" aria-label="Back" onClick={onBack} className="oe-press flex h-10 w-10 items-center justify-center rounded-full">
            <Icon name="back" size={26} />
          </button>
        ) : <span className="w-2" />}
        <div className={cx("min-w-0 flex-1 truncate font-display text-[17px] font-semibold", large && "opacity-0")}>{!large && title}</div>
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      </div>
      {large && <h1 className="px-4 pb-2 font-display text-[30px] font-bold leading-tight tracking-tight">{title}</h1>}
    </header>
  );
}

/** Full-screen page scaffold: column with a header and a scrolling body. */
export function Screen({ children, className, bottomNav }: { children: ReactNode; className?: string; bottomNav?: boolean }) {
  return (
    <div className={cx("absolute inset-0 flex flex-col bg-bg text-fg", className)} style={bottomNav ? { paddingBottom: "var(--oe-bottom-nav)" } : undefined}>
      {children}
    </div>
  );
}

export function ScrollBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain", className)}>{children}</div>;
}

/** Centred empty / error state. */
export function EmptyState({ icon = "empty", title, body, action }: { icon?: IconName; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-10 py-12 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-raised text-fg-2"><Icon name={icon} size={26} /></span>
      <p className="font-display text-[17px] font-semibold">{title}</p>
      {body && <p className="mt-1.5 text-[14px] leading-relaxed text-fg-3">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
