"use client";

// "Manage filters" page: choose which filters appear in the camera strip, pin favourites and reorder them.
// The inventory (shown/hidden + favourite order) is stored per browser and shared with the camera.
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useBackHandler } from "@/lib/back";
import { CAMERA_BASIC_ORDER, FILTER_CATEGORY, filterByKey, type LocalFilter } from "@/lib/filters";
import { Button, Icon, IconButton, ListGroup, ScrollBody, Switch, Thumb, TopBar, cx, toast } from "@/components/ui";
import { filterThumb, type FilterCategory } from "./FilterPanel";

const FAVORITE_ID = 310000;
const KEY = "oe.camera.filterInventory";
const EVENT = "oe:filterInventory";

/** shown = visible in the camera strip (per filter key); favOrder = favourite order. */
interface InvState { shown: Record<string, boolean>; favOrder: string[] }
const EMPTY: InvState = { shown: {}, favOrder: [] };

/** User choice, else the filter's default; Original is always shown. */
export function isFilterShown(shown: Record<string, boolean>, key: string) {
  if (key === "ORIGINAL") return true;
  return shown[key] ?? filterByKey(key)?.defaultBookmark ?? false;
}
let cache: InvState | null = null;

function read(): InvState {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...EMPTY, ...(JSON.parse(raw) as InvState) } : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}
function write(s: InvState) {
  cache = s;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
  window.dispatchEvent(new Event(EVENT));
}
function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

export interface FilterInventoryApi {
  shown: Record<string, boolean>;
  isShown: (key: string) => boolean;
  favOrder: string[];
  setShown: (key: string, shown: boolean) => void;
  setFavOrder: (keys: string[]) => void;
  /** Apply hidden filters and favorite order to the camera list categories. */
  apply: (cats: FilterCategory[]) => FilterCategory[];
}

/** Camera strip categories: Favourites + All (camera order), filtered by the inventory. */
export function cameraFilterCategories(favorites: readonly string[], inv: Pick<FilterInventoryApi, "apply">): FilterCategory[] {
  return inv.apply([
    { id: FILTER_CATEGORY.FAVORITE, label: "Favourites", filters: favorites.map((k) => filterByKey(k)).filter((f): f is LocalFilter => !!f) },
    { id: FILTER_CATEGORY.BASIC, label: "All", filters: CAMERA_BASIC_ORDER.map((k) => filterByKey(k)!) },
  ]);
}

export function useFilterInventory(): FilterInventoryApi {
  const s = useSyncExternalStore(subscribe, read, () => EMPTY);
  const setShown = useCallback((key: string, v: boolean) => {
    const cur = read();
    write({ ...cur, shown: { ...cur.shown, [key]: v } });
  }, []);
  const setFavOrder = useCallback((keys: string[]) => write({ ...read(), favOrder: keys }), []);
  return useMemo(() => ({
    shown: s.shown,
    isShown: (k: string) => isFilterShown(s.shown, k),
    favOrder: s.favOrder,
    setShown,
    setFavOrder,
    apply: (cats: FilterCategory[]) =>
      cats.map((c) => {
        if (c.id !== FAVORITE_ID) return { ...c, filters: c.filters.filter((f) => isFilterShown(s.shown, f.key)) };
        const rank = (k: string) => { const i = s.favOrder.indexOf(k); return i < 0 ? 1e6 : i; };
        const fs = c.filters.filter((f) => isFilterShown(s.shown, f.key));
        return { ...c, filters: fs.map((f, i) => ({ f, i })).sort((a, b) => rank(a.f.key) - rank(b.f.key) || a.i - b.i).map((x) => x.f) };
      }),
  }), [s, setShown, setFavOrder]);
}

interface Props {
  categories: FilterCategory[];
  favorites: string[];
  onToggleFavorite: (f: LocalFilter) => void;
  onClose: () => void;
  inventory: FilterInventoryApi;
}

const ROW_H = 64;

