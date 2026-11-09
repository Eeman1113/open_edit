"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import type { DevInit } from "./EditScreen";

// The editor needs IndexedDB + WebGL, so it only renders on the client.
const EditScreen = dynamic(() => import("./EditScreen").then((m) => m.EditScreen), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-black" />,
});

export function EditClient() {
  const sp = useSearchParams();
  const id = sp.get("id") ?? "";
  // Dev-only verification hooks (headless screenshots): ?__sample=1&__tab=FILTER&__sub=curves&__adj=contrast&__save=1
  let dev: DevInit | undefined;
  if (process.env.NODE_ENV !== "production" && sp.get("__sample")) {
    dev = {
      sample: true,
      tab: sp.get("__tab") ?? undefined,
      sub: sp.get("__sub") ?? undefined,
      adjust: sp.get("__adj") ?? undefined,
      filter: sp.get("__filter") ?? undefined,
      save: sp.get("__save") === "1",
      share: sp.get("__share") === "1",
    };
  }
  return <EditScreen key={id + (dev ? JSON.stringify(dev) : "")} id={id} dev={dev} />;
}
