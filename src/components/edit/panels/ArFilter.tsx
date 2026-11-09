"use client";

// Face FX tab: face-tracked AR stickers on the photo. The built-in set comes from the asset pack; a remote catalogue
// is added when the content API provides one. The picked sticker is drawn by the face engine in still-image mode, in
// the preview and in the full-size save.
import { useEffect, useRef, useState } from "react";
import { Icon, Spinner, cx } from "@/components/ui";
import { useBackHandler } from "@/lib/back";
import { LOCAL_STICKER_CATEGORIES, fetchStickerCatalog, type Sticker, type StickerCategory } from "@/data/camera/stickers";
import { useEdit } from "../ctx";
import type { Doc } from "../model";
import { ChipRow, ControlRow, Dock, EditBar, EmptyState, ToolChip } from "../ui";
import { detectFaces, ensureFaceAssets, preloadStickerPreview } from "../tools/portrait/faceEngine";

const SHEET_H = 300;
const withSticker = (d0: Doc, id: number | null): Doc => ({
  ...d0,
  beauty: { ...d0.beauty, face: { ...(d0.beauty.face ?? { f: {} }), sticker: id } },
});

export function ArFilterPanel({ onExit }: { onExit: () => void }) {
  const { doc, setLive, commit, setOriginal, bases } = useEdit();
  // the doc as it was when the page opened: Apply commits the pick onto it, Cancel drops it
  const [saved] = useState(doc);
  const savedId = saved.beauty.face?.sticker ?? null;
  const [selectedId, setSelectedId] = useState<number | null>(savedId);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [catIdx, setCatIdx] = useState(0);
  const [remote, setRemote] = useState<StickerCategory[]>([]);
  const [noFace, setNoFace] = useState(false);
  const seq = useRef(0);

  // remote categories, when a catalogue is configured (offline there are none and only the built-in set shows)
  useEffect(() => {
    let alive = true;
    fetchStickerCatalog().then((c) => { if (alive) setRemote(c); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  // face detection starts with the page (stickers need the face landmarks)
  useEffect(() => {
    const base = bases.current[saved.base];
    if (base) void detectFaces(base).then((d) => setNoFace(!d.faces.length)).catch(() => undefined);
  }, [bases, saved.base]);

  const cats: StickerCategory[] = [...LOCAL_STICKER_CATEGORIES, ...remote];
  const cat = cats[Math.min(catIdx, cats.length - 1)];

  const apply = (id: number | null) => {
    const n = ++seq.current;
    setSelectedId(id);
    if (id == null) {
      setLoadingId(null);
      setLive(savedId == null ? null : withSticker(saved, null));
      return;
    }
    setLoadingId(id);
    const base = bases.current[saved.base];
    const next = withSticker(saved, id);
    void Promise.all([
      base ? detectFaces(base) : Promise.resolve({ faces: [] }),
      preloadStickerPreview(id),
      ensureFaceAssets(next.beauty.face),
    ]).then(() => {
      if (n !== seq.current) return;
      setLoadingId(null);
      setLive(next);
    }).catch(() => { if (n === seq.current) setLoadingId(null); });
  };

  const onSelect = (s: Sticker) => apply(s.id === selectedId ? null : s.id);
  const close = () => { seq.current++; setLive(null); onExit(); };
  const confirm = () => {
    seq.current++;
    if (selectedId !== savedId && loadingId == null) commit(withSticker(saved, selectedId));
    else setLive(null);
    onExit();
  };
  useBackHandler(close);

  return (
    <>
      <ControlRow bottom={SHEET_H} onOriginal={setOriginal}>
        {noFace && <span className="mx-auto rounded-full bg-glass px-3 py-1.5 text-[12px] font-medium text-white backdrop-blur-md">No face found: face filters need one</span>}
      </ControlRow>
      <EditBar title="Face FX" onClose={close} onConfirm={confirm} />
      <Dock height={SHEET_H} className="flex flex-col">
        <div className="flex flex-none items-center gap-2 pl-3 pt-3">
          <button
            type="button" aria-label="No filter" aria-pressed={selectedId == null} onClick={() => apply(null)}
            className={cx("oe-press flex h-9 w-9 flex-none items-center justify-center rounded-full", selectedId == null ? "bg-fg text-bg" : "bg-raised text-fg-2")}
          >
            <Icon name="block" size={18} />
          </button>
          <span className="h-6 w-px flex-none bg-line" />
          <ChipRow className="pl-1 pr-3">
            {cats.map((c, i) => <ToolChip key={c.id} label={c.text ?? `Set ${i + 1}`} selected={c === cat} onClick={() => setCatIdx(i)} />)}
          </ChipRow>
        </div>
        <div className="no-scrollbar relative mt-3 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {cat.stickers.length ? (
            <div className="grid grid-cols-4 gap-2.5">
              {cat.stickers.map((s) => {
                const selected = s.id === selectedId;
                return (
                  <button
                    key={s.id} type="button" data-sticker={s.id} onClick={() => onSelect(s)} aria-pressed={selected}
                    className="oe-press flex flex-col items-center gap-1"
                  >
                    <span className={cx("relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-md bg-raised", selected && "ring-2 ring-accent ring-offset-2 ring-offset-panel")}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.thumbnail} alt="" className="h-[78%] w-[78%] object-contain" draggable={false} />
                      {loadingId === s.id && <span className="absolute inset-0 flex items-center justify-center bg-bg/50"><Spinner size={20} className="text-accent" /></span>}
                    </span>
                    {s.name && <span className={cx("w-full truncate text-center text-[11px] font-medium", selected ? "text-fg" : "text-fg-2")}>{s.name}</span>}
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyState text="Nothing in this set yet." icon="sticker" />
          )}
        </div>
      </Dock>
    </>
  );
}
