// Client for the optional hairstyle service (`/api/ai/hair`). New hairstyles need a generative model that doesn't run
// on the device, so the route proxies an online provider configured on the server. With no provider (or no route,
// e.g. static hosting) the AI Hair page offers only its on-device tools and says so.
//
// Contract:
//   GET  /api/ai/hair  → { available: boolean, provider?: string, styles: { id, name, thumb? }[] }
//   POST /api/ai/hair  multipart: image (JPEG, long side ≤ 1024), style (id)  → the restyled photo (image/jpeg or png)
import { asset } from "@/lib/base";
import { apiJson } from "@/lib/content/api";

export interface HairStyle { id: string; name: string; thumb?: string }
export interface HairServiceInfo { available: boolean; provider?: string; styles: HairStyle[] }

export const NO_SERVICE: HairServiceInfo = { available: false, styles: [] };
const URL_PATH = "/api/ai/hair";

const safeThumb = (t: unknown) => (typeof t === "string" && (t.startsWith("/") || t.startsWith("https://")) ? t : undefined);

function clean(j: unknown): HairServiceInfo {
  if (!j || typeof j !== "object") return NO_SERVICE;
  const o = j as Record<string, unknown>;
  const styles = Array.isArray(o.styles)
    ? o.styles.flatMap((s): HairStyle[] => {
      if (!s || typeof s !== "object") return [];
      const r = s as Record<string, unknown>;
      return typeof r.id === "string" && typeof r.name === "string" ? [{ id: r.id, name: r.name.slice(0, 40), thumb: safeThumb(r.thumb) }] : [];
    }).slice(0, 60)
    : [];
  return { available: o.available === true && styles.length > 0, provider: typeof o.provider === "string" ? o.provider.slice(0, 60) : undefined, styles };
}

/** What the server offers. Never throws: anything unexpected means "not available". */
export async function hairService(signal?: AbortSignal): Promise<HairServiceInfo> {
  try {
    return clean(await apiJson(URL_PATH, { signal })); // static hosting: the snapshot says "not available"
  } catch {
    return NO_SERVICE;
  }
}

/** Sends the photo to the configured provider and returns the restyled photo. */
export async function generateHairstyle(photo: HTMLCanvasElement, style: string, signal?: AbortSignal): Promise<Blob> {
  const k = Math.min(1, 1024 / Math.max(photo.width, photo.height));
  const c = document.createElement("canvas");
  c.width = Math.round(photo.width * k); c.height = Math.round(photo.height * k);
  c.getContext("2d")!.drawImage(photo, 0, 0, c.width, c.height);
  const jpeg = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", 0.92));
  const body = new FormData();
  body.set("image", jpeg, "photo.jpg");
  body.set("style", style);
  const r = await fetch(asset(URL_PATH), { method: "POST", body, signal });
  const type = r.headers.get("content-type") ?? "";
  if (!r.ok || !type.startsWith("image/")) throw new Error(`hair service ${r.status}`);
  return r.blob();
}
