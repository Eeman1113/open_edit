"use client";

// Discover: looks shared as filters and effects. Search, a QR scanner, category tabs over swipeable pages
// (a two-column masonry of looks, or a list of creators), and a floating "Create a look" button.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BottomNav, Button, Icon, IconButton, NAV_RESELECT, Tabs, Thumb, cx } from "@/components/ui";
import { isLiked, likeCountOf, setFollow, toggleLike, useUgc } from "./store";
import { FollowPopupHost } from "./Popups";
import { formatCount, postHref, profileHref, type DiscoverAuthor, type DiscoverCategory, type DiscoverCreator, type DiscoverPost } from "./types";
import { media } from "./media";

/** Round avatar (image or a seeded gradient with the initial). */
export function Avatar({ author, size = 28, className }: { author: Pick<DiscoverAuthor, "id" | "name" | "profileImage">; size?: number; className?: string }) {
  return (
    <Thumb src={media(author.profileImage)} seed={author.id} className={cx("shrink-0 rounded-full", className)} style={{ width: size, height: size }}>
      {!media(author.profileImage) && <span className="absolute inset-0 flex items-center justify-center font-display font-bold text-white" style={{ fontSize: size * 0.42 }}>{author.name.slice(0, 1).toUpperCase()}</span>}
    </Thumb>
  );
}

export function VerifiedBadge() {
  return <Icon name="verified" size={14} className="shrink-0 text-info" label="Verified creator" />;
}

/** A look in a masonry column: picture, the filter used, title, author and likes. */
export function PostCard({ post, onPost, showTry = true }: { post: DiscoverPost; onPost?: (p: DiscoverPost) => void; showTry?: boolean }) {
  const router = useRouter();
  const ugc = useUgc();
  const liked = isLiked(ugc, post.id, post.like);
  const count = likeCountOf(ugc, post.id, post.like, post.likeCount);
  const [pop, setPop] = useState(0);
  const open = () => { onPost?.(post); router.push(postHref(post)); };
  const ratio = post.width && post.height ? post.width / post.height : 0.8;
  const likeable = post.type !== "SCHEME";
  return (
    <article className="mb-4 cursor-pointer" onClick={open}>
      <Thumb src={media(post.thumbnail)} seed={post.id} className="w-full rounded-lg" style={{ aspectRatio: `${Math.max(0.55, Math.min(1.4, ratio))}` }}>
        {post.video && <Icon name="play" size={16} filled className="absolute right-2.5 top-2.5 text-white drop-shadow" />}
        {post.type !== "SCHEME" && (
          <span className="absolute bottom-2 left-2 flex max-w-[calc(100%-16px)] items-center gap-1 rounded-full bg-black/45 py-1 pl-1 pr-2.5 text-[11px] font-semibold text-white backdrop-blur-sm">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-on-accent"><Icon name="filter" size={12} stroke={2.2} /></span>
            <span className="truncate">{showTry ? post.buttonText || post.filterName || "Try it" : post.filterName}</span>
          </span>
        )}
        {pop > 0 && <Icon key={pop} name="heart" filled size={56} className="absolute inset-0 m-auto text-white drop-shadow-lg" style={{ animation: "oe-pop 200ms, oe-fade-out 300ms 450ms forwards" }} />}
      </Thumb>
      <h3 className="mt-2 line-clamp-2 px-0.5 text-[14px] font-medium leading-snug">{post.title}</h3>
      <div className="mt-1.5 flex items-center gap-1.5 px-0.5">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5" onClick={(e) => { e.stopPropagation(); router.push(profileHref(post.author.id)); }}>
          <Avatar author={post.author} size={18} />
          <span className="truncate text-[12px] text-fg-3">{post.author.name}</span>
          {post.author.creator && <VerifiedBadge />}
        </button>
        {likeable && (
          <button type="button" aria-pressed={liked} aria-label={liked ? "Unlike" : "Like"} className={cx("oe-press flex shrink-0 items-center gap-1 text-[12px]", liked ? "text-danger" : "text-fg-3")}
            onClick={(e) => { e.stopPropagation(); toggleLike(post, !liked); if (!liked) setPop(Date.now()); }}>
            <Icon name="heart" size={15} filled={liked} />
            {count > 0 && <span className="tabular">{formatCount(count, true)}</span>}
          </button>
        )}
      </div>
    </article>
  );
}

