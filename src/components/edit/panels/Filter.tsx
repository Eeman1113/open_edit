"use client";

// EPFilterFragment (fragment_edit_photo_filter_content.xml): group strip (item_edit_photo_filter_group),
// 55x73 thumbnails (item_edit_photo_filter, EPFilterDecoration), EditSeekBar strength, EPFilterTooltipView.
import { useCallback, useEffect, useRef, useState } from "react";
import { d } from "@/components/ui/legacy-drawable";
import { galleryStrengthFor, LOCAL_FILTERS } from "@/lib/filters";
import { useEdit } from "../ctx";
import { ControlRow, EditSeekBar, Img, hexAlpha } from "../ui";

const FAV_KEY = "b612:edit:favoriteFilters";
const THUMB_BG = "#C1C2C5"; // zo7.f132763b: local filters' thumbnailColor

/**
 * dsj.build() for the GLOBAL flavor (non-India locale): one group "BASIC" (310001) =
 * ORIGINAL, PRESET(internal, dropped by FilterLocalDataSource.p()), DAILY2, NO_FILTER2, NO_FILTER, DAILY,
 * AQUA, JELLY, MILK, SOFT, CLEAN, HEART, PRETTY.
 * Default slider value = LocalFilterStaticProperty isUseFrontInGallery ? strength : backStrength.
 */
const BASIC: { key: string; def: number }[] = [
  { key: "ORIGINAL", def: 0 },
  { key: "DAILY2", def: 0.5 },
  { key: "NO_FILTER2", def: 0.8 },
  { key: "NO_FILTER", def: 0.8 },
  { key: "DAILY", def: 0.55 },
  { key: "AQUA", def: 0.7 },
  { key: "JELLY", def: 0.7 },
  { key: "MILK", def: 0.7 },
  { key: "SOFT", def: 1.0 },
  { key: "CLEAN", def: 0.8 },
  { key: "HEART", def: 0.8 },
  { key: "PRETTY", def: 1.0 },
];
const info = (key: string) => LOCAL_FILTERS.find((f) => f.key === key)!;
const defOf = (key: string) => { const f = LOCAL_FILTERS.find((x) => x.key === key); return f ? galleryStrengthFor(f) : BASIC.find((b) => b.key === key)?.def ?? 0.8; };

