"use client";

// Filter tab: VideoFilterListFragment (fragment_video_filter_list.xml): area_edit_filter_feature (148dp, black) with
// video_filter_decoration_tab (Store + divider + NewFilterCategoryAdapter, 40dp + 10/10 margins) and the filter list
// (gallery_filter_special_item_layout 55x88), video_filterpower_layout (CustomSeekBar, start 50 / end 69, 13dp above),
// filter_name_layout swipe tooltip (22sp, top 82dp), filter_favorite_tooltip on first open.
import { useEffect, useRef, useState } from "react";
import { d } from "@/components/ui/legacy-drawable";
import { EDIT_BASIC_ORDER, filterByKey, galleryStrengthFor, type LocalFilter } from "@/lib/filters";
import { CustomSeekBar, seekBarHeight } from "@/components/camera/CustomSeekBar";
import { PRIMARY } from "./model";

const FAV_KEY = "b612:edit:favoriteFilters";
const THEME = "#C1C2C5";
const ITEM_W = 55, LIST_H = 88;
export const FILTER_AREA_H = 148;

const BASIC = EDIT_BASIC_ORDER.map((k) => filterByKey(k)!).filter(Boolean);
export const defStrength = (key: string) => { const f = filterByKey(key); return f ? galleryStrengthFor(f) : 0.8; };

