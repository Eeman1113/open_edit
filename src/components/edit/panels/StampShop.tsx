"use client";

// Sticker library: every built-in sticker pack with a preview row and Add / Remove. Added packs show up as tabs in
// the sticker picker. Everything is local and free. Also used on its own page (/stamp-shop).
//
// The first time the picker opens, a balloon over the library button points people to it.
import { useEffect, useState, type RefObject } from "react";
import { Button, Icon, TopBar } from "@/components/ui";
import { useBackHandler } from "@/lib/back";
import { TopBalloon } from "../balloon";
import { addedPacks, setAddedPacks, STAMP_PACKS } from "../stamps";

const SHOWN_KEY = "oe:edit:stampLibraryHint";

export function stampShopTooltipPending(): boolean {
  try { return localStorage.getItem(SHOWN_KEY) !== "1"; } catch { return false; }
}
export function markStampShopTooltipShown() {
  try { localStorage.setItem(SHOWN_KEY, "1"); } catch { /* storage unavailable */ }
}

export function StampShop({ onClose, onChange }: { onClose: () => void; onChange?: (ids: string[]) => void }) {
  const [shown, setShown] = useState(false);
  const [added, setAdded] = useState<string[]>(addedPacks);
  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, []);
  useBackHandler(onClose);
  const toggle = (id: string) => {
    const next = added.includes(id) ? added.filter((x) => x !== id) : [...added, id];
    setAdded(next); setAddedPacks(next); onChange?.(next);
  };
  return (
    <div
      className="absolute inset-0 z-[96] flex flex-col bg-bg text-fg"
      style={{ transform: shown ? "none" : "translateY(100%)", transition: "transform 320ms var(--oe-ease)" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <TopBar title="Sticker library" onBack={onClose} />
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-8">
        <p className="mb-4 mt-1 text-[14px] leading-relaxed text-fg-3">Add packs to your sticker picker. They&apos;re all built in, so they work offline.</p>
        <div className="flex flex-col gap-3">
          {STAMP_PACKS.map((p) => {
            const on = added.includes(p.id);
            return (
              <section key={p.id} className="rounded-lg bg-panel p-4">
                <div className="mb-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-[17px] font-semibold">{p.name}</h3>
                    <p className="text-[13px] text-fg-3">{p.about} · {p.stamps.length} stickers</p>
                  </div>
                  <Button size="sm" variant={on ? "secondary" : "primary"} icon={on ? "check" : "plus"} onClick={() => toggle(p.id)}>{on ? "Added" : "Add"}</Button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {p.stamps.map((src, i) => (
                    <span key={i} className="flex aspect-square items-center justify-center rounded-md bg-raised p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" draggable={false} className="h-full w-full object-contain" />
                    </span>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
        <p className="mt-6 flex items-center justify-center gap-2 text-[12px] text-fg-3"><Icon name="info" size={14} /> You can also turn your own pictures into stickers in the picker.</p>
      </div>
    </div>
  );
}

/** One-time hint over the library button. */
export function StampShopBalloon({ anchor, onClick }: { anchor: RefObject<HTMLElement | null>; onClick: () => void }) {
  return <TopBalloon anchor={anchor} text="More sticker packs in here" onClick={onClick} />;
}
