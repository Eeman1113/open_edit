import { BASE } from "@/lib/base";
// Face / segmentation / pose tracking on MediaPipe Tasks Vision (Apache-2.0), self-hosted under /public/mediapipe.
// Nothing is downloaded until FaceTracker.create() (or ensureSegmenter / ensurePose) is first called.

import type { FaceLandmarker, FaceLandmarkerResult, ImageSegmenter, PoseLandmarker } from "@mediapipe/tasks-vision";
import { LANDMARK_COUNT, poseFromPoints, type FaceData } from "./landmarks";
import { makeTexture } from "./gl";

export const MEDIAPIPE_BASE = `${BASE}/mediapipe`;
export const MODEL_URLS = {
  face: `${MEDIAPIPE_BASE}/models/face_landmarker.task`,
  segmenter: `${MEDIAPIPE_BASE}/models/selfie_multiclass_256x256.tflite`,
  pose: `${MEDIAPIPE_BASE}/models/pose_landmarker_lite.task`,
};

type Vision = typeof import("@mediapipe/tasks-vision");
let visionP: Promise<{ vision: Vision; fileset: Awaited<ReturnType<Vision["FilesetResolver"]["forVisionTasks"]>> }> | null = null;

/** MediaPipe's wasm logs this informational line through console.error; drop it so it isn't reported as an error. */
let infoFilterInstalled = false;
function filterMediapipeInfo() {
  if (infoFilterInstalled || typeof console === "undefined") return;
  infoFilterInstalled = true;
  const error = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("INFO: Created TensorFlow Lite XNNPACK delegate")) return;
    error(...args);
  };
}

/** Lazily loads the tasks-vision JS + wasm fileset (shared by all trackers). */
export function loadVision() {
  filterMediapipeInfo();
  visionP ??= (async () => {
    const vision = await import("@mediapipe/tasks-vision");
    const fileset = await vision.FilesetResolver.forVisionTasks(`${MEDIAPIPE_BASE}/wasm`);
    return { vision, fileset };
  })().catch((e) => { visionP = null; throw e; });
  return visionP;
}

export type TrackerMode = "VIDEO" | "IMAGE";
export type TrackSource = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas;

export interface TrackerOptions {
  mode?: TrackerMode;
  /** Default 3. */
  maxFaces?: number;
  /** "GPU" (default, falls back to CPU) or "CPU". */
  delegate?: "GPU" | "CPU";
  /** One-Euro filter (VIDEO mode). minCutoff Hz (default 1.2), beta (default 8). Set false to disable. */
  smoothing?: { minCutoff?: number; beta?: number } | false;
  /** Segmenter input long side (masks come back at this size). Default 320. */
  segmentLongSide?: number;
}

/** Person / hair / skin masks in source space. data = RGBA bytes: R person, G hair, B skin (body+face), A face skin. */
export interface SegmentationMasks {
  width: number;
  height: number;
  data: Uint8Array;
  /** Increments every update (lets uploaders skip unchanged masks). */
  version: number;
}

export interface PoseData {
  /** 33 x [x, y, z, visibility], normalized source space (MediaPipe BlazePose topology). */
  points: Float32Array;
}

// ---------- One-Euro filter ----------
class OneEuro {
  private x: Float32Array | null = null;
  private dx: Float32Array;
  private t = 0;
  constructor(n: number, private minCutoff: number, private beta: number, private dCutoff = 1) { this.dx = new Float32Array(n); }
  private static alpha(cutoff: number, dt: number) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }
  filter(v: Float32Array, tMs: number, scale: number): Float32Array {
    if (!this.x) { this.x = new Float32Array(v); this.t = tMs; return new Float32Array(v); }
    const dt = Math.max(1e-3, (tMs - this.t) / 1000);
    this.t = tMs;
    const ad = OneEuro.alpha(this.dCutoff, dt);
    const out = this.x;
    for (let i = 0; i < v.length; i++) {
      const d = (v[i] - out[i]) / dt;
      this.dx[i] += ad * (d - this.dx[i]);
      // speed normalized by face size so the filter behaves the same for near/far faces
      const cutoff = this.minCutoff + this.beta * Math.abs(this.dx[i]) / scale;
      const a = OneEuro.alpha(cutoff, dt);
      out[i] += a * (v[i] - out[i]);
    }
    return new Float32Array(out);
  }
}

