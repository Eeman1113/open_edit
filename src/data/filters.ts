// Open_Edit filter catalogue. Every look is an original colour grade defined in scripts/gen-luts.mjs, which bakes
// it into a 512x512 lookup PNG (asset kind "filter") and a preview swatch (kind "filter-thumb") in the asset pack.
// Plain data (no imports) so the generator can read it too.

export type FilterGroup = "none" | "everyday" | "film" | "mood" | "mono";

export interface FilterDef {
  /** Stable key, also the asset id of the lookup table and swatch. */
  key: string;
  /** Numeric id (deep links: /?filter=<id>). */
  id: number;
  name: string;
  group: FilterGroup;
  /** Default strength 0..1. */
  strength: number;
  /** One-line description of the grade (docs, accessibility). */
  about: string;
}

export const FILTER_DEFS: FilterDef[] = [
  { key: "natural", id: 1, name: "Natural", group: "everyday", strength: 0.6, about: "Gentle contrast and a touch of vibrance." },
  { key: "clean", id: 2, name: "Clean", group: "everyday", strength: 0.7, about: "Crisp, slightly cool and bright." },
  { key: "bright", id: 3, name: "Bright", group: "everyday", strength: 0.7, about: "Lifted exposure with soft highlights." },
  { key: "peach", id: 4, name: "Peach", group: "everyday", strength: 0.7, about: "Warm peach highlights, soft pink skin." },
  { key: "cream", id: 5, name: "Cream", group: "everyday", strength: 0.7, about: "Creamy, low-contrast warm white." },
  { key: "mint", id: 6, name: "Mint", group: "everyday", strength: 0.7, about: "Fresh green-cyan shadows, clean whites." },
  { key: "warm-film", id: 7, name: "Warm Film", group: "film", strength: 0.8, about: "Amber cast, faded blacks, rolled-off highlights." },
  { key: "cool-matte", id: 8, name: "Cool Matte", group: "film", strength: 0.8, about: "Blue-grey matte with lifted shadows." },
  { key: "fade", id: 9, name: "Fade", group: "film", strength: 0.8, about: "Washed-out blacks and muted colour." },
  { key: "retro", id: 10, name: "Retro", group: "film", strength: 0.8, about: "Cross-processed greens and yellow highlights." },
  { key: "golden", id: 11, name: "Golden", group: "film", strength: 0.8, about: "Late-afternoon gold." },
  { key: "polaroid", id: 12, name: "Instant", group: "film", strength: 0.8, about: "Soft instant-print look with cyan shadows." },
  { key: "dusk", id: 13, name: "Dusk", group: "mood", strength: 0.8, about: "Violet shadows and orange highlights." },
  { key: "cinema", id: 14, name: "Cinema", group: "mood", strength: 0.75, about: "Teal shadows, warm skin, punchy contrast." },
  { key: "ocean", id: 15, name: "Ocean", group: "mood", strength: 0.8, about: "Deep teal-blue mood." },
  { key: "forest", id: 16, name: "Forest", group: "mood", strength: 0.8, about: "Rich greens, earthy shadows." },
  { key: "lilac", id: 17, name: "Lilac", group: "mood", strength: 0.75, about: "Pastel lavender wash." },
  { key: "rose", id: 18, name: "Rose", group: "mood", strength: 0.75, about: "Pink highlights and a soft glow." },
  { key: "mono", id: 19, name: "Mono", group: "mono", strength: 1, about: "Neutral black and white." },
  { key: "noir", id: 20, name: "Noir", group: "mono", strength: 1, about: "High-contrast black and white." },
  { key: "silver", id: 21, name: "Silver", group: "mono", strength: 1, about: "Soft silver-toned monochrome." },
  { key: "sepia", id: 22, name: "Sepia", group: "mono", strength: 0.9, about: "Warm brown-toned monochrome." },
];
