"use client";

// Small animation helpers mirroring android.animation.ValueAnimator (default interpolator:
// AccelerateDecelerateInterpolator = cos((t + 1)π) / 2 + 0.5).
import { useEffect, useRef, useState } from "react";

export const accelDecel = (t: number) => Math.cos((t + 1) * Math.PI) / 2 + 0.5;

/** Animates towards `target` over `duration` ms (restarting from the current value like ValueAnimator). */
export function useTween(target: number, duration: number): number {
  const [value, setValue] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    const from = cur.current;
    if (from === target) return;
    if (duration <= 0) {
      cur.current = target;
      const id = requestAnimationFrame(() => setValue(target));
      return () => cancelAnimationFrame(id);
    }
    const t0 = performance.now();
    let raf = 0;
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / duration);
      cur.current = from + (target - from) * accelDecel(t);
      setValue(cur.current);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

/** Re-render on every animation frame while `active`; returns performance.now() of the frame. */
export function useFrameClock(active: boolean): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const step = () => {
      setNow(performance.now());
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return now;
}
