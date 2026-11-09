// Video editor engine: decoded <video> (or the reversed frame list) → optional rotate stage → WebGL Renderer
// (src/lib/gl/renderer: face passes, LUT filter) → preview canvas. Export replays the edited section into a full
// resolution canvas and records it with MediaRecorder (canvas.captureStream + the original sound through WebAudio).
import { Renderer } from "@/lib/gl/renderer";
import { filterByKey, lutFor } from "@/lib/filters";
import { FaceTracker, type FaceRenderParams, type StickerRuntime, type FaceData } from "@/lib/face";
import { reshapeToEngine } from "@/components/edit/tools/portrait/faceData";
import { reshapeActive, type VDoc } from "./model";

export interface LiveParams {
  doc: VDoc;
  sticker: StickerRuntime | null;
  /** compare_image_view / btn_original held: render without edits. */
  original?: boolean;
  /** A face tab is open: track faces even when no face edit is applied yet (face guide / face list). */
  track?: boolean;
}

export const rotatedSize = (w: number, h: number, rot: number) => (rot % 180 === 0 ? [w, h] : [h, w]) as [number, number];

function faceNeeded(p: LiveParams) {
  return !p.original && (!!p.sticker || reshapeActive(p.doc.reshape) || p.doc.retouch.length > 0);
}

/** Render params for one frame (filter LUT + face passes). */
function renderParams(p: LiveParams, faces: FaceData[]) {
  const { doc } = p;
  const f = filterByKey(doc.filter.key);
  const lut = !p.original && f ? lutFor(f, true, true) : undefined;
  let face: FaceRenderParams | undefined;
  if (faceNeeded(p)) {
    const r = reshapeToEngine(doc.reshape.re, doc.reshape.shape, false);
    face = {
      faces,
      shape: r.shape,
      warp: r.warp,
      warpOps: [...r.ops, ...doc.retouch],
      stickers: p.sticker ? [p.sticker] : [],
    };
  }
  return { lut, intensity: lut ? doc.filter.strength : 0, smooth: 0, whiten: 0, face };
}

/** Draws `src` rotated clockwise by `rot` into `stage` (sized to the rotated dimensions, scaled by `scale`). */
function drawRotated(stage: HTMLCanvasElement, src: CanvasImageSource, sw: number, sh: number, rot: number, scale = 1) {
  const [rw, rh] = rotatedSize(sw, sh, rot).map((v) => Math.max(1, Math.round(v * scale))) as [number, number];
  if (stage.width !== rw || stage.height !== rh) { stage.width = rw; stage.height = rh; }
  const g = stage.getContext("2d")!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.translate(rw / 2, rh / 2);
  g.rotate((rot * Math.PI) / 180);
  const dw = sw * scale, dh = sh * scale;
  g.drawImage(src, -dw / 2, -dh / 2, dw, dh);
}

export interface ReverseFrames { frames: ImageBitmap[]; start: number; end: number; frameMs: number }

/** VideoReverseProcessor: decodes the section into bitmaps (max 720px, ≤ 30 fps, ≤ 450 frames), newest first. */
export async function decodeReverse(blobUrl: string, start: number, end: number, onProgress: (p: number) => void, signal: { cancelled: boolean }): Promise<ReverseFrames> {
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = blobUrl;
  await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error("decode")); });
  const dur = end - start;
  const count = Math.max(2, Math.min(450, Math.round((dur / 1000) * 30)));
  const frameMs = dur / count;
  const scale = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
  const rw = Math.round(v.videoWidth * scale), rh = Math.round(v.videoHeight * scale);
  const frames: ImageBitmap[] = [];
  for (let i = 0; i < count; i++) {
    if (signal.cancelled) { frames.forEach((f) => f.close()); throw new Error("cancelled"); }
    const t = (start + i * frameMs) / 1000;
    await new Promise<void>((res) => { v.onseeked = () => res(); v.currentTime = t; });
    frames.push(await createImageBitmap(v, { resizeWidth: rw, resizeHeight: rh }));
    onProgress((i + 1) / count);
  }
  v.removeAttribute("src"); v.load();
  frames.reverse();
  return { frames, start, end, frameMs };
}

export class VideoEngine {
  readonly video: HTMLVideoElement;
  readonly renderer: Renderer;
  private stage = document.createElement("canvas");
  private raf = 0;
  private tracker: FaceTracker | null = null;
  private trackerP: Promise<FaceTracker> | null = null;
  private lastDetectKey = "";
  params: LiveParams;
  reverse: ReverseFrames | null = null;
  playing = false;
  /** Current position in source ms. */
  pos = 0;
  private revClock = 0;
  private lastTick = 0;
  onTime?: (ms: number) => void;
  onPlayState?: (playing: boolean) => void;
  onFaces?: (faces: FaceData[]) => void;
  disposed = false;

