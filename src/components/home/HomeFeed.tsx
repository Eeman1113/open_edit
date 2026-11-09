"use client";

// Home: quick actions, a featured carousel and content sections (filters, effects, looks, charts) from the feed.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, NAV_RESELECT, Thumb, Wordmark, cx, type IconName } from "@/components/ui";
import { bridgeThumb, cardShape, compactCount, hasAllPage, itemHasTitle, usedTimes, type CardShape } from "./model";
import { img } from "./media";
import type { GroupDto, GroupItemDto } from "./types";

/** Card tap: in-app path → navigate; web URL → new tab; app link (scheme://…) → the link router. */
export function useItemClick() {
  const router = useRouter();
  return (item: GroupItemDto) => {
    const url = item.itemProperty.actionUrl;
    if (!url) return;
    if (/^https?:/.test(url)) window.open(url, "_blank", "noopener");
    else if (url.startsWith("/")) router.push(url);
    else if (/^[a-z][a-z0-9+.-]*:/i.test(url)) router.push(`/s?url=${encodeURIComponent(url)}`);
  };
}

const QUICK: { href: string; icon: IconName; label: string }[] = [
  { href: "/", icon: "camera", label: "Camera" },
  { href: "/gallery", icon: "image", label: "Edit photo" },
  { href: "/gallery?mode=collage", icon: "collage", label: "Collage" },
  { href: "/ai", icon: "ai", label: "AI tools" },
];

const SUPPORTED = new Set(["HOME_BANNER", "BANNER", "BIG_BANNER", "ADVANCED", "BUTTON", "EFFECT", "FILTER", "MAKEUP", "DECORATED", "PURCHASE", "HYBRID", "TOP_CHART", "SHORTCUT"]);

export function HomeFeed({ groups }: { groups: GroupDto[] }) {
  const visible = useMemo(() => groups.filter((g) => SUPPORTED.has(g.type) && g.items.length), [groups]);
  const hero = visible.find((g) => g.type === "HOME_BANNER");
  const rest = visible.filter((g) => g !== hero);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onReselect = (e: Event) => { if ((e as CustomEvent<string>).detail === "home") listRef.current?.scrollTo({ top: 0, behavior: "smooth" }); };
    window.addEventListener(NAV_RESELECT, onReselect);
    return () => window.removeEventListener(NAV_RESELECT, onReselect);
  }, []);
  return (
    <div className="absolute inset-0 bg-bg" style={{ paddingBottom: "var(--oe-bottom-nav)" }}>
      <div ref={listRef} className="no-scrollbar h-full overflow-y-auto overscroll-contain pb-10">
        <header className="flex items-center justify-between px-4 pt-[max(14px,env(safe-area-inset-top))]">
          <Wordmark size={22} />
          <Link href="/settings" aria-label="Settings" className="oe-press flex h-10 w-10 items-center justify-center rounded-full bg-raised"><Icon name="settings" size={20} /></Link>
        </header>

        <nav aria-label="Quick actions" className="mt-5 grid grid-cols-4 gap-2 px-4">
          {QUICK.map((q, i) => (
            <Link key={q.href} href={q.href} className={cx("oe-press flex flex-col items-center gap-2 rounded-lg py-3.5 text-[12px] font-semibold", i === 0 ? "bg-accent text-on-accent" : "bg-panel text-fg")}>
              <Icon name={q.icon} size={22} />
              {q.label}
            </Link>
          ))}
        </nav>

        {hero && <Hero group={hero} />}
        {rest.map((g) => <Section key={g.id} group={g} />)}
        <p className="mt-10 px-6 text-center text-[12px] leading-relaxed text-fg-3">Open_Edit is free and open source. Your photos never leave this device.</p>
      </div>
    </div>
  );
}

