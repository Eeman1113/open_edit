"use client";

// /s?url=<app link>: resolves an Open_Edit app link and replaces itself with the destination (no UI of its own).
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { resolveScheme } from "./dispatch";

export function SchemeRouter() {
  const sp = useSearchParams();
  const router = useRouter();
  const link = sp.get("url") ?? sp.get("link") ?? "";
  useEffect(() => {
    const r = resolveScheme(link || "/");
    if ("back" in r) {
      if (window.history.length > 1) router.back();
      else router.replace("/");
    } else if ("external" in r) {
      window.location.replace(r.external);
    } else {
      router.replace(r.route);
    }
  }, [link, router]);
  return null;
}
