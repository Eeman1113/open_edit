// Asset pack manifest types. A pack is a folder under public/packs/<id>/ with a manifest.json that maps
// (kind, id) -> file. Every replaceable asset (filter tables, makeup and sticker art, brushes, collage layouts,
// demo content, fonts, icons, brand marks...) is looked up through it, never by a hard-coded path.

/**
 * Asset kinds. The list is open: a pack may add new kinds (the string fallback keeps it extensible), and code that
 * does not know a kind simply never asks for it.
 */
export type AssetKind =
  | "filter"          // 512x512 colour lookup PNG (8x8 tiles of 64 levels)
  | "filter-thumb"    // filter preview swatch
  | "table"           // engine lookup tables / textures (whitening, skin tone, grain noise...)
  | "makeup"          // makeup art drawn in canonical face UV space
  | "sticker"         // sticker folder (path ends with "/"), meta = sticker definition
  | "sticker-thumb"   // sticker preview
  | "brush"           // brush tip (white shape, alpha = coverage)
  | "collage"         // collage layout sets (JSON)
  | "feed"            // demo feed artwork (home / discover)
  | "video"           // sample video clips (meta.poster = poster image id)
  | "font"            // OFL fonts (meta.family, meta.weight)
  | "icon"            // UI icons (design system)
  | "brand"           // logo and brand marks (design system)
  | "root"            // folder roots, e.g. root/stickers
  | (string & {});

export interface AssetEntry {
  /** File path relative to the pack folder (folders end with "/"). */
  path: string;
  /** MIME type when it cannot be inferred from the extension. */
  type?: string;
  /** SPDX licence id when it differs from the pack licence (e.g. "OFL-1.1" for fonts). */
  license?: string;
  /** Free-form data for the consumer (display name, default strength, sticker definition...). */
  meta?: Record<string, unknown>;
}

export interface AssetManifest {
  /** Pack id = folder name under public/packs/. */
  name: string;
  title?: string;
  version?: number;
  /** Default licence of the files in this pack. */
  license?: string;
  /** kind -> id -> entry. */
  kinds: Record<string, Record<string, AssetEntry>>;
}
