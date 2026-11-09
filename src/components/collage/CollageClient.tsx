"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import type { CollageDev } from "./CollageScreen";

// The collage maker needs IndexedDB and canvas, so it only renders on the client.
const CollageScreen = dynamic(() => import("./CollageScreen").then((m) => m.CollageScreen), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-bg" />,
});

export function CollageClient() {
  const sp = useSearchParams();
  const ids = (sp.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  // Dev-only proof hooks, e.g. /collage?__sample=4&__menu=BORDER&__border=0.5&__save=1 (__sample = synthetic photos,
  // __n = the newest gallery photos)
  let dev: CollageDev | undefined;
  if (process.env.NODE_ENV !== "production" && [...sp.keys()].some((k) => k.startsWith("__"))) {
    const num = (k: string) => (sp.get(k) != null ? Number(sp.get(k)) : undefined);
    dev = {
      n: num("__n"),
      sample: num("__sample"),
      menu: (sp.get("__menu") as CollageDev["menu"]) ?? undefined,
      depth: (sp.get("__depth") as CollageDev["depth"]) ?? undefined,
      sel: sp.get("__sel") ?? undefined,
      pack: sp.get("__pack") ?? undefined,
      border: num("__border"),
      color: sp.get("__color") ? `#${sp.get("__color")}` : undefined,
      picker: sp.get("__picker") === "1",
      save: sp.get("__save") === "1",
      share: sp.get("__share") === "1",
      alert: sp.get("__alert") === "1",
    };
  }
  return <CollageScreen key={ids.join(",") + (dev ? JSON.stringify(dev) : "")} ids={ids} dev={dev} />;
}
