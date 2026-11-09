import { BottomNav } from "@/components/ui";
import { HomeFeed } from "@/components/home/HomeFeed";
import type { OverviewResponse } from "@/components/home/types";
import home from "@/data/home.json";

const overview = home as unknown as OverviewResponse;

export default function HomePage() {
  return (
    <>
      <HomeFeed groups={overview.result.items[0]?.groups ?? []} />
      <BottomNav active="home" />
    </>
  );
}
