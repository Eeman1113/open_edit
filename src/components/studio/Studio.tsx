"use client";

// Templates: ready-made photo and video templates from the content API (/api/templates). Collage layouts are
// built in and always available; online templates appear when a content service is connected.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, EmptyState, ListGroup, ListRow, ScrollBody, Screen, TopBar, useGoBack } from "@/components/ui";
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

/** /studio/detail?id=…: a single online template. Templates come from a content service; without one (or offline)
 *  the page says so and offers the built-in ones. */
export function StudioDetail() {
  const router = useRouter();
  const back = useGoBack("/studio");
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the connection state once on the client
    setOffline(navigator.onLine === false);
  }, []);
  return (
    <Screen>
      <TopBar title="Template" onBack={back} />
      <div className="flex flex-1 items-center justify-center pb-16">
        <EmptyState
          icon="offline"
          title="This template isn’t available right now."
          body={offline ? "You’re offline. Connect and try again." : "Online templates need a content service. The built-in collage layouts are always available."}
          action={<Button icon="frame" onClick={() => router.replace("/studio")}>Built-in templates</Button>}
        />
      </div>
    </Screen>
  );
}
