"use client";

// Bottom sheet to choose a photo for a tool: recent photos from the gallery, or one imported from the device.
import { useEffect, useRef, useState } from "react";
import { Button, EmptyState, Sheet, Spinner, toast } from "@/components/ui";
import { PHOTOS_EVENT } from "@/components/ui/app";
import { importFiles, isVideoPhoto, listPhotos, type Photo } from "@/lib/store";

export function PhotoPicker({ open, title, onClose, onPick }: { open: boolean; title: string; onClose: () => void; onPick: (photoId: string) => void }) {
  const [photos, setPhotos] = useState<{ p: Photo; url: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    let made: string[] = [];
    const load = () => listPhotos().then((all) => {
      if (!alive) return;
      made.forEach((u) => URL.revokeObjectURL(u));
      const list = all.filter((p) => !isVideoPhoto(p)).slice(0, 60).map((p) => ({ p, url: URL.createObjectURL(p.blob) }));
      made = list.map((x) => x.url);
      setPhotos(list);
    });
    void load();
    window.addEventListener(PHOTOS_EVENT, load);
    return () => { alive = false; window.removeEventListener(PHOTOS_EVENT, load); made.forEach((u) => URL.revokeObjectURL(u)); };
  }, [open]);

  const importFromDevice = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const [p] = await importFiles(files, (f) => toast(`Couldn’t open ${f.name}`, { icon: "alert", tone: "danger" }));
      if (p) onPick(p.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="px-4 pb-2">
        <Button block icon="upload" variant="secondary" loading={busy} onClick={() => file.current?.click()}>Choose from device</Button>
        <input ref={file} type="file" accept="image/*,.heic,.heif" hidden onChange={(e) => { void importFromDevice(e.target.files); e.target.value = ""; }} />
        <p className="mb-2 mt-5 text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-3">Recent</p>
        {photos === null ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : photos.length === 0 ? (
          <EmptyState icon="image" title="Your gallery is empty" body="Take a photo with the camera or choose one from your device." />
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {photos.map(({ p, url }) => (
              <button key={p.id} type="button" onClick={() => onPick(p.id)} className="oe-press aspect-square overflow-hidden rounded-sm bg-raised">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
