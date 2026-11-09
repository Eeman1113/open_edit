import { Suspense } from "react";
import { GalleryClient } from "@/components/gallery/GalleryClient";

// Gallery; ?mode=collage picks photos for a collage.
export default function GalleryPage() {
  return (
    <Suspense fallback={<div className="absolute inset-0 bg-white" />}>
      <GalleryClient />
    </Suspense>
  );
}
