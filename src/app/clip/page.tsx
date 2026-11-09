import { Suspense } from "react";
import { ClipClient } from "@/components/clip/ClipClient";

// Clip picker for video templates.
export default function ClipPage() {
  return (
    <Suspense fallback={<div className="absolute inset-0 bg-black" />}>
      <ClipClient />
    </Suspense>
  );
}