  constructor(readonly canvas: HTMLCanvasElement, readonly url: string, params: LiveParams) {
    this.params = params;
    this.video = document.createElement("video");
    this.video.src = url;
    this.video.playsInline = true;
    this.video.preload = "auto";
    this.video.crossOrigin = "anonymous";
    this.renderer = new Renderer(canvas);
    const loop = () => { this.raf = requestAnimationFrame(loop); this.tick(); };
    this.raf = requestAnimationFrame(loop);
  }

  get srcW() { return this.video.videoWidth; }
  get srcH() { return this.video.videoHeight; }

  ready(): Promise<void> {
    if (this.video.readyState >= 2) return Promise.resolve();
    return new Promise((res, rej) => {
      this.video.addEventListener("loadeddata", () => res(), { once: true });
      this.video.addEventListener("error", () => rej(new Error("video")), { once: true });
    });
  }

  /** Loads the face model the first time a face feature needs it. */
  ensureTracker(): Promise<FaceTracker> {
    if (this.tracker) return Promise.resolve(this.tracker);
    this.trackerP ??= FaceTracker.create({ mode: "VIDEO" }).then((t) => { if (this.disposed) t.close(); this.tracker = t; return t; });
    return this.trackerP;
  }
  get faces(): FaceData[] { return this.tracker?.latest ?? []; }

  setParams(p: LiveParams) {
    this.params = p;
    const { doc } = p;
    this.video.muted = doc.muted || doc.reverse;
    this.video.playbackRate = doc.speed;
    if (faceNeeded(p) || p.track) void this.ensureTracker().catch(() => undefined);
    if (p.sticker) void this.renderer.face.preloadSticker(p.sticker).catch(() => undefined);
    if (this.pos < doc.start || this.pos > doc.end) this.seek(doc.start);
  }

  seek(ms: number) {
    const { start, end } = this.params.doc;
    this.pos = Math.min(end, Math.max(start, ms));
    if (this.params.doc.reverse) this.revClock = end - this.pos + start;
    else if (Math.abs(this.video.currentTime * 1000 - this.pos) > 15) this.video.currentTime = this.pos / 1000;
    this.onTime?.(this.pos);
  }

  play() {
    if (this.playing) return;
    this.playing = true;
    this.lastTick = performance.now();
    if (!this.params.doc.reverse) void this.video.play().catch(() => { this.video.muted = true; void this.video.play().catch(() => undefined); });
    this.onPlayState?.(true);
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    this.video.pause();
    this.onPlayState?.(false);
  }

  toggle() { if (this.playing) this.pause(); else this.play(); }

  private tick() {
    if (this.disposed || this.video.readyState < 2) return;
    const { doc } = this.params;
    const now = performance.now();
    if (doc.reverse && this.reverse) {
      if (this.playing) {
        // reverse plays the section backwards: pos runs end → start at `speed`
        this.pos -= (now - this.lastTick) * doc.speed;
        if (this.pos <= doc.start) this.pos = doc.end;
        this.onTime?.(this.pos);
      }
      this.lastTick = now;
      const r = this.reverse;
      const idx = Math.min(r.frames.length - 1, Math.max(0, Math.floor((r.end - this.pos) / r.frameMs)));
      const bmp = r.frames[idx];
      this.draw(bmp, bmp.width, bmp.height, `r${idx}`);
      return;
    }
    if (this.playing) {
      const t = this.video.currentTime * 1000;
      if (t >= doc.end - 5 || this.video.ended) { this.video.currentTime = doc.start / 1000; if (this.video.paused) void this.video.play().catch(() => undefined); }
      this.pos = Math.min(doc.end, Math.max(doc.start, t));
      this.onTime?.(this.pos);
    }
    this.draw(this.video, this.srcW, this.srcH, `v${this.video.currentTime}`);
  }

  private draw(src: CanvasImageSource, sw: number, sh: number, frameKey: string) {
    const { doc } = this.params;
    let source: CanvasImageSource = src, w = sw, h = sh;
    if (doc.rotation) {
      const scale = Math.min(1, 1280 / Math.max(sw, sh));
      drawRotated(this.stage, src, sw, sh, doc.rotation, scale);
      source = this.stage; w = this.stage.width; h = this.stage.height;
    }
    if (this.tracker && (faceNeeded(this.params) || this.params.track)) {
      const key = `${frameKey}|${doc.rotation}`;
      if (key !== this.lastDetectKey) {
        this.lastDetectKey = key;
        const f = this.tracker.detect(source as HTMLCanvasElement);
        this.onFaces?.(f);
      }
    }
    this.renderer.render(source as TexImageSource, w, h, renderParams(this.params, this.faces));
  }

  /** Current frame as a canvas (thumbnails for the Retouch face list). */
  snapshot(maxSide = 480): HTMLCanvasElement {
    const c = document.createElement("canvas");
    const { doc } = this.params;
    const src = doc.reverse && this.reverse ? this.reverse.frames[0] : this.video;
    const sw = src instanceof HTMLVideoElement ? src.videoWidth : src.width, sh = src instanceof HTMLVideoElement ? src.videoHeight : src.height;
    drawRotated(c, src, sw, sh, doc.rotation, Math.min(1, maxSide / Math.max(sw, sh)));
    return c;
  }

