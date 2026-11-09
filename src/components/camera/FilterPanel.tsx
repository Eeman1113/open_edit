"use client";

// Camera filter drawer: category chips, a strip of filter cards, the strength slider and the favourite toggle.
// Tap a card to apply it; tap the applied card again to show/hide its strength slider; press and hold to (un)favourite.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Chip, Icon, IconButton, Slider, SLIDER_HEIGHT, Thumb, cx, toast as globalToast } from "@/components/ui";
import { getAsset, hasAsset } from "@/lib/assets";
import type { LocalFilter } from "@/lib/filters";
import { FilterInventory, useFilterInventory } from "./FilterInventory";

export { cameraFilterCategories, useFilterInventory, isFilterShown } from "./FilterInventory";

export const PANEL_H = 214;
const FAVORITE_ID = 310000;

export interface FilterCategory { id: number; label: string; filters: LocalFilter[] }

/** Preview image for a filter from the asset pack (kind "filter-thumb"), if any. */
export function filterThumb(f: LocalFilter): string | undefined {
  for (const id of [f.key, f.key.toLowerCase(), f.thumb ?? ""]) if (id && hasAsset("filter-thumb", id)) return getAsset("filter-thumb", id);
  return f.thumb && /^(\/|https?:|data:)/.test(f.thumb) ? f.thumb : undefined;
}

interface Props {
  categories: FilterCategory[];
  /** `${categoryId}:${filterKey}` of the applied filter. */
  selectedKey: string;
  favorites: string[];
  /** Strength slider visible. */
  showSlider: boolean;
  /** Second argument = id of the category the card was tapped in. */
  onSelect: (f: LocalFilter, categoryId?: number) => void;
  onToggleFavorite: (f: LocalFilter) => void;
  onClose: () => void;
  recording?: boolean;
  onToast?: (text: string) => void;
  strength?: { value: number; def: number; onChange: (v: number) => void; onCommit: (v: number) => void };
  /** First-time hint about press-and-hold. */
  favoriteTooltip?: boolean;
  onFavoriteTooltipShown?: () => void;
  inventoryOpen?: boolean;
  onInventoryOpenChange?: (open: boolean) => void;
}

