import { Suspense } from "react";
import { CollageClient } from "@/components/collage/CollageClient";

// Collage maker: /collage?ids=<comma-separated photo ids> (2–9 photos picked in the gallery). The ids are read on the
// client inside a Suspense boundary so the route shell can prerender.
export default function CollagePage() {
  return (
    <Suspense fallback={<div className="absolute inset-0 bg-bg" />}>
      <CollageClient />
    </Suspense>
  );
}
