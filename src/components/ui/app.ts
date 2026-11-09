"use client";

// App-level helpers shared by screens: navigation back, the gallery change event, and the anonymous-session reset.
import { useRouter } from "next/navigation";

/** Fired on window whenever the local gallery changes (save / import / delete). */
export { PHOTOS_EVENT } from "@/lib/store";

/** Go back in history, or to `fallback` when the screen was opened directly. */
export function useGoBack(fallback = "/") {
  const router = useRouter();
  return () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.replace(fallback);
  };
}

/**
 * Open_Edit has no accounts: every visitor is an anonymous local session. This wipes everything the app stored in
 * this browser (gallery in IndexedDB, settings and history in local/session storage, cached models) and reloads,
 * which starts a brand-new session.
 */
export async function clearLocalData(): Promise<void> {
  try { localStorage.clear(); } catch { /* storage blocked */ }
  try { sessionStorage.clear(); } catch { /* storage blocked */ }
  try {
    const dbs = (await indexedDB.databases?.()) ?? [];
    await Promise.all(dbs.map((d) => d.name && new Promise<void>((res) => {
      const req = indexedDB.deleteDatabase(d.name!);
      req.onsuccess = req.onerror = req.onblocked = () => res();
    })));
  } catch { /* IndexedDB unavailable */ }
  try {
    if ("caches" in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
  } catch { /* Cache API unavailable */ }
  window.location.replace(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/`);
}
