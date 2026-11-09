// Content provider adapter interface. A provider supplies one or more content catalogues; the API layer calls the
// method for the requested catalogue, validates the result and falls back to the built-in local catalogue when the
// provider is not configured, fails or times out. Register new adapters in ./index.ts.
import "server-only";
import type { ArtStyle, CatalogItem, FeedName, LookKind, Track } from "@/lib/content/types";
import type { RemoteStickerCategory } from "@/lib/content/validate";
import type { ProviderConfig } from "../env";

export interface CatalogQuery {
  /** Search text (validated, at most 64 characters, may be empty). */
  q: string;
  limit: number;
  offset: number;
  /** Abort signal carrying the provider timeout. */
  signal?: AbortSignal;
}

export interface ContentProvider {
  /** Adapter id, for logs and the X-OE-Source header. */
  readonly name: string;
  music?(q: CatalogQuery): Promise<Track[]>;
  artStyles?(q: CatalogQuery): Promise<ArtStyle[]>;
  looks?(kind: LookKind, q: CatalogQuery): Promise<CatalogItem[]>;
  stickers?(q: CatalogQuery): Promise<RemoteStickerCategory[]>;
  templates?(q: CatalogQuery): Promise<CatalogItem[]>;
  feed?(name: FeedName, q: CatalogQuery): Promise<unknown>;
}

/** Builds a provider from its env configuration. */
export type ProviderFactory = (cfg: ProviderConfig) => ContentProvider;
