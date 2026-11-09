"use client";

// Feed image lookup (client only: the asset-pack store is a client module).
import { getAsset, hasAsset } from "@/lib/assets";
import { asset } from "@/lib/base";
import type { GroupItemDto } from "./types";

/**
 * Image URL for a feed reference: an absolute URL, a path under public/, a cdnPrefix-relative path, or an id in the
 * asset pack (kind "feed"). Unknown ids return undefined (the card then draws a gradient).
 */
export function img(item: Pick<GroupItemDto, "cdnPrefix">, ref: string | null | undefined): string | undefined {
  if (!ref) return undefined;
  if (/^(https?:|data:)/.test(ref)) return ref;
  if (ref.startsWith("/")) return asset(ref);
  if (item.cdnPrefix) return item.cdnPrefix + ref;
  return hasAsset("feed", ref) ? getAsset("feed", ref) : undefined;
}
