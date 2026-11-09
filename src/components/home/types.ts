// Shape of the Home feed content (src/data/home.json, or a content API returning the same JSON):
// response → sections (items[].groups) → cards (group.items).

export type GroupType =
  | "HOME_BANNER"
  | "BANNER"
  | "BIG_BANNER"
  | "ADVANCED"
  | "BUTTON"
  | "EFFECT"
  | "FILTER"
  | "MAKEUP"
  | "DECORATED"
  | "PURCHASE"
  | "HYBRID"
  | "TOP_CHART"
  | "SHORTCUT"
  | "OFFERWALL_BANNER"
  | "ADROP_SDK_BANNER"
  | "NONE";

export type ThumbnailRatioType = "RATIO_2_TO_3" | "RATIO_7_TO_4" | "RATIO_1_TO_1" | "RATIO_15_TO_7";

export interface ItemProperty {
  actionUrl: string | null;
  shareUrl: string | null;
  vip: boolean;
  paid: boolean;
  newBadge: boolean;
  showVipType: string | null;
  useCount: number | null;
}

export interface GroupItemDto {
  cdnPrefix: string;
  id: number;
  badgeColor: string | null;
  title: string;
  subTitle: string;
  type: string;
  textColor: string | null;
  backgroundColor: string | null;
  iconImage: string | null;
  thumbnail: string | null;
  beforeThumbnail: string | null;
  thumbnailRatio: number | null;
  tag: string | null;
  series: string | null;
  hasItemEnd: boolean;
  categoryText: string | null;
  purchaseSubType: string | null;
  itemProperty: ItemProperty;
  /** Linked content; [0].thumbnail (with a contentId) is a small icon of the filter / effect the card applies. */
  itemBridges: { contentId?: number; thumbnail?: string | null }[];
  itemEnd: unknown;
}

export interface GroupDto {
  id: number;
  title: string;
  subTitle: string;
  subImage: string | null;
  type: GroupType | string;
  purchaseSubType: string | null;
  row: number;
  scroll: boolean;
  chartSize: number;
  rank: boolean;
  thumbnailRatioType: ThumbnailRatioType | string | null;
  showVipType: string | null;
  showUseCount: boolean;
  experimentDetail: unknown;
  items: GroupItemDto[];
}

export interface OverviewResponse {
  result: {
    cdnPrefix: string;
    items: { id: number; positionType: string; experimentDetail: unknown; groups: GroupDto[] }[];
  };
}
