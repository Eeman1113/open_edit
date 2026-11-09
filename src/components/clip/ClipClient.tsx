"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";

const ClipGallery = dynamic(() => import("./ClipGallery").then((m) => m.ClipGallery), { ssr: false, loading: () => <div className="absolute inset-0 bg-black" /> });

/** /clip?template=<id>&clips=<n>: pick the clips a video template needs. */
export function ClipClient() {
  const sp = useSearchParams();
  const clips = Math.max(1, Math.min(20, Number(sp.get("clips") ?? 3) || 3));
  return <ClipGallery clips={clips} templateId={sp.get("template")} />;
}
