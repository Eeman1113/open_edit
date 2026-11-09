// Filter catalogue used by the camera, the photo editor and the video editor. The looks are defined in
// src/data/filters.ts and baked by scripts/gen-luts.mjs into lookup tables of the asset pack (kind "filter",
// id = key) plus preview swatches (kind "filter-thumb").
import { getAsset } from "@/lib/assets";
import { FILTER_DEFS, type FilterGroup } from "@/data/filters";

export type { FilterGroup } from "@/data/filters";

export interface LocalFilter {
  key: string;
  /** Numeric id (deep links: /?filter=<id>). */
  id: number;
  name: string;
  /** Preview swatch URL (asset pack). */
  thumb?: string;
  /** Lookup table asset id (kind "filter"); undefined = no colour grade. */
  lut?: string;
  /** Optional rear-camera variant of the table. */
  backLut?: string;
  /** Default strength with the front camera. */
  strength: number;
  /** Default strength with the rear camera. */
  backStrength: number;
  group: FilterGroup;
  /** Shown in the camera strip on a fresh install (the inventory can hide or show any filter). */
  defaultBookmark: boolean;
  /** Default strength in the photo / video editor (defaults to `strength`). */
  galleryStrength?: number;
}

/** Key of the pass-through filter. */
export const ORIGINAL_KEY = "ORIGINAL";

const thumb = (id: string) => getAsset("filter-thumb", id) || undefined;

export const LOCAL_FILTERS: LocalFilter[] = [
  { key: ORIGINAL_KEY, id: 0, name: "Original", thumb: thumb("original"), strength: 1, backStrength: 1, group: "none", defaultBookmark: true, galleryStrength: 0 },
  ...FILTER_DEFS.map((d): LocalFilter => ({
    key: d.key, id: d.id, name: d.name, thumb: thumb(d.key), lut: d.key,
    strength: d.strength, backStrength: d.strength, group: d.group, defaultBookmark: true,
  })),
];

/** Filter strip categories. */
export const FILTER_CATEGORY = { FAVORITE: 1, BASIC: 2, SELFIE: 3 } as const;

/** Camera strip order. */
export const CAMERA_BASIC_ORDER: readonly string[] = LOCAL_FILTERS.map((f) => f.key);
/** Photo / video editor order. */
export const EDIT_BASIC_ORDER: readonly string[] = LOCAL_FILTERS.map((f) => f.key);

/** No favourites on a fresh install. */
export const DEFAULT_FAVORITES: readonly string[] = [];

/** Filter selected on first launch. */
export const DEFAULT_FILTER_KEY = "natural";

export function filterByKey(key: string): LocalFilter | undefined {
  return LOCAL_FILTERS.find((x) => x.key === key);
}

export function filterById(id: number): LocalFilter | undefined {
  return LOCAL_FILTERS.find((x) => x.id === id);
}

/** Lookup table asset id for a filter (the rear camera may use a variant). */
export function lutFor(filter: LocalFilter, isFront: boolean, inGallery = false): string | undefined {
  if (!filter.lut) return undefined;
  return !isFront && !inGallery && filter.backLut ? filter.backLut : filter.lut;
}

export function strengthFor(filter: LocalFilter, isFront: boolean): number {
  return isFront ? filter.strength : filter.backStrength;
}

/** Default strength in the editors. */
export function galleryStrengthFor(filter: LocalFilter): number {
  return filter.galleryStrength ?? filter.strength;
}

/** URL of a filter's lookup table. */
export const lutUrl = (lut: string) => getAsset("filter", lut);
