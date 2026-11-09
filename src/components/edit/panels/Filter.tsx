"use client";

// Filters tab: group chips (Favourites, Everyday, Film, Mood, Mono) over a strip of preview swatches. Tap a filter to
// apply it, tap it again to show or hide the strength slider, press and hold to add it to Favourites.
import { useEffect, useRef, useState } from "react";
import { Icon, toast } from "@/components/ui";
import { galleryStrengthFor, LOCAL_FILTERS, ORIGINAL_KEY, type FilterGroup, type LocalFilter } from "@/lib/filters";
import { useEdit } from "../ctx";
import { ChipRow, ControlRow, CTRL_H, EditSeekBar, MENU, PanelArea, ThumbItem, ToolChip } from "../ui";

export const FAV_KEY = "oe:edit:favoriteFilters";
const GROUPS: { id: FilterGroup | "fav"; label: string }[] = [
  { id: "fav", label: "Favourites" }, { id: "everyday", label: "Everyday" }, { id: "film", label: "Film" }, { id: "mood", label: "Mood" }, { id: "mono", label: "Mono" },
];
const byKey = (k: string) => LOCAL_FILTERS.find((f) => f.key === k);
export const defStrength = (key: string) => { const f = byKey(key); return f ? galleryStrengthFor(f) : 0.8; };

