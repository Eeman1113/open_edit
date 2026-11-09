// Pure helpers for the Home feed (shared by the server route pages and client components).
import type { GroupDto, GroupItemDto } from "./types";


/** Small icon of the content the card applies (first linked item with a thumbnail). */
export function bridgeThumb(item: Pick<GroupItemDto, "itemBridges">): string | undefined {
  const b = item.itemBridges?.[0];
  if (!b || b.contentId === undefined || b.contentId === -1 || !b.thumbnail) return undefined;
  return b.thumbnail;
}

/** 1234 → "1.2k", 1_500_000 → "1.5M". */
export function compactCount(n: number): string {
  if (n <= 0) return "";
  if (n < 1000) return String(n);
  const units: [number, string][] = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "k"]];
  for (const [u, s] of units) if (n >= u) { const v = n / u; return `${v >= 100 ? Math.floor(v) : Math.floor(v * 10) / 10}${s}`; }
  return String(n);
}

/** "Used 1.2k times", or "" when the section hides counts. */
export function usedTimes(group: GroupDto, item: GroupItemDto) {
  const s = compactCount(group.showUseCount ? (item.itemProperty.useCount ?? 0) : 0);
  return s ? `${s} uses` : "";
}

export const itemHasTitle = (it: GroupItemDto) => !!it.title && it.title !== "untitled";

export type CardShape = "portrait" | "wide" | "square" | "banner";
/** Card shape for a section's ratio code. */
export function cardShape(code: string | null | undefined): CardShape {
  switch (code) {
    case "2:3": case "RATIO_2_TO_3": return "portrait";
    case "7:4": case "RATIO_7_TO_4": return "wide";
    case "15:7": case "RATIO_15_TO_7": return "banner";
    default: return "square";
  }
}

/** Sections that have a "See all" page. */
export function hasAllPage(g: GroupDto): boolean {
  if (g.type === "EFFECT" || g.type === "FILTER") return true;
  if (g.type === "TOP_CHART") return g.chartSize < g.items.length;
  if (g.type === "HYBRID") return ["portrait", "wide"].includes(cardShape(g.thumbnailRatioType));
  return false;
}
