"use client";

// Effects drawer: AR effects grouped by category. The built-in set works offline; extra catalog categories come
// from the content API (fetchStickerCatalog) and show a retry state when it is unreachable.
import { useEffect, useState } from "react";
import { Button, Chip, EmptyState, IconButton, Spinner, Thumb, cx } from "@/components/ui";
import { getAsset, hasAsset } from "@/lib/assets";
import { LOCAL_STICKER_CATEGORIES, fetchStickerCatalog, type Sticker, type StickerCategory } from "@/data/camera/stickers";

export const STICKER_PANEL_H = 280;

/** Placeholder tab for the online catalog while it is loading or unavailable. */
const ONLINE: StickerCategory = { id: -1, text: "More", stickers: [], server: true };

/** Preview for an effect: pack thumbnail (kind "sticker-thumb"), else a URL on the sticker, else a swatch. */
export function stickerThumb(s: Sticker): string | undefined {
  const id = String(s.id);
  if (hasAsset("sticker-thumb", id)) return getAsset("sticker-thumb", id);
  if (s.thumbnail && hasAsset("sticker-thumb", s.thumbnail)) return getAsset("sticker-thumb", s.thumbnail);
  return s.thumbnail && /^(\/|https?:|data:)/.test(s.thumbnail) ? s.thumbnail : undefined;
}

const catLabel = (c: StickerCategory, i: number) => c.text ?? (c.server ? "More" : i === 0 ? "Featured" : `Set ${i + 1}`);

interface Props {
  selectedId?: number | null;
  /** Tapping the selected effect again clears it (null). */
  onSelect?: (s: Sticker | null) => void;
  onRemoveEffect?: () => void;
  onClose?: () => void;
  /** Effect whose resources / face model are still loading. */
  loadingId?: number | null;
}

type Phase = "loading" | "error" | "ready";

export function StickerPanel({ selectedId = null, onSelect, onRemoveEffect, onClose, loadingId = null }: Props) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [online, setOnline] = useState<StickerCategory[]>([]);
  const [sel, setSel] = useState(0);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchStickerCatalog()
      .then((c) => { if (alive) { setOnline(c); setPhase("ready"); } })
      .catch(() => alive && setPhase("error"));
    return () => { alive = false; };
  }, [attempt]);

  const cats: StickerCategory[] = [...LOCAL_STICKER_CATEGORIES, ...(online.length ? online : [ONLINE])];
  const cat = cats[Math.min(sel, cats.length - 1)];
  const pagePhase: Phase = cat.server ? phase : "ready";

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-xl bg-panel/95 backdrop-blur-xl" style={{ height: STICKER_PANEL_H }}>
      <div className="flex h-12 shrink-0 items-center gap-1 px-2">
        <IconButton icon="chevron-down" label="Close effects" size={36} iconSize={22} className="text-fg-2" onClick={onClose} />
        <div className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1">
          {cats.map((c, i) => <Chip key={c.id} selected={c === cat} onClick={() => setSel(i)}>{catLabel(c, i)}</Chip>)}
        </div>
        <Button size="sm" variant="secondary" icon="block" disabled={selectedId == null} onClick={() => onRemoveEffect?.()}>None</Button>
      </div>

      <div className="relative min-h-0 flex-1">
        {pagePhase === "ready" && (cat.stickers.length ? (
          <div className="no-scrollbar h-full overflow-y-auto px-3 pb-6 pt-1">
            <div className="grid grid-cols-5 gap-2">
              {cat.stickers.map((s) => {
                const on = s.id === selectedId;
                return (
                  <button key={s.id} type="button" data-sticker={s.id} aria-pressed={on} onClick={() => onSelect?.(on ? null : s)} className="oe-press relative aspect-square">
                    <Thumb src={stickerThumb(s)} seed={`fx${s.id}`} label={s.name?.slice(0, 2)} fit="contain" className={cx("h-full w-full rounded-md ring-offset-2 ring-offset-panel", on && "ring-2 ring-accent")} />
                    {loadingId === s.id && <span className="absolute inset-0 flex items-center justify-center rounded-md bg-black/40 text-white"><Spinner size={20} /></span>}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <EmptyState icon="effects" title="Nothing here yet" body="Effects you pin will show up in this tab." />
        ))}
        {pagePhase === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-[14px] text-fg-2"><Spinner size={18} /> Loading effects…</div>
        )}
        {pagePhase === "error" && (
          <EmptyState
            icon="offline"
            title="Can’t load more effects"
            body="The online catalog isn’t reachable. The built-in effects still work."
            action={<Button size="sm" variant="secondary" icon="reset" onClick={() => { setPhase("loading"); setAttempt((a) => a + 1); }}>Try again</Button>}
          />
        )}
      </div>
    </div>
  );
}
