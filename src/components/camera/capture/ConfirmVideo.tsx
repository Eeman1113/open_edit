"use client";

// Confirm-screen video preview (main_capture_image_screen for a video result): plays the result in a
// loop. While several clips are still being joined, the clips are played back to back.
import { useEffect, useMemo, useRef, useState } from "react";

export function ConfirmVideo({ src, clips, muted }: { src: string | null; clips?: Blob[]; muted: boolean }) {
  // Object URLs for the raw clips are created inside the effect (not in useMemo) so that the cleanup → re-run cycle
  // (StrictMode, prop changes) never leaves the <video> pointing at a revoked blob: URL.
  const [clipUrls, setClipUrls] = useState<{ clips?: Blob[]; urls: string[] }>({ urls: [] });
  useEffect(() => {
    if (src) return;
    const made = (clips ?? []).map((c) => URL.createObjectURL(c));
    queueMicrotask(() => setClipUrls({ clips, urls: made }));
    return () => made.forEach((u) => URL.revokeObjectURL(u));
  }, [src, clips]);
  const urls = useMemo(() => (src ? [src] : clipUrls.clips === clips ? clipUrls.urls : []), [src, clips, clipUrls]);
  const [i, setI] = useState(0);
  const ref = useRef<HTMLVideoElement>(null);
  const cur = urls[Math.min(i, urls.length - 1)];

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = muted;
    // Autoplay with sound right after the capture gesture; fall back to muted if the browser refuses.
    v.play().catch(() => {
      v.muted = true;
      void v.play().catch(() => {});
    });
  }, [cur, muted]);

  return (
    <video
      ref={ref}
      key={cur}
      src={cur}
      autoPlay
      playsInline
      loop={urls.length <= 1}
      onEnded={() => setI((n) => (n + 1) % Math.max(1, urls.length))}
      className="h-full w-full object-cover"
    />
  );
}
