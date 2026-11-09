// Open_Edit app links: openedit://<page>?<params> (used by content cards, QR codes and shared links) → web routes.
//
//   openedit://camera?filter=<id>&sticker=<id>&beauty=<style>   camera with a filter / effect / beauty style
//   openedit://home | discover | ai | me                         a main tab
//   openedit://discover?post=<id> | ?user=<id> | ?search         a look, a creator, or search
//   openedit://ai?tool=<enhance|remove|generativefill|dslr|cutout|HAIRCOLOR>
//   openedit://gallery | collage | lens | studio | aistyle | qr | settings | notifications
//   openedit://shop?category=<id>                                the sticker shop
//   openedit://web?url=<https url>                               an external page (opened in the browser)
//   openedit://back                                              go back
// Plain in-app paths ("/discover") and https links are accepted too.

export type SchemeResult = { route: string } | { external: string } | { back: true };

export const APP_SCHEME = "openedit";

/** "a=b&c=d" → map with lower-cased keys and decoded values. */
export function parseParams(query: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of query.replace(/^\?/, "").split("&")) {
    if (!part) continue;
    const i = part.indexOf("=");
    const k = (i < 0 ? part : part.slice(0, i)).toLowerCase();
    let v = i < 0 ? "" : part.slice(i + 1);
    try { v = decodeURIComponent(v.replace(/\+/g, " ")); } catch { /* keep raw */ }
    out[k] = v;
  }
  return out;
}

const TABS: Record<string, string> = { home: "/home", discover: "/discover", camera: "/", ai: "/ai", me: "/my", my: "/my" };

function cameraRoute(p: Record<string, string>) {
  const q = new URLSearchParams();
  if (p.sticker) q.set("sticker", p.sticker);
  if (p.filter) q.set("filter", p.filter);
  if (p.beauty) q.set("beauty", p.beauty);
  const s = q.toString();
  return s ? `/?${s}` : "/";
}

function discoverRoute(p: Record<string, string>) {
  const post = p.post || p.sharepost;
  if (post) return `/discover/post/${encodeURIComponent(post)}`;
  const user = p.user || p.userpage;
  if (user) return `/discover/profile/${encodeURIComponent(user)}`;
  if ("search" in p) return "/discover/search";
  return "/discover";
}

const qs = (p: Record<string, string>) => { const s = new URLSearchParams(p).toString(); return s ? `?${s}` : ""; };

/** Resolve an app link (or a path / https URL) to a destination. */
export function resolveScheme(raw: string): SchemeResult {
  const link = raw.trim();
  const m = /^([a-z0-9+.-]+):\/\/([^?#]*)\??([^#]*)/i.exec(link);
  if (!m) return { route: link.startsWith("/") ? link : "/" };
  const prefix = m[1].toLowerCase();
  if (prefix === "http" || prefix === "https") {
    try {
      const u = new URL(link);
      if (typeof window !== "undefined" && u.origin === window.location.origin) return { route: u.pathname + u.search };
    } catch { /* fall through */ }
    return prefix === "https" ? { external: link } : { route: "/" };
  }
  if (prefix !== APP_SCHEME) return { route: "/" };

  const page = m[2].replace(/\/+$/, "").toLowerCase();
  const p = parseParams(m[3]);
  switch (page) {
    case "":
    case "camera":
      return { route: cameraRoute(p) };
    case "discover":
      return { route: discoverRoute(p) };
    case "ai":
      return { route: p.tool ? `/aimode?tool=${encodeURIComponent(p.tool)}` : "/ai" };
    case "gallery":
      return { route: "/gallery" };
    case "collage":
      return { route: "/gallery?mode=collage" };
    case "edit":
      return { route: p.id ? `/edit${qs(p)}` : "/gallery" };
    case "lens":
      return { route: "/lens" };
    case "studio":
      return { route: p.id ? `/studio/detail${qs(p)}` : "/studio" };
    case "aistyle":
      return { route: `/aistyle${qs(p)}` };
    case "qr":
      return { route: "/discover/qr" };
    case "settings":
      return { route: "/settings" };
    case "notifications":
      return { route: "/settings/notification" };
    case "shop":
      return { route: `/stamp-shop${p.category ? `?category=${encodeURIComponent(p.category)}` : ""}` };
    case "web": {
      const url = p.url ?? "";
      return /^https:\/\//i.test(url) ? { route: `/settings/web?${new URLSearchParams({ url, title: p.title ?? "" })}` } : { route: "/" };
    }
    case "back":
      return { back: true };
    default:
      return { route: TABS[page] ?? "/" };
  }
}
