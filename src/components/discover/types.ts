// Discover content model (src/data/discover.json, or a content API returning the same JSON).
import data from "@/data/discover.json";

export interface DiscoverAuthor {
  id: string;
  name: string;
  profileImage: string;
  /** Verified creator badge. */
  creator: boolean;
}

export interface DiscoverPost {
  id: string;
  title: string;
  thumbnail: string;
  width: number;
  height: number;
  filterId: number;
  filterName: string;
  effectIcon: string;
  /** Custom call-to-action text; null = the default ("Try it"). */
  buttonText: string | null;
  author: DiscoverAuthor;
  likeCount: number;
  like: boolean;
  /** Tap opens the post page; otherwise it goes straight to the camera with the post's filter. */
  detailPage: boolean;
  type: "POSTING" | "STICKER" | "SCHEME";
  /** optional .mp4 media for the detail page */
  video?: string;
  /** Hashtags the post is listed under. */
  tags?: string[];
}

export interface DiscoverCreator extends DiscoverAuthor {
  followerCount: number;
  posts: string[];
}

export interface DiscoverCategory {
  id: number;
  name: string;
  type: "CONTENTS" | "CREATOR";
  posts?: DiscoverPost[];
  creators?: DiscoverCreator[];
}

export interface TrendKeyword {
  keyword: string;
  thumbnail: string;
}

export interface DiscoverTag {
  name: string;
  count: number;
}

/** External profile link in the demo data (not shown: Open_Edit has no social accounts). */
export interface ProfileSns {
  type: "INSTAGRAM" | "DOUYIN" | "XIAOHONGSHU";
  id: string;
  profileUrl: string;
}

export interface UserProfileExtra {
  biography: string;
  sns: ProfileSns | null;
  following: number;
}

export interface RelatedKeyword {
  keyword: string;
  thumbnail: string;
}


export const CATEGORIES = data.categories as DiscoverCategory[];
const PROFILES = (data as unknown as { profiles: Record<string, UserProfileExtra> }).profiles;
const RELATED = (data as unknown as { relatedKeywords: Record<string, RelatedKeyword[]> }).relatedKeywords;
export const TREND_KEYWORDS = data.trendKeywords as TrendKeyword[];
export const TAGS = data.tags as DiscoverTag[];

/** Every post across categories, de-duplicated by id. */
export const ALL_POSTS: DiscoverPost[] = (() => {
  const m = new Map<string, DiscoverPost>();
  for (const c of CATEGORIES) for (const p of c.posts ?? []) if (!m.has(p.id)) m.set(p.id, p);
  return [...m.values()];
})();

export const findPost = (id: string) => ALL_POSTS.find((p) => p.id === id);

/** Every post carrying the tag. */
export const postsByTag = (name: string) => ALL_POSTS.filter((p) => p.tags?.includes(name.toLowerCase()));

/** Related keywords for a query (at most 4). */
export const relatedKeywordsFor = (query: string): RelatedKeyword[] => (RELATED[query.trim().toLowerCase()] ?? []).slice(0, 4);

export const tagHref = (name: string) => `/discover/tag/${encodeURIComponent(name)}`;

export interface CreatorInfo extends DiscoverAuthor, UserProfileExtra {
  followerCount: number;
  posts: DiscoverPost[];
}

/** Creator profile assembled from the creators list and the posts they authored. */
export function findCreator(id: string): CreatorInfo | undefined {
  const posts = ALL_POSTS.filter((p) => p.author.id === id);
  const listed = CATEGORIES.flatMap((c) => c.creators ?? []).find((c) => c.id === id);
  const author = listed ?? posts[0]?.author;
  if (!author) return undefined;
  return {
    id: author.id,
    name: author.name,
    profileImage: author.profileImage,
    creator: author.creator,
    followerCount: listed?.followerCount ?? 0,
    posts,
    biography: PROFILES[author.id]?.biography ?? "",
    sns: PROFILES[author.id]?.sns ?? null,
    following: PROFILES[author.id]?.following ?? 0,
  };
}

/** 1234 → "1.2k". `zeroAsEmpty` returns "" for 0 (list like counts). */
export function formatCount(j: number, zeroAsEmpty = false): string {
  if (j <= 0) return zeroAsEmpty ? "" : "0";
  const one = (whole: number, frac: number, unit: string) => (frac === 0 ? `${whole}${unit}` : `${whole}.${frac}${unit}`);
  if (j < 1000) return String(j);
  if (j < 100000) return one(Math.floor(j / 1000), Math.floor((j % 1000) / 100), "k");
  if (j < 1000000) return `${Math.floor(j / 1000)}k`;
  if (j < 1e9) return one(Math.floor(j / 1e6), Math.floor((j % 1e6) / 1e5), "M");
  if (j < 1e12) return one(Math.floor(j / 1e9), Math.floor((j % 1e9) / 1e8), "B");
  return one(Math.floor(j / 1e12), Math.floor((j % 1e12) / 1e11), "T");
}

/** Post page, or straight to the camera with the post's filter. */
export const postHref = (p: DiscoverPost) => (p.detailPage ? `/discover/post/${encodeURIComponent(p.id)}` : cameraHref(p));
export const cameraHref = (p: DiscoverPost) => `/?filter=${p.filterId}`;
export const profileHref = (userId: string) => `/discover/profile/${encodeURIComponent(userId)}`;