  setReverse(r: ReverseFrames | null) {
    this.reverse?.frames.forEach((f) => { if (!r || !r.frames.includes(f)) f.close(); });
    this.reverse = r;
    if (r) { this.video.pause(); this.pos = r.end; } else if (this.playing) void this.video.play().catch(() => undefined);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
    this.reverse?.frames.forEach((f) => f.close());
    this.tracker?.close();
    this.renderer.dispose();
  }

  /**
   * C14780f save: replays the section at the original resolution into an offscreen renderer and records it.
   * MediaRecorder (mp4/H.264 where supported, else WebM VP9/VP8) with the original sound unless muted/reversed.
   */
  async export(onProgress: (p: number) => void, signal: { cancelled: boolean }): Promise<{ blob: Blob; width: number; height: number; duration: number }> {
    const p = { ...this.params, original: false };
    const { doc } = p;
    const sw = this.srcW, sh = this.srcH;
    const [ow, oh] = rotatedSize(sw, sh, doc.rotation).map((v) => Math.round(v / 2) * 2) as [number, number];
    const canvas = document.createElement("canvas");
    canvas.width = ow; canvas.height = oh;
    const r = new Renderer(canvas);
    if (p.sticker) await r.face.preloadSticker(p.sticker).catch(() => undefined);
    const f = filterByKey(doc.filter.key);
    const lut = f ? lutFor(f, true, true) : undefined;
    if (lut) await r.loadLut(lut);
    if (faceNeeded(p)) await this.ensureTracker().catch(() => undefined);
    const stage = document.createElement("canvas");
    const frame = (src: CanvasImageSource, w: number, h: number) => {
      let s: CanvasImageSource = src, fw = w, fh = h;
      if (doc.rotation) { drawRotated(stage, src, w, h, doc.rotation); s = stage; fw = stage.width; fh = stage.height; }
      const faces = this.tracker && faceNeeded(p) ? this.tracker.detect(s as HTMLCanvasElement) : [];
      r.render(s as TexImageSource, fw, fh, renderParams(p, faces));
    };

    const stream = canvas.captureStream(30);
    const v = document.createElement("video");
    v.src = this.url; v.playsInline = true; v.crossOrigin = "anonymous";
    await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error("video")); });
    let ac: AudioContext | null = null;
    const withSound = !doc.muted && !doc.reverse;
    if (withSound) {
      try {
        ac = new AudioContext();
        const srcNode = ac.createMediaElementSource(v);
        const dest = ac.createMediaStreamDestination();
        srcNode.connect(dest);
        dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
      } catch { ac = null; }
    }
    const types = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: Math.min(20_000_000, Math.round(ow * oh * 30 * 0.15)) });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise<void>((res) => { rec.onstop = () => res(); });
    const outDur = (doc.end - doc.start) / doc.speed;

    try {
      if (doc.reverse && this.reverse) {
        const fr = this.reverse;
        frame(fr.frames[0], fr.frames[0].width, fr.frames[0].height);
        rec.start(250);
        const t0 = performance.now();
        await new Promise<void>((res) => {
          const step = () => {
            if (signal.cancelled) return res();
            const el = (performance.now() - t0) * doc.speed;
            const idx = Math.floor(el / fr.frameMs);
            if (idx >= fr.frames.length) return res();
            frame(fr.frames[idx], fr.frames[idx].width, fr.frames[idx].height);
            onProgress(Math.min(1, el / (doc.end - doc.start)));
            requestAnimationFrame(step);
          };
          step();
        });
      } else {
        v.currentTime = doc.start / 1000;
        await new Promise<void>((res) => { v.onseeked = () => res(); });
        v.playbackRate = doc.speed;
        frame(v, sw, sh);
        rec.start(250);
        await v.play();
        await new Promise<void>((res) => {
          const vv = v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
          const step = () => {
            if (signal.cancelled) return res();
            const t = v.currentTime * 1000;
            frame(v, sw, sh);
            onProgress(Math.min(1, (t - doc.start) / (doc.end - doc.start)));
            if (t >= doc.end || v.ended) return res();
            if (vv.requestVideoFrameCallback) vv.requestVideoFrameCallback(step); else requestAnimationFrame(step);
          };
          step();
          v.onended = () => res();
        });
        v.pause();
      }
    } finally {
      if (rec.state !== "inactive") rec.stop();
      await stopped;
      stream.getTracks().forEach((t) => t.stop());
      void ac?.close();
      v.removeAttribute("src"); v.load();
      r.dispose();
    }
    if (signal.cancelled) throw new Error("cancelled");
    const blob = new Blob(chunks, { type: (mimeType || "video/webm").split(";")[0] });
    if (!blob.size) throw new Error("empty");
    return { blob, width: ow, height: oh, duration: Math.round(outDur) };
  }
}
