"use client";

// Everything tagged #name.
import { BottomNav, EmptyState, ScrollBody, Screen, TopBar, useGoBack } from "@/components/ui";
import { Masonry } from "./Discover";
import { FollowPopupHost } from "./Popups";
import { TAGS, formatCount, postsByTag } from "./types";

export const tagCount = (n: number) => (n < 100 ? "Under 100 looks" : `${formatCount(n)} looks`);

export function TagPage({ name }: { name: string }) {
  const back = useGoBack("/discover/search");
  const tag = TAGS.find((t) => t.name === name) ?? { name, count: 0 };
  const posts = postsByTag(name);
  return (
    <Screen bottomNav>
      <TopBar title={`#${tag.name}`} onBack={back} large />
      <ScrollBody className="pb-10">
        <p className="mb-4 px-4 text-[14px] text-fg-2">{tagCount(Math.max(tag.count, posts.length))}</p>
        {posts.length ? <Masonry posts={posts} /> : <EmptyState icon="hash" title="No looks with this tag yet" />}
      </ScrollBody>
      <FollowPopupHost />
      <BottomNav active="discover" />
    </Screen>
  );
}