function readFavs(): string[] {
  try { return (JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]") as string[]).filter((k) => BASIC.some((b) => b.key === k)); } catch { return []; }
}

type Group = "FAVORITE" | "BASIC";

/* ------------------------------------------------------------------ EPFilterArrowView (view_filter_arrow.xml) */

type Arrow = "NONE" | "FAVORITE" | "LEFT" | "RIGHT";
/** EPFilterArrow: resId + dir (FAVORITE and LEFT sit on the left edge, RIGHT on the right edge). */
const ARROW_RES: Record<Exclude<Arrow, "NONE">, { img: string; left: boolean }> = {
  FAVORITE: { img: "icon_filter_arrow_favorite_full", left: true },
  LEFT: { img: "icon_filter_arrow_left_full", left: true },
  RIGHT: { img: "icon_filter_arrow_right_full", left: false },
};

/**
 * Arrow hint over the top of list_filter: 110dp tall ImageViews (centerCrop, wrap width = 40dp) at the left / right
 * edge. q(arrow): fade in 500 ms, then (startDelay 1000) fade out 500 ms, then o() hides it. Shown as FAVORITE when a
 * filter is added to the favourites (EPFilterViewModel.zg -> fp7.a), and as LEFT / RIGHT when the list scrolled more
 * than 3 items away from where it last stopped; hidden when the list reaches the arrow's end. Tapping LEFT/FAVORITE
 * scrolls to the first item, RIGHT to the last.
 */
function useFilterArrow(listRef: React.RefObject<HTMLDivElement | null>) {
  const [arrow, setArrow] = useState<{ a: Arrow; n: number }>({ a: "NONE", n: 0 });
  const cur = useRef<Arrow>("NONE");
  const stopPos = useRef(-1), prePos = useRef(-1);
  const stopT = useRef<number | undefined>(undefined);
  const show = useCallback((a: Exclude<Arrow, "NONE">) => { cur.current = a; setArrow((o) => ({ a, n: o.n + 1 })); }, []);
  const hide = useCallback(() => { cur.current = "NONE"; setArrow((o) => ({ a: "NONE", n: o.n })); }, []);
  const visible = () => {
    const list = listRef.current;
    if (!list) return null;
    const kids = Array.from(list.children) as HTMLElement[];
    const l = list.scrollLeft, r = l + list.clientWidth;
    const first = kids.findIndex((c) => c.offsetLeft + c.offsetWidth > l);
    let last = -1;
    kids.forEach((c, i) => { if (c.offsetLeft < r) last = i; });
    return { first: Math.max(0, first), last, count: kids.length };
  };
  /** RecyclerView.OnScrollListener.onScrolled */
  const onScroll = () => {
    const v = visible();
    if (!v) return;
    // onScrollStateChanged(IDLE): remember the first visible position where the list stopped
    window.clearTimeout(stopT.current);
    stopT.current = window.setTimeout(() => { const w = visible(); if (w) stopPos.current = w.first; }, 120);
    if (prePos.current === v.first) return;
    if (prePos.current === -1) { prePos.current = v.first; if (stopPos.current < 0) stopPos.current = v.first; return; }
    prePos.current = v.first;
    const dirLeft = cur.current === "LEFT" || cur.current === "FAVORITE";
    if (dirLeft && v.first === 0) { hide(); return; }
    if (cur.current === "RIGHT" && v.last === v.count - 1) { hide(); return; }
    if (stopPos.current - v.first > 3) { stopPos.current = v.first; if (cur.current !== "LEFT") show("LEFT"); return; }
    if (v.first - stopPos.current > 3) { stopPos.current = v.first; if (cur.current !== "RIGHT") show("RIGHT"); }
  };
  useEffect(() => () => window.clearTimeout(stopT.current), []);
  const tap = (left: boolean) => {
    const list = listRef.current;
    if (list) list.scrollTo({ left: left ? 0 : list.scrollWidth, behavior: "smooth" });
    hide();
  };
  const node = arrow.a === "NONE" ? null : (
    <button
      key={arrow.n}
      type="button"
      onClick={() => tap(ARROW_RES[arrow.a as Exclude<Arrow, "NONE">].left)}
      className="absolute z-[1]"
      style={{ top: 0, height: 110, width: 40, [ARROW_RES[arrow.a].left ? "left" : "right"]: 0, animation: "filterArrow 2000ms linear both" }}
      onAnimationEnd={hide}
      aria-label="arrow"
    >
      <style>{"@keyframes filterArrow { 0% { opacity: 0 } 25% { opacity: 1 } 75% { opacity: 1 } 100% { opacity: 0 } }"}</style>
      <img src={d(ARROW_RES[arrow.a].img)} alt="" draggable={false} className="h-full w-full" style={{ objectFit: "cover" }} />
    </button>
  );
  return { node, onScroll, show };
}
interface Entry { key: string; group: Group }

export function FilterPanel() {
  const { doc, setLive, commit, undo, redo, setOriginal } = useEdit();
  const [favs, setFavs] = useState<string[]>(readFavs);
  const [sliderOn, setSliderOn] = useState(true);
  const [flash, setFlash] = useState(0);
  const [groupSel, setGroupSel] = useState<Group>("BASIC");
  const [selGroup, setSelGroup] = useState<Group>("BASIC");
  const listRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState("");
  const arrowView = useFilterArrow(listRef);
  const press = useRef<number | undefined>(undefined);
  const longPressed = useRef(false);
  const programmatic = useRef(false);
  const progT = useRef<number | undefined>(undefined);
  const markProgrammatic = () => { programmatic.current = true; window.clearTimeout(progT.current); progT.current = window.setTimeout(() => { programmatic.current = false; }, 600); };

  const cur = doc.filter;
  const isOriginal = cur.key === "ORIGINAL";
  const showSlider = !isOriginal && sliderOn;
  // filterList = favourites (newest first) + local groups
  const entries: Entry[] = [...favs.map((key) => ({ key, group: "FAVORITE" as const })), ...BASIC.map((b) => ({ key: b.key, group: "BASIC" as const }))];
  const groups: Group[] = favs.length ? ["FAVORITE", "BASIC"] : ["BASIC"];

  const centerItem = (idx: number, smooth = true) => {
    const list = listRef.current;
    const el = list?.children[idx] as HTMLElement | undefined;
    if (!list || !el) return;
    markProgrammatic();
    list.scrollTo({ left: el.offsetLeft + el.offsetWidth / 2 - list.clientWidth / 2, behavior: smooth ? "smooth" : "auto" });
  };

  // open: scroll the selected filter into the centre
  useEffect(() => {
    const idx = entries.findIndex((e) => e.key === cur.key && e.group === selGroup);
    centerItem(idx < 0 ? entries.findIndex((e) => e.key === cur.key) : idx, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** EPFilterTooltipView.c: anim_filter_swipe_{left_to_right,right_to_left}. */
  const showTooltip = (name: string, ltr: boolean) => {
    setTip(name);
    const el = tipRef.current;
    if (!el) return;
    el.getAnimations().forEach((a) => a.cancel());
    const from = ltr ? "-200%" : "200%", to = ltr ? "200%" : "-200%";
    el.animate([
      { opacity: 0.4, transform: `translateX(${from})`, offset: 0 },
      { opacity: 1, transform: "translateX(0)", offset: 300 / 1800 },
      { opacity: 1, transform: "translateX(0)", offset: 1300 / 1800 },
      { opacity: 0.4, transform: `translateX(${to})`, offset: 1 },
    ], { duration: 1800, fill: "both", easing: "cubic-bezier(0.0, 0.0, 0.2, 1)" });
  };

  const pick = (e: Entry, idx: number) => {
    if (e.key === cur.key) { setSliderOn((v) => !v); return; }
    const oldIdx = entries.findIndex((x) => x.key === cur.key);
    const newIdx = entries.findIndex((x) => x.key === e.key);
    commit({ ...doc, filter: { key: e.key, strength: defOf(e.key) } });
    setSelGroup(e.group);
    setSliderOn(true);
    setFlash((n) => n + 1);
    showTooltip(info(e.key).name, oldIdx > newIdx);
    centerItem(idx);
    setGroupSel(e.group);
  };

  const toggleFav = (key: string) => {
    if (key === "ORIGINAL") return; // zo7.mo154016d(): Original can't be a favourite
    const adding = !favs.includes(key);
    const next = adding ? [key, ...favs] : favs.filter((k) => k !== key);
    setFavs(next);
    // EPFilterViewModel.zg: adding a favourite emits fp7.a -> EPFilterFragment.H6 -> arrow FAVORITE
    if (adding) arrowView.show("FAVORITE");
    if (!next.length) setGroupSel("BASIC");
    try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  // scrolling the filter list selects the group under the left edge (EPFilterViewModel.lg)
  const onListScroll = () => {
    arrowView.onScroll();
    if (programmatic.current) return;
    const list = listRef.current;
    if (!list) return;
    const first = Array.from(list.children).findIndex((c) => (c as HTMLElement).offsetLeft + (c as HTMLElement).offsetWidth > list.scrollLeft);
    const g = entries[Math.max(0, first)]?.group ?? "BASIC";
    if (g !== groupSel) setGroupSel(g);
  };

  const tapGroup = (g: Group) => {
    setGroupSel(g);
    const idx = entries.findIndex((e) => e.group === g);
    const list = listRef.current;
    const el = list?.children[idx] as HTMLElement | undefined;
    if (!list || !el) return;
    markProgrammatic();
    list.scrollTo({ left: el.offsetLeft - 15, behavior: "smooth" });
  };

  return (
    <>
      {/* tooltip (EPFilterTooltipView): fills the area above container_feature, paddingTop 82 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden" style={{ bottom: 186 }}>
        <div ref={tipRef} className="flex flex-col items-center text-white" style={{ paddingTop: 82, opacity: 0 }}>
          <span style={{ fontSize: 22, lineHeight: "26px", margin: "0 2px", textShadow: "0 0 3px rgba(0,0,0,0.73)" }}>{tip}</span>
        </div>
      </div>
      <ControlRow undo={undo} redo={redo} onOriginal={setOriginal}>
        {showSlider && (
          <EditSeekBar
            style={{ marginLeft: 24, marginRight: 24 }}
            value={cur.strength}
            def={defOf(cur.key)}
            flashKey={flash}
            onChange={(v) => setLive({ ...doc, filter: { ...cur, strength: v } })}
            onRelease={(v) => commit({ ...doc, filter: { ...cur, strength: v } })}
          />
        )}
      </ControlRow>
      {/* container_feature: 134dp, transparent */}
      <div className="absolute inset-x-0" style={{ bottom: 52, height: 134 }}>
        {/* list_group: 27dp pills centred in the first 52dp band, paddingEnd 15, LinearItemDecoration(6) */}
        <div ref={groupRef} className="no-scrollbar absolute inset-x-0 flex items-center overflow-x-auto" style={{ top: 12.5, height: 27, paddingRight: 15, gap: 6 }}>
          {groups.map((g, i) => {
            const sel = groupSel === g;
            return (
              <div key={g} className="flex flex-none" style={{ paddingLeft: i === 0 && sel ? 11.5 : 0, transition: "padding-left 200ms cubic-bezier(0,0,0.2,1)" }}>
                <button
                  type="button"
                  onClick={() => tapGroup(g)}
                  className="relative flex items-center"
                  style={{ height: 27, padding: "0 11.5px", fontSize: 13, lineHeight: "15px", borderRadius: 13.5, background: sel ? "#ffffff" : "transparent", color: sel ? "#222222" : "#ffffff", fontWeight: sel ? 700 : 400 }}
                >
                  {g}
                </button>
              </div>
            );
          })}
        </div>
        {/* list_filter: top = 52dp guide (EPFilterDecoration: 15 edges, 2+2 inside a group, 15 at a group start) */}
        <div ref={listRef} onScroll={onListScroll} className="no-scrollbar absolute inset-x-0 flex overflow-x-auto" style={{ top: 52 }}>
          {entries.map((e, i) => {
            const f = info(e.key);
            const selected = cur.key === e.key;
            const groupStart = i > 0 && entries[i - 1].group !== e.group;
            const groupEnd = i < entries.length - 1 && entries[i + 1].group !== e.group;
            const last = i === entries.length - 1;
            return (
              <button
                key={`${e.group}:${e.key}`}
                type="button"
                className="relative flex flex-none flex-col overflow-hidden"
                style={{
                  width: 55, height: 73, borderRadius: 3, background: "rgba(0,0,0,0.6)",
                  marginLeft: i === 0 ? 15 : groupStart ? 15 : 2,
                  marginRight: last ? 15 : groupEnd ? 0 : 2,
                }}
                onPointerDown={() => {
                  longPressed.current = false;
                  window.clearTimeout(press.current);
                  press.current = window.setTimeout(() => { longPressed.current = true; toggleFav(e.key); }, 500);
                }}
                onPointerUp={() => window.clearTimeout(press.current)}
                onPointerLeave={() => window.clearTimeout(press.current)}
                onContextMenu={(ev) => ev.preventDefault()}
                onClick={() => { if (!longPressed.current) pick(e, i); }}
              >
                <div className="flex-1" style={{ background: THUMB_BG }}>
                  {f.thumb && <img src={d(f.thumb)} alt="" draggable={false} className="h-full w-full object-contain" />}
                </div>
                <div className="truncate text-center text-white" style={{ height: 18, lineHeight: "18px", fontSize: 10, background: THUMB_BG }}>{f.name}</div>
                <div className="absolute inset-0 flex justify-center" style={{ background: hexAlpha(THUMB_BG, 230 / 255), opacity: selected ? 1 : 0, transition: "opacity 150ms" }}>
                  <Img name="icon_thumbnail_confirm" size={30} style={{ marginTop: 16 }} />
                </div>
                {favs.includes(e.key) && <Img name="icon_filter_favorite" size={12} style={{ position: "absolute", top: 3, left: 3 }} />}
              </button>
            );
          })}
        </div>
        {/* arrow_view: top = list_filter top */}
        <div className="pointer-events-none absolute inset-x-0" style={{ top: 52, height: 110 }}>
          <div className="pointer-events-auto">{arrowView.node}</div>
        </div>
      </div>
    </>
  );
}
