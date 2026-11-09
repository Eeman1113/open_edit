"use client";

// Launch screen: the mark and name over the app background, shown on a cold start until the camera is ready
// (or has failed / is waiting for permission). Client-side navigation back to the camera never shows it again.
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/ui";

let splashDone = false;

export function Splash({ ready }: { ready: boolean }) {
  const [firstLoad] = useState(() => !splashDone);
  useEffect(() => { if (ready) splashDone = true; }, [ready]);
  if (!firstLoad || ready) return null;
  return (
    <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-bg" aria-hidden>
      <div style={{ animation: "oe-pop 500ms var(--oe-ease)" }}><Wordmark size={30} /></div>
      <p className="absolute bottom-[max(40px,env(safe-area-inset-bottom))] text-[12px] font-medium tracking-wide text-fg-3">Free and open-source · runs on your device</p>
    </div>
  );
}
