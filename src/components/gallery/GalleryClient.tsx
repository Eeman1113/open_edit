"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";

// The gallery reads IndexedDB, so it only renders on the client.
const Screen = dynamic(() => import("./GalleryScreen").then((m) => m.GalleryScreen), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-white" />,
});

/** Each mode is a separate screen: remount (and replay the enter transition) when it changes. */
export function GalleryClient() {
  const mode = useSearchParams().get("mode") ?? "normal";
  return <Screen key={mode} />;
}
