import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CreatorProfile } from "@/components/discover/CreatorProfile";
import { ALL_POSTS, CATEGORIES, findCreator } from "@/components/discover/types";

export function generateStaticParams() {
  const ids = new Set<string>(ALL_POSTS.map((p) => p.author.id));
  for (const c of CATEGORIES) for (const cr of c.creators ?? []) ids.add(cr.id);
  return [...ids].map((id) => ({ id }));
}

async function Profile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const creator = findCreator(decodeURIComponent(id));
  if (!creator) notFound();
  return <CreatorProfile creator={creator} />;
}

// Not async: params are awaited below a Suspense boundary (Cache Components).
export default function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="absolute inset-0 bg-bg" />}>
      <Profile params={params} />
    </Suspense>
  );
}
