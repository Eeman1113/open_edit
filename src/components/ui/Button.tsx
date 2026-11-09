"use client";

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger" | "glass";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-on-accent",
  secondary: "bg-raised text-fg",
  ghost: "bg-transparent text-fg",
  danger: "bg-danger text-white",
  glass: "bg-glass text-white backdrop-blur-md",
};
const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-sm",
  md: "h-11 px-4 text-[15px] gap-2 rounded-md",
  lg: "h-13 px-6 text-[16px] gap-2 rounded-lg",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
  block?: boolean;
  loading?: boolean;
}

/** Text button. Primary = accent fill; use one primary per view. */
export function Button({ variant = "primary", size = "md", icon, iconRight, block, loading, className, children, disabled, ...rest }: ButtonProps) {
  const is = size === "sm" ? 16 : 18;
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "oe-press inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-semibold disabled:opacity-40",
        VARIANT[variant], SIZE[size], block && "w-full", className,
      )}
    >
      {loading ? <Spinner size={is} /> : icon && <Icon name={icon} size={is} stroke={2} />}
      {children}
      {iconRight && <Icon name={iconRight} size={is} stroke={2} />}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: IconName;
  /** Required accessible name. */
  label: string;
  size?: number;
  iconSize?: number;
  variant?: "plain" | "glass" | "raised" | "accent";
  active?: boolean;
  filled?: boolean;
  badge?: boolean;
  children?: ReactNode;
}

const IB: Record<NonNullable<IconButtonProps["variant"]>, string> = {
  plain: "text-current",
  glass: "bg-glass text-white backdrop-blur-md",
  raised: "bg-raised text-fg",
  accent: "bg-accent text-on-accent",
};

/** Round icon-only button with a ≥ 40 px hit target. */
export function IconButton({ icon, label, size = 40, iconSize, variant = "plain", active, filled, badge, className, style, children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cx("oe-press relative inline-flex shrink-0 items-center justify-center rounded-full disabled:opacity-40", IB[variant], active && variant === "plain" && "text-accent", className)}
      style={{ width: size, height: size, ...style }}
    >
      <Icon name={icon} size={iconSize ?? Math.round(size * 0.55)} filled={filled} />
      {badge && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent ring-2 ring-bg" />}
      {children}
    </button>
  );
}

export function Spinner({ size = 20, className, style }: { size?: number; className?: string; style?: CSSProperties }) {
  return <Icon name="loader" size={size} className={cx("oe-spin", className)} style={style} label="Loading" />;
}
