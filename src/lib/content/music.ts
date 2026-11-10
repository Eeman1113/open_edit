// Music catalogue for the client: the content API (/api/music) first, then the active asset pack's built-in
// tracks (kind "music") when the API is unreachable (e.g. static hosting). Used by every music picker.
import { getAsset, getAssetMeta, listAssets } from "@/lib/assets";
import { apiJson } from "./api";
import type { Track } from "./types";
import { cleanTracks } from "./validate";

/** Built-in tracks from the asset pack. */
export function packTracks(): Track[] {
  return listAssets("music").flatMap((id) => {
    const m = getAssetMeta<{ title?: string; artist?: string; mood?: string; bpm?: number; duration?: number }>("music", id) ?? {};
    const url = getAsset("music", id);
    return url ? [{ id, title: m.title ?? id, artist: m.artist, mood: m.mood, bpm: m.bpm, duration: m.duration, url }] : [];
  });
}

let cache: Promise<Track[]> | null = null;
/** All tracks (cached for the page's lifetime; `fresh` refetches). */
export function loadMusic(fresh = false): Promise<Track[]> {
  if (!cache || fresh) {
    cache = apiJson("/api/music")
      .then((j: unknown) => cleanTracks(j, window.location.href))
      .then((t) => (t.length ? t : packTracks()), () => packTracks());
  }
  return cache;
}

/** A track by id (for playback of a previously chosen track). */
export const findTrack = async (id: string | null | undefined) => (id ? (await loadMusic()).find((t) => t.id === id) : undefined);