/** Two balanced columns (each post goes to the shorter column). */
export function Masonry({ posts, onPost, header, showTry, className }: { posts: DiscoverPost[]; onPost?: (p: DiscoverPost) => void; header?: ReactNode; showTry?: boolean; className?: string }) {
  const cols: DiscoverPost[][] = [[], []];
  const h = [header ? 0.9 : 0, 0];
  for (const p of posts) {
    const c = h[0] <= h[1] ? 0 : 1;
    cols[c].push(p);
    h[c] += (p.width && p.height ? p.height / p.width : 1.2) + 0.35;
  }
  return (
    <div className={cx("flex gap-3 px-4", className)}>
      <div className="min-w-0 flex-1">{header}{cols[0].map((p) => <PostCard key={p.id} post={p} onPost={onPost} showTry={showTry} />)}</div>
      <div className="min-w-0 flex-1">{cols[1].map((p) => <PostCard key={p.id} post={p} onPost={onPost} showTry={showTry} />)}</div>
    </div>
  );
}

export function FollowButton({ userId, size = "sm" }: { userId: string; size?: "sm" | "md" }) {
  const ugc = useUgc();
  const following = ugc.follows[userId] ?? false;
  return (
    <Button size={size} variant={following ? "secondary" : "primary"} icon={following ? "check" : "plus"} onClick={(e) => { e.stopPropagation(); setFollow(userId, !following); }}>
      {following ? "Following" : "Follow"}
    </Button>
  );
}

function CreatorCard({ c }: { c: DiscoverCreator }) {
  const router = useRouter();
  const ugc = useUgc();
  const followers = c.followerCount + (ugc.follows[c.id] ? 1 : 0);
  return (
    <div onClick={() => router.push(profileHref(c.id))} className="mx-4 mb-3 cursor-pointer rounded-xl bg-panel p-3">
      <div className="flex items-center gap-3">
        <Avatar author={c} size={44} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 truncate text-[15px] font-semibold">{c.name}{c.creator && <VerifiedBadge />}</p>
          <p className="text-[12px] text-fg-3">{formatCount(followers)} followers</p>
        </div>
        <FollowButton userId={c.id} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {[0, 1, 2].map((i) => <Thumb key={i} src={media(c.posts[i])} seed={`${c.id}${i}`} className="aspect-square rounded-sm" />)}
      </div>
    </div>
  );
}

/** Floating "Create a look" action. */
export function CreateButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 z-20 flex justify-center" style={{ bottom: "calc(var(--oe-bottom-nav) + 16px)" }}>
      <Button size="lg" icon="plus" className="pointer-events-auto rounded-full shadow-[0_8px_24px_rgba(0,0,0,.45)]" onClick={onClick}>Create a look</Button>
    </div>
  );
}

export function Discover({ categories }: { categories: DiscoverCategory[] }) {
  const router = useRouter();
  const [sel, setSel] = useState(0);
  const pager = useRef<HTMLDivElement>(null);
  const pages = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const onReselect = (e: Event) => { if ((e as CustomEvent<string>).detail === "discover") pages.current[sel]?.scrollTo({ top: 0, behavior: "smooth" }); };
    window.addEventListener(NAV_RESELECT, onReselect);
    return () => window.removeEventListener(NAV_RESELECT, onReselect);
  }, [sel]);

  const go = (i: number) => {
    setSel(i);
    const p = pager.current;
    if (p) p.scrollTo({ left: i * p.clientWidth, behavior: "smooth" });
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-bg" style={{ paddingBottom: "var(--oe-bottom-nav)" }}>
      <header className="shrink-0 px-4 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-[28px] font-bold tracking-tight">Discover</h1>
          <IconButton icon="qr-scan" label="Scan a QR code" variant="raised" size={40} iconSize={20} onClick={() => router.push("/discover/qr")} />
        </div>
        <Link href="/discover/search" className="mt-3 flex h-11 items-center gap-2 rounded-full bg-panel px-4 text-[15px] text-fg-3">
          <Icon name="search" size={18} /> Search looks, creators and tags
        </Link>
      </header>
      <Tabs className="mt-2 shrink-0 border-b border-line" items={categories.map((c, i) => ({ id: i, label: c.name }))} value={sel} onChange={go} />
      <div
        ref={pager}
        className="no-scrollbar flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
        onScroll={(e) => {
          const i = Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth);
          if (i !== sel && i >= 0 && i < categories.length) setSel(i);
        }}
      >
        {categories.map((c, i) => (
          <div key={c.id} ref={(el) => { pages.current[i] = el; }} className="no-scrollbar h-full w-full shrink-0 snap-start overflow-y-auto pb-28 pt-4">
            {c.type === "CREATOR"
              ? <>
                  <p className="mb-3 px-4 text-[13px] font-semibold uppercase tracking-[0.08em] text-fg-3">Creators to follow</p>
                  {(c.creators ?? []).map((cr) => <CreatorCard key={cr.id} c={cr} />)}
                </>
              : <Masonry posts={c.posts ?? []} />}
          </div>
        ))}
      </div>
      <CreateButton onClick={() => router.push("/lens")} />
      <FollowPopupHost />
      <BottomNav active="discover" />
    </div>
  );
}