interface Track { id: number; filter: OneEuro | null; nose: [number, number]; seen: number }

const dimsOf = (s: TrackSource): [number, number] => {
  if (typeof HTMLVideoElement !== "undefined" && s instanceof HTMLVideoElement) return [s.videoWidth, s.videoHeight];
  if (typeof HTMLImageElement !== "undefined" && s instanceof HTMLImageElement) return [s.naturalWidth, s.naturalHeight];
  return [s.width, s.height];
};

export class FaceTracker {
  /** Last tracked faces (source-normalized coords, unmirrored). */
  latest: FaceData[] = [];
  /** Last segmentation (VIDEO: updated by segment()). */
  latestMasks: SegmentationMasks | null = null;
  latestPose: PoseData[] = [];
  private tracks: Track[] = [];
  private nextId = 1;
  private lastTs = -1;
  private segmenter?: ImageSegmenter;
  private segP?: Promise<ImageSegmenter>;
  private poser?: PoseLandmarker;
  private poseP?: Promise<PoseLandmarker>;
  private segCanvas?: HTMLCanvasElement;
  private maskVersion = 0;
  private closed = false;

  private constructor(private lm: FaceLandmarker, readonly mode: TrackerMode, private opts: TrackerOptions, readonly delegate: "GPU" | "CPU") {}

