// Edit render pipeline: base image -> WebGL (beauty, LUT filter, tone, adjust) -> 2D composite (border + layers).
import { fontStack, loadPackFonts, packFonts } from "@/lib/fonts";
import { getAsset } from "@/lib/assets";
import { LOCAL_FILTERS, lutFor } from "@/lib/filters";
import { Renderer, type RenderParams } from "@/lib/gl/renderer";
import { exportFaceStage, faceStageSource } from "./tools/portrait/faceEngine";
import { SKIN_TONES, toEditAdjust, type Doc, type Layer, type LayerAdjust, type Stroke, type TextStyle } from "./model";

/** Beauty smoothing spacing is in source texels: render every size at the same nominal long side. */
const NOMINAL = 1280;
const nominal = (w: number, h: number): [number, number] => {
  const k = NOMINAL / Math.max(w, h);
  return [w * k, h * k];
};

export function renderParams(doc: Doc): RenderParams {
  const f = LOCAL_FILTERS.find((x) => x.key === doc.filter.key);
  const s = doc.filter.strength;
  let lut: string | undefined, intensity = 0;
  const extraSmooth = 0, extraWhiten = 0, sharpen = 0;
  if (f && f.lut) { lut = lutFor(f, true, true); intensity = s; }
  const b = doc.beauty;
  const edit = toEditAdjust(doc);
  edit.clarity = Math.max(-1, Math.min(1, edit.clarity + b.clear));
  edit.sharpen = Math.min(1, edit.sharpen + sharpen);
  return {
    lut, intensity,
    smooth: Math.min(1, b.smooth + b.smoother * 0.6 + extraSmooth),
    whiten: 0,
    tone: { coolWarm: b.coolWarm, tanLight: Math.max(-1, Math.min(1, b.tanLight + extraWhiten)), skinTone: b.skinTone, skinToneValue: b.skinToneValue },
    edit,
  };
}

/* ------------------------------------------------------------------ frame / border geometry */

export interface FrameGeo { fw: number; fh: number; px: number; py: number; pw: number; ph: number }

/** Border: the frame takes the target ratio and covers the photo, which is drawn contain-fit and centred. */
export function frameGeo(pw: number, ph: number, doc: Doc): FrameGeo {
  const r = doc.border.ratio;
  if (!r || !doc.border.fill) return { fw: pw, fh: ph, px: 0, py: 0, pw, ph };
  const ratio = r[0] === 0 ? pw / ph : r[0] / r[1];
  let fw = pw, fh = ph;
  if (ratio > pw / ph) fw = ph * ratio; else fh = pw / ratio;
  fw = Math.round(fw); fh = Math.round(fh);
  return { fw, fh, px: (fw - pw) / 2, py: (fh - ph) / 2, pw, ph };
}

/* ------------------------------------------------------------------ images / fonts */

