// Fonts of the active asset pack (kind "font", OFL-1.1, see scripts/gen-fonts.mjs), loaded on demand with the
// FontFace API. CSS family names are prefixed so they never collide with installed system fonts.
import { getAsset, getAssetMeta, listAssets } from "@/lib/assets";

export interface PackFont {
  id: string;
  /** Display name. */
  label: string;
  /** CSS font-family name registered by loadPackFonts(). */
  family: string;
  /** Weight or weight range ("400", "100 900"). */
  weight: string;
}

const SYSTEM = "-apple-system, 'Helvetica Neue', Arial, sans-serif";

export function packFonts(): PackFont[] {
  return listAssets("font").map((id) => {
    const m = getAssetMeta<{ family?: string; weight?: string }>("font", id) ?? {};
    return { id, label: m.family ?? id, family: `OE ${m.family ?? id}`, weight: m.weight ?? "400" };
  });
}

/** CSS font stack for a pack font id (falls back to the system font). */
export const fontStack = (id: string) => {
  const f = packFonts().find((x) => x.id === id);
  return f ? `'${f.family}', ${SYSTEM}` : SYSTEM;
};

let loading: Promise<void> | null = null;
/** Registers every pack font with document.fonts (resolves when loaded or failed; never rejects). */
export function loadPackFonts(): Promise<void> {
  loading ??= Promise.all(packFonts().map((f) =>
    new FontFace(f.family, `url(${getAsset("font", f.id)}) format("woff2")`, { weight: f.weight, display: "swap" }).load()
      .then((ff) => { document.fonts.add(ff); }).catch(() => undefined))).then(() => undefined);
  return loading;
}
