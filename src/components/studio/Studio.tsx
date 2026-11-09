"use client";

// Templates: ready-made photo and video templates from the content API (/api/templates). Collage layouts are
// built in and always available; online templates appear when a content service is connected.
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button, ListGroup, ListRow, ScrollBody, Screen, Spinner, TopBar, toast, useGoBack } from "@/components/ui";
import { useContentCatalog } from "@/components/lens/LensEditor";

export function Studio() {
  const back = useGoBack("/");
  const list = useContentCatalog("templates");
  return (
    <Screen>
      <TopBar title="Templates" onBack={back} large />
      <ScrollBody className="pb-10">
        <ListGroup title="Built in">
          <ListRow icon="collage" title="Collage layouts" subtitle="Combine up to nine photos." href="/gallery?mode=collage" />
          <ListRow icon="film" title="Video editor" subtitle="Trim, filter and add music to a clip." href="/gallery?tab=video" />
        </ListGroup>
        <h3 className="mb-2 mt-6 px-5 text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-3">Online</h3>
        <div className="relative min-h-[260px]">{list.view}</div>
      </ScrollBody>
    </Screen>
  );
}

/** /studio/detail?id=…: a single online template. Without a content service it explains and returns. */
export function StudioDetail() {
  const router = useRouter();
  const back = () => (window.history.length > 1 ? router.back() : router.replace("/studio"));
  useEffect(() => {
    const t = setTimeout(() => {
      toast(navigator.onLine === false ? "You’re offline. Connect and try again." : "This template isn’t available right now.", { icon: "offline" });
      if (!(process.env.NODE_ENV !== "production" && window.location.search.includes("__still"))) back();
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black">
      <div className="absolute left-2 top-2"><Button variant="glass" size="sm" icon="back" className="rounded-full" onClick={back}>Back</Button></div>
      <Spinner size={28} className="text-fg-2" />
    </div>
  );
}
