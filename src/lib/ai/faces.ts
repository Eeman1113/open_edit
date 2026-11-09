// Face boxes + person / hair / skin masks for a still photo, via the face engine (MediaPipe, src/lib/face).
import type { FaceTracker } from "@/lib/face";
import { canvas, ctx2d, type Src } from "./canvas";
import type { FaceBox } from "./enhance";

let trackerP: Promise<FaceTracker> | null = null;
function tracker() {
  trackerP ??= (async () => {
    const { FaceTracker } = await import("@/lib/face");
    return FaceTracker.create({ mode: "IMAGE", maxFaces: 5, smoothing: false, segmentLongSide: 512 });
  })().catch((e) => { trackerP = null; throw e; });
  return trackerP;
}

export interface PhotoFaces {
  faces: FaceBox[];
  /** alpha = mask, source-normalized (stretch over the photo). null when the segmenter failed. */
  hair: HTMLCanvasElement | null;
  faceSkin: HTMLCanvasElement | null;
  person: HTMLCanvasElement | null;
}

const cache = new WeakMap<object, Promise<PhotoFaces>>();

function channel(data: Uint8Array, w: number, h: number, ch: number) {
  const c = canvas(w, h);
  const img = new ImageData(w, h);
  for (let i = 0; i < w * h; i++) { img.data[i * 4] = 255; img.data[i * 4 + 1] = 255; img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = data[i * 4 + ch]; }
  ctx2d(c).putImageData(img, 0, 0);
  return c;
}

/** Faces and masks for `src` (cached per canvas; the first call loads the face model and the 16 MB segmenter). */
export function photoFaces(src: Src): Promise<PhotoFaces> {
  let p = cache.get(src);
  if (!p) {
    p = (async () => {
      const t = await tracker();
      const faces = t.detect(src).map((f) => {
        let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
        for (let i = 0; i < f.points.length; i += 3) {
          const x = f.points[i], y = f.points[i + 1];
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      });
      let hair: HTMLCanvasElement | null = null, faceSkin: HTMLCanvasElement | null = null, person: HTMLCanvasElement | null = null;
      {
        try {
          await t.ensureSegmenter();
          const m = t.segment(src);
          if (m) {
            person = channel(m.data, m.width, m.height, 0);
            hair = channel(m.data, m.width, m.height, 1);
            faceSkin = channel(m.data, m.width, m.height, 3);
          }
        } catch { /* masks optional */ }
      }
      return { faces, hair, faceSkin, person };
    })();
    p.catch(() => cache.delete(src));
    cache.set(src, p);
  }
  return p;
}
