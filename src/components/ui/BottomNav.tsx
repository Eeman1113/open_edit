"use client";

// Bottom navigation: Home · Discover · [Camera] · AI · Me. The camera tab is a raised accent button in the middle.
// Re-tapping the active tab fires NAV_RESELECT (screens scroll back to the top).
import Link from "next/link";
import { cx } from "./Button";
import { Icon, type IconName } from "./Icon";

export type NavTab = "home" | "discover" | "camera" | "ai" | "me";
export const NAV_RESELECT = "oe:nav-reselect";

const TABS: { id: NavTab; href: string; icon: IconName; label: string }[] = [
  { id: "home", href: "/home", icon: "home", label: "Home" },
  { id: "discover", href: "/discover", icon: "discover", label: "Discover" },
  { id: "camera", href: "/", icon: "camera", label: "Camera" },
  { id: "ai", href: "/ai", icon: "ai", label: "AI tools" },
  { id: "me", href: "/my", icon: "me", label: "Me" },
];

/** `tone="overlay"` is used over the live camera: no fill, white glyphs with a soft shadow. */
export function BottomNav({ active, tone = "solid" }: { active: NavTab; tone?: "solid" | "overlay" }) {
  const overlay = tone === "overlay";
  return (
    <nav
      aria-label="Main"
      className={cx("absolute inset-x-0 bottom-0 z-40 flex items-stretch justify-around px-2", overlay ? "bg-gradient-to-t from-black/45 to-transparent" : "border-t border-line bg-bg/92 backdrop-blur-xl")}
      style={{ height: "var(--oe-bottom-nav)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {TABS.map((t) => {
        const on = t.id === active;
        const onClick = (e: React.MouseEvent) => {
          if (!on) return;
          e.preventDefault();
          window.dispatchEvent(new CustomEvent(NAV_RESELECT, { detail: t.id }));
        };
        if (t.id === "camera") {
          return (
            <Link key={t.id} href={t.href} onClick={onClick} aria-label={t.label} aria-current={on ? "page" : undefined} className="oe-press flex w-16 items-center justify-center">
              <span className={cx("flex h-11 w-11 items-center justify-center rounded-md", on ? "bg-fg text-bg" : "bg-accent text-on-accent shadow-[0_4px_14px_rgba(255,176,32,.35)]")}>
                <Icon name="camera" size={22} stroke={2} />
              </span>
            </Link>
          );
        }
        return (
          <Link
            key={t.id}
            href={t.href}
            onClick={onClick}
            aria-current={on ? "page" : undefined}
            className={cx(
              "flex w-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
              on ? (overlay ? "text-white" : "text-accent") : overlay ? "text-white/70" : "text-fg-3",
              overlay && "[filter:drop-shadow(0_0_2px_rgba(0,0,0,.5))]",
            )}
          >
            <Icon name={t.icon} size={22} stroke={on ? 2.1 : 1.75} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
