"use client";

// Pick viewer for collage mode: view a photo full screen (pinch / double-tap to zoom, tap to hide the bars) and add
// it to the collage with "Add photo".
import { useEffect, useRef, useState } from "react";
import { Button, IconButton } from "@/components/ui";
import { useBackHandler } from "@/lib/back";
import type { Photo } from "@/lib/store";
import { ZoomImage } from "./ZoomImage";


export function SelectViewer({ items, urls, startId, onBack, onSelect }: {
  items: Photo[];
  urls: Map<string, string>;
  startId: string;
  onBack: () => void;
  onSelect: (p: Photo) => void;
}) {
  const pager = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(() => Math.max(0, items.findIndex((p) => p.id === startId)));
  const [bars, setBars] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const cur = Math.min(index, Math.max(0, items.length - 1));

  useEffect(() => {
    const el = pager.current;
    if (el) el.scrollTo({ left: cur * el.clientWidth });
  }, [items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const pop = (then?: () => void) => {
    setLeaving(true);
    window.setTimeout(() => {
      then?.();
      onBack();
    }, 350);
  };
  useBackHandler(pop);

  const item = items[cur];
  const title = `${items.length === 0 ? 0 : cur + 1} / ${items.length}`;

  return (
    <div
      className="absolute inset-0 z-40 bg-black"
      style={{ animation: "oe-fade-in 250ms", opacity: leaving ? 0 : 1, transition: "opacity 300ms" }}
    >
      {/* photoend_center_layout: full-screen pager behind the bars */}
      <div
        ref={pager}
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          if (i !== index) {
            setIndex(i);
            setZoomed(false);
          }
        }}
        className="no-scrollbar absolute inset-0 flex overflow-y-hidden"
        style={{ overflowX: zoomed ? "hidden" : "auto", scrollSnapType: "x mandatory", overscrollBehavior: "contain" }}
      >
        {items.map((p, i) => {
          const u = urls.get(p.id);
          return (
            <div key={`${p.id}-${i}`} className="relative h-full w-full flex-none" style={{ scrollSnapAlign: "start", scrollSnapStop: "always" }}>
              {u && Math.abs(i - cur) <= 2 && (
                <ZoomImage
                  src={u}
                  maxScale={32}
                  doubleTapScale={2}
                  active={i === cur}
                  onZoomedChange={(z) => i === cur && setZoomed(z)}
                  onTap={() => setBars((b) => !b)}
                />
              )}
            </div>
          );
        })}
      </div>

      {bars && (
        <>
          <div className="absolute inset-x-0 top-0 flex h-14 items-center justify-center bg-gradient-to-b from-black/60 to-transparent pt-[env(safe-area-inset-top)]">
            <span className="absolute left-2"><IconButton icon="back" label="Back" onClick={() => pop()} className="text-white" iconSize={26} /></span>
            <span className="tabular text-[15px] font-semibold text-white">{title}</span>
          </div>
          <div className="absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-black/60 to-transparent px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-10">
            <Button size="lg" icon="plus" disabled={!item} className="rounded-full" onClick={() => { if (!item) return; onSelect(item); pop(); }}>Add photo</Button>
          </div>
        </>
      )}
    </div>
  );
}
