"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import type { DevInit } from "./VideoEditScreen";

// The editor needs IndexedDB + WebGL + MediaRecorder, so it only renders on the client.
const VideoEditScreen = dynamic(() => import("./VideoEditScreen").then((m) => m.VideoEditScreen), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-black" />,
});

export function VideoEditClient() {
  const sp = useSearchParams();
  const id = sp.get("id") ?? "";
  // Dev-only verification hooks: ?__sample=1&__tab=Filter&__filter=DAILY&__speed=2&__reverse=1&__sticker=9000100&__music=1&__save=1&__share=1
  let dev: DevInit | undefined;
  if (process.env.NODE_ENV !== "production" && sp.get("__sample")) {
    dev = {
      sample: true,
      tab: sp.get("__tab") ?? undefined,
      filter: sp.get("__filter") ?? undefined,
      speed: sp.get("__speed") ? Number(sp.get("__speed")) : undefined,
      sticker: sp.get("__sticker") ? Number(sp.get("__sticker")) : undefined,
      reverse: sp.get("__reverse") === "1",
      music: sp.get("__music") === "1",
      save: sp.get("__save") === "1",
      share: sp.get("__share") === "1",
    };
  }
  return <VideoEditScreen key={id + (dev ? JSON.stringify(dev) : "")} id={id} dev={dev} />;
}
