// Response shapes of the content API (src/app/api/**). Shared by the route handlers, the provider adapters and the
// client components, so this file must stay free of server-only imports.

/** A music track (GET /api/music → { tracks }). `url` is absolute or site-relative. */
export interface Track {
  id: string;
  title: string;
  artist?: string;
  url: string;
  /** Seconds. */
  duration?: number;
  mood?: string;
  bpm?: number;
  cover?: string;
}

/** One step of an art style. Styles are applied on the device, so a provider can only combine these operations. */
export type ArtOp =
  | { op: "smooth"; radius: number }
  | { op: "posterize"; levels: number }
  | { op: "saturate"; amount: number }
  | { op: "contrast"; amount: number }
  | { op: "brightness"; amount: number }
  | { op: "edges"; strength: number; threshold?: number; color?: string }
  | { op: "sketch"; strength?: number }
  | { op: "duotone"; dark: string; light: string }
  | { op: "halftone"; cell: number; angle?: number }
  | { op: "grain"; amount: number }
  | { op: "paper"; color: string; amount: number };

export const ART_OPS = ["smooth", "posterize", "saturate", "contrast", "brightness", "edges", "sketch", "duotone", "halftone", "grain", "paper"] as const;

/** An art style (GET /api/aistyle → { styles }). */
export interface ArtStyle {
  id: string;
  name: string;
  about?: string;
  thumbnail?: string;
  ops: ArtOp[];
}

/** A generic catalogue entry (GET /api/looks/<kind>, GET /api/templates → { items }). */
export interface CatalogItem {
  id: string;
  name: string;
  thumbnail?: string;
  /** Which look-creator category the entry belongs to (search results mix kinds). */
  kind?: string;
  /** In-app route that opens or applies the entry. */
  href?: string;
  tags?: string[];
}

/** Look-creator categories accepted by /api/looks/<kind>. */
export const LOOK_KINDS = [
  "sticker", "accessory", "transform", "makeup", "filter", "effect", "cutout", "facepaint", "brush", "text", "beauty",
  "template", "templates", "music", "background", "adjust", "store",
] as const;
export type LookKind = (typeof LOOK_KINDS)[number];

/** Feeds accepted by /api/feed/<name>. */
export const FEED_NAMES = ["home", "discover"] as const;
export type FeedName = (typeof FEED_NAMES)[number];