function readFavs(): string[] {
  try { return (JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]") as string[]).filter((k) => BASIC.some((b) => b.key === k)); } catch { return []; }
}

export function VideoFilterPanel({ value, onChange, onCommit, onToast }: {
  value: { key: string; strength: number };
  onChange: (v: { key: string; strength: number }) => void;
  onCommit: (v: { key: string; strength: number }) => void;
  onToast: (t: string) => void;
}) {
  const [favs, setFavs] = useState<string[]>(readFavs);
  const [slider, setSlider] = useState(false);
  const [tip, setTip] = useState<{ name: string; ltr: boolean; n: number } | null>(null);
  const [favTip, setFavTip] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const press = useRef<{ t?: number; fired: boolean }>({ fired: false });
  const cats = [...(favs.length ? [{ id: 310000, label: "FAVORITE", filters: favs.map((k) => filterByKey(k)!) }] : []), { id: 310001, label: "BASIC", filters: BASIC }];
  const flat = cats.flatMap((c) => c.filters.map((f, i) => ({ c, f, first: i === 0, key: `${c.id}:${f.key}` })));
  const [activeCat, setActiveCat] = useState(310001);
  const selIdx = flat.findIndex((x) => x.f.key === value.key);

  useEffect(() => { const t = window.setTimeout(() => setFavTip(false), 2200); return () => window.clearTimeout(t); }, []);
  useEffect(() => {
    const el = listRef.current?.children[Math.max(0, selIdx)] as HTMLElement | undefined;
    if (el && listRef.current) listRef.current.scrollTo({ left: el.offsetLeft + ITEM_W / 2 - listRef.current.clientWidth / 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (f: LocalFilter, idx: number) => {
    if (f.key === value.key) { if (f.key !== "ORIGINAL") setSlider((s) => !s); return; }
    const v = { key: f.key, strength: defStrength(f.key) };
    onCommit(v);
    setSlider(false);
    setTip({ name: f.name, ltr: idx < selIdx, n: (tip?.n ?? 0) + 1 });
    const list = listRef.current, el = list?.children[idx] as HTMLElement | undefined;
    if (list && el) list.scrollTo({ left: el.offsetLeft + ITEM_W / 2 - list.clientWidth / 2, behavior: "smooth" });
  };
  const toggleFav = (f: LocalFilter) => {
    if (f.key === "ORIGINAL") return;
    const on = favs.includes(f.key);
    const next = on ? favs.filter((k) => k !== f.key) : [f.key, ...favs];
    setFavs(next);
    onToast(on ? "Removed from Favorites." : "Added to Favorites.");
    try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const scrollToCat = (id: number) => {
    setActiveCat(id);
    const idx = flat.findIndex((x) => x.c.id === id);
    const el = listRef.current?.children[idx] as HTMLElement | undefined;
    if (el && listRef.current) listRef.current.scrollTo({ left: el.offsetLeft - 15, behavior: "smooth" });
  };

  return (
    <>
      {/* filter_name_layout: 22sp white, shadow #b000 r3, top 82dp, swipe animation */}
      {tip && (
        <div key={tip.n} className="pointer-events-none absolute inset-x-0 flex justify-center text-white" style={{ top: 82, fontSize: 22, textShadow: "0 0 3px rgba(0,0,0,0.69)", animation: `${tip.ltr ? "ve-swipe-r" : "ve-swipe-l"} 1800ms cubic-bezier(0,0,0.2,1) both` }}>
          {tip.name}
        </div>
      )}
      {/* video_filterpower_layout */}
      {slider && value.key !== "ORIGINAL" && (
        <div className="absolute" style={{ left: 50, right: 69, bottom: FILTER_AREA_H + 13, height: seekBarHeight() }}>
          <CustomSeekBar value={value.strength} def={defStrength(value.key)} onChange={(s) => onChange({ ...value, strength: s })} onCommit={(s) => onCommit({ ...value, strength: s })} />
        </div>
      )}
      {/* filter_favorite_tooltip: 49dp common_primary above the area */}
      <div className="pointer-events-none absolute inset-x-0 flex items-center justify-center truncate text-white" style={{ bottom: FILTER_AREA_H, height: 49, background: PRIMARY, fontSize: 14, opacity: favTip ? 1 : 0, transition: "opacity 200ms" }}>
        Tap and hold a filter to add it as a favorite.
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-black" style={{ height: FILTER_AREA_H }}>
        <div className="flex" style={{ height: 60 }}>
          <button type="button" onClick={() => onToast("You are not connected to network.\nPlease check your network settings and try again.")} className="flex h-full shrink-0 items-center" style={{ marginLeft: 15 }}>
            <img src={d("filter_store")} alt="" style={{ width: 16, height: 16.33 }} draggable={false} />
            <span className="whitespace-nowrap" style={{ marginLeft: 4, paddingRight: 12, fontSize: 13, lineHeight: "15px", color: PRIMARY }}>Store</span>
          </button>
          <span className="shrink-0 self-center" style={{ width: 1, height: 14, background: "rgba(255,255,255,0.2)" }} />
          <div className="no-scrollbar flex min-w-0 flex-1 items-center overflow-x-auto" style={{ height: 40, marginTop: 10, marginBottom: 10 }}>
            {cats.map((c, i) => {
              const sel = c.id === activeCat;
              return (
                <button
                  key={c.id} type="button" onClick={() => scrollToCat(c.id)}
                  className="relative flex h-full shrink-0 items-center whitespace-nowrap"
                  style={{ marginLeft: i === 0 ? (cats.length > 1 && sel ? 15 : 3.5) : 6, marginRight: i === cats.length - 1 && i > 0 ? 15 : 0, padding: "0 11.5px", fontSize: 13, lineHeight: "15px" }}
                >
                  <span className="absolute inset-x-0" style={{ top: "50%", height: 27, transform: "translateY(-50%)", borderRadius: 50, background: sel ? "#ffffff" : "transparent" }} />
                  <span className="relative" style={{ fontWeight: sel ? 700 : 400, color: sel ? "#222222" : "#ffffff" }}>{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div
          ref={listRef}
          className="no-scrollbar flex overflow-x-auto"
          style={{ height: LIST_H }}
          onScroll={(e) => {
            const l = e.currentTarget;
            const first = Array.from(l.children).findIndex((c) => (c as HTMLElement).offsetLeft + ITEM_W > l.scrollLeft + 15);
            const cid = flat[Math.max(0, first)]?.c.id;
            if (cid && cid !== activeCat) setActiveCat(cid);
          }}
        >
          {flat.map((x, i) => {
            const sel = i === selIdx || (selIdx >= 0 && flat[selIdx].f.key === x.f.key && x.c.id === flat[selIdx].c.id);
            const fav = favs.includes(x.f.key);
            return (
              <div key={x.key} className="relative shrink-0 overflow-hidden" style={{ width: ITEM_W, height: LIST_H, marginLeft: i === 0 ? 15 : x.first ? 16 : 4, marginRight: i === flat.length - 1 ? 15 : 0, borderRadius: 3 }}>
                <button
                  type="button" className="relative block" style={{ width: ITEM_W, height: ITEM_W }}
                  onClick={() => { if (press.current.fired) { press.current.fired = false; return; } pick(x.f, i); }}
                  onPointerDown={() => { press.current.fired = false; window.clearTimeout(press.current.t); press.current.t = window.setTimeout(() => { press.current.fired = true; toggleFav(x.f); }, 500); }}
                  onPointerUp={() => window.clearTimeout(press.current.t)}
                  onPointerLeave={() => window.clearTimeout(press.current.t)}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <img src={d(x.f.thumb ?? "filterthumb_original")} alt="" className="absolute inset-0 h-full w-full" draggable={false} />
                  {sel && (
                    <span className="absolute inset-0">
                      <span className="absolute inset-0" style={{ background: PRIMARY, opacity: 0.9 }} />
                      <img src={d(slider && x.f.key !== "ORIGINAL" ? "filter_adjust" : "filter_confirm")} alt="" className="absolute" style={{ width: 30, height: 30, top: 16, left: 12.5 }} draggable={false} />
                    </span>
                  )}
                  {fav && <img src={d("favorite_flag")} alt="" className="absolute" style={{ width: 12, height: 12, left: 3, top: 3 }} draggable={false} />}
                </button>
                <div className="flex items-center justify-center overflow-hidden whitespace-nowrap text-white" style={{ height: 18, paddingBottom: 0.5, fontSize: 10, background: sel ? PRIMARY : THEME }} onClick={() => pick(x.f, i)}>
                  {x.f.name}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <style>{`
        @keyframes ve-swipe-r { 0% { opacity: .4; transform: translateX(-200%) } 16.7% { opacity: 1; transform: none } 72.2% { opacity: 1; transform: none } 100% { opacity: 0; transform: translateX(200%) } }
        @keyframes ve-swipe-l { 0% { opacity: .4; transform: translateX(200%) } 16.7% { opacity: 1; transform: none } 72.2% { opacity: 1; transform: none } 100% { opacity: 0; transform: translateX(-200%) } }
      `}</style>
    </>
  );
}
