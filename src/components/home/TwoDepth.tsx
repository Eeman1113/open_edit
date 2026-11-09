"use client";

// "See all" page for a Home section: every card of the section in a grid (or the full chart).
import { ScrollBody, Screen, TopBar, useGoBack } from "@/components/ui";
import { Card, ChartRow, useItemClick } from "./HomeFeed";
import { cardShape } from "./model";
import type { GroupDto } from "./types";

export function TwoDepth({ group }: { group: GroupDto }) {
  const back = useGoBack("/home");
  const click = useItemClick();
  const shape = cardShape(group.thumbnailRatioType);
  const wide = shape === "wide" || shape === "banner";
  return (
    <Screen bottomNav>
      <TopBar title={group.title} onBack={back} large />
      <ScrollBody className="pb-10">
        {group.subTitle && <p className="-mt-1 mb-4 px-4 text-[14px] text-fg-2">{group.subTitle}</p>}
        {group.type === "TOP_CHART" ? (
          <div className="mx-4 overflow-hidden rounded-lg bg-panel">
            {group.items.map((it, i) => <ChartRow key={it.id} group={group} item={it} rank={i + 1} onClick={() => click(it)} />)}
          </div>
        ) : (
          <div className={wide ? "grid grid-cols-1 gap-5 px-4" : "grid grid-cols-2 gap-x-3 gap-y-5 px-4"}>
            {group.items.map((it) => <Card key={it.id} group={group} item={it} shape={group.type === "EFFECT" || group.type === "FILTER" ? "square" : shape} onClick={() => click(it)} fill />)}
          </div>
        )}
      </ScrollBody>
    </Screen>
  );
}
