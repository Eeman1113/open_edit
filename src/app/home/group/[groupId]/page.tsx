import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BottomNav } from "@/components/ui";
import { hasAllPage } from "@/components/home/model";
import { TwoDepth } from "@/components/home/TwoDepth";
import type { OverviewResponse } from "@/components/home/types";
import home from "@/data/home.json";

// Only sections with a "See all" page are reachable.
const groups = ((home as unknown as OverviewResponse).result.items[0]?.groups ?? []).filter((g) => hasAllPage(g));

export function generateStaticParams() {
  return groups.map((g) => ({ groupId: String(g.id) }));
}

async function Group({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const group = groups.find((g) => String(g.id) === groupId);
  if (!group) notFound();
  return <TwoDepth group={group} />;
}

// Not async: params are awaited below a Suspense boundary (Cache Components).
export default function GroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  return (
    <>
      <Suspense fallback={<div className="absolute inset-0 bg-bg" />}>
        <Group params={params} />
      </Suspense>
      <BottomNav active="home" />
    </>
  );
}
