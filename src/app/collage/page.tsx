import { Suspense } from "react";
import { CollageClient } from "@/components/collage/CollageClient";

// CollageActivity: /collage?ids=<comma-separated photo ids> (gallery "Layout" multi-pick, 2–9 photos).
// The ids are read on the client (useSearchParams) inside a Suspense boundary so the route shell can prerender.
export default function CollagePage() {
  return (
    <Suspense fallback={<div className="absolute inset-0 bg-black" />}>
      <CollageClient />
    </Suspense>
  );
}
