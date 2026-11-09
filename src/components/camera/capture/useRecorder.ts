"use client";

// Video recording for the camera:
//  - frames: the WebGL preview canvas, cropped to the visible rect and mirrored like photos (plus the optional
//    watermark), composited into a 2D canvas that MediaRecorder captures; audio: the microphone.
//  - clips (Video mode): every resume starts a new clip; Undo arms on the first tap and removes the last clip on
//    the second tap.
//  - minimum clip length 1000 ms: an earlier stop is deferred until it is reached; recording stops on its own when
//    the total reaches maxMs (hold-to-record in Photo mode: 20 s; Video mode: the chosen 5 / 15 / 30 min).
import { useCallback, useEffect, useRef, useState } from "react";
import { mergeClips } from "./mergeClips";
import { drawWatermark, loadWatermark, watermarkEnabled } from "./watermark";

export const MIN_RECORD_MS = 1000;
export const LONG_PRESS_MAX_MS = 20_000;
export const RECORDING_TIMES = { "5m": 300_000, "15m": 900_000, "30m": 1_800_000 } as const;

export interface CropSpec { sx: number; sy: number; sw: number; sh: number; flip: boolean }

export interface RecordingResult {
  /** Final file once ready (a single clip is ready immediately; several clips are merged). */
  ready: Promise<Blob>;
  /** The clip files in order (playable before the merge finishes). */
  clips: Blob[];
  width: number;
  height: number;
  durationMs: number;
  mimeType: string;
}

export type RecorderStatus = "idle" | "recording" | "paused";

const MIMES = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
export const pickMime = () => (typeof MediaRecorder === "undefined" ? "" : MIMES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "");

interface Session {
  maxMs: number;
  comp: HTMLCanvasElement;
  raf: number;
  stream: MediaStream;
  mic: MediaStream | null;
  mime: string;
  rec: MediaRecorder | null;
  recDone: Promise<Blob> | null;
  clipStart: number;
  blobs: Blob[];
  durs: number[];
  finishing: boolean;
}

interface Options {
  getCanvas: () => HTMLCanvasElement | null;
  getCrop: () => CropSpec;
  /** Called when the total length reaches maxMs (the original stops and opens Confirm). */
  onAutoStop?: (r: RecordingResult) => void;
  onError?: (message: string) => void;
}

