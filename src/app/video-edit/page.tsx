import { Suspense } from "react";
import { VideoEditClient } from "@/components/video-edit/VideoEditClient";

// EditActivity (video mode) / VideoEditFragment: /video-edit?id=<galleryItemId>.
export default function VideoEditPage() {
  return (
    <Suspense fallback={<div className="absolute inset-0 bg-black" />}>
      <VideoEditClient />
    </Suspense>
  );
}
