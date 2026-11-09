// Skin tone presets. scripts/gen-luts.mjs turns each into two lookup tables (asset kind "table"):
// `skintone-<key>-skin` pulls skin hues toward `target`, `skintone-<key>-bg` is the matching gentle grade for the
// rest of the frame. Plain data (no imports) so the generator can read it too.

export interface SkinToneDef {
  key: string;
  label: string;
  /** Swatch colour (UI). */
  color: string;
  /** Skin colour the skin table moves toward (hue + saturation; lightness is shifted by `light`). */
  target: string;
  /** Lightness shift of skin, -1..1. */
  light: number;
  /** White-balance nudge for the background table, -1 (cool) .. 1 (warm). */
  bgTemp: number;
}

export const SKIN_TONE_DEFS: SkinToneDef[] = [
  { key: "fair", label: "Fair", color: "#F2D3C2", target: "#F0CDB8", light: 0.35, bgTemp: -0.15 },
  { key: "rosy", label: "Rosy", color: "#EDB5A8", target: "#E9A99A", light: 0.15, bgTemp: -0.05 },
  { key: "golden", label: "Golden", color: "#E2B184", target: "#DDA772", light: 0.05, bgTemp: 0.2 },
  { key: "tan", label: "Tan", color: "#B57C57", target: "#B07450", light: -0.2, bgTemp: 0.25 },
  { key: "deep", label: "Deep", color: "#6E4330", target: "#714330", light: -0.45, bgTemp: 0.1 },
];