const images = new Map<string, HTMLImageElement>();
export function stampImage(src: string, onLoad?: () => void): HTMLImageElement | null {
  let img = images.get(src);
  if (!img) {
    img = new Image();
    img.onload = () => onLoad?.();
    img.src = src;
    images.set(src, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

/** Text fonts: "Default" (system font) followed by the asset pack's fonts (src/lib/fonts.ts). */
export function loadFonts(): Promise<void> {
  return loadPackFonts();
}
const SYSTEM = "-apple-system, 'Helvetica Neue', Arial, sans-serif";
export const FONTS = [
  { id: "default", label: "Default", css: SYSTEM },
  ...packFonts().map((f) => ({ id: f.id, label: f.label, css: fontStack(f.id) })),
];

/* ------------------------------------------------------------------ text raster */

const TEXT_PX = 160; // raster font size; layout sizes below are in units of 1/24 of it
export function rasterText(st: TextStyle): HTMLCanvasElement {
  const unit = TEXT_PX / 24; // layout unit
  const font = `${TEXT_PX}px ${FONTS.find((f) => f.id === st.font)?.css ?? FONTS[0].css}`;
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  ctx.font = font;
  const lines = (st.text || " ").split("\n");
  const letter = st.letter * TEXT_PX;
  const width = (s: string) => ctx.measureText(s).width + Math.max(0, s.length - 1) * letter;
  const lw = lines.map(width);
  const lineH = TEXT_PX * 1.17 * (1 + st.line);
  const strokeW = st.stroke ? TEXT_PX * st.strokeV * 0.4 : 0;
  const sh = st.shadow ? 2 * unit * st.shadowV : 0;
  const padX = 2 * unit + strokeW, padY = 1 * unit + strokeW;
  const tw = Math.max(...lw), th = lineH * lines.length;
  c.width = Math.ceil(tw + padX * 2 + sh * 3);
  c.height = Math.ceil(th + padY * 2 + sh * 3);
  ctx.font = font;
  ctx.textBaseline = "middle";
  if (st.bg) {
    ctx.globalAlpha = st.bgV;
    ctx.fillStyle = st.bg;
    ctx.beginPath();
    ctx.roundRect(0, 0, tw + padX * 2, th + padY * 2, unit);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  const drawLine = (s: string, x: number, y: number, mode: "fill" | "stroke") => {
    if (!letter) { if (mode === "fill") ctx.fillText(s, x, y); else ctx.strokeText(s, x, y); return; }
    let cx = x;
    for (const ch of s) {
      if (mode === "fill") ctx.fillText(ch, cx, y); else ctx.strokeText(ch, cx, y);
      cx += ctx.measureText(ch).width + letter;
    }
  };
  const pass = (mode: "fill" | "stroke") => lines.forEach((s, i) => {
    const x = padX + (st.align === "left" ? 0 : st.align === "right" ? tw - lw[i] : (tw - lw[i]) / 2);
    drawLine(s, x, padY + lineH * (i + 0.5), mode);
  });
  if (st.shadow) {
    ctx.shadowColor = st.shadow;
    ctx.shadowBlur = sh; ctx.shadowOffsetX = sh; ctx.shadowOffsetY = sh;
  }
  if (st.stroke && strokeW > 0) {
    ctx.strokeStyle = st.stroke; ctx.lineWidth = strokeW * 2; ctx.lineJoin = "round";
    pass("stroke");
    ctx.shadowColor = "transparent";
  }
  ctx.globalAlpha = st.colorAlpha;
  ctx.fillStyle = st.color;
  pass("fill");
  return c;
}

const textCache = new Map<string, HTMLCanvasElement>();
export function textCanvas(st: TextStyle) {
  const k = JSON.stringify(st);
  let c = textCache.get(k);
  if (!c) { c = rasterText(st); textCache.set(k, c); if (textCache.size > 40) textCache.delete(textCache.keys().next().value!); }
  return c;
}

/* ------------------------------------------------------------------ strokes */

/** Brush tips from the asset pack (kind "brush", generated by scripts/gen-brushes.mjs) used as dab textures. */
export const BRUSH_TEXTURES = ["round", "soft", "marker", "marker-soft", "neon", "dashed", "spray"] as const;
const brushTexUrl = (name: string) => getAsset("brush", name);
/** Decoded brush mask (null while loading; `onLoad` fires once it is ready). */
export function brushTexture(name: string, onLoad?: () => void): HTMLImageElement | null {
  return stampImage(brushTexUrl(name), onLoad);
}
export function loadBrushTextures(names: readonly string[] = BRUSH_TEXTURES): Promise<void> {
  return Promise.all(names.map((n) => new Promise<void>((res) => {
    const img = stampImage(brushTexUrl(n), () => res());
    if (img) res();
    else window.setTimeout(res, 4000);
  }))).then(() => undefined);
}
const strokeTextures = (s: Stroke) => [s.tex, s.outline].filter((t): t is string => !!t);

/** The mask's alpha filled with one colour (the engine multiplies the brush colour with the mask). */
const tintCache = new Map<string, HTMLCanvasElement>();
function tintedTexture(img: HTMLImageElement, name: string, color: string) {
  const k = `${name}|${color}`;
  let c = tintCache.get(k);
  if (!c) {
    c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext("2d")!;
    g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = "destination-in";
    g.drawImage(img, 0, 0);
    tintCache.set(k, c);
    if (tintCache.size > 80) tintCache.delete(tintCache.keys().next().value!);
  }
  return c;
}

/**
 * Stamp a texture along the stroke path (one dab every `interval * size`, rotated along the
 * path when useDirection). Dabs are drawn opaque into a scratch canvas so overlaps inside one stroke don't build up,
 * then the stroke is composited once.
 */
function dabStroke(ctx: CanvasRenderingContext2D, s: Stroke, w: number, h: number, tex: string, color: string, scale: number, alpha: number, op: GlobalCompositeOperation) {
  const img = brushTexture(tex);
  if (!img) return false;
  const t = tintedTexture(img, tex, color);
  const dw = Math.max(1, s.size * w * scale), dh = dw * (img.naturalHeight / img.naturalWidth);
  const pad = Math.max(dw, dh);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < s.pts.length; i += 2) {
    const x = s.pts[i] * w, y = s.pts[i + 1] * h;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  x0 = Math.floor(Math.max(0, x0 - pad)); y0 = Math.floor(Math.max(0, y0 - pad));
  x1 = Math.ceil(Math.min(w, x1 + pad)); y1 = Math.ceil(Math.min(h, y1 + pad));
  if (x1 <= x0 || y1 <= y0) return true;
  const sc = document.createElement("canvas");
  sc.width = x1 - x0; sc.height = y1 - y0;
  const g = sc.getContext("2d")!;
  const step = Math.max(1, (s.interval ?? 0.1) * dw);
  let ang = 0;
  const dab = (x: number, y: number) => {
    g.save();
    g.translate(x - x0, y - y0);
    if (s.rot) g.rotate(ang);
    g.drawImage(t, -dw / 2, -dh / 2, dw, dh);
    g.restore();
  };
  let px = s.pts[0] * w, py = s.pts[1] * h, carry = 0;
  if (s.pts.length >= 4) ang = Math.atan2(s.pts[3] * h - py, s.pts[2] * w - px);
  dab(px, py);
  for (let i = 2; i < s.pts.length; i += 2) {
    const x = s.pts[i] * w, y = s.pts[i + 1] * h;
    const dx = x - px, dy = y - py, len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    ang = Math.atan2(dy, dx);
    let d = step - carry;
    while (d <= len) { dab(px + (dx * d) / len, py + (dy * d) / len); d += step; }
    carry = len - (d - step);
    px = x; py = y;
  }
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.globalCompositeOperation = op;
  ctx.drawImage(sc, x0, y0);
  ctx.restore();
  return true;
}

/** Texture strokes are drawn once every texture they use is decoded (callers wait like stamp images). */
export function strokesReady(strokes: Stroke[], onLoad?: () => void) {
  let ok = true;
  for (const s of strokes) for (const t of strokeTextures(s)) if (!brushTexture(t, onLoad)) ok = false;
  return ok;
}

export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], w: number, h: number) {
  for (const s of strokes) {
    if (s.pts.length < 2) continue;
    if (s.tex && s.kind !== "eraser" && s.kind !== "restore") {
      // textured brushes: COLOR / HIGHLIGHTER (one 50% layer, no build-up) / OUTLINE (outline mask in the picked colour,
      // inner mask in the inner colour on top) / STAMP-like dashes
      let done: boolean;
      if (s.kind === "outline") {
        done = dabStroke(ctx, s, w, h, s.outline ?? "soft", s.color, 2, 1, "source-over");
        done = dabStroke(ctx, s, w, h, s.tex, s.inner ?? "#FFFFFF", 0.7, 1, "source-over") && done;
      } else if (s.kind === "highlighter") done = dabStroke(ctx, s, w, h, s.tex, s.color, 1, 0.5, "source-over");
      else done = dabStroke(ctx, s, w, h, s.tex, s.color, 1, s.opacity ?? 1, "source-over");
      if (done) continue;
    }
    const lw = Math.max(1, s.size * w);
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(s.pts[0] * w, s.pts[1] * h);
      if (s.pts.length === 2) ctx.lineTo(s.pts[0] * w + 0.01, s.pts[1] * h);
      for (let i = 2; i < s.pts.length; i += 2) ctx.lineTo(s.pts[i] * w, s.pts[i + 1] * h);
    };
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (s.kind === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "#000"; ctx.lineWidth = lw; path(); ctx.stroke();
    } else if (s.kind === "restore") {
      ctx.strokeStyle = "#000"; ctx.lineWidth = lw; path(); ctx.stroke();
    } else if (s.kind === "highlighter") {
      // semi-transparent marker: draw opaque on a scratch canvas, then composite once at 50%
      const t = document.createElement("canvas"); t.width = w; t.height = h;
      const tc = t.getContext("2d")!;
      tc.lineCap = "square"; tc.lineJoin = "round"; tc.strokeStyle = s.color; tc.lineWidth = lw;
      tc.beginPath(); tc.moveTo(s.pts[0] * w, s.pts[1] * h);
      for (let i = 2; i < s.pts.length; i += 2) tc.lineTo(s.pts[i] * w, s.pts[i + 1] * h);
      if (s.pts.length === 2) tc.lineTo(s.pts[0] * w + 0.01, s.pts[1] * h);
      tc.stroke();
      ctx.globalAlpha = 0.5; ctx.globalCompositeOperation = "multiply";
      ctx.drawImage(t, 0, 0);
    } else if (s.kind === "outline") {
      ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = lw * 1.6; ctx.shadowColor = s.color; ctx.shadowBlur = lw; path(); ctx.stroke();
      ctx.shadowBlur = 0; ctx.strokeStyle = s.color; ctx.lineWidth = lw; path(); ctx.stroke();
      ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = lw * 0.35; path(); ctx.stroke();
    } else {
      ctx.strokeStyle = s.color; ctx.lineWidth = lw; path(); ctx.stroke();
    }
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ layer adjust */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Per-layer adjustments (stickers, text, drawings), applied to the layer's pixels in this order: sharpen (unsharp
 * mask), highlights / shadows (driven by a blurred luminance so edges keep their contrast), tint (green ↔ magenta),
 * saturation (distance from luma), contrast (around mid grey), brightness (a gamma curve) and warmth (red ↔ blue).
 */
export function adjustImage(c: HTMLCanvasElement, a: LayerAdjust) {
  const on = (Object.values(a) as number[]).some((v) => Math.abs(v) > 0.005);
  if (!on) return;
  const w = c.width, h = c.height, ctx = c.getContext("2d")!;
  const img = ctx.getImageData(0, 0, w, h), px = img.data;
  let bl: Uint8ClampedArray | null = null;
  if (a.sharpen > 0.005 || Math.abs(a.highlights) > 0.005 || Math.abs(a.shadows) > 0.005) {
    const t = document.createElement("canvas"); t.width = w; t.height = h;
    const tc = t.getContext("2d")!;
    tc.filter = `blur(${Math.max(1, 0.015 * Math.min(w, h))}px)`;
    tc.drawImage(c, 0, 0);
    bl = tc.getImageData(0, 0, w, h).data;
  }
  const gamma = Math.pow(2, -a.brightness * 0.9);
  const k = 1 + a.contrast * 0.8;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    let r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
    if (bl && a.sharpen > 0.005) {
      const m = a.sharpen * 2.2;
      r = clamp01(r + (r - bl[i] / 255) * m); g = clamp01(g + (g - bl[i + 1] / 255) * m); b = clamp01(b + (b - bl[i + 2] / 255) * m);
    }
    if (bl && (Math.abs(a.highlights) > 0.005 || Math.abs(a.shadows) > 0.005)) {
      const lum = (0.2126 * bl[i] + 0.7152 * bl[i + 1] + 0.0722 * bl[i + 2]) / 255;
      // shadows act on the dark end, highlights on the bright end; positive values lift, negative values deepen
      const d = a.shadows * 0.35 * (1 - lum) * (1 - lum) + a.highlights * 0.35 * lum * lum;
      r = clamp01(r + d * (d > 0 ? 1 - r : r)); g = clamp01(g + d * (d > 0 ? 1 - g : g)); b = clamp01(b + d * (d > 0 ? 1 - b : b));
    }
    if (Math.abs(a.tint) > 0.005) { g = clamp01(g - a.tint * 0.06); r = clamp01(r + a.tint * 0.03); b = clamp01(b + a.tint * 0.03); }
    if (Math.abs(a.saturation) > 0.005) {
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b, f = 1 + a.saturation;
      r = clamp01(y + (r - y) * f); g = clamp01(y + (g - y) * f); b = clamp01(y + (b - y) * f);
    }
    if (Math.abs(a.contrast) > 0.005) { r = clamp01(0.5 + (r - 0.5) * k); g = clamp01(0.5 + (g - 0.5) * k); b = clamp01(0.5 + (b - 0.5) * k); }
    if (Math.abs(a.brightness) > 0.005) { r = Math.pow(r, gamma); g = Math.pow(g, gamma); b = Math.pow(b, gamma); }
    if (Math.abs(a.warmth) > 0.005) { r = clamp01(r + a.warmth * 0.08 * (a.warmth > 0 ? 1 - r : r)); b = clamp01(b - a.warmth * 0.08 * (a.warmth > 0 ? b : 1 - b)); }
    px[i] = r * 255; px[i + 1] = g * 255; px[i + 2] = b * 255;
  }
  ctx.putImageData(img, 0, 0);
}

/* ------------------------------------------------------------------ layer raster */

/** Content of a layer at the given pixel width (erase mask + per-layer adjust applied). */
export function rasterLayer(l: Layer, tw: number, onLoad?: () => void): HTMLCanvasElement | null {
  tw = Math.max(2, Math.round(tw));
  const th = Math.max(2, Math.round(tw / l.aspect));
  const c = document.createElement("canvas"); c.width = tw; c.height = th;
  const ctx = c.getContext("2d")!;
  if (l.kind === "stamp") {
    const img = stampImage(l.src, onLoad);
    if (!img) return null;
    ctx.drawImage(img, 0, 0, tw, th);
  } else if (l.kind === "text") {
    ctx.drawImage(textCanvas(l.style), 0, 0, tw, th);
  } else {
    if (!strokesReady(l.strokes, onLoad)) return null;
    drawStrokes(ctx, l.strokes, tw, th);
  }
  if (l.erase.length) {
    const m = document.createElement("canvas"); m.width = tw; m.height = th;
    const mc = m.getContext("2d")!;
    mc.fillStyle = "#000"; mc.fillRect(0, 0, tw, th);
    drawStrokes(mc, l.erase, tw, th);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(m, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }
  adjustImage(c, l.adjust);
  return c;
}

const layerCache = new Map<string, HTMLCanvasElement>();
function cachedLayer(l: Layer, tw: number, onLoad?: () => void) {
  const content = l.kind === "stamp" ? l.src : l.kind === "text" ? JSON.stringify(l.style) : JSON.stringify(l.strokes);
  const key = `${l.kind}|${content.length > 4000 ? content.length + ":" + content.slice(-200) : content}|${JSON.stringify(l.erase)}|${JSON.stringify(l.adjust)}|${Math.round(tw)}|${l.aspect}`;
  let c = layerCache.get(key);
  if (!c) {
    const r = rasterLayer(l, tw, onLoad);
    if (!r) return null;
    c = r;
    layerCache.set(key, c);
    if (layerCache.size > 60) layerCache.delete(layerCache.keys().next().value!);
  }
  return c;
}

export function drawLayer(ctx: CanvasRenderingContext2D, l: Layer, fw: number, fh: number, onLoad?: () => void) {
  const w = l.s * fw, h = w / l.aspect;
  const c = cachedLayer(l, w, onLoad);
  if (!c) return;
  ctx.save();
  ctx.globalAlpha = l.opacity;
  ctx.globalCompositeOperation = l.blend === "normal" ? "source-over" : l.blend;
  ctx.translate(l.x * fw, l.y * fh);
  ctx.rotate(l.rot);
  ctx.scale(l.flip ? -1 : 1, 1);
  ctx.drawImage(c, -w / 2, -h / 2, w, h);
  ctx.restore();
}

/* ------------------------------------------------------------------ composite */

export function composite(out: HTMLCanvasElement, photo: CanvasImageSource, pw: number, ph: number, doc: Doc, onLoad?: () => void, skipLayer?: number) {
  const g = frameGeo(pw, ph, doc);
  if (out.width !== g.fw || out.height !== g.fh) { out.width = g.fw; out.height = g.fh; }
  const ctx = out.getContext("2d")!;
  ctx.clearRect(0, 0, g.fw, g.fh);
  const fill = doc.border.ratio ? doc.border.fill : null;
  if (fill) {
    if (fill.type === "color") {
      ctx.fillStyle = fill.color; ctx.fillRect(0, 0, g.fw, g.fh);
    } else {
      // blurred cover-fit copy of the photo (~25px at preview scale)
      const k = Math.max(g.fw / pw, g.fh / ph);
      ctx.save();
      ctx.filter = `blur(${Math.round(g.fw * 25 / 360)}px)`;
      ctx.drawImage(photo, (g.fw - pw * k) / 2 - 20, (g.fh - ph * k) / 2 - 20, pw * k + 40, ph * k + 40);
      ctx.restore();
    }
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = g.fw * 12 / 360;
    ctx.drawImage(photo, g.px, g.py, pw, ph);
    ctx.restore();
  } else {
    ctx.drawImage(photo, g.px, g.py, pw, ph);
  }
  for (const l of doc.layers) if (!l.hidden && l.id !== skipLayer) drawLayer(ctx, l, g.fw, g.fh, onLoad);
  return g;
}

/* ------------------------------------------------------------------ preview + export */

export const SKIN_TONE_KEYS = SKIN_TONES.map((s) => s.key);

export class Preview {
  readonly gl: HTMLCanvasElement;
  readonly renderer: Renderer;
  src: HTMLCanvasElement | null = null;
  ready: Promise<void>;
  constructor() {
    this.gl = document.createElement("canvas");
    this.renderer = new Renderer(this.gl);
    this.ready = this.renderer.preloadEditTextures(SKIN_TONE_KEYS);
  }
  /** Downscale the base for interactive rendering. */
  /** full-resolution base the preview was made from (face detection is cached per base) */
  base: HTMLCanvasElement | null = null;
  setBase(base: HTMLCanvasElement, maxSide: number) {
    this.base = base;
    const k = Math.min(1, maxSide / Math.max(base.width, base.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(base.width * k)); c.height = Math.max(1, Math.round(base.height * k));
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(base, 0, 0, c.width, c.height);
    this.src = c;
    this.gl.width = c.width; this.gl.height = c.height;
  }
  get size() { return this.src ? [this.src.width, this.src.height] as const : [0, 0] as const; }
  private lutWait = new Map<string, Promise<void>>();
  private lutDone = new Set<string>();
  /**
   * Render the photo pass only (no border/layers). A filter table that isn't loaded yet renders without it;
   * `onLutReady` is called once it has loaded so the caller can render again.
   */
  renderPhoto(doc: Doc, onLutReady?: () => void) {
    if (!this.src) return;
    const [nw, nh] = nominal(this.src.width, this.src.height);
    const p = renderParams(doc);
    if (p.lut && !this.lutDone.has(p.lut)) {
      const name = p.lut;
      let w = this.lutWait.get(name);
      if (!w) { w = this.renderer.loadLut(name).then(() => { this.lutDone.add(name); }); this.lutWait.set(name, w); }
      if (onLutReady) void w.then(onLutReady);
    }
    // face engine stage (Face / Makeup / Body / Reshape ...), additive: returns this.src when nothing applies
    this.renderer.render(faceStageSource(this.base, this.src, doc.beauty.face), nw, nh, p);
  }
  dispose() { this.renderer.dispose(); }
}

/** Full-resolution render of the whole document. */
export async function exportDoc(base: HTMLCanvasElement, doc: Doc): Promise<{ blob: Blob; width: number; height: number }> {
  const glc = document.createElement("canvas");
  const r = new Renderer(glc);
  try {
    const maxSide = Math.min(r.maxTextureSize, 4096);
    let src: HTMLCanvasElement = base;
    if (Math.max(base.width, base.height) > maxSide) {
      const k = maxSide / Math.max(base.width, base.height);
      src = document.createElement("canvas");
      src.width = Math.round(base.width * k); src.height = Math.round(base.height * k);
      src.getContext("2d")!.drawImage(base, 0, 0, src.width, src.height);
    }
    glc.width = src.width; glc.height = src.height;
    const p = renderParams(doc);
    await r.preloadEditTextures(doc.beauty.skinTone ? [doc.beauty.skinTone] : []);
    if (p.lut) await r.loadLut(p.lut);
    // stamps must be decoded before compositing
    await Promise.all(doc.layers.filter((l) => l.kind === "stamp").map((l) => new Promise<void>((res) => {
      const img = stampImage((l as { src: string }).src, () => res());
      if (img) res();
    })));
    await loadFonts();
    await loadBrushTextures([...new Set(doc.layers.flatMap((l) => (l.kind === "brush" ? l.strokes.flatMap(strokeTextures) : [])))]);
    const [nw, nh] = nominal(src.width, src.height);
    // face engine stage at full resolution (additive; null when no face edit is set)
    const face = await exportFaceStage(base, src, doc.beauty.face);
    r.render(face?.canvas ?? src, nw, nh, p);
    face?.dispose();
    const out = document.createElement("canvas");
    composite(out, glc, src.width, src.height, doc);
    // flatten alpha onto black (JPEG has no alpha)
    const flat = document.createElement("canvas");
    flat.width = out.width; flat.height = out.height;
    const fc = flat.getContext("2d")!;
    fc.fillStyle = "#000"; fc.fillRect(0, 0, flat.width, flat.height);
    fc.drawImage(out, 0, 0);
    const blob = await new Promise<Blob>((res, rej) => flat.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), "image/jpeg", 0.95));
    return { blob, width: flat.width, height: flat.height };
  } finally {
    r.dispose();
  }
}

/** Decode a stored photo blob into a canvas (EXIF orientation is applied by createImageBitmap). */
export async function decodeToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const c = document.createElement("canvas");
  c.width = bmp.width; c.height = bmp.height;
  c.getContext("2d")!.drawImage(bmp, 0, 0);
  bmp.close();
  return c;
}
