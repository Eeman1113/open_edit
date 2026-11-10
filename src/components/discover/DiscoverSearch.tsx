"use client";

// Search Discover. Empty query: recent searches (up to 4) and trending keywords. Typing searches live
// (after a short pause) across looks, creators and tags, shown in tabs.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, Icon, IconButton, Tabs, Thumb, useGoBack } from "@/components/ui";
import { Avatar, Masonry, VerifiedBadge } from "./Discover";
import { addRecent, clearRecents, removeRecent, useUgc } from "./store";
import { FollowPopupHost } from "./Popups";
import { tagCount } from "./TagPage";
import {
  ALL_POSTS, CATEGORIES, TAGS, TREND_KEYWORDS, findPost, profileHref, relatedKeywordsFor, tagHref,
  type DiscoverAuthor, type DiscoverPost, type DiscoverTag,
} from "./types";
import { media } from "./media";
import { useBackHandler } from "@/lib/back";

type Tab = "top" | "looks" | "creators" | "tags";
const TABS: { id: Tab; label: string }[] = [
  { id: "top", label: "Top" }, { id: "looks", label: "Looks" }, { id: "creators", label: "Creators" }, { id: "tags", label: "Tags" },
];

export function DiscoverSearch() {
  const router = useRouter();
  const back = useGoBack("/discover");
  useBackHandler(back);
  const ugc = useUgc();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("top");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { const t = setTimeout(() => input.current?.focus(), 300); return () => clearTimeout(t); }, []);
  useEffect(() => { const t = setTimeout(() => setQuery(q.trim().toLowerCase()), 350); return () => clearTimeout(t); }, [q]);

  const results = useMemo(() => {
    if (!query) return null;
    const posts = ALL_POSTS.filter((p) => [p.title, p.author.name, p.filterName].some((s) => s.toLowerCase().includes(query)));
    const authors = new Map<string, DiscoverAuthor>();
    for (const p of ALL_POSTS) if (p.author.name.toLowerCase().includes(query)) authors.set(p.author.id, p.author);
    for (const c of CATEGORIES) for (const cr of c.creators ?? []) if (cr.name.toLowerCase().includes(query)) authors.set(cr.id, cr);
    const tags = TAGS.filter((t) => t.name.toLowerCase().includes(query.replace(/^#/, "")));
    return { posts, creators: [...authors.values()], tags, related: posts.length ? relatedKeywordsFor(query) : [] };
  }, [query]);

  const openTag = (t: DiscoverTag) => { addRecent("tag", t.name); router.push(tagHref(t.name)); };
  const keyword = (k: string) => { setQ(k); setQuery(k.toLowerCase()); };
  const recents = ugc.recents
    .map((r) => (r.kind === "post" ? { r, post: findPost(r.id) } : { r, tag: TAGS.find((t) => t.name === r.id) ?? { name: r.id, count: 0 } }))
    .filter((x) => ("post" in x ? x.post : true));

  const creatorRow = (a: DiscoverAuthor) => (
    <button key={a.id} type="button" onClick={() => router.push(profileHref(a.id))} className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-panel">
      <Avatar author={a} size={44} />
      <span className="flex min-w-0 items-center gap-1 truncate text-[15px] font-medium">{a.name}{a.creator && <VerifiedBadge />}</span>
    </button>
  );
  const tagRow = (t: DiscoverTag) => (
    <button key={t.name} type="button" onClick={() => openTag(t)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-panel">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-raised text-fg-2"><Icon name="hash" size={20} /></span>
      <span className="min-w-0"><span className="block truncate text-[15px]">#{t.name}</span><span className="text-[12px] text-fg-3">{tagCount(t.count)}</span></span>
    </button>
  );

  return (
    <div className="absolute inset-0 flex flex-col bg-bg">
      <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-[max(10px,env(safe-area-inset-top))]">
        <IconButton icon="back" label="Back" onClick={back} />
        <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-panel px-4">
          <Icon name="search" size={18} className="text-fg-3" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") input.current?.blur(); }}
            placeholder="Looks, creators, #tags"
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-3"
          />
          {q && <button type="button" aria-label="Clear" onClick={() => { setQ(""); setQuery(""); input.current?.focus(); }} className="text-fg-3"><Icon name="x-circle" size={18} /></button>}
        </label>
      </div>

      {!results ? (
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-10">
          {recents.length > 0 && (
            <section className="mt-3">
              <div className="flex items-center justify-between px-4">
                <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-fg-3">Recent</h2>
                <button type="button" onClick={clearRecents} className="text-[13px] font-semibold text-accent">Clear all</button>
              </div>
              <div className="mt-2">
                {recents.map((x) => (
                  <div key={`${x.r.kind}:${x.r.id}`} className="flex items-center pr-2">
                    <button type="button" className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left"
                      onClick={() => ("post" in x && x.post ? router.push(`/discover/post/${encodeURIComponent(x.post.id)}`) : "tag" in x && x.tag && openTag(x.tag))}>
                      {"post" in x && x.post
                        ? <Thumb src={media(x.post.thumbnail)} seed={x.post.id} className="h-11 w-11 shrink-0 rounded-sm" />
                        : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm bg-raised text-fg-2"><Icon name="hash" size={20} /></span>}
                      <span className="truncate text-[15px]">{"post" in x && x.post ? x.post.title : `#${x.r.id}`}</span>
                    </button>
                    <IconButton icon="close" label="Remove" size={36} iconSize={16} className="text-fg-3" onClick={() => removeRecent(x.r.kind, x.r.id)} />
                  </div>
                ))}
              </div>
            </section>
          )}
          <section className="mt-6 px-4">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-fg-3">Trending</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {TREND_KEYWORDS.slice(0, 10).map((k) => (
                <button key={k.keyword} type="button" onClick={() => keyword(k.keyword)} className="oe-press flex items-center gap-2 rounded-full bg-panel py-1 pl-1 pr-3.5 text-[14px]">
                  <Thumb src={media(k.thumbnail)} seed={k.keyword} className="h-8 w-8 rounded-full" />
                  {k.keyword}
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <>
          <Tabs className="shrink-0 border-b border-line" items={TABS} value={tab} onChange={setTab} />
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-10 pt-4">
            {tab === "top" && (
              <>
                {results.related.length > 0 && (
                  <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto px-4">
                    {results.related.map((k) => (
                      <button key={k.keyword} type="button" onClick={() => keyword(k.keyword)} className="flex shrink-0 items-center gap-2 rounded-full bg-panel py-1 pl-1 pr-3 text-[13px]">
                        <Thumb src={media(k.thumbnail)} seed={k.keyword} className="h-7 w-7 rounded-full" /> {k.keyword}
                      </button>
                    ))}
                  </div>
                )}
                {results.creators.slice(0, 3).map(creatorRow)}
                {results.tags.slice(0, 3).map(tagRow)}
                {results.posts.length > 0 && <div className="mt-3"><Masonry posts={results.posts} onPost={(p: DiscoverPost) => addRecent("post", p.id)} /></div>}
                {!results.posts.length && !results.creators.length && !results.tags.length && <EmptyState icon="search" title="No results" body={`Nothing matches “${q.trim()}”. Try another word.`} />}
              </>
            )}
            {tab === "looks" && (results.posts.length ? <Masonry posts={results.posts} onPost={(p: DiscoverPost) => addRecent("post", p.id)} /> : <EmptyState icon="image" title="No looks found" />)}
            {tab === "creators" && (results.creators.length ? results.creators.map(creatorRow) : <EmptyState icon="users" title="No creators found" />)}
            {tab === "tags" && (results.tags.length ? results.tags.map(tagRow) : <EmptyState icon="hash" title="No tags found" />)}
          </div>
        </>
      )}
      <FollowPopupHost />
    </div>
  );
}
