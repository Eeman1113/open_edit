import { Suspense } from "react";
import { TagPage } from "@/components/discover/TagPage";
import { TAGS } from "@/components/discover/types";

export function generateStaticParams() {
  return TAGS.map((t) => ({ name: t.name }));
}

async function Tag({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return <TagPage name={decodeURIComponent(name)} />;
}

// Not async: params are awaited below a Suspense boundary (Cache Components).
export default function TagRoute({ params }: { params: Promise<{ name: string }> }) {
  return (
    <Suspense fallback={<div className="absolute inset-0 bg-bg" />}>
      <Tag params={params} />
    </Suspense>
  );
}
