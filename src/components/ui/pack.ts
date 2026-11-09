"use client";


// UI-side view of the active asset pack (src/lib/assets): brand marks, illustrations, icon overrides and the theme
// override. All UI lookups of replaceable art go through these helpers, never through hard-coded paths.
import { getAsset, hasAsset } from "@/lib/assets";

/** URL of a brand asset (ids: mark, mark-mono, wordmark, icon, icon-maskable, icon-192, icon-512, icon-maskable-512,
 * apple-touch-icon, favicon, favicon-32, favicon-ico). */
export const brandUrl = (id: string): string => getAsset("brand", id);

/** URL of an illustration (empty states, hero art), or undefined when the pack has none. */
export const illustrationUrl = (id: string): string | undefined => (hasAsset("illustration", id) ? getAsset("illustration", id) : undefined);

/**
 * Pack override for an icon id. A pack registers `icon/<name>` (drawn as a mask, follows currentColor) or
 * `icon/<name>@color` (drawn as-is). Returns null when the built-in glyph should be used.
 */
export function packIconUrl(name: string): { url: string; color: boolean } | null {
  if (hasAsset("icon", `${name}@color`)) return { url: getAsset("icon", `${name}@color`), color: true };
  if (hasAsset("icon", name)) return { url: getAsset("icon", name), color: false };
  return null;
}

/** Optional pack stylesheet that redefines --oe-* theme variables (kind "theme", id "tokens"). */
export const themeOverrideUrl = (): string | undefined => (hasAsset("theme", "tokens") ? getAsset("theme", "tokens") : undefined);
