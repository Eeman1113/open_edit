import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PostDetail } from "@/components/discover/PostDetail";
import { ALL_POSTS, findPost } from "@/components/discover/types";

export function generateStaticParams() {
  return ALL_POSTS.map((p) => ({ id: p.id }));
}

async function Post({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = findPost(decodeURIComponent(id));
  if (!post) notFound();
  return <PostDetail post={post} />;
}

// Not async: params are awaited below a Suspense boundary (Cache Components).
export default function PostPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="absolute inset-0" style={{ background: "#000" }} />}>
      <Post params={params} />
    </Suspense>
  );
}
