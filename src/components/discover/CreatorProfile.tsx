"use client";

// A creator's page: avatar, name, bio, stats, Follow, and their looks (plus the looks they liked).
import { useEffect, useState } from "react";
import { BottomNav, EmptyState, IconButton, ScrollBody, Screen, Tabs, TopBar, toast, useGoBack } from "@/components/ui";
import { Avatar, FollowButton, Masonry, VerifiedBadge } from "./Discover";
import { likeCountOf, useUgc } from "./store";
import { FollowPopupHost, UserMoreSheet } from "./Popups";
import { formatCount, type CreatorInfo } from "./types";

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div className="flex-1 text-center">
      <p className="tabular font-display text-[18px] font-bold">{n}</p>
      <p className="text-[12px] text-fg-3">{label}</p>
    </div>
  );
}

export function CreatorProfile({ creator }: { creator: CreatorInfo }) {
  const back = useGoBack("/discover");
  const ugc = useUgc();
  const following = ugc.follows[creator.id] ?? false;
  const [tab, setTab] = useState(0);
  const [more, setMore] = useState<null | "sheet" | "block" | "blocked" | "report" | "reported">(null);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const m = new URLSearchParams(window.location.search).get("__more");
    if (m) { const id = window.setTimeout(() => setMore(m as "sheet"), 0); return () => window.clearTimeout(id); }
  }, []);
  const shareProfile = async () => {
    const url = `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/discover/profile/${encodeURIComponent(creator.id)}`;
    try {
      if (navigator.share) await navigator.share({ url, text: `${creator.name} on Open_Edit` });
      else { await navigator.clipboard?.writeText(url); toast("Link copied", { icon: "copy" }); }
    } catch { /* dismissed */ }
  };
  const likes = creator.posts.reduce((n, p) => n + likeCountOf(ugc, p.id, p.like, p.likeCount), 0);
  const liked = creator.posts.filter((p) => ugc.likes[p.id] ?? p.like);

  return (
    <Screen bottomNav>
      <TopBar onBack={back} actions={<IconButton icon="more" label="More" onClick={() => setMore("sheet")} />} />
      <ScrollBody className="pb-10">
        <div className="flex flex-col items-center px-6 text-center">
          <Avatar author={creator} size={88} />
          <h1 className="mt-3 flex items-center gap-1.5 font-display text-[22px] font-bold">{creator.name}{creator.creator && <VerifiedBadge />}</h1>
          <p className="text-[13px] text-fg-3">@{creator.id}</p>
          {creator.biography && <p className="mt-3 whitespace-pre-line text-[14px] leading-relaxed text-fg-2">{creator.biography}</p>}
          <div className="mt-5 flex w-full rounded-lg bg-panel py-3">
            <Stat n={formatCount(likes)} label="Likes" />
            <Stat n={formatCount(creator.followerCount + (following ? 1 : 0))} label="Followers" />
            <Stat n={formatCount(creator.following)} label="Following" />
          </div>
          <div className="mt-4 w-full [&>button]:w-full"><FollowButton userId={creator.id} size="md" /></div>
        </div>
        <Tabs className="mt-6 border-b border-line" items={[{ id: 0, label: "Looks" }, { id: 1, label: "You liked" }]} value={tab} onChange={setTab} />
        <div className="pt-4">
          {(tab === 0 ? creator.posts : liked).length
            ? <Masonry posts={tab === 0 ? creator.posts : liked} showTry={false} />
            : <EmptyState icon={tab === 0 ? "image" : "heart"} title={tab === 0 ? "No looks yet" : "Nothing liked yet"} body={tab === 0 ? undefined : "Looks from this creator that you like show up here."} />}
        </div>
      </ScrollBody>
      {more && (
        <UserMoreSheet userId={creator.id} official={creator.creator} initial={more} onClose={() => setMore(null)} onShare={() => void shareProfile()} onBlocked={back} />
      )}
      <FollowPopupHost />
      <BottomNav active="discover" />
    </Screen>
  );
}
