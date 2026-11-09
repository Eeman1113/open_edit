"use client";

// Loads the active asset pack's theme override (kind "theme", id "tokens": a CSS file redefining --oe-* variables)
// after the default tokens, so a pack can restyle the app without code changes.
import { useAssetPack } from "@/lib/assets";
import { themeOverrideUrl } from "./pack";

export function PackTheme() {
  useAssetPack();
  const href = themeOverrideUrl();
  return href ? <link rel="stylesheet" href={href} precedence="high" /> : null;
}