  /** Loads wasm + face_landmarker.task. GPU delegate with CPU fallback. */
  static async create(opts: TrackerOptions = {}): Promise<FaceTracker> {
    const { vision, fileset } = await loadVision();
    const mode = opts.mode ?? "VIDEO";
    const make = (delegate: "GPU" | "CPU") => vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URLS.face, delegate },
      runningMode: mode,
      numFaces: opts.maxFaces ?? 3,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    let delegate: "GPU" | "CPU" = opts.delegate ?? "GPU";
    let lm: FaceLandmarker;
    try { lm = await make(delegate); } catch (e) {
      if (delegate === "CPU") throw e;
      delegate = "CPU";
      lm = await make("CPU");
    }
    return new FaceTracker(lm, mode, opts, delegate);
  }

  private ts(t?: number): number {
    let v = t ?? performance.now();
    if (v <= this.lastTs) v = this.lastTs + 1;
    this.lastTs = v;
    return v;
  }

  /**
   * Detects faces. VIDEO mode: call once per new video frame (timestamp ms, monotonically increasing; defaults to
   * performance.now()). IMAGE mode: timestamp ignored. Returns faces in source-normalized coords and stores `latest`.
   */
  detect(source: TrackSource, timestampMs?: number): FaceData[] {
    if (this.closed) return [];
    const [sw, sh] = dimsOf(source);
    if (!sw || !sh) return this.latest;
    const t = this.ts(timestampMs);
    let res: FaceLandmarkerResult;
    try {
      res = this.mode === "VIDEO" ? this.lm.detectForVideo(source, t) : this.lm.detect(source);
    } catch {
      return this.latest;
    }
    const faces: FaceData[] = [];
    const used = new Set<Track>();
    res.faceLandmarks.forEach((lms, i) => {
      if (lms.length < LANDMARK_COUNT) return;
      const raw = new Float32Array(LANDMARK_COUNT * 3);
      for (let k = 0; k < LANDMARK_COUNT; k++) { raw[k * 3] = lms[k].x; raw[k * 3 + 1] = lms[k].y; raw[k * 3 + 2] = lms[k].z; }
      const nose: [number, number] = [raw[3], raw[4]];
      // match to the previous track by nose position
      let best: Track | undefined, bd = 0.15;
      for (const tr of this.tracks) {
        if (used.has(tr)) continue;
        const d = Math.hypot(tr.nose[0] - nose[0], tr.nose[1] - nose[1]);
        if (d < bd) { bd = d; best = tr; }
      }
      const sm = this.opts.smoothing;
      if (!best) {
        best = { id: this.nextId++, filter: this.mode === "VIDEO" && sm !== false ? new OneEuro(LANDMARK_COUNT * 3, sm?.minCutoff ?? 1.2, sm?.beta ?? 8) : null, nose, seen: t };
        this.tracks.push(best);
      }
      used.add(best);
      best.nose = nose; best.seen = t;
      const faceSize = Math.hypot(raw[263 * 3] - raw[33 * 3], raw[263 * 3 + 1] - raw[33 * 3 + 1]) || 0.1;
      const points = best.filter ? best.filter.filter(raw, t, faceSize) : raw;
      const blendshapes: Record<string, number> = {};
      for (const c of res.faceBlendshapes?.[i]?.categories ?? []) blendshapes[c.categoryName] = c.score;
      const m = res.facialTransformationMatrixes?.[i]?.data;
      faces.push({ id: best.id, points, blendshapes, matrix: m ? Float32Array.from(m) : null, pose: poseFromPoints(points, sw / sh) });
    });
    this.tracks = this.tracks.filter((tr) => used.has(tr) || t - tr.seen < 500);
    this.latest = faces;
    return faces;
  }

  /** Loads the multiclass selfie segmenter (selfie_multiclass_256x256). */
  ensureSegmenter(): Promise<ImageSegmenter> {
    if (this.segmenter) return Promise.resolve(this.segmenter);
    this.segP ??= (async () => {
      const { vision, fileset } = await loadVision();
      const make = (delegate: "GPU" | "CPU") => vision.ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URLS.segmenter, delegate },
        runningMode: this.mode,
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
      let s: ImageSegmenter;
      try { s = await make(this.delegate); } catch { s = await make("CPU"); }
      this.segmenter = s;
      return s;
    })();
    return this.segP;
  }

  /**
   * Person / hair / skin / face-skin masks. Returns null (and starts loading) until the segmenter is ready.
   * The source is downscaled to `segmentLongSide` first, so masks are small (cheap to read back and upload).
   */
  segment(source: TrackSource, timestampMs?: number): SegmentationMasks | null {
    if (this.closed) return null;
    if (!this.segmenter) { void this.ensureSegmenter().catch(() => undefined); return null; }
    const [sw, sh] = dimsOf(source);
    if (!sw || !sh) return this.latestMasks;
    const long = this.opts.segmentLongSide ?? 320;
    const k = Math.min(1, long / Math.max(sw, sh));
    const cw = Math.max(1, Math.round(sw * k)), ch = Math.max(1, Math.round(sh * k));
    this.segCanvas ??= document.createElement("canvas");
    const cv = this.segCanvas;
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
    cv.getContext("2d")!.drawImage(source as CanvasImageSource, 0, 0, cw, ch);
    const t = this.ts(timestampMs);
    try {
      const res = this.mode === "VIDEO" ? this.segmenter.segmentForVideo(cv, t) : this.segmenter.segment(cv);
      const ms = res.confidenceMasks ?? [];
      if (ms.length >= 4) {
        const get = (i: number) => (ms[i] ? ms[i].getAsFloat32Array() : null);
        const bg = get(0)!, hair = get(1)!, body = get(2)!, face = get(3)!;
        const n = cw * ch, data = new Uint8Array(n * 4);
        for (let i = 0; i < n; i++) {
          data[i * 4] = Math.round((1 - bg[i]) * 255);
          data[i * 4 + 1] = Math.round(hair[i] * 255);
          data[i * 4 + 2] = Math.round(Math.min(1, body[i] + face[i]) * 255);
          data[i * 4 + 3] = Math.round(face[i] * 255);
        }
        this.latestMasks = { width: cw, height: ch, data, version: ++this.maskVersion };
      }
      for (const m of ms) m.close();
      res.close?.();
    } catch {
      /* keep the last masks */
    }
    return this.latestMasks;
  }

  /** Loads pose_landmarker_lite. */
  ensurePose(): Promise<PoseLandmarker> {
    if (this.poser) return Promise.resolve(this.poser);
    this.poseP ??= (async () => {
      const { vision, fileset } = await loadVision();
      const make = (delegate: "GPU" | "CPU") => vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URLS.pose, delegate },
        runningMode: this.mode,
        numPoses: 2,
      });
      let p: PoseLandmarker;
      try { p = await make(this.delegate); } catch { p = await make("CPU"); }
      this.poser = p;
      return p;
    })();
    return this.poseP;
  }

  /** Body pose (33 points per person). Returns [] (and starts loading) until the model is ready. */
  pose(source: TrackSource, timestampMs?: number): PoseData[] {
    if (this.closed) return [];
    if (!this.poser) { void this.ensurePose().catch(() => undefined); return []; }
    const t = this.ts(timestampMs);
    try {
      const res = this.mode === "VIDEO" ? this.poser.detectForVideo(source, t) : this.poser.detect(source);
      this.latestPose = res.landmarks.map((l) => {
        const a = new Float32Array(l.length * 4);
        l.forEach((p, i) => { a[i * 4] = p.x; a[i * 4 + 1] = p.y; a[i * 4 + 2] = p.z; a[i * 4 + 3] = p.visibility ?? 1; });
        return { points: a };
      });
      res.close?.();
    } catch {
      /* keep last */
    }
    return this.latestPose;
  }

  /**
   * Runs detect() (and optionally segment()/pose()) once per new video frame using requestVideoFrameCallback
   * (falls back to rAF). Returns a stop function. The camera's render loop just reads `tracker.latest`.
   */
  track(video: HTMLVideoElement, opts: { segment?: boolean; segmentEvery?: number; pose?: boolean; onFrame?: (faces: FaceData[]) => void } = {}): () => void {
    let stop = false, n = 0;
    const v = video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number };
    const step = () => {
      if (stop || this.closed) return;
      if (video.readyState >= 2) {
        const faces = this.detect(video);
        if (opts.segment && n % Math.max(1, opts.segmentEvery ?? 1) === 0) this.segment(video);
        if (opts.pose) this.pose(video);
        n++;
        opts.onFrame?.(faces);
      }
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(step);
      else requestAnimationFrame(step);
    };
    step();
    return () => { stop = true; };
  }

  close() {
    this.closed = true;
    this.lm.close();
    this.segmenter?.close();
    this.poser?.close();
  }
}

/** Uploads masks into a texture of `gl` (re-using `tex` if given). Masks are in source space, top row first. */
export function uploadMasks(gl: WebGLRenderingContext, masks: SegmentationMasks, tex?: WebGLTexture): WebGLTexture {
  const t = tex ?? makeTexture(gl);
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, masks.width, masks.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, masks.data);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  return t;
}

/** Blendshape-derived expression flags used by sticker triggers. */
export function expressions(f: FaceData) {
  const b = f.blendshapes;
  const g = (k: string) => b[k] ?? 0;
  return {
    mouthOpen: g("jawOpen") > 0.35,
    eyeBlink: g("eyeBlinkLeft") > 0.5 && g("eyeBlinkRight") > 0.5,
    browRaise: g("browInnerUp") > 0.5 || (g("browOuterUpLeft") + g("browOuterUpRight")) / 2 > 0.5,
    kiss: g("mouthPucker") > 0.6,
    smile: (g("mouthSmileLeft") + g("mouthSmileRight")) / 2 > 0.5,
  };
}
