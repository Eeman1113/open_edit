"use client";

// Me: the anonymous session. No accounts: this browser is the profile. Shows what is stored here and links to the
// gallery, settings and info.
import { useEffect, useState } from "react";
import { BottomNav, Icon, ListGroup, ListRow, Logo, ScrollBody, Screen } from "@/components/ui";
import { PHOTOS_EVENT } from "@/components/ui/app";
import { formatBytes, useStorageEstimate } from "@/components/settings/CameraSettings";
import { listPhotos } from "@/lib/store";

function usePhotoCount() {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    const load = () => void listPhotos().then((p) => setN(p.length)).catch(() => setN(0));
    load();
    window.addEventListener(PHOTOS_EVENT, load);
    return () => window.removeEventListener(PHOTOS_EVENT, load);
  }, []);
  return n;
}

export function MyTab() {
  const photos = usePhotoCount();
  const used = useStorageEstimate();
  return (
    <Screen bottomNav>
      <ScrollBody className="pb-10">
        <header className="px-4 pt-[max(16px,env(safe-area-inset-top))]">
          <h1 className="font-display text-[28px] font-bold tracking-tight">Me</h1>
        </header>
        <section className="mx-4 mt-4 rounded-xl bg-panel p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-raised"><Logo size={30} /></span>
            <div className="min-w-0">
              <p className="font-display text-[18px] font-bold">Guest session</p>
              <p className="text-[13px] leading-snug text-fg-3">No account needed. Everything stays in this browser.</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-md bg-raised px-3 py-2.5">
              <p className="tabular font-display text-[20px] font-bold">{photos ?? "…"}</p>
              <p className="text-[12px] text-fg-3">photos and videos</p>
            </div>
            <div className="rounded-md bg-raised px-3 py-2.5">
              <p className="tabular font-display text-[20px] font-bold">{used == null ? "…" : formatBytes(used)}</p>
              <p className="text-[12px] text-fg-3">stored on this device</p>
            </div>
          </div>
        </section>

        <ListGroup title="Your stuff">
          <ListRow icon="gallery" title="Gallery" href="/gallery" />
          <ListRow icon="collage" title="Make a collage" href="/gallery?mode=collage" />
          <ListRow icon="effects" title="Create a look" subtitle="Save your own filter and effect combo." href="/lens" />
          <ListRow icon="frame" title="Templates" subtitle="Collage layouts and ready-made designs." href="/studio" />
          <ListRow icon="palette" title="Art styles" subtitle="Turn a photo into a painting or sketch." href="/aistyle" />
        </ListGroup>
        <ListGroup title="App">
          <ListRow icon="settings" title="Settings" href="/settings" />
          <ListRow icon="bell" title="Inbox" href="/settings/notification" />
          <ListRow icon="info" title="About Open_Edit" href="/settings/about" />
        </ListGroup>
        <p className="mt-6 flex items-center justify-center gap-1.5 px-6 text-center text-[12px] text-fg-3">
          <Icon name="privacy" size={14} /> To start over, use Settings → Clear local data.
        </p>
      </ScrollBody>
      <BottomNav active="me" />
    </Screen>
  );
}
