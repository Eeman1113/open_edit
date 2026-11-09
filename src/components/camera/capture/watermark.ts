// Optional "made with Open_Edit" watermark (Settings → Watermark). Drawn in the bottom-right corner of photos and
// recorded video frames: the brand mark from the active asset pack plus the name in the display face.
import { brandUrl } from "@/components/ui/pack";
import { TOKENS } from "@/components/ui/theme";
import { SETTINGS, getSetting } from "@/lib/settings";

export const WATERMARK_SETTING = SETTINGS.watermark;

let cached: Promise<HTMLImageElement> | null = null;
export function loadWatermark(): Promise<HTMLImageElement> {
  if (!cached) {
    cached = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = brandUrl("mark");
    });
    cached.catch(() => (cached = null));
  }
  return cached;
}

export const watermarkEnabled = () => getSetting<boolean>(WATERMARK_SETTING, false);

/** Draws the watermark into a w×h context (photo or video frame). */
export function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number, img: HTMLImageElement) {
  const u = Math.min(w, h) / 360; // one design pixel on a 360-wide reference frame
  const mark = 18 * u, pad = 10 * u, gap = 4 * u;
  ctx.save();
  ctx.font = `700 ${12 * u}px ${TOKENS.font.display}`;
  ctx.textBaseline = "middle";
  const label = "open_edit";
  const tw = ctx.measureText(label).width;
  const x = w - pad - tw, cy = h - pad - mark / 2;
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 3 * u;
  ctx.globalAlpha = 0.9;
  ctx.drawImage(img, x - gap - mark, cy - mark / 2, mark, mark);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(label, x, cy);
  ctx.restore();
}

/** Returns the photo with the watermark applied when the setting is on (otherwise the same blob). */
export async function maybeWatermarkPhoto(blob: Blob): Promise<Blob> {
  if (!watermarkEnabled()) return blob;
  const [bmp, img] = await Promise.all([createImageBitmap(blob), loadWatermark()]);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  drawWatermark(ctx, c.width, c.height, img);
  return new Promise<Blob>((res) => c.toBlob((b) => res(b ?? blob), "image/jpeg", 0.95));
}
