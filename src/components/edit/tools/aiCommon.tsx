"use client";

// Shared plumbing for the on-device AI tools (src/lib/ai): async bake, cancellable AI jobs with a progress
// percentage, and the step captions shown on the progress card.
import { useCallback, useEffect, useRef, useState } from "react";
import { isAbort, type Progress } from "@/lib/ai";
import { useEdit } from "../ctx";

/** Progress caption: getting ready ≤10%, fetching the model ≤50%, processing ≤90%, then finishing. */
const STEPS = ["Getting ready", "Fetching the model", "Processing your photo", "Almost done"];
export const aiStepText = (p: number) => `${STEPS[p <= 10 ? 0 : p <= 50 ? 1 : p <= 90 ? 2 : 3]}\n${p}%`;

/** Maps model download (0–40%) and inference (40–99%) progress to one percentage. */
export function progressPercent(stage: "download" | "run", v: number, downloadShare = 40) {
  return Math.min(99, Math.round(stage === "download" ? v * downloadShare : downloadShare + v * (99 - downloadShare)));
}

/**
 * One cancellable AI job at a time. `pct` is null when idle. Errors other than cancel go to `onError`.
 * Cancels the running job on unmount.
 */
export function useAiJob(onError?: (e: unknown) => void) {
  const [pct, setPct] = useState<number | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const errRef = useRef(onError);
  useEffect(() => { errRef.current = onError; });
  useEffect(() => () => ctl.current?.abort(), []);
  const run = useCallback(async <T,>(fn: (signal: AbortSignal, progress: Progress) => Promise<T>, downloadShare = 40): Promise<T | null> => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setPct(0);
    try {
      const r = await fn(c.signal, (s, v) => { if (!c.signal.aborted) setPct((p) => Math.max(p ?? 0, progressPercent(s, v, downloadShare))); });
      if (c.signal.aborted) return null;
      return r;
    } catch (e) {
      if (!isAbort(e) && !c.signal.aborted) errRef.current?.(e);
      return null;
    } finally {
      if (ctl.current === c) { ctl.current = null; setPct(null); }
    }
  }, []);
  const cancel = useCallback(() => { ctl.current?.abort(); ctl.current = null; setPct(null); }, []);
  return { pct, busy: pct !== null, run, cancel };
}

/** Pushes an asynchronously computed bitmap as a new base (like useBake) and leaves the sub page. */
export function useAsyncBake() {
  const { doc, bases, commit, openSub } = useEdit();
  return async (fn: (base: HTMLCanvasElement) => Promise<HTMLCanvasElement | null>) => {
    const base = bases.current[doc.base];
    if (!base) return false;
    const out = await fn(base);
    if (!out) return false;
    bases.current.push(out);
    commit({ ...doc, base: bases.current.length - 1 });
    openSub(null);
    return true;
  };
}

/** The editor base (full-resolution source bitmap) for the current doc. */
export function useBase() {
  const { doc, bases } = useEdit();
  const idx = doc.base;
  // stable per base index (bases is the editor's ref-held bitmap list)
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  return useCallback(() => bases.current[idx] ?? null, [bases, idx]);
}
