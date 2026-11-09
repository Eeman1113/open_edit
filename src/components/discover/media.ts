"use client";

// Content image lookup for Discover (client only: the asset-pack store is a client module).
import { getAsset, hasAsset } from "@/lib/assets";
import { asset } from "@/lib/base";

/** Media URL for a content reference: a URL, a path under public/, or an id in the asset pack (kind "feed"). */
export const media = (ref: string | null | undefined): string | undefined => {
  if (!ref) return undefined;
  if (/^(https?:|data:)/.test(ref)) return ref;
  if (ref.startsWith("/")) return asset(ref);
  return hasAsset("feed", ref) ? getAsset("feed", ref) : undefined;
};