export function FilterInventory({ categories, favorites, onToggleFavorite, onClose, inventory }: Props) {
  const { isShown, setShown, setFavOrder } = inventory;
  const favCat = inventory.apply(categories).find((c) => c.id === FAVORITE_ID);
  const favList = (favCat?.filters ?? []).filter((f) => favorites.includes(f.key));
  const all = CAMERA_BASIC_ORDER.filter((k) => k !== "ORIGINAL" && k !== "PRESET").map((k) => filterByKey(k)!).filter(Boolean);
  useBackHandler(onClose);

  const toggleFav = (f: LocalFilter) => {
    if (!favorites.includes(f.key)) {
      toast(`${f.name} pinned to Favourites`, { icon: "star" });
      if (!isShown(f.key)) setShown(f.key, true);
    }
    onToggleFavorite(f);
  };
  const toggleShown = (f: LocalFilter) => {
    if (isShown(f.key)) {
      if (favorites.includes(f.key)) onToggleFavorite(f);
      setShown(f.key, false);
    } else setShown(f.key, true);
  };

  // drag to reorder favourites (press and hold the grip)
  const [drag, setDrag] = useState<{ key: string; startY: number; dy: number; from: number } | null>(null);
  const dragTimer = useRef<number | undefined>(undefined);
  const order = favList.map((f) => f.key);
  const dragTo = drag ? Math.max(0, Math.min(order.length - 1, drag.from + Math.round(drag.dy / ROW_H))) : -1;
  const ordered = drag ? (() => { const o = order.filter((k) => k !== drag.key); o.splice(dragTo, 0, drag.key); return o; })() : order;

  const row = (f: LocalFilter, favSection: boolean) => {
    const on = favSection || isShown(f.key);
    const fav = favorites.includes(f.key);
    const dragging = drag?.key === f.key;
    return (
      <div
        key={(favSection ? "fav:" : "all:") + f.key}
        className={cx("relative flex items-center gap-3 bg-panel px-4", dragging && "z-[2] shadow-xl")}
        style={{ height: ROW_H, transform: dragging ? `translateY(${drag!.dy - (dragTo - drag!.from) * ROW_H}px)` : undefined }}
      >
        <Thumb src={filterThumb(f)} seed={f.key} label={f.name.slice(0, 2)} className={cx("h-11 w-11 shrink-0 rounded-sm", !on && "opacity-35")} />
        <span className={cx("min-w-0 flex-1 truncate text-[15px]", on ? "text-fg" : "text-fg-3")}>{f.name}</span>
        <IconButton icon="star" label={fav ? "Unpin" : "Pin to favourites"} filled={fav} size={36} iconSize={20} className={fav ? "text-accent" : "text-fg-3"} onClick={() => toggleFav(f)} />
        {favSection ? (
          <span
            className="flex h-9 w-9 touch-none items-center justify-center text-fg-3"
            aria-label="Drag to reorder"
            onPointerDown={(e) => {
              const y = e.clientY, el = e.currentTarget, id = e.pointerId;
              dragTimer.current = window.setTimeout(() => { el.setPointerCapture(id); setDrag({ key: f.key, startY: y, dy: 0, from: order.indexOf(f.key) }); }, 250);
            }}
            onPointerMove={(e) => drag && setDrag({ ...drag, dy: e.clientY - drag.startY })}
            onPointerUp={() => { clearTimeout(dragTimer.current); if (drag) { setFavOrder(ordered); setDrag(null); } }}
            onPointerCancel={() => { clearTimeout(dragTimer.current); setDrag(null); }}
          >
            <Icon name="grip" size={20} />
          </span>
        ) : (
          <Switch checked={on} onChange={() => toggleShown(f)} label={`Show ${f.name}`} />
        )}
      </div>
    );
  };

  return (
    <div className="pointer-events-auto absolute inset-0 z-50 flex flex-col bg-bg" style={{ animation: "oe-sheet-in 220ms var(--oe-ease)" }} onClick={(e) => e.stopPropagation()}>
      <TopBar title="Manage filters" onBack={onClose} actions={<Button size="sm" onClick={onClose}>Done</Button>} />
      <ScrollBody>
        {favList.length > 0 && (
          <ListGroup title="Favourites" footer="Hold the grip to change the order.">
            {ordered.map((k) => row(favList.find((x) => x.key === k)!, true))}
          </ListGroup>
        )}
        <ListGroup title="All filters" footer="Switched-off filters are hidden from the camera strip.">
          {all.map((f) => row(f, false))}
        </ListGroup>
        <div className="h-8" />
      </ScrollBody>
    </div>
  );
}
