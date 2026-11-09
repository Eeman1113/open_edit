"use client";

// Likes, follows, blocks and recent searches for Discover. Stored only in this browser (anonymous session).
import { useSyncExternalStore } from "react";

interface UgcState {
  likes: Record<string, boolean>;
  follows: Record<string, boolean>;
  recents: { kind: "post" | "tag"; id: string }[];
  /** Locally hidden creators. */
  blocks?: Record<string, boolean>;
  /** Follow suggestion: likes counted so far (capped at 11) and whether it was accepted. */
  followPopupLikeCount?: number;
  followPopupDone?: boolean;
}

const KEY = "oe.discover";
const EMPTY: UgcState = { likes: {}, follows: {}, recents: [] };
let cache: UgcState | null = null;
const listeners = new Set<() => void>();

function read(): UgcState {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<UgcState>) } : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function write(next: UgcState) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: keep in memory */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      l();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export function useUgc(): UgcState {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** Effective like state: local override, else the server value. */
export const isLiked = (s: UgcState, postId: string, server: boolean) => s.likes[postId] ?? server;
/** Like count adjusted by the local like state. */
export const likeCountOf = (s: UgcState, postId: string, server: boolean, count: number) => {
  const l = isLiked(s, postId, server);
  return count + (l && !server ? 1 : !l && server ? -1 : 0);
};

export function setLike(postId: string, like: boolean) {
  const s = read();
  write({ ...s, likes: { ...s.likes, [postId]: like } });
}

export function setFollow(userId: string, follow: boolean) {
  const s = read();
  write({ ...s, follows: { ...s.follows, [userId]: follow } });
}

const MAX_RECENT = 4;

export function addRecent(kind: "post" | "tag", id: string) {
  const s = read();
  const rest = s.recents.filter((r) => !(r.kind === kind && r.id === id));
  write({ ...s, recents: [{ kind, id }, ...rest].slice(0, MAX_RECENT) });
}

export function removeRecent(kind: "post" | "tag", id: string) {
  const s = read();
  write({ ...s, recents: s.recents.filter((r) => !(r.kind === kind && r.id === id)) });
}

export function clearRecents() {
  const s = read();
  write({ ...s, recents: [] });
}

export function setBlocked(userId: string) {
  const s = read();
  write({ ...s, blocks: { ...(s.blocks ?? {}), [userId]: true } });
}

/* ---------------------------------------------------------------- follow suggestion */

export interface FollowPopupPost {
  userId: string;
  username: string;
  profileImage: string;
}
type Popup = { kind: "ask" | "done"; post: FollowPopupPost } | null;
let popup: Popup = null;
const popupListeners = new Set<() => void>();
const emitPopup = (p: Popup) => {
  popup = p;
  popupListeners.forEach((l) => l());
};
export function useFollowPopup(): Popup {
  return useSyncExternalStore(
    (l) => {
      popupListeners.add(l);
      return () => popupListeners.delete(l);
    },
    () => popup,
    () => null,
  );
}
export const closeFollowPopup = () => emitPopup(null);

/**
 * After a like (not an unlike): on the 3rd and the 10th like, suggest following the creator, unless a suggestion was
 * already accepted.
 */
export function onLikedForFollowPopup(post: FollowPopupPost) {
  const s = read();
  if (s.followPopupDone) return;
  const n = (s.followPopupLikeCount ?? 0) + 1;
  if (n <= 11) write({ ...s, followPopupLikeCount: n });
  if (n > 10) return;
  if (n === 3 || n === 10) emitPopup({ kind: "ask", post });
}

/** Suggestion accepted: follow and stop suggesting. */
export function confirmFollowPopup(post: FollowPopupPost) {
  const s = read();
  write({ ...s, follows: { ...s.follows, [post.userId]: true }, followPopupDone: true });
  emitPopup({ kind: "done", post });
}

/** Like toggle plus the follow suggestion. */
export function toggleLike(post: { id: string; author: { id: string; name: string; profileImage: string } }, like: boolean) {
  setLike(post.id, like);
  if (like) onLikedForFollowPopup({ userId: post.author.id, username: post.author.name, profileImage: post.author.profileImage });
}