/** Featured carousel: full-width cards that snap and auto-advance every 5 s (paused while touched). */
function Hero({ group }: { group: GroupDto }) {
  const click = useItemClick();
  const ref = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const hold = useRef(false);
  const n = group.items.length;
  useEffect(() => {
    if (n < 2) return;
    const t = window.setInterval(() => {
      const el = ref.current;
      if (!el || hold.current) return;
      const next = (Math.round(el.scrollLeft / el.clientWidth) + 1) % n;
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    }, 5000);
    return () => window.clearInterval(t);
  }, [n]);
  return (
    <section className="mt-6">
      <div
        ref={ref}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
        onScroll={(e) => setPage(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        onPointerDown={() => { hold.current = true; }}
        onPointerUp={() => { hold.current = false; }}
        onPointerCancel={() => { hold.current = false; }}
      >
        {group.items.map((it) => (
          <button key={it.id} type="button" onClick={() => click(it)} className="w-full shrink-0 snap-start px-4 text-left">
            <Thumb src={img(it, it.thumbnail)} seed={`hero${it.id}`} className="aspect-[16/10] w-full rounded-xl">
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-14">
                <span className="block font-display text-[22px] font-bold leading-tight text-white">{itemHasTitle(it) ? it.title : "Featured"}</span>
                {it.subTitle && <span className="mt-1 block text-[13px] text-white/80">{it.subTitle}</span>}
              </span>
            </Thumb>
          </button>
        ))}
      </div>
      {n > 1 && (
        <div className="mt-3 flex justify-center gap-1.5">
          {group.items.map((it, i) => <span key={it.id} className={cx("h-1.5 rounded-full transition-all", i === page ? "w-5 bg-accent" : "w-1.5 bg-muted")} />)}
        </div>
      )}
    </section>
  );
}

function SectionHeader({ group }: { group: GroupDto }) {
  const titled = !!group.title && group.title !== "untitled";
  if (!titled) return null;
  return (
    <div className="mb-3 flex items-end justify-between gap-3 px-4">
      <div className="min-w-0">
        <h2 className="truncate font-display text-[19px] font-bold">{group.title}</h2>
        {group.subTitle && <p className="truncate text-[13px] text-fg-3">{group.subTitle}</p>}
      </div>
      {hasAllPage(group) && (
        <Link href={`/home/group/${group.id}`} className="flex shrink-0 items-center gap-0.5 text-[13px] font-semibold text-accent">
          See all <Icon name="chevron-right" size={16} />
        </Link>
      )}
    </div>
  );
}

function Section({ group }: { group: GroupDto }) {
  const click = useItemClick();
  if (group.type === "TOP_CHART") {
    const rows = group.items.slice(0, Math.max(3, group.chartSize || 5));
    return (
      <section className="mt-9">
        <SectionHeader group={group} />
        <div className="mx-4 overflow-hidden rounded-lg bg-panel">
          {rows.map((it, i) => <ChartRow key={it.id} group={group} item={it} rank={i + 1} onClick={() => click(it)} />)}
        </div>
      </section>
    );
  }
  if (group.type === "BUTTON" || group.type === "SHORTCUT") {
    return (
      <section className="mt-9">
        <SectionHeader group={group} />
        <div className="no-scrollbar flex gap-3 overflow-x-auto px-4">
          {group.items.map((it) => (
            <button key={it.id} type="button" onClick={() => click(it)} className="oe-press flex w-[72px] shrink-0 flex-col items-center gap-2">
              <Thumb src={img(it, it.iconImage ?? it.thumbnail)} seed={`b${it.id}`} label={it.title.slice(0, 1)} className="h-14 w-14 rounded-full" />
              <span className="w-full truncate text-center text-[12px] text-fg-2">{it.title}</span>
            </button>
          ))}
        </div>
      </section>
    );
  }
  const shape: CardShape = group.type === "BANNER" || group.type === "ADVANCED" || group.type === "BIG_BANNER" ? "banner" : cardShape(group.thumbnailRatioType);
  return (
    <section className="mt-9">
      <SectionHeader group={group} />
      <div className="no-scrollbar flex snap-x gap-3 overflow-x-auto px-4 scroll-px-4">
        {group.items.map((it) => <Card key={it.id} group={group} item={it} shape={shape} onClick={() => click(it)} />)}
      </div>
    </section>
  );
}

const SHAPE: Record<CardShape, string> = {
  portrait: "w-[132px] aspect-[2/3]",
  square: "w-[128px] aspect-square",
  wide: "w-[240px] aspect-[7/4]",
  banner: "w-[300px] aspect-[15/7]",
};

export function Card({ group, item, shape, onClick, fill }: { group: GroupDto; item: GroupItemDto; shape: CardShape; onClick: () => void; fill?: boolean }) {
  const mini = bridgeThumb(item);
  const uses = usedTimes(group, item);
  return (
    <button type="button" onClick={onClick} className={cx("oe-press shrink-0 snap-start text-left", fill && "w-full")}>
      <Thumb src={img(item, item.thumbnail)} seed={`c${item.id}`} className={cx("rounded-lg", fill ? SHAPE[shape].replace(/w-\[\d+px\]/, "w-full") : SHAPE[shape])}>
        {item.itemProperty.newBadge && <span className="absolute left-2 top-2 rounded-xs bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase text-on-accent">New</span>}
        {mini && img(item, mini) && <Thumb src={img(item, mini)} seed={`m${item.id}`} className="absolute bottom-2 left-2 h-8 w-8 rounded-sm ring-2 ring-black/30" />}
      </Thumb>
      {itemHasTitle(item) && (
        <span className="mt-2 block max-w-full truncate text-[14px] font-semibold">{item.title}</span>
      )}
      {(item.subTitle || uses) && <span className="block truncate text-[12px] text-fg-3">{item.subTitle || uses}</span>}
    </button>
  );
}

export function ChartRow({ group, item, rank, onClick }: { group: GroupDto; item: GroupItemDto; rank: number; onClick: () => void }) {
  const n = group.showUseCount ? item.itemProperty.useCount ?? 0 : 0;
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 border-b border-line px-3 py-2.5 text-left last:border-b-0 active:bg-raised">
      <span className={cx("tabular w-6 text-center font-display text-[17px] font-bold", rank <= 3 ? "text-accent" : "text-fg-3")}>{rank}</span>
      <Thumb src={img(item, bridgeThumb(item) ?? item.thumbnail)} seed={`r${item.id}`} className="h-12 w-12 shrink-0 rounded-sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">{item.title}</span>
        {(item.subTitle || n > 0) && <span className="block truncate text-[12px] text-fg-3">{item.subTitle || `${compactCount(n)} uses`}</span>}
      </span>
      <Icon name="chevron-right" size={18} className="text-fg-3" />
    </button>
  );
}
