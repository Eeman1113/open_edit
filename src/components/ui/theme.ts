// Open_Edit theme: the ONE place where visual tokens live (colours, fonts, radii, spacing, motion).
//
// The values are emitted as CSS custom properties (`--oe-*`) by <ThemeStyle/> in the root layout, and Tailwind maps
// them to utilities in globals.css (`bg-panel`, `text-fg-2`, `rounded-lg`, `font-display`, ...). An asset pack can
// restyle the app without code changes by shipping a `theme` asset (a CSS file that redefines any `--oe-*` variable);
// the layout loads it after these defaults. JS that draws on a canvas reads the same values through `TOKENS`.

export const TOKENS = {
  color: {
    /** App background (behind every screen). */
    bg: "#0B0C0F",
    /** Cards, sheets, list groups. */
    panel: "#15171C",
    /** Raised controls on a panel (inputs, chips, segmented tracks). */
    raised: "#1F2229",
    /** Pressed / hovered raised surface, thumbnails placeholders. */
    muted: "#2A2E37",
    /** Hairlines and dividers. */
    line: "rgba(255,255,255,0.08)",
    /** Primary text and icons. */
    fg: "#F4F5F7",
    /** Secondary text. */
    fg2: "#A6ACB8",
    /** Tertiary text, disabled icons. */
    fg3: "#6C7280",
    /** Brand accent ("Sodium"): primary actions, selection, active tab. */
    accent: "#FFB020",
    /** Text / icons drawn on the accent. */
    onAccent: "#1A1200",
    /** Softer accent fill for selected chips and tracks. */
    accentSoft: "rgba(255,176,32,0.16)",
    /** Informational / link colour ("Cobalt"). */
    info: "#5B8CFF",
    /** Positive state. */
    ok: "#3DD68C",
    /** Destructive actions and the recording indicator. */
    danger: "#FF5A5F",
    /** Translucent chrome over the live camera / photos. */
    glass: "rgba(11,12,15,0.56)",
    /** Scrim behind dialogs and sheets. */
    scrim: "rgba(0,0,0,0.6)",
  },
  font: {
    sans: '"Inter Variable", Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
    display: '"Space Grotesk Variable", "Space Grotesk", "Inter Variable", ui-sans-serif, system-ui, sans-serif',
  },
  /** Corner radii (px). */
  radius: { xs: 6, sm: 10, md: 14, lg: 20, xl: 28 },
  /** 4 px spacing scale; components use multiples of `space.unit`. */
  space: { unit: 4, gutter: 16 },
  /** Fixed chrome sizes (px). */
  size: { topBar: 52, bottomNav: 64, tap: 44 },
  motion: { fast: "120ms", base: "200ms", slow: "320ms", ease: "cubic-bezier(.2,.8,.2,1)" },
} as const;

export type Tokens = typeof TOKENS;

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/** `:root { --oe-*: ... }` for the given tokens. */
export function themeCss(t: Tokens = TOKENS): string {
  const v: string[] = [];
  for (const [k, val] of Object.entries(t.color)) v.push(`--oe-${kebab(k)}:${val}`);
  for (const [k, val] of Object.entries(t.font)) v.push(`--oe-font-${k}:${val}`);
  for (const [k, val] of Object.entries(t.radius)) v.push(`--oe-r-${k}:${val}px`);
  v.push(`--oe-gutter:${t.space.gutter}px`);
  for (const [k, val] of Object.entries(t.size)) v.push(`--oe-${kebab(k)}:${val}px`);
  for (const [k, val] of Object.entries(t.motion)) v.push(`--oe-${k}:${val}`);
  return `:root{${v.join(";")}}`;
}
