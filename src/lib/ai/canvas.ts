// Small canvas helpers shared by the AI ops (main thread).
export type Src = HTMLCanvasElement;

export function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}

export function ctx2d(c: HTMLCanvasElement) {
  return c.getContext("2d", { willReadFrequently: true })!;
}

/** Draws `src` (or a sub-rect of it) into a new w x h canvas. */
export function resized(src: CanvasImageSource, w: number, h: number, sx = 0, sy = 0, sw?: number, sh?: number) {
  const c = canvas(w, h);
  const g = ctx2d(c);
  g.imageSmoothingQuality = "high";
  const s = src as { width: number; height: number };
  g.drawImage(src, sx, sy, sw ?? s.width, sh ?? s.height, 0, 0, c.width, c.height);
  return c;
}

export function pixels(c: HTMLCanvasElement) {
  return ctx2d(c).getImageData(0, 0, c.width, c.height).data;
}

export function fromRgba(rgba: Uint8ClampedArray, w: number, h: number) {
  const c = canvas(w, h);
  ctx2d(c).putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer as ArrayBuffer, rgba.byteOffset, rgba.length), w, h), 0, 0);
  return c;
}

/** Copy of `rgba` as a transferable Uint8ClampedArray. */
export function rgbaOf(c: HTMLCanvasElement) {
  return new Uint8ClampedArray(pixels(c));
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const smoothstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
