// Face pass chain used by Renderer (after beauty smoothing, before the LUT):
// reshape warp -> makeup / retouch -> liquify (manual reshape) -> stickers (background replace, face mask, sprites).

import { toViewSpace, type FaceData, type ViewMapping } from "./landmarks";
import { FaceWarp, beauty3dOps, warpActive, warpedLandmarks, type LiquifyField, type ShapeWeights, type WarpOp, type WarpParams } from "./warp";
import { bodySlimActive, bodySlimField, type BodySlimParams } from "./body";
import { FaceMakeup, makeupActive, type MakeupParams } from "./makeup";
import { StickerRenderer, type StickerRuntime } from "./sticker";
import { uploadMasks, type SegmentationMasks } from "./tracker";
import { ImageCache, makeTexture } from "./gl";

export interface FaceRenderParams {
  /** Tracked faces (FaceTracker.latest / detect()). */
  faces: FaceData[];
  /**
   * "source" (default): faces are in the tracked frame's normalized coords; the renderer maps them through its
   * cover crop + mirror. "view": faces are already in canvas-normalized coords.
   */
  space?: "source" | "view";
  warp?: Partial<WarpParams>;
  /** Per-side reshape weights, e.g. { faceSlim_left: 0.4 } (see ShapeWeights). */
  shape?: ShapeWeights;
  /** Extra local deformations (sticker effects, editor face ratio...). */
  warpOps?: WarpOp[];
  makeup?: MakeupParams;
  stickers?: StickerRuntime[];
  /** Latest masks from FaceTracker.segment() (source space). Needed for BACKGROUND / SEGMENTATION sticker items. */
  segmentation?: SegmentationMasks | null;
  /** Editor manual Reshape field (view space). */
  liquify?: LiquifyField | null;
  /** Animation clock (ms), default performance.now(). */
  now?: number;
  /** 3D sculpt sliders by key (lift, forehead, cheeks, mouth, lips, nose, bridge, alar, root, tip). See beauty3dOps. */
  beauty3d?: Record<string, number>;
  /**
   * Body slim (Beauty "Slim" body / editor Body slim): pose-driven silhouette squeeze. Needs pose landmarks
   * (tracker.track(video, { pose: true }) -> tracker.latestPose); `segmentation` (person mask) refines the width.
   */
  body?: BodySlimParams | null;
}

export function faceParamsActive(p?: FaceRenderParams): boolean {
  if (!p) return false;
  if (p.liquify && !p.liquify.isIdentity) return true;
  if (p.stickers?.length) return true;
  if (bodySlimActive(p.body)) return true;
  if (!p.faces.length) return false;
  return warpActive(p.warp, p.warpOps, p.shape) || makeupActive(p.makeup) || !!(p.beauty3d && Object.values(p.beauty3d).some((v) => Math.abs(v) > 1e-3));
}

export class FacePipeline {
  readonly images: ImageCache;
  private warp?: FaceWarp;
  private makeup?: FaceMakeup;
  private sticker?: StickerRenderer;
  private maskTex?: WebGLTexture;
  private maskVersion = -1;
  private maskRef: SegmentationMasks | null = null;
  private bodyField: LiquifyField | null = null;

  constructor(readonly gl: WebGLRenderingContext) {
    this.images = new ImageCache(gl);
  }

  /** Returns the output texture (owned by the pipeline, GL orientation), or `input` if nothing was active. */
  run(input: WebGLTexture, w: number, h: number, p: FaceRenderParams, mapping: ViewMapping): WebGLTexture {
    const gl = this.gl;
    let faces = p.space === "view" ? p.faces : p.faces.map((f) => toViewSpace(f, mapping));
    let tex = input;
    // stickers can carry deformations and reshape values
    let ops = p.warpOps;
    let shape = p.shape;
    let warp: Partial<WarpParams> = p.warp ?? {};
    if (p.beauty3d) { const b3 = beauty3dOps(p.beauty3d); if (b3.length) ops = [...(ops ?? []), ...b3]; }
    // body slim first (whole frame; it fades out above the shoulders so the face landmarks stay valid)
    if (bodySlimActive(p.body)) {
      const f = bodySlimField(this.bodyField, w, h, p.body!, mapping, p.segmentation);
      if (f) {
        this.bodyField = f;
        this.warp ??= new FaceWarp(gl);
        tex = this.warp.applyLiquify(tex, w, h, f, "body");
      }
    }
    for (const rt of p.stickers ?? []) {
      const so = rt.distortionOps();
      if (so.length) ops = [...(ops ?? []), ...so];
      const ss = rt.def.shapeSides;
      if (ss) { const merged: ShapeWeights = { ...(shape ?? {}) }; for (const [k, v] of Object.entries(ss)) merged[k] = (merged[k] ?? 0) + v; shape = merged; }
      const sw = rt.def.shape;
      if (sw) { const merged = { ...warp }; for (const [k, v] of Object.entries(sw)) merged[k as keyof WarpParams] = (merged[k as keyof WarpParams] ?? 0) + (v ?? 0); warp = merged; }
    }
    if (faces.length && warpActive(warp, ops, shape)) {
      this.warp ??= new FaceWarp(gl);
      tex = this.warp.apply(tex, w, h, faces, warp, ops, shape);
      // makeup and stickers follow the reshaped face
      faces = this.warp.lastWarped.length === faces.length ? this.warp.lastWarped : faces.map((f) => warpedLandmarks(f, w, h, warp, ops, shape));
    }
    // sticker makeup presets add layers after the user's makeup
    let makeup = p.makeup;
    for (const rt of p.stickers ?? []) {
      const sm = rt.def.makeup;
      if (sm) makeup = { ...sm, ...makeup, layers: [...(makeup?.layers ?? []), ...(sm.layers ?? [])] };
    }
    if (faces.length && makeupActive(makeup)) {
      this.makeup ??= new FaceMakeup(gl, this.images);
      tex = this.makeup.apply(tex, w, h, faces, makeup!);
    }
    if (p.liquify && !p.liquify.isIdentity) {
      this.warp ??= new FaceWarp(gl);
      tex = this.warp.applyLiquify(tex, w, h, p.liquify);
    }
    if (p.stickers?.length) {
      this.sticker ??= new StickerRenderer(gl, this.images);
      let masks: WebGLTexture | null = null;
      if (p.segmentation) {
        if (p.segmentation !== this.maskRef || p.segmentation.version !== this.maskVersion) {
          this.maskTex ??= makeTexture(gl);
          uploadMasks(gl, p.segmentation, this.maskTex);
          this.maskRef = p.segmentation;
          this.maskVersion = p.segmentation.version;
        }
        masks = this.maskTex!;
      }
      for (const rt of p.stickers) tex = this.sticker.render(tex, w, h, rt, faces, masks, mapping, p.now);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.disable(gl.BLEND);
    return tex;
  }

  /**
   * Preload sticker resources through the shared image cache (item frames and the textures of a sticker's makeup
   * preset), so the first rendered frame is complete (a still photo is rendered once).
   */
  preloadSticker(rt: StickerRuntime): Promise<void> {
    this.sticker ??= new StickerRenderer(this.gl, this.images);
    const urls = (rt.def.makeup?.layers ?? []).flatMap((l) => (l.texture?.url ? [l.texture.url] : []));
    return Promise.all([this.sticker.preload(rt), this.images.preload(urls)]).then(() => undefined);
  }

  dispose() {
    this.warp?.dispose();
    this.makeup?.dispose();
    this.sticker?.dispose();
    this.images.dispose();
    if (this.maskTex) this.gl.deleteTexture(this.maskTex);
  }
}