export function readFavs(): string[] {
  try { return (JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]") as string[]).filter((k) => k !== ORIGINAL_KEY && !!byKey(k)); } catch { return []; }
}
export function writeFavs(v: string[]) { try { localStorage.setItem(FAV_KEY, JSON.stringify(v)); } catch { /* storage unavailable */ } }

interface Entry { f: LocalFilter; group: FilterGroup | "fav" }

/** Filter strip shared by the photo and video editors. */
export function FilterStrip({ value, onPick, onToggleSlider, sliderOn, className }: {
  value: string; onPick: (f: LocalFilter) => void; onToggleSlider: () => void; sliderOn: boolean; className?: string;
}) {
  const [favs, setFavs] = useState<string[]>(readFavs);
  const listRef = useRef<HTMLDivElement>(null);
  const press = useRef<{ t?: number; fired: boolean }>({ fired: false });
  const programmatic = useRef(0);
  const entries: Entry[] = [
    { f: byKey(ORIGINAL_KEY)!, group: "everyday" },
    ...favs.map((k) => ({ f: byKey(k)!, group: "fav" as const })),
    ...LOCAL_FILTERS.filter((f) => f.key !== ORIGINAL_KEY).map((f) => ({ f, group: f.group })),
  ];
  const groups = GROUPS.filter((g) => g.id !== "fav" || favs.length);
  const [active, setActive] = useState<Entry["group"]>(() => byKey(value)?.group === "none" ? "everyday" : (byKey(value)?.group ?? "everyday"));

  const scrollTo = (i: number, mode: "centre" | "start", smooth = true) => {
    const list = listRef.current, el = list?.children[i] as HTMLElement | undefined;
    if (!list || !el) return;
    programmatic.current = performance.now();
    list.scrollTo({ left: mode === "centre" ? el.offsetLeft + el.offsetWidth / 2 - list.clientWidth / 2 : el.offsetLeft - 16, behavior: smooth ? "smooth" : "auto" });
  };
  useEffect(() => {
    const i = entries.findIndex((e) => e.f.key === value && e.group !== "fav");
    scrollTo(Math.max(0, i), "centre", false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleFav = (f: LocalFilter) => {
    if (f.key === ORIGINAL_KEY) return;
    const on = favs.includes(f.key);
    const next = on ? favs.filter((k) => k !== f.key) : [f.key, ...favs];
    setFavs(next); writeFavs(next);
    toast(on ? `${f.name} removed from Favourites` : `${f.name} added to Favourites`, { icon: "star" });
  };
  const onScroll = () => {
    if (performance.now() - programmatic.current < 600) return;
    const list = listRef.current;
    if (!list) return;
    const first = Array.from(list.children).findIndex((c) => (c as HTMLElement).offsetLeft + (c as HTMLElement).offsetWidth / 2 > list.scrollLeft + 16);
    const g = entries[Math.max(1, first)]?.group;
    if (g && g !== active) setActive(g);
  };

  return (
    <div className={className}>
      <ChipRow className="h-10">
        {groups.map((g) => (
          <ToolChip key={g.id} label={g.label} selected={active === g.id} onClick={() => { setActive(g.id); scrollTo(entries.findIndex((e) => e.group === g.id), "start"); }} />
        ))}
      </ChipRow>
      <div ref={listRef} onScroll={onScroll} className="no-scrollbar mt-1.5 flex gap-2.5 overflow-x-auto px-4 pb-1 pt-1">
        {entries.map((e, i) => {
          const sel = e.f.key === value;
          const groupStart = i > 0 && entries[i - 1].group !== e.group;
          return (
            <div
              key={`${e.group}:${e.f.key}`} className="flex flex-none" style={{ marginLeft: groupStart ? 10 : 0 }}
              onPointerDown={() => { press.current.fired = false; window.clearTimeout(press.current.t); press.current.t = window.setTimeout(() => { press.current.fired = true; toggleFav(e.f); }, 500); }}
              onPointerUp={() => window.clearTimeout(press.current.t)}
              onPointerLeave={() => window.clearTimeout(press.current.t)}
              onContextMenu={(ev) => ev.preventDefault()}
            >
              <ThumbItem
                size={56}
                label={e.f.name}
                src={e.f.thumb}
                none={e.f.key === ORIGINAL_KEY && !e.f.thumb}
                selected={sel}
                onClick={() => {
                  if (press.current.fired) { press.current.fired = false; return; }
                  if (sel) { if (e.f.key !== ORIGINAL_KEY) onToggleSlider(); return; }
                  onPick(e.f);
                  scrollTo(i, "centre");
                }}
                badge={(
                  <>
                    {favs.includes(e.f.key) && <span className="absolute left-1 top-1 text-accent drop-shadow"><Icon name="star" size={12} filled /></span>}
                    {sel && e.f.key !== ORIGINAL_KEY && (
                      <span className="absolute left-1 bottom-1 flex h-5 w-5 items-center justify-center rounded-full bg-glass text-white backdrop-blur-md">
                        <Icon name={sliderOn ? "chevron-down" : "edit"} size={12} />
                      </span>
                    )}
                  </>
                )}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Big filter name that flashes over the preview when a new filter is picked. */
export function FilterName({ name, n, bottom }: { name: string; n: number; bottom: number }) {
  if (!n) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-center" style={{ bottom }}>
      <span key={n} className="font-display text-[30px] font-bold tracking-tight text-white [text-shadow:0_2px_12px_rgba(0,0,0,0.55)]" style={{ animation: "oe-filter-name 1400ms var(--oe-ease) both" }}>
        {name}
      </span>
      <style>{"@keyframes oe-filter-name { 0% { opacity: 0; transform: scale(.92) } 15% { opacity: 1; transform: none } 75% { opacity: 1 } 100% { opacity: 0 } }"}</style>
    </div>
  );
}

export function FilterPanel() {
  const { doc, setLive, commit, setOriginal, undo } = useEdit();
  const [sliderOn, setSliderOn] = useState(true);
  const [flash, setFlash] = useState(0);
  const [name, setName] = useState({ text: "", n: 0 });
  const cur = doc.filter;
  const showSlider = cur.key !== ORIGINAL_KEY && sliderOn;
  return (
    <>
      <FilterName name={name.text} n={name.n} bottom={MENU + CTRL_H} />
      <ControlRow undo={undo} onOriginal={setOriginal}>
        {showSlider && (
          <EditSeekBar
            value={cur.strength}
            def={defStrength(cur.key)}
            flashKey={flash}
            onChange={(v) => setLive({ ...doc, filter: { ...cur, strength: v } })}
            onRelease={(v) => commit({ ...doc, filter: { ...cur, strength: v } })}
          />
        )}
      </ControlRow>
      <PanelArea className="pt-2.5">
        <FilterStrip
          value={cur.key}
          sliderOn={sliderOn}
          onToggleSlider={() => setSliderOn((v) => !v)}
          onPick={(f) => {
            commit({ ...doc, filter: { key: f.key, strength: defStrength(f.key) } });
            setSliderOn(true);
            setFlash((n) => n + 1);
            setName((o) => ({ text: f.name, n: o.n + 1 }));
          }}
        />
      </PanelArea>
    </>
  );
}