export function useRecorder({ getCanvas, getCrop, onAutoStop, onError }: Options) {
  const sess = useRef<Session | null>(null);
  const cb = useRef({ onAutoStop, onError, getCanvas, getCrop });
  useEffect(() => {
    cb.current = { onAutoStop, onError, getCanvas, getCrop };
  });

  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [durations, setDurations] = useState<number[]>([]);
  const [clipStartedAt, setClipStartedAt] = useState<number | null>(null);
  const [maxMs, setMaxMs] = useState(LONG_PRESS_MAX_MS);
  const [undoArmed, setUndoArmed] = useState(false);
  const armedRef = useRef(false);
  const finishRef = useRef<() => Promise<RecordingResult | null>>(async () => null);

  const startClip = (s: Session) => {
    const tracks = [...s.stream.getVideoTracks(), ...(s.mic?.getAudioTracks() ?? [])];
    const rec = new MediaRecorder(new MediaStream(tracks), { mimeType: s.mime, videoBitsPerSecond: 8_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    s.recDone = new Promise((res) => (rec.onstop = () => res(new Blob(chunks, { type: s.mime.split(";")[0] }))));
    rec.start(1000);
    s.rec = rec;
    s.clipStart = performance.now();
    setClipStartedAt(s.clipStart);
    setStatus("recording");
    armedRef.current = false;
    setUndoArmed(false);
  };

  const endClip = async (s: Session) => {
    const rec = s.rec;
    if (!rec) return;
    const dur = performance.now() - s.clipStart;
    s.rec = null;
    rec.stop();
    const blob = await s.recDone!;
    s.blobs.push(blob);
    s.durs.push(dur);
    setDurations([...s.durs]);
    setClipStartedAt(null);
  };

  const teardown = (s: Session) => {
    cancelAnimationFrame(s.raf);
    s.stream.getTracks().forEach((t) => t.stop());
    s.mic?.getTracks().forEach((t) => t.stop());
    sess.current = null;
    setStatus("idle");
    setDurations([]);
    setClipStartedAt(null);
    armedRef.current = false;
    setUndoArmed(false);
  };

  /** Total recorded length including the running clip. */
  const total = (s: Session) => s.durs.reduce((a, b) => a + b, 0) + (s.rec ? performance.now() - s.clipStart : 0);

  const start = useCallback(async (max: number): Promise<boolean> => {
    if (sess.current) return false;
    const src = cb.current.getCanvas();
    const mime = pickMime();
    if (!src || !mime || !("captureStream" in HTMLCanvasElement.prototype)) {
      cb.current.onError?.("Recording is not supported on this browser.");
      return false;
    }
    const crop = cb.current.getCrop();
    const comp = document.createElement("canvas");
    comp.width = Math.max(2, Math.round(crop.sw / 2) * 2);
    comp.height = Math.max(2, Math.round(crop.sh / 2) * 2);
    const ctx = comp.getContext("2d")!;
    const wm = watermarkEnabled() ? await loadWatermark().catch(() => null) : null;
    let mic: MediaStream | null = null;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      mic = null; // record without sound when the microphone is unavailable or denied
    }
    const draw = () => {
      const c = cb.current.getCanvas();
      const k = cb.current.getCrop();
      if (c) {
        ctx.save();
        if (k.flip) { ctx.translate(comp.width, 0); ctx.scale(-1, 1); }
        ctx.drawImage(c, k.sx, k.sy, k.sw, k.sh, 0, 0, comp.width, comp.height);
        ctx.restore();
        if (wm) drawWatermark(ctx, comp.width, comp.height, wm);
      }
    };
    draw();
    const s: Session = {
      maxMs: max, comp, raf: 0, stream: comp.captureStream(30), mic, mime, rec: null, recDone: null,
      clipStart: 0, blobs: [], durs: [], finishing: false,
    };
    const loop = () => {
      draw();
      if (s.rec && !s.finishing && total(s) >= s.maxMs) {
        void finishRef.current().then((r) => r && cb.current.onAutoStop?.(r));
      }
      s.raf = requestAnimationFrame(loop);
    };
    s.raf = requestAnimationFrame(loop);
    sess.current = s;
    setMaxMs(max);
    setDurations([]);
    startClip(s);
    return true;
  }, []);

  /** HANDS_FREE: pause the session (ends the running clip). */
  const pause = useCallback(async () => {
    const s = sess.current;
    if (!s || !s.rec || s.finishing) return;
    setStatus("paused");
    await endClip(s);
  }, []);

  /** HANDS_FREE: resume (starts a new clip). */
  const resume = useCallback(() => {
    const s = sess.current;
    if (!s || s.rec || s.finishing) return;
    startClip(s);
  }, []);

  /** Undo button: first tap arms (last clip blinks), second tap deletes the last clip. */
  const undo = useCallback(() => {
    const s = sess.current;
    if (!s || s.rec || !s.blobs.length) return;
    if (!armedRef.current) {
      armedRef.current = true;
      setUndoArmed(true);
      return;
    }
    armedRef.current = false;
    setUndoArmed(false);
    s.blobs.pop();
    s.durs.pop();
    setDurations([...s.durs]);
    if (!s.blobs.length) teardown(s);
  }, []);

  /** Stop recording and return the result (deferred until MIN_RECORD_MS is reached). */
  const finish = useCallback(async (): Promise<RecordingResult | null> => {
    const s = sess.current;
    if (!s || s.finishing) return null;
    const t = total(s);
    if (s.rec && t < MIN_RECORD_MS) {
      await new Promise((r) => setTimeout(r, MIN_RECORD_MS - t));
      if (sess.current !== s || s.finishing) return null;
    }
    s.finishing = true;
    await endClip(s);
    const clips = [...s.blobs];
    const durationMs = s.durs.reduce((a, b) => a + b, 0);
    const { width, height } = s.comp;
    const mime = s.mime;
    teardown(s);
    if (!clips.length) return null;
    return { clips, width, height, durationMs, mimeType: mime.split(";")[0], ready: mergeClips(clips, width, height, mime) };
  }, []);
  useEffect(() => {
    finishRef.current = finish;
  }, [finish]);

  /** Drop the session without a result (e.g. leaving the camera). */
  const cancel = useCallback(() => {
    const s = sess.current;
    if (!s) return;
    s.finishing = true;
    s.rec?.stop();
    teardown(s);
  }, []);

  useEffect(() => () => cancel(), [cancel]);

  const totalMs = durations.reduce((a, b) => a + b, 0);
  return { status, durations, clipStartedAt, maxMs, undoArmed, totalMs, start, pause, resume, undo, finish, cancel };
}
