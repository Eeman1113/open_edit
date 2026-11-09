import { Suspense } from "react";
import { VideoEditClient } from "@/components/video-edit/VideoEditClient";

// Video editor: /video-edit?id=<gallery item id>.
export default function VideoEditPage() {
  return (
    <Suspense fallback={<div className="absolute inset-0 bg-bg" />}>
      <VideoEditClient />
    </Suspense>
  );
}
