"use client";

// A shared look, full screen: the picture or clip, its title, creator and filter, with Like, Share and "Try it"
// (opens the camera with the look's filter).
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { BottomNav, Button, Icon, IconButton, Thumb, toast, useGoBack } from "@/components/ui";
import { Avatar, VerifiedBadge } from "./Discover";
import { isLiked, likeCountOf, toggleLike, useUgc } from "./store";
import { FollowPopupHost } from "./Popups";
import { cameraHref, formatCount, profileHref, tagHref, type DiscoverPost } from "./types";
import { media } from "./media";

export function PostDetail({ post }: { post: DiscoverPost }) {
  const router = useRouter();
  const back = useGoBack("/discover");
  const ugc = useUgc();
  const liked = isLiked(ugc, post.id, post.like);
  const count = likeCountOf(ugc, post.id, post.like, post.likeCount);
  const [paused, setPaused] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) { void v.play(); setPaused(false); } else { v.pause(); setPaused(true); }
  };
  const share = async () => {
    const url = `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/discover/post/${encodeURIComponent(post.id)}`;
    const text = `Try the “${post.filterName || post.title}” look on Open_Edit`;
    try {
      if (navigator.share) await navigator.share({ text, url });
      else { await navigator.clipboard?.writeText(`${text} ${url}`); toast("Link copied", { icon: "copy" }); }
    } catch { /* dismissed */ }
  };

  return (
    <div className="absolute inset-0 bg-black" style={{ paddingBottom: "var(--oe-bottom-nav)" }}>
      <div className="relative h-full overflow-hidden" onClick={toggle}>
        {post.video ? (
          <video ref={video} src={media(post.video)} poster={media(post.thumbnail)} className="h-full w-full object-contain" autoPlay loop muted playsInline />
        ) : (
          <Thumb src={media(post.thumbnail)} seed={post.id} fit="contain" className="h-full w-full bg-black" />
        )}
        {paused && <Icon name="play" filled size={64} className="pointer-events-none absolute inset-0 m-auto text-white/90 drop-shadow-lg" />}
      </div>

      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3 pt-[max(12px,env(safe-area-inset-top))]">
        <IconButton icon="back" label="Back" variant="glass" size={40} iconSize={24} onClick={back} />
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-4 pb-4 pt-24" style={{ bottom: "var(--oe-bottom-nav)" }}>
        <div className="pointer-events-auto flex items-end gap-4">
          <div className="min-w-0 flex-1">
            <button type="button" onClick={() => router.push(profileHref(post.author.id))} className="mb-2 flex max-w-full items-center gap-2">
              <Avatar author={post.author} size={28} />
              <span className="truncate text-[14px] font-semibold text-white">{post.author.name}</span>
              {post.author.creator && <VerifiedBadge />}
            </button>
            <h1 className="line-clamp-2 font-display text-[20px] font-bold leading-tight text-white">{post.title}</h1>
            {!!post.tags?.length && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {post.tags.map((t) => <button key={t} type="button" onClick={() => router.push(tagHref(t))} className="text-[13px] font-medium text-white/75">#{t}</button>)}
              </div>
            )}
          </div>
          <div className="flex flex-col items-center gap-4">
            {post.type !== "SCHEME" && (
              <button type="button" aria-pressed={liked} aria-label={liked ? "Unlike" : "Like"} onClick={() => toggleLike(post, !liked)} className="oe-press flex flex-col items-center gap-1 text-[12px] font-semibold text-white">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-glass backdrop-blur-md"><Icon name="heart" size={22} filled={liked} className={liked ? "text-danger" : undefined} /></span>
                {formatCount(count)}
              </button>
            )}
            <button type="button" aria-label="Share" onClick={() => void share()} className="oe-press flex flex-col items-center gap-1 text-[12px] font-semibold text-white">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-glass backdrop-blur-md"><Icon name="share" size={20} /></span>
              Share
            </button>
          </div>
        </div>
        <Button size="lg" block icon="camera" className="pointer-events-auto mt-4 rounded-full" onClick={() => router.replace(cameraHref(post))}>
          {post.buttonText || (post.filterName ? `Try “${post.filterName}”` : "Try it")}
        </Button>
      </div>
      <FollowPopupHost />
      <BottomNav active="discover" />
    </div>
  );
}
