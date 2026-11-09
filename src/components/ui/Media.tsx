"use client";

// Brand marks and media helpers.
import type { CSSProperties, ReactNode } from "react";
import { asset } from "@/lib/base";
import { cx } from "./Button";
import { brandUrl } from "./pack";

/** The Open_Edit mark (from the active pack). */
export function Logo({ size = 32, className, mono }: { size?: number; className?: string; mono?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={brandUrl(mono ? "mark-mono" : "mark")} alt="" width={size} height={size} className={cx("shrink-0", className)} draggable={false} />;
}

/** Name treatment: the mark plus "open_edit" set in the display face, the underscore in the accent. */
export function Wordmark({ size = 22, className, mark = true }: { size?: number; className?: string; mark?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-[0.35em] font-display font-bold tracking-[-0.03em]", className)} style={{ fontSize: size }} aria-label="Open_Edit">
      {mark && <Logo size={Math.round(size * 1.25)} />}
      <span aria-hidden>open<span className="text-accent">_</span>edit</span>
    </span>
  );
}

/**
 * Resolves a content image reference to a URL. Content may carry a URL ("/content/x.jpg", "https://…", "data:…")
 * or a bare id that the active pack does not provide; bare ids return undefined so callers draw a <Swatch/>.
 */
export function mediaSrc(ref: string | null | undefined): string | undefined {
  if (!ref) return undefined;
  if (/^(https?:|data:|blob:)/.test(ref)) return ref;
  if (ref.startsWith("/")) return asset(ref);
  return undefined;
}

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/** Deterministic two-tone gradient for items without artwork (seeded by any string). */
export function swatchBg(seed: string): string {
  const h = hash(seed);
  const a = h % 360, b = (a + 40 + ((h >> 9) % 80)) % 360;
  return `linear-gradient(135deg, hsl(${a} 55% 46%), hsl(${b} 60% 30%))`;
}

/** Image if the reference resolves, else a seeded gradient with an optional label. */
export function Thumb({ src, seed, label, className, style, fit = "cover", children, alt = "" }: {
  src?: string | null; seed: string; label?: ReactNode; className?: string; style?: CSSProperties; fit?: "cover" | "contain"; children?: ReactNode; alt?: string;
}) {
  const url = mediaSrc(src);
  return (
    <span className={cx("relative block overflow-hidden bg-muted", className)} style={{ background: url ? undefined : swatchBg(seed), ...style }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt={alt} draggable={false} className="absolute inset-0 h-full w-full" style={{ objectFit: fit }} />}
      {!url && label && <span className="absolute inset-0 flex items-center justify-center p-1 text-center font-display text-[13px] font-bold text-white/90">{label}</span>}
      {children}
    </span>
  );
}