export function FilterPanel({
  categories: raw, selectedKey, favorites, showSlider, onSelect, onToggleFavorite, onClose, recording = false, onToast,
  strength, favoriteTooltip = false, onFavoriteTooltipShown, inventoryOpen: invOpenProp, onInventoryOpenChange,
}: Props) {
  const say = onToast ?? ((s: string) => globalToast(s));
  const inv = useFilterInventory();
  const categories = useMemo(() => inv.apply(raw).filter((c) => c.filters.length > 0), [inv, raw]);
  const [invLocal, setInvLocal] = useState(false);
  const invOpen = invOpenProp ?? invLocal;
  const setInv = (o: boolean) => { setInvLocal(o); onInventoryOpenChange?.(o); };

  const flat = useMemo(() => categories.flatMap((c) => c.filters.map((f) => ({ c, f, key: `${c.id}:${f.key}` }))), [categories]);
  const selected = flat.find((x) => x.key === selectedKey) ?? flat.find((x) => x.f.key === selectedKey.split(":")[1]);
  const selFilter = selected?.f;
  const selFav = !!selFilter && favorites.includes(selFilter.key);
  const [cat, setCat] = useState<number | undefined>(undefined);
  const activeCat = cat ?? selected?.c.id ?? categories[0]?.id;
  const shown = flat.filter((x) => x.c.id === activeCat);

  const listRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  useLayoutEffect(() => {
    const el = cardRefs.current.get(selected?.key ?? ""), list = listRef.current;
    if (el && list) list.scrollTo({ left: el.offsetLeft - list.clientWidth / 2 + el.offsetWidth / 2, behavior: "smooth" });
  }, [selected?.key, activeCat]);

  // first-run hint
  const [tip, setTip] = useState(false);
  useEffect(() => {
    if (!favoriteTooltip) return;
    const a = window.setTimeout(() => { setTip(true); onFavoriteTooltipShown?.(); }, 300);
    const b = window.setTimeout(() => setTip(false), 3300);
    return () => { clearTimeout(a); clearTimeout(b); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favoriteTooltip]);

  // press-and-hold = favourite
  const press = useRef<{ t?: number; fired: boolean }>({ fired: false });
  const hold = (f: LocalFilter) => {
    if (f.key === "ORIGINAL") return false;
    const adding = !favorites.includes(f.key);
    onToggleFavorite(f);
    say(adding ? `${f.name} added to favourites` : `${f.name} removed from favourites`);
    navigator.vibrate?.(12);
    return true;
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {/* strength + favourite, floating just above the drawer */}
      <div className="pointer-events-auto absolute inset-x-0 flex items-end gap-2 px-3" style={{ bottom: PANEL_H + 6 }}>
        <div className="min-w-0 flex-1">
          {strength && showSlider && selFilter && selFilter.key !== "ORIGINAL" && (
            <Slider
              aria-label="Filter strength"
              value={strength.value}
              def={strength.def}
              onChange={strength.onChange}
              onCommit={(v) => strength.onCommit(Math.round(v * 100) / 100)}
              label="always"
              tone="overlay"
            />
          )}
        </div>
        {selFilter && selFilter.key !== "ORIGINAL" && (
          <IconButton
            icon="star"
            label={selFav ? "Remove from favourites" : "Add to favourites"}
            variant="glass"
            filled={selFav}
            className={selFav ? "text-accent" : undefined}
            size={38}
            iconSize={18}
            style={{ marginBottom: (SLIDER_HEIGHT - 38) / 2 }}
            onClick={() => hold(selFilter)}
          />
        )}
      </div>

      {tip && (
        <div className="pointer-events-auto absolute inset-x-4 flex items-center gap-2 rounded-md bg-accent px-3 py-2.5 text-[13px] font-medium text-on-accent shadow-lg" style={{ bottom: PANEL_H + SLIDER_HEIGHT + 14, animation: "oe-rise 200ms" }}>
          <Icon name="star" size={16} /> Press and hold a filter to pin it to Favourites.
        </div>
      )}

      <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex flex-col rounded-t-xl bg-panel/95 backdrop-blur-xl" style={{ height: PANEL_H }}>
        <div className="flex h-12 shrink-0 items-center gap-1 pl-2 pr-2">
          <IconButton icon="chevron-down" label="Close filters" onClick={onClose} size={36} iconSize={22} className="text-fg-2" />
          <div className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1">
            {categories.map((c) => (
              <Chip key={c.id} selected={c.id === activeCat} icon={c.id === FAVORITE_ID ? "star" : undefined} onClick={() => setCat(c.id)}>
                {c.id === FAVORITE_ID ? "Favourites" : c.label.charAt(0) + c.label.slice(1).toLowerCase()}
              </Chip>
            ))}
          </div>
          <IconButton
            icon="menu"
            label="Manage filters"
            size={36}
            iconSize={20}
            className="text-fg-2"
            onClick={() => (recording ? say("You can manage filters after recording.") : setInv(true))}
          />
        </div>

        <div ref={listRef} className="no-scrollbar flex flex-1 items-start gap-2.5 overflow-x-auto px-4 pt-2">
          {shown.map(({ f, c, key }) => {
            const on = key === selected?.key || (!selected && f.key === selectedKey);
            const fav = favorites.includes(f.key);
            return (
              <button
                key={key}
                ref={(el) => { if (el) cardRefs.current.set(key, el); }}
                type="button"
                data-key={key}
                className="oe-press flex w-[68px] shrink-0 flex-col items-center gap-1.5"
                onClick={() => { if (press.current.fired) { press.current.fired = false; return; } if (!recording) onSelect(f, c.id); }}
                onPointerDown={() => { press.current.fired = false; clearTimeout(press.current.t); press.current.t = window.setTimeout(() => { press.current.fired = hold(f); }, 500); }}
                onPointerUp={() => clearTimeout(press.current.t)}
                onPointerLeave={() => clearTimeout(press.current.t)}
                onPointerCancel={() => clearTimeout(press.current.t)}
                onContextMenu={(e) => e.preventDefault()}
              >
                <Thumb
                  src={filterThumb(f)}
                  seed={f.key}
                  label={f.key === "ORIGINAL" ? undefined : f.name.slice(0, 2)}
                  className={cx("h-[68px] w-[68px] rounded-md ring-offset-2 ring-offset-panel transition-shadow", on && "ring-2 ring-accent")}
                >
                  {f.key === "ORIGINAL" && <span className="absolute inset-0 flex items-center justify-center bg-raised text-fg-2"><Icon name="block" size={24} /></span>}
                  {on && f.key !== "ORIGINAL" && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/35 text-white">
                      <Icon name={showSlider ? "edit" : "check"} size={22} stroke={2.2} />
                    </span>
                  )}
                  {fav && <Icon name="star" filled size={12} className="absolute left-1.5 top-1.5 text-accent drop-shadow" />}
                </Thumb>
                <span className={cx("w-full truncate text-center text-[11px] font-medium", on ? "text-fg" : "text-fg-3")}>{f.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {invOpen && <FilterInventory categories={raw} favorites={favorites} onToggleFavorite={onToggleFavorite} onClose={() => setInv(false)} inventory={inv} />}
    </div>
  );
}
